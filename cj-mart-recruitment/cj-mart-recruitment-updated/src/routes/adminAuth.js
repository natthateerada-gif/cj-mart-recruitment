const express = require('express');
const { verifyAdminPassword, issueAdminSession, clearAdminSession, isAdminRequest } = require('../auth');

const router = express.Router();

router.post('/api/admin/login', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'validation', message: 'กรุณากรอกรหัสผ่าน' });
    const ok = await verifyAdminPassword(password);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials', message: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่' });
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
