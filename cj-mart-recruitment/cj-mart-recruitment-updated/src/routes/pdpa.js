const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

async function readPdpaSettings() {
  const { rows } = await pool.query("SELECT key, value FROM settings WHERE key IN ('pdpa_policy_text', 'pdpa_consent_text')");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    policyText: map.pdpa_policy_text || '',
    consentText: map.pdpa_consent_text || '',
  };
}

router.get('/api/pdpa', async (req, res, next) => {
  try {
    res.json(await readPdpaSettings());
  } catch (err) { next(err); }
});

router.get('/api/admin/pdpa', requireAdmin, async (req, res, next) => {
  try {
    res.json(await readPdpaSettings());
  } catch (err) { next(err); }
});

router.put('/api/admin/pdpa', requireAdmin, async (req, res, next) => {
  try {
    const { policyText, consentText } = req.body || {};
    if (!policyText || !policyText.trim() || !consentText || !consentText.trim()) {
      return res.status(400).json({ error: 'validation', message: 'กรุณากรอกทั้งเนื้อหานโยบายและข้อความยินยอมให้ครบถ้วน' });
    }
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('pdpa_policy_text', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [policyText.trim()]
    );
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('pdpa_consent_text', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [consentText.trim()]
    );
    res.json(await readPdpaSettings());
  } catch (err) { next(err); }
});

module.exports = router;
