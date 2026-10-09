const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt only uses the first 72 bytes

function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    active: row.active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

function passwordError(p) {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) return `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
  if (Buffer.byteLength(p, 'utf8') > MAX_PASSWORD) return `รหัสผ่านยาวเกินไป (ไม่เกิน ${MAX_PASSWORD} ไบต์)`;
  return null;
}

// Change my own password (personal accounts only).
router.post('/api/admin/me/password', requireAdmin, async (req, res, next) => {
  try {
    if (req.admin.isOwner) {
      return res.status(400).json({ error: 'validation', message: 'บัญชีผู้ดูแลระบบหลักใช้รหัสผ่านที่ตั้งไว้ในเซิร์ฟเวอร์ (.env) เปลี่ยนที่นั่น' });
    }
    const { currentPassword, newPassword } = req.body || {};
    const perr = passwordError(newPassword);
    if (perr) return res.status(400).json({ error: 'validation', message: perr });
    const { rows } = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [req.admin.id]);
    if (rows.length === 0 || !(await bcrypt.compare(String(currentPassword || ''), rows[0].password_hash))) {
      return res.status(400).json({ error: 'validation', message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admin_users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, req.admin.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Managing accounts: any logged-in admin (all accounts have the same access).
router.use('/api/admin/users', requireAdmin);

router.get('/api/admin/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM admin_users ORDER BY created_at ASC');
    res.json(rows.map(toUser));
  } catch (err) { next(err); }
});

router.post('/api/admin/users', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = (b.name || '').trim();
    const email = (b.email || '').trim().toLowerCase();
    const errors = [];
    if (!name) errors.push('กรุณากรอกชื่อ');
    if (name.length > 100) errors.push('ชื่อยาวเกินไป');
    if (!EMAIL_RE.test(email) || email.length > 200) errors.push('อีเมลไม่ถูกต้อง');
    const perr = passwordError(b.password);
    if (perr) errors.push(perr);
    if (errors.length) return res.status(400).json({ error: 'validation', message: errors.join(' / '), errors });

    const dup = await pool.query('SELECT 1 FROM admin_users WHERE lower(email) = $1', [email]);
    if (dup.rows.length) return res.status(409).json({ error: 'duplicate', message: 'อีเมลนี้มีบัญชีอยู่แล้ว' });

    const hash = await bcrypt.hash(b.password, 10);
    const { rows } = await pool.query(
      'INSERT INTO admin_users (id, email, name, password_hash) VALUES ($1,$2,$3,$4) RETURNING *',
      [uid(), email, name, hash]
    );
    res.status(201).json(toUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'duplicate', message: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
    next(err);
  }
});

// Partial update: name, email, active, and/or a new password (reset).
router.patch('/api/admin/users/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const cur = await pool.query('SELECT * FROM admin_users WHERE id = $1', [req.params.id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'not_found', message: 'ไม่พบบัญชีนี้' });
    const row = cur.rows[0];
    const isSelf = row.id === req.admin.id;

    const errors = [];
    const name = b.name === undefined ? row.name : String(b.name).trim();
    const email = b.email === undefined ? row.email : String(b.email).trim().toLowerCase();
    const active = b.active === undefined ? row.active : !!b.active;
    if (!name || name.length > 100) errors.push('กรุณากรอกชื่อ (ไม่เกิน 100 ตัวอักษร)');
    if (!EMAIL_RE.test(email) || email.length > 200) errors.push('อีเมลไม่ถูกต้อง');
    if (isSelf && !active) errors.push('ไม่สามารถปิดการใช้งานบัญชีตัวเองได้');
    let hash = null;
    if (b.password !== undefined && b.password !== '') {
      const perr = passwordError(b.password);
      if (perr) errors.push(perr);
      else hash = await bcrypt.hash(b.password, 10);
    }
    if (errors.length) return res.status(400).json({ error: 'validation', message: errors.join(' / '), errors });

    if (email !== row.email.toLowerCase()) {
      const dup = await pool.query('SELECT 1 FROM admin_users WHERE lower(email) = $1 AND id <> $2', [email, row.id]);
      if (dup.rows.length) return res.status(409).json({ error: 'duplicate', message: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
    }
    const { rows } = await pool.query(
      `UPDATE admin_users SET name = $1, email = $2, active = $3,
         password_hash = COALESCE($4, password_hash), updated_at = now()
       WHERE id = $5 RETURNING *`,
      [name, email, active, hash, row.id]
    );
    res.json(toUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'duplicate', message: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
    next(err);
  }
});

router.delete('/api/admin/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.admin.id) {
      return res.status(400).json({ error: 'validation', message: 'ไม่สามารถลบบัญชีตัวเองได้' });
    }
    const { rowCount } = await pool.query('DELETE FROM admin_users WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'not_found', message: 'ไม่พบบัญชีนี้' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
