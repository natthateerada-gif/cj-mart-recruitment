# ฟอนต์ของเว็บ

ฟอนต์ตาม CI บริษัทคือ **DB Heavent** (Regular / Med / Bold) แต่เป็นฟอนต์มีลิขสิทธิ์ ไฟล์เว็บฟอนต์ยังไม่อยู่ใน repo
ตอนนี้เว็บใช้ฟอนต์ฟรีที่หน้าตาใกล้เคียงแทน (โฮสต์ในโปรเจกต์เอง ไม่ต้องเรียก Google Fonts):

| ไฟล์ | ฟอนต์ | ใช้กับ | ไลเซนส์ |
|---|---|---|---|
| `inter-latin-{400,500,700}.woff2` | Inter | ตัวอักษรอังกฤษ/ตัวเลข | SIL OFL (`OFL-Inter.txt`) |
| `noto-sans-thai-thai-{400,500,700}.woff2` | Noto Sans Thai | ตัวอักษรไทย | SIL OFL (`OFL-NotoSansThai.txt`) |

น้ำหนัก: 400 = Regular, 500 = Med, 700 = Bold (ตรงกับ DB Heavent)

## เมื่อได้ไฟล์ DB Heavent (ต้องมีสิทธิ์ใช้งานบนเว็บ / web embedding จากเจ้าของลิขสิทธิ์)

1. แปลงเป็น `.woff2` แล้ววางในโฟลเดอร์นี้ เช่น `DBHeavent-Regular.woff2`, `DBHeavent-Med.woff2`, `DBHeavent-Bold.woff2`
2. เพิ่มใน `public/css/style.css` (ส่วน Typeface ด้านบนสุด):

```css
@font-face{font-family:'DB Heavent';font-weight:400;font-display:swap;src:url('/fonts/DBHeavent-Regular.woff2') format('woff2');}
@font-face{font-family:'DB Heavent';font-weight:500;font-display:swap;src:url('/fonts/DBHeavent-Med.woff2') format('woff2');}
@font-face{font-family:'DB Heavent';font-weight:700;font-display:swap;src:url('/fonts/DBHeavent-Bold.woff2') format('woff2');}
```

3. แก้บรรทัด `--font-ci` ให้ใส่ `'DB Heavent'` เป็นตัวแรก:
   `--font-ci:'DB Heavent','CJx Latin','CJx Thai','Tahoma',sans-serif;`
4. DB Heavent ตัวอักษรเล็กกว่าฟอนต์ทั่วไป อาจต้องเพิ่มขนาด (เช่น `size-adjust:115%;` ในแต่ละ `@font-face`) ให้ดูเทียบแล้วปรับ
