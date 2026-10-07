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

// Shared by create + edit: keywords must be a non-empty list, answer non-empty.
function parseRuleBody(body) {
  const { keywords, answer } = body || {};
  const kws = Array.isArray(keywords) ? keywords.map((k) => String(k).trim()).filter(Boolean) : [];
  const ans = (answer || '').trim();
  return { kws, ans, valid: kws.length > 0 && !!ans };
}

const RULE_VALIDATION_MESSAGE = 'กรุณากรอกคำสำคัญอย่างน้อย 1 คำ และคำตอบ';

router.post('/api/admin/faq-rules', requireAdmin, async (req, res, next) => {
  try {
    const { kws, ans, valid } = parseRuleBody(req.body);
    if (!valid) {
      return res.status(400).json({ error: 'validation', message: RULE_VALIDATION_MESSAGE });
    }
    const { rows } = await pool.query(
      'INSERT INTO faq_rules (id, keywords, answer) VALUES ($1,$2,$3) RETURNING *',
      [uid(), kws, ans]
    );
    res.status(201).json(rowToRule(rows[0]));
  } catch (err) { next(err); }
});

// Edit an existing rule in place (keeps its position in the list).
router.patch('/api/admin/faq-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    const { kws, ans, valid } = parseRuleBody(req.body);
    if (!valid) {
      return res.status(400).json({ error: 'validation', message: RULE_VALIDATION_MESSAGE });
    }
    const { rows } = await pool.query(
      'UPDATE faq_rules SET keywords = $1, answer = $2 WHERE id = $3 RETURNING *',
      [kws, ans, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found', message: 'ไม่พบคำตอบนี้ (อาจถูกลบไปแล้ว)' });
    res.json(rowToRule(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/api/admin/faq-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM faq_rules WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
