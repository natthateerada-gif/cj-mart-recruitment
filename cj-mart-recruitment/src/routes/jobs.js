const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { newJobId } = require('../utils/id');
const { toCsv, parseCsv } = require('../utils/csv');

const router = express.Router();

function rowToJob(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    shift: row.shift,
    salaryRange: row.salary_range,
    summary: row.summary,
    requirements: row.requirements,
    open: row.is_open,
  };
}

// Public: only open jobs, for the careers page.
router.get('/api/jobs', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE is_open = true ORDER BY created_at ASC');
    res.json(rows.map(rowToJob));
  } catch (err) { next(err); }
});

// Admin: all jobs including closed ones, for the manage-jobs panel.
router.get('/api/admin/jobs', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at ASC');
    res.json(rows.map(rowToJob));
  } catch (err) { next(err); }
});

router.post('/api/admin/jobs', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = (b.title || '').trim();
    if (!title) return res.status(400).json({ error: 'validation', message: 'กรุณากรอกชื่อตำแหน่งงาน' });
    const id = newJobId();
    const { rows } = await pool.query(
      `INSERT INTO jobs (id, title, type, shift, salary_range, summary, requirements, is_open)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING *`,
      [id, title, (b.type || '').trim() || 'ไม่ระบุ', (b.shift || '').trim() || 'ไม่ระบุ',
       (b.salaryRange || '').trim() || 'แจ้งในวันสัมภาษณ์', (b.summary || '').trim() || '-',
       (b.requirements || '').trim() || '-']
    );
    res.status(201).json(rowToJob(rows[0]));
  } catch (err) { next(err); }
});

router.patch('/api/admin/jobs/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const fields = [];
    const values = [];
    let i = 1;
    const map = { title: 'title', type: 'type', shift: 'shift', salaryRange: 'salary_range', summary: 'summary', requirements: 'requirements', open: 'is_open' };
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        fields.push(`${map[key]} = $${i}`);
        values.push(b[key]);
        i += 1;
      }
    });
    if (fields.length === 0) return res.status(400).json({ error: 'validation', message: 'ไม่มีข้อมูลให้อัปเดต' });
    fields.push(`updated_at = now()`);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE jobs SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(rowToJob(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/api/admin/jobs/:id', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

router.get('/api/admin/export/jobs.csv', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at ASC');
    const csv = toCsv(rows.map(rowToJob), [
      { label: 'id', value: 'id' },
      { label: 'title', value: 'title' },
      { label: 'type', value: 'type' },
      { label: 'shift', value: 'shift' },
      { label: 'salaryRange', value: 'salaryRange' },
      { label: 'summary', value: 'summary' },
      { label: 'requirements', value: 'requirements' },
      { label: 'open', value: (j) => (j.open ? 'TRUE' : 'FALSE') },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cjmart-jobs-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// Upsert jobs from a CSV file (same shape the export produces). Matches an
// existing job by id when one is given and present; otherwise creates new.
router.post('/api/admin/import/jobs', requireAdmin, express.text({ type: '*/*', limit: '2mb' }), async (req, res, next) => {
  try {
    const rows = parseCsv(req.body || '');
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      const title = (r.title || '').trim();
      if (!title) continue;
      const openVal = String(r.open || '').trim().toUpperCase();
      const isOpen = openVal === '' ? true : (openVal === 'TRUE' || openVal === '1' || openVal === 'YES');
      if (r.id) {
        const { rowCount } = await pool.query(
          `UPDATE jobs SET title=$1, type=$2, shift=$3, salary_range=$4, summary=$5, requirements=$6, is_open=$7, updated_at=now() WHERE id=$8`,
          [title, r.type || 'ไม่ระบุ', r.shift || 'ไม่ระบุ', r.salaryRange || 'แจ้งในวันสัมภาษณ์', r.summary || '-', r.requirements || '-', isOpen, r.id]
        );
        if (rowCount > 0) { updated += 1; continue; }
      }
      await pool.query(
        `INSERT INTO jobs (id, title, type, shift, salary_range, summary, requirements, is_open) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newJobId(), title, r.type || 'ไม่ระบุ', r.shift || 'ไม่ระบุ', r.salaryRange || 'แจ้งในวันสัมภาษณ์', r.summary || '-', r.requirements || '-', isOpen]
      );
      created += 1;
    }
    res.json({ created, updated });
  } catch (err) { next(err); }
});

module.exports = router;
