# คู่มือ Deploy สำหรับทีม IT — CJ Mart Careers Site

เอกสารนี้สำหรับทีม IT ที่จะนำระบบไปรันบน Docker และ PostgreSQL ของบริษัท
**ไม่ต้องแก้โค้ด** ตั้งค่าทุกอย่างผ่าน environment variable เท่านั้น

> ระบบนี้เก็บข้อมูลส่วนบุคคลของผู้สมัครงาน รวมถึงข้อมูลอ่อนไหว (โรคประจำตัว ประวัติคดีความ)
> เรซูเม่และรูปถ่าย ต้องจัดการตามนโยบาย PDPA และ AI & Data Governance Policy ของบริษัท
> (ดูหัวข้อ "ความปลอดภัยและ PDPA" ท้ายเอกสาร)

---

## 1. ภาพรวม

| ส่วน | รายละเอียด |
|---|---|
| รูปแบบ | แอปเดียว (Node.js 22 + Express) ให้บริการทั้งหน้าเว็บและ API บนพอร์ต 3000 |
| ฐานข้อมูล | PostgreSQL (ทดสอบกับเวอร์ชัน 16) เก็บทุกอย่างในฐานข้อมูล รวมถึงแบนเนอร์ เรซูเม่ และรูปถ่าย (คอลัมน์ BYTEA) |
| ดิสก์ | **ไม่ต้องมี volume / persistent disk** container ไม่เขียนไฟล์ลงดิสก์ |
| สถานะ | Stateless รันได้หลาย instance หลัง load balancer (session เป็น JWT cookie) |
| Migration | รันอัตโนมัติทุกครั้งที่ container เริ่ม (idempotent ปลอดภัยที่จะรันซ้ำ) |

## 2. สิ่งที่ต้องเตรียม

1. **ฐานข้อมูล PostgreSQL** แยก 1 ฐาน และ user เฉพาะแอป เช่น

   ```sql
   CREATE ROLE cjmart LOGIN PASSWORD '<รหัสผ่านที่แข็งแรง>';
   CREATE DATABASE cjmart OWNER cjmart;
   ```

   user ที่แอปใช้ต้องสร้างและแก้ตารางได้ (เป็นเจ้าของฐานข้อมูล/schema) เพราะ migration ใช้ `CREATE TABLE` / `ALTER TABLE`
   ไม่ต้องติดตั้ง extension ใด ๆ
2. **ค่า secret 3 ตัว** (เก็บใน secret manager ของบริษัท อย่าใส่ใน Git)
   - `JWT_SECRET` สร้างด้วย `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `ADMIN_PASSWORD_HASH` สร้างด้วย `node scripts/hash-password.js "รหัสผ่านแอดมิน"` (หรือ `npm run hash-password -- "รหัสผ่าน"`)
   - `INTEGRATION_API_KEY` (ถ้าจะเชื่อม RMS) สุ่มสตริงยาว ๆ

## 3. Build และรัน

```bash
# build image
docker build -t cjmart-recruitment:1.0 .

# รัน (ตัวอย่าง)
docker run -d --name cjmart-recruitment \
  -p 3000:3000 \
  --env-file /path/to/cjmart.env \
  --restart unless-stopped \
  cjmart-recruitment:1.0
```

ลองทั้งชุด (แอป + Postgres ชั่วคราว) บนเครื่องทดสอบ:

```bash
cp .env.example .env     # ใส่ JWT_SECRET และรหัสแอดมิน
docker compose up --build
# เปิด http://localhost:3000   (docker-compose.yml ใส่ข้อมูลตัวอย่างให้เพื่อทดสอบเท่านั้น)
```

> **ข้อควรระวังเรื่องเครื่องหมาย `$`:** bcrypt hash มี `$` อยู่ภายใน
> - `docker run --env-file` ใช้ค่าตามตัวอักษร ไม่ต้องทำอะไร
> - `docker compose` จะตีความ `$` ใน `.env` ให้ใส่ `$$` แทน `$` หรือครอบค่าด้วยเครื่องหมาย `'...'`
> - ถ้าเข้าสู่ระบบแอดมินไม่ได้ทั้งที่รหัสถูก ให้สงสัยจุดนี้ก่อน

เมื่อ container เริ่ม ระบบจะ (1) รัน migration แล้ว (2) เปิดเซิร์ฟเวอร์
ถ้าฐานข้อมูลยังไม่พร้อมจะลองซ้ำ 10 ครั้ง ห่างกัน 3 วินาที ถ้ายังไม่สำเร็จ container จะหยุดพร้อม error ใน log

## 4. Environment variables

| ตัวแปร | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|---|
| `DATABASE_URL` | ใช่ | – | `postgresql://USER:PASSWORD@HOST:5432/DBNAME` (รหัสผ่านที่มีอักขระพิเศษต้อง URL-encode เช่น `@` เป็น `%40`) |
| `JWT_SECRET` | ใช่ | – | สตริงสุ่มยาวอย่างน้อย 32 ตัวอักษร ใช้เซ็น session แอดมิน |
| `ADMIN_PASSWORD_HASH` | ใช่* | – | bcrypt hash ของรหัสผ่านแอดมิน (*หรือใช้ `ADMIN_PASSWORD` แบบ plain text แทนได้ แต่ไม่แนะนำ) |
| `PORT` | ไม่ | `3000` | พอร์ตที่แอปฟัง |
| `NODE_ENV` | ไม่ | `production` (ใน image) | |
| `TRUST_PROXY` | แนะนำ | – | จำนวน reverse proxy ด้านหน้า (ปกติ `1`) เพื่อให้ตัวจำกัดการล็อกอินเห็น IP จริงของผู้ใช้ |
| `COOKIE_SECURE` | ไม่ | `true` เมื่อ production | ถ้าเปิดเว็บผ่าน HTTP ธรรมดาในเครือข่ายภายใน ให้ตั้ง `false` มิฉะนั้นแอดมินจะล็อกอินไม่ติด |
| `PGSSL` | ไม่ | `true` | `false` = ไม่ใช้ TLS (Postgres ในเครือข่ายภายใน), `true` = TLS ไม่ตรวจใบรับรอง, `verify` = TLS และตรวจใบรับรอง |
| `PGSSL_CA_FILE` | ไม่ | – | path ของ CA (PEM) เมื่อใช้ `PGSSL=verify` กับ CA ภายในองค์กร |
| `PG_POOL_MAX` | ไม่ | `10` | จำนวน connection สูงสุดต่อ 1 instance |
| `SEED_SAMPLE_DATA` | ไม่ | `0` ใน image | `0` = ไม่ใส่ตำแหน่งงาน/ผู้ติดต่อ HR ตัวอย่าง **ต้องเป็น 0 ใน production** |
| `RUN_MIGRATIONS` | ไม่ | `true` | ตั้ง `false` ถ้า IT ต้องการรัน `db/schema.sql` เอง |
| `MIGRATION_RETRIES` | ไม่ | `10` | จำนวนครั้งที่ลอง migrate ใหม่เมื่อฐานข้อมูลยังไม่พร้อม |
| `CORS_ORIGINS` | ไม่ | – | ต้องใช้เมื่อหน้าเว็บอยู่คนละ origin กับ API เท่านั้น |
| `LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_MINUTES` | ไม่ | `10` / `15` | ล็อกการล็อกอินแอดมินต่อ IP เมื่อใส่รหัสผิดเกินกำหนด (เก็บในหน่วยความจำของแต่ละ instance) |
| `INTEGRATION_API_KEY` | เมื่อเชื่อม RMS | – | คีย์ที่ RMS ต้องส่งใน header `X-API-Key` เมื่อเรียก `/api/integration/*` ถ้าไม่ตั้ง endpoint นี้จะปิดอยู่ (ตอบ 503) |
| `RMS_WEBHOOK_URL` | ไม่ | – | ถ้าตั้ง ทุกใบสมัครใหม่จะถูก POST ไปที่ URL นี้ (timeout 5 วินาที ไม่กระทบผู้สมัครหากปลายทางล่ม) |

ไฟล์ตัวอย่างอยู่ที่ `.env.example`

## 5. Health check

| Endpoint | ใช้ทำอะไร | ผลลัพธ์ |
|---|---|---|
| `GET /healthz` | liveness: โปรเซสยังทำงาน (ไม่แตะฐานข้อมูล) | `200 {"status":"ok"}` |
| `GET /readyz` | readiness: ฐานข้อมูลตอบสนอง | `200` หรือ `503` |

Dockerfile มี `HEALTHCHECK` เรียก `/healthz` ให้แล้ว สำหรับ load balancer ให้ใช้ `/readyz`

## 6. Reverse proxy / Load balancer

- **TLS:** ควรปิด TLS ที่ proxy แล้วส่ง HTTP เข้า container พอร์ต 3000 และตั้ง `TRUST_PROXY=1`
- **ขนาด request:** ผู้สมัครแนบเรซูเม่และรูปถ่ายไฟล์ละไม่เกิน 5 MB (รวมกันได้ราว 10 MB)
  **ต้องตั้ง limit ของ proxy ให้อย่างน้อย 12 MB** เช่น nginx: `client_max_body_size 12m;`
  ค่าเริ่มต้นของ nginx คือ 1 MB ทำให้ผู้สมัครที่แนบไฟล์ใหญ่ส่งไม่ผ่านและเห็นข้อความ error ทั่วไป
- **Timeout:** ตั้ง read/send timeout อย่างน้อย 60 วินาทีสำหรับการอัปโหลดไฟล์
- ส่ง header `X-Forwarded-For` / `X-Forwarded-Proto` ตามปกติ
- ไม่ต้อง sticky session

ตัวอย่าง nginx

```nginx
server {
  listen 443 ssl;
  server_name careers.example.co.th;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

## 7. สำรองและกู้คืนข้อมูล

ข้อมูลทั้งหมดอยู่ในฐานข้อมูลเดียว จึงสำรองที่ฐานข้อมูลได้ตามขั้นตอนมาตรฐานของ IT
หรือใช้สคริปต์ที่แนบมา (ต้องมี `pg_dump` / `pg_restore` ที่เวอร์ชันไม่ต่ำกว่าเซิร์ฟเวอร์):

```bash
DATABASE_URL=postgresql://... sh scripts/backup.sh /secure/backup/dir     # เก็บ 30 วัน (ปรับด้วย RETENTION_DAYS)
DATABASE_URL=postgresql://... sh scripts/restore.sh /secure/backup/dir/cjmart-YYYYmmdd-HHMMSS.dump
```

- `restore.sh` จะ **แทนที่** ข้อมูลในฐานข้อมูลปลายทาง ควรทดสอบกู้คืนในฐานข้อมูลทดสอบก่อนเสมอ
- ไฟล์ backup มีข้อมูลส่วนบุคคลครบทุกอย่าง ต้องเก็บแบบเข้ารหัสและจำกัดสิทธิ์
- แนะนำให้ตั้ง cron สำรองทุกวัน และทดสอบกู้คืนอย่างน้อยไตรมาสละครั้ง

## 8. การอัปเดตเวอร์ชัน

1. Build image ใหม่ ติด tag ใหม่ (เช่น `1.1`)
2. **สำรองฐานข้อมูลก่อน**
3. หยุด container เก่า รัน container ใหม่ด้วย env เดิม (migration จะทำงานเอง)
4. ตรวจ `/readyz` และเปิดหน้าเว็บ ถ้ามีปัญหา ให้รัน image tag เดิมกลับ
   (migration เน้นเพิ่มตาราง/คอลัมน์ ไม่ลบข้อมูลผู้สมัคร ปกติจึงย้อนกลับ image ได้ แต่ถ้ามีปัญหาให้กู้คืนจาก backup ที่สำรองในข้อ 2)

## 9. Logs

แอปเขียน log ออก stdout/stderr (ดูด้วย `docker logs`) ไม่เขียนไฟล์ เมื่อเกิด database error ข้อความ error ของ PostgreSQL อาจมีข้อมูลบางส่วนของแถวที่บันทึกไม่สำเร็จ (เช่น ชื่อ เบอร์โทร) ปะปนใน log
จึงควรจำกัดสิทธิ์การเข้าถึง log และกำหนดอายุการเก็บ log เช่นเดียวกับข้อมูลผู้สมัคร

## 10. ความปลอดภัยและ PDPA (ต้องคุยกับ IT Security / DPO ก่อนเปิดจริง)

- **เก็บ secret ใน secret manager** อย่าใส่ใน Git, image หรือ chat
- **รหัสผ่านแอดมินเป็นชุดเดียวใช้ร่วมกัน** ไม่มีระบบบัญชีรายบุคคลและไม่บันทึกว่าใครเข้าดูข้อมูลผู้สมัคร
  ถ้าบริษัทต้องการ audit trail ควรจำกัด path `/api/admin/*` ที่ proxy ให้เข้าได้เฉพาะ VPN / IP ภายในบริษัท หรือผ่าน SSO ของบริษัท
  (หน้าแอดมินเป็นส่วนหนึ่งของหน้าเว็บเดียวกัน แต่ข้อมูลทั้งหมดดึงผ่าน `/api/admin/*` จึงใช้งานไม่ได้หากเข้าถึง path นี้ไม่ได้)
  ส่วนการทำบัญชีแอดมินรายบุคคลเป็นงานที่ทีมพัฒนาควรปรับในเฟสถัดไป
- **ไม่มีการลบข้อมูลอัตโนมัติ** ต้องกำหนดระยะเวลาเก็บข้อมูลผู้สมัครกับ DPO และจัดการลบด้วยขั้นตอนของบริษัท
  (การลบแถวใน `applications` จะลบไฟล์แนบใน `application_files` ตามไปด้วยอัตโนมัติ)
- **ข้อมูลอ่อนไหวในใบสมัคร:** โรคประจำตัว ประวัติคดีความ ข้อความนโยบาย PDPA และข้อความขอความยินยอม แก้ได้ที่หน้าแอดมิน
  ฝ่ายกฎหมาย/DPO ควรตรวจข้อความก่อนเปิดใช้
- **ฟอนต์:** หน้าเว็บโหลดฟอนต์จาก Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`)
  ถ้าเครือข่ายผู้ใช้บล็อกโดเมนนี้ หน้าเว็บยังใช้งานได้แต่จะเปลี่ยนเป็นฟอนต์สำรอง
- แอปที่คนอื่นจะใช้งานควรผ่านการคัดกรองตามนโยบายของบริษัทก่อนเปิดใช้งาน (cjx-toolkit ai-app-screening)

## 11. โครงสร้างโปรเจกต์โดยย่อ

```
Dockerfile, docker-compose.yml, .env.example   การ deploy
scripts/docker-entrypoint.sh                    migrate แล้วเริ่มเซิร์ฟเวอร์
scripts/backup.sh, restore.sh, hash-password.js
db/schema.sql                                   โครงสร้างตาราง (idempotent)
db/seed.sql                                     ข้อความเริ่มต้น + คำตอบแชทบอท (ใส่ครั้งเดียว)
db/seed-sample.sql                              ข้อมูลตัวอย่าง (ข้ามด้วย SEED_SAMPLE_DATA=0)
src/                                            โค้ดเซิร์ฟเวอร์ (Express)
public/                                         หน้าเว็บ (HTML/CSS/JS ไม่ต้อง build)
README.md                                       รายละเอียด API และการเชื่อม RMS
```

## 12. แก้ปัญหาเบื้องต้น

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| container หยุดทันที พร้อม `DATABASE_URL is not set` | ยังไม่ได้ส่ง env เข้า container |
| `Migration failed ... ECONNREFUSED` / timeout | host/port ผิด หรือ firewall ยังไม่เปิดจาก container ไปยัง Postgres |
| `SSL ... not supported` | Postgres ไม่ใช้ TLS ให้ตั้ง `PGSSL=false` |
| `permission denied for schema public` | user ของแอปไม่ใช่เจ้าของฐานข้อมูล/schema (PostgreSQL 15 ขึ้นไป) |
| หน้าเว็บขึ้น "ไม่สามารถโหลดข้อมูลได้" | ฐานข้อมูลเชื่อมต่อไม่ได้ ตรวจ `/readyz` และ log |
| แอดมินล็อกอินแล้วเด้งกลับ | เปิดผ่าน HTTP แต่ `COOKIE_SECURE` เป็น true หรือเจอ `$` ใน hash (ดูข้อ 3) |
| แอดมินขึ้น "ลองรหัสผ่านผิดหลายครั้งเกินไป" | ใส่รหัสผิดเกินกำหนดต่อ IP รอ 15 นาที หรือ restart container เพื่อล้างตัวนับ |
| ผู้สมัครอัปโหลดไฟล์ไม่ผ่านทั้งที่ไม่เกิน 5 MB | `client_max_body_size` ของ proxy ต่ำเกินไป (ดูข้อ 6) |
