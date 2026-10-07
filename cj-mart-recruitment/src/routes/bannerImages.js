// Rotating image banner on the home page. The image bytes are stored in the
// banner_images table (BYTEA) — not on disk, which is wiped on every deploy on
// hosts like Render's free tier — and served publicly from
// /api/banner-images/<id>/file (no login needed to view the homepage).

const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');
const { bannerUpload } = require('../upload');

const router = express.Router();

function rowToImage(row) {
  return {
    id: row.id,
    url: `/api/banner-images/${row.id}/file`,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

// Never select the bytes for list endpoints — only metadata.
const LIST_SQL = 'SELECT id, display_order, created_at FROM banner_images WHERE data IS NOT NULL ORDER BY display_order ASC, created_at ASC';

router.get('/api/banner-images', async (req, res, next) => {
  try {
    const { rows } = await pool.query(LIST_SQL);
    res.json(rows.map(rowToImage));
  } catch (err) { next(err); }
});

// Public image bytes. An id never changes content, so it can be cached hard.
router.get('/api/banner-images/:id/file', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT data, mime_type FROM banner_images WHERE id = $1', [req.params.id]);
    if (rows.length === 0 || !rows[0].data) return res.status(404).end();
    res.setHeader('Content-Type', rows[0].mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(rows[0].data);
  } catch (err) { next(err); }
});

router.get('/api/admin/banner-images', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(LIST_SQL);
    res.json(rows.map(rowToImage));
  } catch (err) { next(err); }
});

// multer runs before the route handler, so its rejections (wrong type / too
// big) must be translated here — a try/catch inside the handler never sees them.
function receiveImage(req, res, next) {
  bannerUpload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.message === 'unsupported_file_type') {
      return res.status(400).json({ error: 'validation', message: 'รองรับเฉพาะไฟล์รูปภาพ (PNG/JPG/WEBP/GIF)' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'validation', message: 'ไฟล์รูปภาพมีขนาดใหญ่เกินไป (ไม่เกิน 5MB)' });
    }
    return next(err);
  });
}

router.post('/api/admin/banner-images', requireAdmin, receiveImage, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'validation', message: 'กรุณาเลือกไฟล์รูปภาพ' });
    }
    const { rows: orderRows } = await pool.query(
      'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM banner_images'
    );
    const id = uid();
    const { rows } = await pool.query(
      `INSERT INTO banner_images (id, data, mime_type, display_order) VALUES ($1, $2, $3, $4)
       RETURNING id, display_order, created_at`,
      [id, req.file.buffer, req.file.mimetype, orderRows[0].next_order]
    );
    res.status(201).json(rowToImage(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/api/admin/banner-images/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM banner_images WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
