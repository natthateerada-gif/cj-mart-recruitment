// Endpoints meant to be called by the future Recruitment Management System,
// not by the careers-site frontend. Protected by a static API key
// (X-API-Key header) rather than the admin browser-session cookie, since a
// server-to-server integration has no browser to hold a cookie.
//
// Disabled entirely (503) until INTEGRATION_API_KEY is set in .env — see
// README.md "Connecting the Recruitment Management System" for the intended
// integration pattern (polling `since` + the RMS_WEBHOOK_URL push).

const express = require('express');
const pool = require('../db');
const { requireIntegrationKey } = require('../auth');
const { rowToApplication } = require('./applications');

const router = express.Router();

router.get('/api/integration/applications', requireIntegrationKey, async (req, res, next) => {
  try {
    const { since, limit = '100', cursor } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;
    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: 'validation', message: '`since` must be an ISO 8601 timestamp' });
      }
      conditions.push(`submitted_at > $${i}`);
      values.push(sinceDate.toISOString());
      i += 1;
    }
    if (cursor) {
      conditions.push(`id > $${i}`);
      values.push(cursor);
      i += 1;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const capped = Math.min(parseInt(limit, 10) || 100, 500);
    const { rows } = await pool.query(
      `SELECT * FROM applications ${where} ORDER BY submitted_at ASC LIMIT $${i}`,
      values.concat([capped])
    );
    res.json({
      applications: rows.map((r) => rowToApplication(r)),
      nextCursor: rows.length === capped ? rows[rows.length - 1].id : null,
    });
  } catch (err) { next(err); }
});

router.get('/api/integration/jobs', requireIntegrationKey, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at ASC');
    res.json(rows.map((r) => ({
      id: r.id, title: r.title, type: r.type, shift: r.shift, salaryRange: r.salary_range,
      summary: r.summary, requirements: r.requirements, open: r.is_open,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })));
  } catch (err) { next(err); }
});

module.exports = router;
