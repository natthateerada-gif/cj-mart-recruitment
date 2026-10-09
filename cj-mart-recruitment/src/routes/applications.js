const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');
const { toCsv } = require('../utils/csv');
const { upload, UPLOAD_DIR, MAX_FILE_BYTES } = require('../upload');
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

const STATUS_OPTIONS = ['ใหม่', 'ติดต่อแล้ว', 'นัดสัมภาษณ์', 'รับเข้าทำงาน', 'ไม่ผ่านการพิจารณา', 'ไม่สนใจงาน', 'Blacklist'];

// Validates + normalises the applicant-supplied fields. Used by the public form
// (strict: everything on the form is required) and by the admin "edit on behalf of
// the applicant" action (lenient: only job/name/phone are required, so old
// applications that never had the newer questions can still be corrected; any value
// that IS given must still be valid). Never touches PDPA consent or the job lookup.
function validateApplicationFields(b, { lenient = false } = {}) {
  const errors = [];
  const need = (missing, msg) => { if (!lenient && missing) errors.push(msg); };

  const name = (b.name || '').trim();
  const phone = (b.phone || '').trim();
  const startDate = (b.startDate || '').trim();
  const experience = (b.experience || '').trim();
  const titleOther = (b.titlePrefixOther || '').trim();
  let titlePrefix = (b.titlePrefix || '').trim();
  if (titlePrefix === 'อื่นๆ') titlePrefix = titleOther;
  else if (titlePrefix && !TITLE_OPTIONS.includes(titlePrefix)) titlePrefix = '';
  const birthRaw = (b.birthDate || '').trim();
  const birthDate = parseBirthDate(birthRaw);
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

  need(!titlePrefix, 'กรุณาเลือกคำนำหน้าชื่อ (หากเลือก อื่นๆ ให้ระบุคำนำหน้า)');
  if (!name) errors.push('กรุณากรอกชื่อ-นามสกุล');
  if (!birthDate && (!lenient || birthRaw)) errors.push('กรุณาเลือกวัน เดือน ปีเกิดให้ถูกต้อง');
  if (!PHONE_RE.test(phone)) errors.push('เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักเท่านั้น');
  if (lenient) {
    if (province.length > 100) errors.push('ชื่อจังหวัดยาวเกินไป');
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push('วันที่พร้อมเริ่มงานไม่ถูกต้อง');
  } else {
    if (province !== ANY_PROVINCE && !PROVINCES.includes(province)) errors.push('กรุณาเลือกจังหวัดที่สมัคร');
    if (!startDate) errors.push('กรุณาเลือกวันที่พร้อมเริ่มงาน');
  }
  need(canDriveCar === null, 'กรุณาตอบคำถามว่าขับรถยนต์ได้หรือไม่');
  need(hasDriverLicense === null, 'กรุณาตอบคำถามว่ามีใบขับขี่รถยนต์หรือไม่');
  need(hasCriminalRecord === null, 'กรุณาตอบคำถามเรื่องประวัติถูกดำเนินคดี');
  if (hasCriminalRecord === true && !criminalRecordDetail) errors.push('กรุณาระบุรายละเอียดคดี');
  need(hasChronicDisease === null, 'กรุณาตอบคำถามเรื่องโรคประจำตัว');
  if (hasChronicDisease === true && !chronicDiseaseDetail) errors.push('กรุณาระบุโรคประจำตัว');
  need(workedAtKarabao === null, 'กรุณาตอบคำถามว่าเคยเป็นพนักงานในเครือคาราบาวหรือไม่');
  if (workedAtKarabao === true && !karabaoCompany) errors.push('กรุณาระบุชื่อบริษัทในเครือคาราบาวที่เคยทำงาน');
  if (!lenient) {
    if (!sourceChannel || (!SOURCE_OPTIONS.includes(sourceChannel) && !(b.sourceChannel === 'อื่นๆ'))) errors.push('กรุณาเลือกช่องทางที่รับทราบประกาศสมัครงาน');
    if (!EXPERIENCE_OPTIONS.includes(totalExperience)) errors.push('กรุณาเลือกจำนวนประสบการณ์ทำงานรวม');
  } else if (totalExperience && !EXPERIENCE_OPTIONS.includes(totalExperience)) {
    errors.push('จำนวนประสบการณ์ทำงานรวมไม่ถูกต้อง');
  }
  need(!experience, 'กรุณากรอกรายละเอียดประสบการณ์ทำงาน');

  return {
    errors,
    v: {
      name, phone, startDate, experience, titlePrefix, birthDate, lineId, province,
      canDriveCar, hasDriverLicense,
      hasCriminalRecord, criminalRecordDetail: hasCriminalRecord ? criminalRecordDetail : '',
      hasChronicDisease, chronicDiseaseDetail: hasChronicDisease ? chronicDiseaseDetail : '',
      workedAtKarabao, karabaoCompany: workedAtKarabao ? karabaoCompany : '',
      sourceChannel, totalExperience,
      email: (b.email || '').trim(),
    },
  };
}

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
// multer runs before the handler, so its rejections must be translated here
// (a try/catch inside the handler never sees them). The messages name the file
// so the applicant knows exactly which one to fix.
function receiveFiles(req, res, next) {
  upload.fields([{ name: 'resumeFile', maxCount: 1 }, { name: 'photoFile', maxCount: 1 }])(req, res, (err) => {
    if (!err) return next();
    const isPhoto = err.field === 'photoFile';
    const label = isPhoto ? 'รูปถ่าย' : 'ไฟล์ประวัติ/เรซูเม่';
    const maxMb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
    let message;
    if (err.code === 'LIMIT_FILE_SIZE') message = `${label}มีขนาดใหญ่เกินกำหนด (ไม่เกิน ${maxMb}MB ต่อไฟล์) กรุณาลดขนาดไฟล์แล้วอัปโหลดใหม่`;
    else if (err.message === 'unsupported_file_type') message = isPhoto ? 'รูปถ่ายต้องเป็นไฟล์รูปภาพ (PNG/JPG/WEBP/GIF)' : 'ไฟล์ประวัติ/เรซูเม่ต้องเป็น PDF หรือรูปภาพ (PNG/JPG/WEBP/GIF)';
    else if (err.code === 'LIMIT_UNEXPECTED_FILE') message = 'พบไฟล์แนบที่ระบบไม่รองรับ';
    if (message) return res.status(400).json({ error: 'validation', message });
    return next(err);
  });
}

// busboy decodes multipart filenames as latin1, which garbles Thai names; undo
// that when the bytes are valid UTF-8.
function fixFilename(name) {
  if (!name) return name;
  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  return fixed.includes('\ufffd') ? name : fixed;
}

router.post(
  '/api/applications',
  receiveFiles,
  async (req, res, next) => {
    try {
      const b = req.body || {};
      const files = req.files || {};
      const errors = [];

      const jobId = (b.jobId || '').trim();
      const pdpaConsent = b.pdpaConsent === 'true' || b.pdpaConsent === true;
      const { errors: fieldErrors, v } = validateApplicationFields(b);
      errors.push(...fieldErrors);
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

      // The application row and its attachments are saved together: either all
      // of it lands or none of it does.
      let rows;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        ({ rows } = await client.query(
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
          id, job.id, job.title, v.name, v.phone, v.email, v.province, v.startDate,
          [], v.experience,
          resumeFile ? 'db' : null, resumeFile ? fixFilename(resumeFile.originalname) : null, resumeFile ? resumeFile.mimetype : null,
          photoFile ? 'db' : null, photoFile ? fixFilename(photoFile.originalname) : null, photoFile ? photoFile.mimetype : null,
          'ใหม่', true,
          v.titlePrefix, v.birthDate, v.lineId, v.canDriveCar, v.hasDriverLicense, v.hasCriminalRecord,
          v.criminalRecordDetail, v.sourceChannel, v.totalExperience,
          v.hasChronicDisease, v.chronicDiseaseDetail,
          v.workedAtKarabao, v.karabaoCompany,
        ]
        ));
        for (const [kind, f] of [['resume', resumeFile], ['photo', photoFile]]) {
          if (!f) continue;
          await client.query(
            'INSERT INTO application_files (application_id, kind, data, mime_type, original_name) VALUES ($1,$2,$3,$4,$5)',
            [id, kind, f.buffer, f.mimetype, fixFilename(f.originalname)]
          );
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      const application = rowToApplication(rows[0]);
      notifyRmsWebhook('application.created', application);
      res.status(201).json({ ok: true, application });
    } catch (err) { next(err); }
  }
);

// Admin: list applications with optional filters + pagination.
router.get('/api/admin/applications', requireAdmin, async (req, res, next) => {
  try {
    const { jobId, status, q, page = '1', pageSize = '50' } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;
    if (jobId) { conditions.push(`job_id = $${i}`); values.push(jobId); i += 1; }
    if (status) { conditions.push(`status = $${i}`); values.push(status); i += 1; }
    // Keyword search: every word (space-separated, max 5) must match at least one of
    // name / phone / email / LINE ID / province / job title / source channel.
    // Phone numbers also match when typed without dashes or spaces.
    const words = String(q || '').trim().slice(0, 100).split(/\s+/).filter(Boolean).slice(0, 5);
    for (const word of words) {
      const like = `%${word.replace(/[\\%_]/g, '\\$&')}%`;
      const fields = ['name', 'phone', 'email', 'line_id', 'area', 'job_title', 'source_channel'];
      const parts = fields.map((f) => `${f} ILIKE $${i}`);
      values.push(like); i += 1;
      const digits = word.replace(/\D/g, '');
      if (digits.length >= 3) {
        parts.push(`regexp_replace(phone, '\\D', '', 'g') LIKE $${i}`);
        values.push(`%${digits}%`); i += 1;
      }
      conditions.push(`(${parts.join(' OR ')})`);
    }
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

// Admin: change status only ({status}) OR edit the applicant's details on their
// behalf (any other keys present -> full edit with the lenient validator; the
// attachments and PDPA consent are not touched).
router.patch('/api/admin/applications/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const fullEdit = Object.keys(body).some((k) => k !== 'status');

    if (!fullEdit) {
      const { status } = body;
      if (!STATUS_OPTIONS.includes(status)) {
        return res.status(400).json({ error: 'validation', message: 'สถานะไม่ถูกต้อง' });
      }
      const { rows } = await pool.query(
        'UPDATE applications SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
      return res.json(rowToApplication(rows[0]));
    }

    const { errors, v } = validateApplicationFields(body, { lenient: true });
    const jobId = (body.jobId || '').trim();
    let job = null;
    if (!jobId) errors.push('กรุณาเลือกตำแหน่งที่สมัคร');
    else {
      const jobRes = await pool.query('SELECT id, title FROM jobs WHERE id = $1', [jobId]);
      if (jobRes.rows.length === 0) errors.push('ไม่พบตำแหน่งงานที่เลือก');
      else job = jobRes.rows[0];
    }
    if (body.status !== undefined && !STATUS_OPTIONS.includes(body.status)) errors.push('สถานะไม่ถูกต้อง');
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation', message: errors.join(' / '), errors });
    }

    const { rows } = await pool.query(
      `UPDATE applications SET
         job_id = $1, job_title = $2, name = $3, phone = $4, email = $5, area = $6,
         start_date = $7, experience = $8, title_prefix = $9, birth_date = $10, line_id = $11,
         can_drive_car = $12, has_driver_license = $13, has_criminal_record = $14, criminal_record_detail = $15,
         has_chronic_disease = $16, chronic_disease_detail = $17, worked_at_karabao = $18, karabao_company = $19,
         source_channel = $20, total_experience = $21,
         status = COALESCE($22, status), updated_at = now()
       WHERE id = $23 RETURNING *`,
      [
        job.id, job.title, v.name, v.phone, v.email, v.province,
        v.startDate || null, v.experience, v.titlePrefix, v.birthDate, v.lineId,
        v.canDriveCar, v.hasDriverLicense, v.hasCriminalRecord, v.criminalRecordDetail,
        v.hasChronicDisease, v.chronicDiseaseDetail, v.workedAtKarabao, v.karabaoCompany,
        v.sourceChannel, v.totalExperience,
        body.status === undefined ? null : body.status,
        req.params.id,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found', message: 'ไม่พบใบสมัครนี้ (อาจถูกลบไปแล้ว)' });
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
    // Current storage: bytes in Postgres.
    const { rows: fileRows } = await pool.query(
      'SELECT data, mime_type, original_name FROM application_files WHERE application_id = $1 AND kind = $2',
      [req.params.id, kind]
    );
    if (fileRows.length > 0) {
      const f = fileRows[0];
      const fallbackName = kind === 'resume' ? 'resume' : 'photo';
      const fileName = f.original_name || fallbackName;
      res.setHeader('Content-Type', f.mime_type || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      return res.send(f.data);
    }
    // Legacy: files written to local disk before attachments moved into Postgres.
    const col = kind === 'resume' ? 'resume_path' : 'photo_path';
    const nameCol = kind === 'resume' ? 'resume_original_name' : 'photo_original_name';
    const { rows } = await pool.query(`SELECT ${col} AS path, ${nameCol} AS name FROM applications WHERE id = $1`, [req.params.id]);
    if (rows.length === 0 || !rows[0].path) return res.status(404).json({ error: 'not_found' });
    const legacyPath = path.join(UPLOAD_DIR, path.basename(rows[0].path));
    if (rows[0].path !== 'db' && fs.existsSync(legacyPath)) {
      return res.download(legacyPath, rows[0].name || rows[0].path);
    }
    return res.status(404).type('text').send('ไม่พบไฟล์แนบนี้ (ไฟล์ที่อัปโหลดก่อนการปรับระบบถูกลบไปเมื่อเซิร์ฟเวอร์ deploy/restart) กรุณาขอให้ผู้สมัครส่งไฟล์ใหม่');
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
