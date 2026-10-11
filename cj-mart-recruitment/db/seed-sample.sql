-- SAMPLE data only (demo jobs + placeholder HR contacts with example.com emails).
-- Loaded by `npm run migrate` unless SEED_SAMPLE_DATA=0. Do NOT load in production.
--
-- Inserted ONCE per database (guarded by marker rows in `settings`), and only into an
-- empty jobs / hr_contacts table. Without this, every deploy re-inserted the sample rows,
-- so a sample job an admin had deleted came back after each deploy.

WITH marker AS (
  INSERT INTO settings (key, value) VALUES ('sample_jobs_seeded', '1')
  ON CONFLICT (key) DO NOTHING
  RETURNING 1
)
INSERT INTO jobs (id, title, type, shift, salary_range, summary, requirements, is_open)
SELECT * FROM (VALUES
  ('sales-associate', 'พนักงานขายหน้าร้าน', 'เต็มเวลา / พาร์ทไทม์', 'หมุนเวียนตามกะ', '12,000 บาทขึ้นไป (ตามประสบการณ์)', 'ต้อนรับลูกค้า แนะนำสินค้า จัดเรียงสินค้าและดูแลความเรียบร้อยหน้าร้าน', 'วุฒิ ม.3 ขึ้นไป, อายุ 18 ปีขึ้นไป, บุคลิกดี ยิ้มแย้มแจ่มใส', true),
  ('cashier', 'แคชเชียร์', 'เต็มเวลา / พาร์ทไทม์', 'หมุนเวียนตามกะ', '12,000 - 14,000 บาท', 'รับชำระเงิน ดูแลหน้าเคาน์เตอร์ ตรวจนับเงินประจำวันให้ถูกต้อง', 'ละเอียดรอบคอบ ซื่อสัตย์ มีไหวพริบในการแก้ปัญหาเฉพาะหน้า', true),
  ('stock', 'พนักงานสต๊อก/คลังสินค้า', 'เต็มเวลา', 'กะเช้า / กะบ่าย', '12,500 บาทขึ้นไป', 'รับสินค้าเข้า-ออก ตรวจนับสต๊อก จัดเรียงคลังสินค้าให้เป็นระบบ', 'แข็งแรง ขยัน สามารถยกของและทำงานเป็นทีมได้', true),
  ('asst-manager', 'ผู้ช่วยผู้จัดการสาขา', 'เต็มเวลา', 'ตามตารางสาขา', '16,000 - 20,000 บาท', 'ช่วยบริหารจัดการหน้าร้าน ดูแลทีมงาน ควบคุมยอดขายและสต๊อกสินค้า', 'มีประสบการณ์งานค้าปลีกอย่างน้อย 1 ปี เป็นผู้นำทีมได้', true),
  ('store-manager', 'ผู้จัดการสาขา', 'เต็มเวลา', 'ตามตารางสาขา', '22,000 บาทขึ้นไป + คอมมิชชั่น', 'บริหารสาขาในภาพรวม ดูแลยอดขาย ทีมงาน และมาตรฐานการให้บริการ', 'มีประสบการณ์บริหารร้านค้าปลีกอย่างน้อย 2 ปี', true),
  ('cleaning', 'พนักงานทำความสะอาด', 'พาร์ทไทม์', 'กะเช้า / กะเย็น', '400 - 450 บาท/วัน', 'ดูแลความสะอาดพื้นที่ร้านและบริเวณโดยรอบให้พร้อมบริการลูกค้าเสมอ', 'ขยัน รับผิดชอบ ตรงต่อเวลา', true)
) AS v(id, title, type, shift, salary_range, summary, requirements, is_open)
WHERE EXISTS (SELECT 1 FROM marker) AND NOT EXISTS (SELECT 1 FROM jobs)
ON CONFLICT (id) DO NOTHING;

WITH marker AS (
  INSERT INTO settings (key, value) VALUES ('sample_hr_seeded', '1')
  ON CONFLICT (key) DO NOTHING
  RETURNING 1
)
INSERT INTO hr_contacts (id, name, coverage, phone, email, line_id, display_order)
SELECT * FROM (VALUES
  ('hr-1', 'คุณสมศรี ใจดี', 'พนักงานขายหน้าร้าน, แคชเชียร์, พนักงานสต๊อก', '081-234-5678', 'somsri.hr@cjmart.example', '@cjmart-somsri', 1),
  ('hr-2', 'คุณวิชัย มั่นคง', 'ผู้ช่วยผู้จัดการสาขา, ผู้จัดการสาขา', '082-345-6789', 'wichai.hr@cjmart.example', '@cjmart-wichai', 2)
) AS v(id, name, coverage, phone, email, line_id, display_order)
WHERE EXISTS (SELECT 1 FROM marker) AND NOT EXISTS (SELECT 1 FROM hr_contacts)
ON CONFLICT (id) DO NOTHING;
