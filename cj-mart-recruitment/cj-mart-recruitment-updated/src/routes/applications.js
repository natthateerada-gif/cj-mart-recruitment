const express = require('express');
const path = require('path');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');
const { toCsv } = require('../utils/csv');
const { upload, UPLOAD_DIR } = require('../upload');
const { notifyRmsWebhook } = require('../utils/webhook');

const router = express.Router();

const AVAILABILITY_OPTIONS = ['กะเช้า', 'กะบ่าย', 'กะดึก', 'วันหยุด/สุดสัปดาห์', 'ยืดหยุ่นได้ทุกช่วงเวลา'];
const STATUS_OPTIONS = ['ใหม่', 'ติดต่อแล้ว', 'นัดสัมภาษณ์', 'รับเข้าทำงาน', 'ไม่ผ่านการพิจารณา'];

function rowToApplication(row, { includeFilePaths = false } = {}) {
  const out = {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    name: row.name,
    phone: row.phone,
    email: row.email,
    area: row.area,
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
      let availability = b.availability;
      if (typeof availability === 'string') availability = [availability];
      availability = (availability || []).filter((a) => AVAILABILITY_OPTIONS.includes(a));
      const pdpaConsent = b.pdpaConsent === 'true' || b.pdpaConsent === true;

      if (!name) errors.push('กรุณากรอกชื่อ-นามสกุล');
      if (!phone || !/^[0-9+\-\s]{9,15}$/.test(phone)) errors.push('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง');
      if (!startDate) errors.push('กรุณาเลือกวันที่พร้อมเริ่มงาน');
      if (!experience) errors.push('กรุณากรอกประสบการณ์ทำงาน');
      if (availability.length === 0) errors.push('กรุณาเลือกเวลาที่สะดวกทำงานอย่างน้อย 1 ช่วง');
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
           status, pdpa_consent, pdpa_consent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
         RETURNING *`,
        [
          id, job.id, job.title, name, phone, (b.email || '').trim(), (b.area || '').trim(), startDate,
          availability, experience,
          resumeFile ? resumeFile.filename : null, resumeFile ? resumeFile.originalname : null, resumeFile ? resumeFile.mimetype : null,
          photoFile ? photoFile.filename : null, photoFile ? photoFile.originalname : null, photoFile ? photoFile.mimetype : null,
          'ใหม่', true,
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
      { label: 'area', value: 'area' },
      { label: 'startDate', value: (a) => (a.startDate ? new Date(a.startDate).toISOString().slice(0, 10) : '') },
      { label: 'availability', value: (a) => (a.availability || []).join(', ') },
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
