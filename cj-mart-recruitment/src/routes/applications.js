const express = require('express');
const path = require('path');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');
const { toCsv } = require('../utils/csv');
const { upload, UPLOAD_DIR } = require('../upload');
const { notifyRmsWebhook } = require('../utils/webhook');
const { PROVINCES, ANY_PROVINCE } = require('../utils/provinces');

const router = express.Router();

const AVAILABILITY_OPTIONS = ['กะเช้า', 'กะบ่าย', 'กะดึก', 'วันหยุด/สุดสัปดาห์', 'ยืดหยุ่นได้ทุกช่วงเวลา'];
const TITLE_OPTIONS = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ ร.ต.'];
const SOURCE_OPTIONS = ['Facebook', 'Tiktok', 'โฆษณา Facebook', 'ป้ายโฆษณา', 'เพื่อนแนะนำ', 'Jobthai', 'JobBkk', 'JobsDB', 'LinkedIn', 'Line'];
const EXPERIENCE_OPTIONS = ['ไม่มีประสบการณ์', 'น้อยกว่า 1 ปี', '1-2 ปี', '3-5 ปี', '6-10 ปี', 'มากกว่า 10 ปี'];
const PHONE_RE = /^[0-9]{10}$/;

// 'true'/'false' (FormData strings) or real booleans -> boolean, anything else -> null
function parseYesNo(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

// Birth date arrives as a Gregorian ISO date (the frontend converts from the
// พ.ศ. dropdowns). Must be a real calendar date, not in the future, year >= 1900.
function parseBirthDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1900 || dt.getTime() > Date.now()) return null;
  return v;
}

const STATUS_OPTIONS = ['ใหม่', 'ติดต่อแล้ว', 'นัดสัมภาษณ์', 'รับเข้าทำงาน', 'ไม่ผ่านการพิจารณา'];

function rowToApplication(row, { includeFilePaths = false } = {}) {
  const out = {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    name: row.name,
    phone: row.phone,
    email: row.email,
    titlePrefix: row.title_prefix || '',
    birthDate: row.birth_date,
    lineId: row.line_id || '',
    province: row.area,
    area: row.area,
    canDriveCar: row.can_drive_car,
    hasDriverLicense: row.has_driver_license,
    hasCriminalRecord: row.has_criminal_record,
    criminalRecordDetail: row.criminal_record_detail || '',
    hasChronicDisease: row.has_chronic_disease,
    chronicDiseaseDetail: row.chronic_disease_detail || '',
    workedAtKarabao: row.worked_at_karabao,
    karabaoCompany: row.karabao_company || '',
    sourceChannel: row.source_channel || '',
    totalExperience: row.total_experience || '',
    startDate: row.start_date,
    availability: row.availability,
    experience: row.experience,
    hasResume: !!row.resume_path,
    hasPhoto: !!row.photo_path,
    resumeOriginalName: row.resume_original_name,
    photoOriginalName: row.photo_original_name,
    status: row.status,
    pdpaConsent: row.pdpa_consent,
    pdpaConsentAt: row.pdpa_consent_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
  if (includeFilePaths) {
    out.resumePath = row.resume_path;
    out.photoPath = row.photo_path;
  }
  return out;
}

// Public: submit a new application (multipart/form-data with optional
// resumeFile / photoFile). PDPA consent is re-validated server-side —
// the frontend's own consent modal is not trusted on its own.
router.post(
  '/api/applications',
  upload.fields([{ name: 'resumeFile', maxCount: 1 }, { name: 'photoFile', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const b = req.body || {};
      const files = req.files || {};
      const errors = [];

      const jobId = (b.jobId || '').trim();
      const name = (b.name || '').trim();
      const phone = (b.phone || '').trim();
      const startDate = (b.startDate || '').trim();
      const experience = (b.experience || '').trim();
      const titleOther = (b.titlePrefixOther || '').trim();
      let titlePrefix = (b.titlePrefix || '').trim();
      if (titlePrefix === 'อื่นๆ') titlePrefix = titleOther;
      else if (titlePrefix && !TITLE_OPTIONS.includes(titlePrefix)) titlePrefix = '';
      const birthDate = parseBirthDate((b.birthDate || '').trim());
      const lineId = (b.lineId || '').trim();
      const province = (b.province || '').trim();
      const canDriveCar = parseYesNo(b.canDriveCar);
      const hasDriverLicense = parseYesNo(b.hasDriverLicense);
      const hasCriminalRecord = parseYesNo(b.hasCriminalRecord);
      const criminalRecordDetail = (b.criminalRecordDetail || '').trim();
      const hasChronicDisease = parseYesNo(b.hasChronicDisease);
      const chronicDiseaseDetail = (b.chronicDiseaseDetail || '').trim();
      const workedAtKarabao = parseYesNo(b.workedAtKarabao);
      const karabaoCompany = (b.karabaoCompany || '').trim();
      let sourceChannel = (b.sourceChannel || '').trim();
      if (sourceChannel === 'อื่นๆ') sourceChannel = (b.sourceChannelOther || '').trim() || 'อื่นๆ';
      const totalExperience = (b.totalExperience || '').trim();
      const pdpaConsent = b.pdpaConsent === 'true' || b.pdpaConsent === true;

      if (!titlePrefix) errors.push('กรุณาเลือกคำนำหน้าชื่อ (หากเลือก อื่นๆ ให้ระบุคำนำหน้า)');
      if (!name) errors.push('กรุณากรอกชื่อ-นามสกุล');
      if (!birthDate) errors.push('กรุณาเลือกวัน เดือน ปีเกิดให้ถูกต้อง');
      if (!PHONE_RE.test(phone)) errors.push('เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักเท่านั้น');
      if (province !== ANY_PROVINCE && !PROVINCES.includes(province)) errors.push('กรุณาเลือกจังหวัดที่สมัคร');
      if (!startDate) errors.push('กรุณาเลือกวันที่พร้อมเริ่มงาน');
      if (canDriveCar === null) errors.push('กรุณาตอบคำถามว่าขับรถยนต์ได้หรือไม่');
      if (hasDriverLicense === null) errors.push('กรุณาตอบคำถามว่ามีใบขับขี่รถยนต์หรือไม่');
      if (hasCriminalRecord === null) errors.push('กรุณาตอบคำถามเรื่องประวัติถูกดำเนินคดี');
      if (hasCriminalRecord === true && !criminalRecordDetail) errors.push('กรุณาระบุรายละเอียดคดี');
      if (hasChronicDisease === null) errors.push('กรุณาตอบคำถามเรื่องโรคประจำตัว');
      if (hasChronicDisease === true && !chronicDiseaseDetail) errors.push('กรุณาระบุโรคประจำตัว');
      if (workedAtKarabao === null) errors.push('กรุณาตอบคำถามว่าเคยเป็นพนักงานในเครือคาราบาวหรือไม่');
      if (workedAtKarabao === true && !karabaoCompany) errors.push('กรุณาระบุชื่อบริษัทในเครือคาราบาวที่เคยทำงาน');
      if (!sourceChannel || (!SOURCE_OPTIONS.includes(sourceChannel) && !(b.sourceChannel === 'อื่นๆ'))) errors.push('กรุณาเลือกช่องทางที่รับทราบประกาศสมัครงาน');
      if (!EXPERIENCE_OPTIONS.includes(totalExperience)) errors.push('กรุณาเลือกจำนวนประสบการณ์ทำงานรวม');
      if (!experience) errors.push('กรุณากรอกรายละเอียดประสบการณ์ทำงาน');
      if (!pdpaConsent) errors.push('กรุณายืนยันความยินยอม PDPA ก่อนส่งใบสมัคร');

      const jobRes = await pool.query('SELECT * FROM jobs WHERE id = $1 AND is_open = true', [jobId]);
      if (jobRes.rows.length === 0) errors.push('กรุณาเลือกตำแหน่งที่เปิดรับสมัคร');

      if (errors.length > 0) {
        return res.status(400).json({ error: 'validation', message: errors.join(' / '), errors });
      }

      const job = jobRes.rows[0];
      const id = uid();
      const resumeFile = files.resumeFile && files.resumeFile[0];
      const photoFile = files.photoFile && files.photoFile[0];

      const { rows } = await pool.query(
        `INSERT INTO applications
          (id, job_id, job_title, name, phone, email, area, start_date, availability, experience,
           resume_path, resume_original_name, resume_mime_type, photo_path, photo_original_name, photo_mime_type,
           status, pdpa_consent, pdpa_consent_at,
           title_prefix, birth_date, line_id, can_drive_car, has_driver_license, has_criminal_record,
           criminal_record_detail, source_channel, total_experience,
           has_chronic_disease, chronic_disease_detail, worked_at_karabao, karabao_company)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),
                 $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
         RETURNING *`,
        [
          id, job.id, job.title, name, phone, (b.email || '').trim(), province, startDate,
          [], experience,
          resumeFile ? resumeFile.filename : null, resumeFile ? resumeFile.originalname : null, resumeFile ? resumeFile.mimetype : null,
          photoFile ? photoFile.filename : null, photoFile ? photoFile.originalname : null, photoFile ? photoFile.mimetype : null,
          'ใหม่', true,
          titlePrefix, birthDate, lineId, canDriveCar, hasDriverLicense, hasCriminalRecord,
          hasCriminalRecord ? criminalRecordDetail : '', sourceChannel, totalExperience,
          hasChronicDisease, hasChronicDisease ? chronicDiseaseDetail : '',
          workedAtKarabao, workedAtKarabao ? karabaoCompany : '',
        ]
      );

      const application = rowToApplication(rows[0]);
      notifyRmsWebhook('application.created', application);
      res.status(201).json({ ok: true, application });
    } catch (err) {
      if (err.message === 'unsupported_file_type') {
        return res.status(400).json({ error: 'validation', message: 'รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (PNG/JPG/WEBP/GIF)' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'validation', message: 'ไฟล์แนบมีขนาดใหญ่เกินไป (ไม่เกิน 5MB ต่อไฟล์)' });
      }
      next(err);
    }
  }
);

// Admin: list applications with optional filters + pagination.
router.get('/api/admin/applications', requireAdmin, async (req, res, next) => {
  try {
    const { jobId, status, page = '1', pageSize = '50' } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;
    if (jobId) { conditions.push(`job_id = $${i}`); values.push(jobId); i += 1; }
    if (status) { conditions.push(`status = $${i}`); values.push(status); i += 1; }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

    const countRes = await pool.query(`SELECT COUNT(*) FROM applications ${where}`, values);
    const dataRes = await pool.query(
      `SELECT * FROM applications ${where} ORDER BY submitted_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      values.concat([limit, offset])
    );
    res.json({
      total: parseInt(countRes.rows[0].count, 10),
      page: Math.max(parseInt(page, 10) || 1, 1),
      pageSize: limit,
      applications: dataRes.rows.map((r) => rowToApplication(r)),
    });
  } catch (err) { next(err); }
});

router.patch('/api/admin/applications/:id', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!STATUS_OPTIONS.includes(status)) {
      return res.status(400).json({ error: 'validation', message: 'สถานะไม่ถูกต้อง' });
    }
    const { rows } = await pool.query(
      'UPDATE applications SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(rowToApplication(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/api/admin/applications/:id', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

async function streamAttachment(req, res, next, kind) {
  try {
    const col = kind === 'resume' ? 'resume_path' : 'photo_path';
    const nameCol = kind === 'resume' ? 'resume_original_name' : 'photo_original_name';
    const { rows } = await pool.query(`SELECT ${col} AS path, ${nameCol} AS name FROM applications WHERE id = $1`, [req.params.id]);
    if (rows.length === 0 || !rows[0].path) return res.status(404).json({ error: 'not_found' });
    res.download(path.join(UPLOAD_DIR, rows[0].path), rows[0].name || rows[0].path);
  } catch (err) { next(err); }
}

router.get('/api/admin/applications/:id/resume', requireAdmin, (req, res, next) => streamAttachment(req, res, next, 'resume'));
router.get('/api/admin/applications/:id/photo', requireAdmin, (req, res, next) => streamAttachment(req, res, next, 'photo'));

router.get('/api/admin/export/applicants.csv', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM applications ORDER BY submitted_at DESC');
    const csv = toCsv(rows.map((r) => rowToApplication(r)), [
      { label: 'submittedAt', value: (a) => (a.submittedAt ? new Date(a.submittedAt).toISOString() : '') },
      { label: 'name', value: 'name' },
      { label: 'jobTitle', value: 'jobTitle' },
      { label: 'phone', value: 'phone' },
      { label: 'email', value: 'email' },
      { label: 'titlePrefix', value: 'titlePrefix' },
      { label: 'birthDate', value: (a) => (a.birthDate ? new Date(a.birthDate).toISOString().slice(0, 10) : '') },
      { label: 'lineId', value: 'lineId' },
      { label: 'province', value: 'province' },
      { label: 'startDate', value: (a) => (a.startDate ? new Date(a.startDate).toISOString().slice(0, 10) : '') },
      { label: 'canDriveCar', value: (a) => (a.canDriveCar === null ? '' : a.canDriveCar ? 'TRUE' : 'FALSE') },
      { label: 'hasDriverLicense', value: (a) => (a.hasDriverLicense === null ? '' : a.hasDriverLicense ? 'TRUE' : 'FALSE') },
      { label: 'hasCriminalRecord', value: (a) => (a.hasCriminalRecord === null ? '' : a.hasCriminalRecord ? 'TRUE' : 'FALSE') },
      { label: 'criminalRecordDetail', value: 'criminalRecordDetail' },
      { label: 'hasChronicDisease', value: (a) => (a.hasChronicDisease === null ? '' : a.hasChronicDisease ? 'TRUE' : 'FALSE') },
      { label: 'chronicDiseaseDetail', value: 'chronicDiseaseDetail' },
      { label: 'workedAtKarabao', value: (a) => (a.workedAtKarabao === null ? '' : a.workedAtKarabao ? 'TRUE' : 'FALSE') },
      { label: 'karabaoCompany', value: 'karabaoCompany' },
      { label: 'sourceChannel', value: 'sourceChannel' },
      { label: 'totalExperience', value: 'totalExperience' },
      { label: 'availability(legacy)', value: (a) => (a.availability || []).join(', ') },
      { label: 'experience', value: 'experience' },
      { label: 'status', value: 'status' },
      { label: 'hasResume', value: (a) => (a.hasResume ? 'TRUE' : 'FALSE') },
      { label: 'hasPhoto', value: (a) => (a.hasPhoto ? 'TRUE' : 'FALSE') },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cjmart-applicants-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

router.get('/api/admin/export/applicants.json', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM applications ORDER BY submitted_at DESC');
    res.setHeader('Content-Disposition', `attachment; filename="cjmart-applicants-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(rows.map((r) => rowToApplication(r)));
  } catch (err) { next(err); }
});

module.exports = { router, rowToApplication, STATUS_OPTIONS, AVAILABILITY_OPTIONS };
