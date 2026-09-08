const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'cjmart_admin_session';
const TOKEN_TTL = '12h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET is not set (or too short). Set a long random string in .env.');
  }
  return secret;
}

async function verifyAdminPassword(candidate) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plain = process.env.ADMIN_PASSWORD;
  if (hash) {
    return bcrypt.compare(candidate, hash);
  }
  if (plain) {
    return candidate === plain;
  }
  throw new Error('Neither ADMIN_PASSWORD nor ADMIN_PASSWORD_HASH is set in .env.');
}

function issueAdminSession(res) {
  const token = jwt.sign({ role: 'admin' }, getSecret(), { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearAdminSession(res) {
  res.clearCookie(COOKIE_NAME);
}

function isAdminRequest(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    const payload = jwt.verify(token, getSecret());
    return payload && payload.role === 'admin';
  } catch (err) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (isAdminRequest(req)) return next();
  return res.status(401).json({ error: 'unauthorized', message: 'กรุณาเข้าสู่ระบบแอดมินก่อน' });
}

function requireIntegrationKey(req, res, next) {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'integration_disabled', message: 'ยังไม่ได้ตั้งค่า INTEGRATION_API_KEY บนเซิร์ฟเวอร์นี้' });
  }
  const provided = req.get('X-API-Key');
  if (provided && provided === expected) return next();
  return res.status(401).json({ error: 'unauthorized', message: 'invalid or missing X-API-Key header' });
}

module.exports = {
  COOKIE_NAME,
  verifyAdminPassword,
  issueAdminSession,
  clearAdminSession,
  isAdminRequest,
  requireAdmin,
  requireIntegrationKey,
};
