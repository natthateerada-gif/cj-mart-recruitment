require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const jobsRouter = require('./routes/jobs');
const { router: applicationsRouter } = require('./routes/applications');
const faqRulesRouter = require('./routes/faqRules');
const pdpaRouter = require('./routes/pdpa');
const adminAuthRouter = require('./routes/adminAuth');
const integrationRouter = require('./routes/integration');
const siteContentRouter = require('./routes/siteContent');
const hrContactsRouter = require('./routes/hrContacts');
const bannerImagesRouter = require('./routes/bannerImages');
const pool = require('./db');

const app = express();

app.disable('x-powered-by');

// Behind a reverse proxy / load balancer (nginx, GCP LB, ...) set TRUST_PROXY so
// req.ip is the real client IP (used by the admin login limiter). Accepts a hop
// count ("1"), "true", or any value Express understands ("loopback", a CIDR, ...).
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? parseInt(v, 10) : v === 'true' ? true : v === 'false' ? false : v);
}

// Basic hardening headers (no extra dependency).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

// Health checks for Docker / load balancers.
//   /healthz  liveness  - the process is up (does not touch the database)
//   /readyz   readiness - the database answers
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    console.error('readiness check failed:', err.message);
    res.status(503).json({ status: 'database_unavailable' });
  }
});

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins, credentials: true }));
}

app.use(adminAuthRouter);
app.use(jobsRouter);
app.use(applicationsRouter);
app.use(faqRulesRouter);
app.use(pdpaRouter);
app.use(integrationRouter);
app.use(siteContentRouter);
app.use(hrContactsRouter);
app.use(bannerImagesRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Express 5: use a named wildcard, not a bare "*", for the SPA-style fallback.
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Central error handler — always last.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'server_error', message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`CJ Mart recruitment server listening on port ${PORT}`);
});

// Graceful shutdown (docker stop / orchestrator rollouts send SIGTERM): stop
// accepting new connections, let in-flight requests finish, close the DB pool.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  const force = setTimeout(() => {
    console.error('Forced exit after 10s');
    process.exit(1);
  }, 10000);
  force.unref();
  server.close(async () => {
    try { await pool.end(); } catch (err) { console.error(err); }
    process.exit(0);
  });
  if (server.closeIdleConnections) server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
