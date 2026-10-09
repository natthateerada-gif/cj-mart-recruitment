const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const COOKIE_NAME = 'cjmart_admin_session';
const TOKEN_TTL = '12h';

// Who can log in to the admin area:
//  - the "owner": the shared password from .env (ADMIN_PASSWORD / ADMIN_PASSWORD_HASH).
//    Always full access and always works, so nobody can be locked out. Used to create
//    the first personal accounts.
//  - personal accounts in the admin_users table (email + password). Every account has
//    the same access, including adding / removing other admin accounts.
const OWNER_ID = 'owner';

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

// The session cookie is "Secure" (HTTPS only) in production. If the site is served
// over plain HTTP on an internal network, set COOKIE_SECURE=false or admin login
// will appear to succeed but the browser will drop the cookie.
function cookieSecure() {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

// `user` = { id, name, email }. Only the id goes into the token: the account is
// re-read from the database on every request, so deactivating or deleting an account
// takes effect immediately instead of after the 12h token expires.
function issueAdminSession(res, user) {
  const token = jwt.sign({ role: 'admin', sub: user ? user.id : OWNER_ID }, getSecret(), { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearAdminSession(res) {
  res.clearCookie(COOKIE_NAME);
}

const OWNER = { id: OWNER_ID, name: 'ผู้ดูแลระบบหลัก', email: '', isOwner: true };

// Resolves the logged-in admin from the cookie, or null.
async function resolveAdmin(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch (err) {
    return null;
  }
  if (!payload || payload.role !== 'admin') return null;
  // Tokens issued before personal accounts existed have no "sub": they were the shared password.
  if (!payload.sub || payload.sub === OWNER_ID) return { ...OWNER };
  const { rows } = await pool.query(
    'SELECT id, name, email, active FROM admin_users WHERE id = $1',
    [payload.sub]
  );
  if (rows.length === 0 || !rows[0].active) return null;
  return { id: rows[0].id, name: rows[0].name, email: rows[0].email, isOwner: false };
}

async function isAdminRequest(req) {
  return !!(await resolveAdmin(req));
}

async function requireAdmin(req, res, next) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return res.status(401).json({ error: 'unauthorized', message: 'กรุณาเข้าสู่ระบบแอดมินก่อน' });
    req.admin = admin;
    return next();
  } catch (err) { return next(err); }
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
  OWNER_ID,
  verifyAdminPassword,
  issueAdminSession,
  clearAdminSession,
  resolveAdmin,
  isAdminRequest,
  requireAdmin,
  requireIntegrationKey,
};
