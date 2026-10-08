const express = require('express');
const { verifyAdminPassword, issueAdminSession, clearAdminSession, isAdminRequest } = require('../auth');

const router = express.Router();

// Brute-force protection for the (single, shared) admin password: after
// LOGIN_MAX_FAILURES wrong passwords from one IP within LOGIN_WINDOW_MINUTES,
// further attempts get 429 until the window passes. In-memory, per app instance.
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

router.post('/api/admin/login', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'validation', message: 'กรุณากรอกรหัสผ่าน' });
    const ip = req.ip;
    if (isBlocked(ip)) {
      return res.status(429).json({ error: 'too_many_attempts', message: 'ลองรหัสผ่านผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' });
    }
    const ok = await verifyAdminPassword(password);
    if (!ok) {
      recordFailure(ip);
      return res.status(401).json({ error: 'invalid_credentials', message: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่' });
    }
    failures.delete(ip);
    issueAdminSession(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/api/admin/logout', (req, res) => {
  clearAdminSession(res);
  res.json({ ok: true });
});

router.get('/api/admin/session', (req, res) => {
  res.json({ loggedIn: isAdminRequest(req) });
});

module.exports = router;
