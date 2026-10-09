const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verifyAdminPassword, issueAdminSession, clearAdminSession, resolveAdmin } = require('../auth');

const router = express.Router();

// Brute-force protection: after LOGIN_MAX_FAILURES wrong passwords from one IP within
// LOGIN_WINDOW_MINUTES, further attempts get 429 until the window passes.
// In-memory, per app instance.
const MAX_FAILURES = parseInt(process.env.LOGIN_MAX_FAILURES, 10) || 10;
const WINDOW_MS = (parseInt(process.env.LOGIN_WINDOW_MINUTES, 10) || 15) * 60 * 1000;
const failures = new Map(); // ip -> { count, resetAt }

function isBlocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() > f.resetAt) { failures.delete(ip); return false; }
  return f.count >= MAX_FAILURES;
}
function recordFailure(ip) {
  const now = Date.now();
  const f = failures.get(ip);
  if (!f || now > f.resetAt) failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else f.count += 1;
  if (failures.size > 5000) { // keep memory bounded
    for (const [k, v] of failures) if (now > v.resetAt) failures.delete(k);
  }
}

// Used so that "unknown email" costs the same time as "wrong password".
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, isOwner: !!u.isOwner });

// Body: { password } = shared owner password, or { email, password } = personal account.
router.post('/api/admin/login', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    const email = ((req.body && req.body.email) || '').trim().toLowerCase();
    if (!password) return res.status(400).json({ error: 'validation', message: 'กรุณากรอกรหัสผ่าน' });
    const ip = req.ip;
    if (isBlocked(ip)) {
      return res.status(429).json({ error: 'too_many_attempts', message: 'ลองรหัสผ่านผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' });
    }
    const fail = () => {
      recordFailure(ip);
      return res.status(401).json({ error: 'invalid_credentials', message: email ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่' : 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่' });
    };

    if (!email) {
      if (!(await verifyAdminPassword(password))) return fail();
      failures.delete(ip);
      const owner = { id: 'owner', name: 'ผู้ดูแลระบบหลัก', email: '', isOwner: true };
      issueAdminSession(res, owner);
      return res.json({ ok: true, user: publicUser(owner) });
    }

    const { rows } = await pool.query(
      'SELECT id, name, email, active, password_hash FROM admin_users WHERE lower(email) = $1',
      [email]
    );
    const row = rows[0];
    const match = await bcrypt.compare(String(password), row ? row.password_hash : DUMMY_HASH);
    if (!row || !match || !row.active) return fail();
    failures.delete(ip);
    await pool.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [row.id]);
    issueAdminSession(res, row);
    return res.json({ ok: true, user: publicUser(row) });
  } catch (err) { next(err); }
});

router.post('/api/admin/logout', (req, res) => {
  clearAdminSession(res);
  res.json({ ok: true });
});

router.get('/api/admin/session', async (req, res, next) => {
  try {
    const admin = await resolveAdmin(req);
    res.json({ loggedIn: !!admin, user: admin ? publicUser(admin) : null });
  } catch (err) { next(err); }
});

module.exports = router;
