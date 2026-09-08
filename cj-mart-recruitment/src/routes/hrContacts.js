// HR staff shown on the public "ติดต่อเจ้าหน้าที่" page. Different HR staff
// often cover different positions, so each contact carries a free-text
// "coverage" note (e.g. which job titles/departments they handle).

const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');

const router = express.Router();

function rowToContact(row) {
  return {
    id: row.id,
    name: row.name,
    coverage: row.coverage,
    phone: row.phone,
    email: row.email,
    lineId: row.line_id,
    displayOrder: row.display_order,
  };
}

router.get('/api/hr-contacts', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM hr_contacts ORDER BY display_order ASC, created_at ASC');
    res.json(rows.map(rowToContact));
  } catch (err) { next(err); }
});

router.get('/api/admin/hr-contacts', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM hr_contacts ORDER BY display_order ASC, created_at ASC');
    res.json(rows.map(rowToContact));
  } catch (err) { next(err); }
});

router.post('/api/admin/hr-contacts', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = (b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'validation', message: 'กรุณากรอกชื่อเจ้าหน้าที่' });
    const { rows } = await pool.query(
      `INSERT INTO hr_contacts (id, name, coverage, phone, email, line_id, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [uid(), name, (b.coverage || '').trim(), (b.phone || '').trim(), (b.email || '').trim(),
       (b.lineId || '').trim(), Number.isFinite(b.displayOrder) ? b.displayOrder : 0]
    );
    res.status(201).json(rowToContact(rows[0]));
  } catch (err) { next(err); }
});

router.patch('/api/admin/hr-contacts/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const fields = [];
    const values = [];
    let i = 1;
    const map = { name: 'name', coverage: 'coverage', phone: 'phone', email: 'email', lineId: 'line_id', displayOrder: 'display_order' };
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        fields.push(`${map[key]} = $${i}`);
        values.push(b[key]);
        i += 1;
      }
    });
    if (fields.length === 0) return res.status(400).json({ error: 'validation', message: 'ไม่มีข้อมูลให้อัปเดต' });
    fields.push('updated_at = now()');
    values.push(id);
    const { rows } = await pool.query(`UPDATE hr_contacts SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(rowToContact(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/api/admin/hr-contacts/:id', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM hr_contacts WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
