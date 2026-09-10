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
const { BANNER_DIR } = require('./upload');

const app = express();

app.disable('x-powered-by');
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

// Banner images are the only uploaded files served publicly (no login
// needed to view the homepage banner) — resumes/photos stay behind the
// admin-only download routes in applications.js.
app.use('/uploads/banner', express.static(BANNER_DIR));

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
app.listen(PORT, () => {
  console.log(`CJ Mart recruitment server listening on port ${PORT}`);
});
