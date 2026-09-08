// Public "about the company" content for the Home page: an overview blurb
// plus social media links. Stored in the same generic `settings` key/value
// table as the PDPA text, so no extra migration was needed to add this.

const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

const KEYS = ['company_overview', 'social_youtube', 'social_tiktok', 'social_facebook', 'social_instagram'];

async function readSiteContent() {
  const { rows } = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [KEYS]);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    companyOverview: map.company_overview || '',
    social: {
      youtube: map.social_youtube || '',
      tiktok: map.social_tiktok || '',
      facebook: map.social_facebook || '',
      instagram: map.social_instagram || '',
    },
  };
}

router.get('/api/site-content', async (req, res, next) => {
  try {
    res.json(await readSiteContent());
  } catch (err) { next(err); }
});

router.get('/api/admin/site-content', requireAdmin, async (req, res, next) => {
  try {
    res.json(await readSiteContent());
  } catch (err) { next(err); }
});

router.put('/api/admin/site-content', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const social = b.social || {};
    const values = {
      company_overview: (b.companyOverview || '').trim(),
      social_youtube: (social.youtube || '').trim(),
      social_tiktok: (social.tiktok || '').trim(),
      social_facebook: (social.facebook || '').trim(),
      social_instagram: (social.instagram || '').trim(),
    };
    for (const key of KEYS) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, values[key]]
      );
    }
    res.json(await readSiteContent());
  } catch (err) { next(err); }
});

module.exports = router;
