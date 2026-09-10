// Rotating image banner on the home page. Images are uploaded as real files
// (see upload.js's bannerUpload/BANNER_DIR) and served publicly from
// /uploads/banner/<filename> (mounted in server.js) — only the filename is
// kept in the database, alongside a display order.

const fs = require('fs');
const path = require('path');
const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');
const { bannerUpload, BANNER_DIR } = require('../upload');

const router = express.Router();

function rowToImage(row) {
  return {
    id: row.id,
    url: `/uploads/banner/${row.filename}`,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

router.get('/api/banner-images', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM banner_images ORDER BY display_order ASC, created_at ASC'
    );
    res.json(rows.map(rowToImage));
  } catch (err) { next(err); }
});

router.get('/api/admin/banner-images', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM banner_images ORDER BY display_order ASC, created_at ASC'
    );
    res.json(rows.map(rowToImage));
  } catch (err) { next(err); }
});

router.post(
  '/api/admin/banner-images',
  requireAdmin,
  bannerUpload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'validation', message: 'กรุณาเลือกไฟล์รูปภาพ' });
      }
      const { rows: orderRows } = await pool.query(
        'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM banner_images'
      );
      const id = uid();
      const { rows } = await pool.query(
        `INSERT INTO banner_images (id, filename, display_order) VALUES ($1, $2, $3) RETURNING *`,
        [id, req.file.filename, orderRows[0].next_order]
      );
      res.status(201).json(rowToImage(rows[0]));
    } catch (err) {
      if (err.message === 'unsupported_file_type') {
        return res.status(400).json({ error: 'validation', message: 'รองรับเฉพาะไฟล์รูปภาพ (PNG/JPG/WEBP/GIF)' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'validation', message: 'ไฟล์รูปภาพมีขนาดใหญ่เกินไป (ไม่เกิน 5MB)' });
      }
      next(err);
    }
  }
);

router.delete('/api/admin/banner-images/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT filename FROM banner_images WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    await pool.query('DELETE FROM banner_images WHERE id = $1', [req.params.id]);
    // Best-effort cleanup of the file on disk; a missing file shouldn't fail the request.
    fs.unlink(path.join(BANNER_DIR, rows[0].filename), () => {});
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
