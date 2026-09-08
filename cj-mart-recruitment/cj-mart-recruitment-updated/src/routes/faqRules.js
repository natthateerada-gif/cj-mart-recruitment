const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');

const router = express.Router();

function rowToRule(row) {
  return { id: row.id, keywords: row.keywords, answer: row.answer };
}

// Public: custom rules only (the chatbot's built-in defaults live in the
// frontend, same as before — custom rules are checked first).
router.get('/api/faq-rules', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM faq_rules ORDER BY created_at ASC');
    res.json(rows.map(rowToRule));
  } catch (err) { next(err); }
});

router.post('/api/admin/faq-rules', requireAdmin, async (req, res, next) => {
  try {
    const { keywords, answer } = req.body || {};
    const kws = Array.isArray(keywords) ? keywords.map((k) => String(k).trim()).filter(Boolean) : [];
    const ans = (answer || '').trim();
    if (kws.length === 0 || !ans) {
      return res.status(400).json({ error: 'validation', message: 'กรุณากรอกคำสำคัญอย่างน้อย 1 คำ และคำตอบ' });
    }
    const { rows } = await pool.query(
      'INSERT INTO faq_rules (id, keywords, answer) VALUES ($1,$2,$3) RETURNING *',
      [uid(), kws, ans]
    );
    res.status(201).json(rowToRule(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/api/admin/faq-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM faq_rules WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
