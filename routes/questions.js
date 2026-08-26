const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/questions?course_id=&year=&type=&topic=&page=1&limit=20
// Public on purpose — the bank is meant to be browsable by anyone.
router.get('/', async (req, res) => {
  const { course_id, year, type, topic, page = 1, limit = 20 } = req.query;

  const pageNum   = Math.max(1, parseInt(page));
  const limitNum  = Math.min(100, Math.max(1, parseInt(limit)));
  const offset    = (pageNum - 1) * limitNum;

  let query = supabase
    .from('questions')
    .select('*, courses(code, title)', { count: 'exact' });

  if (course_id) query = query.eq('course_id', course_id);
  if (year)      query = query.eq('year', year);
  if (type)      query = query.eq('type', type);
  if (topic)     query = query.ilike('topic', `%${topic}%`);

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limitNum - 1);

  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    data,
    total: count,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(count / limitNum),
  });
});

// POST /api/questions — requires a logged-in user. Previously open to
// anyone, which meant the bank could be spammed with garbage rows.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { course_id, year, content, type, options, answer, topic } = req.body;

    if (!course_id || !content) {
      return res.status(400).json({ error: 'course_id and content are required' });
    }

    const { data, error } = await supabase
      .from('questions')
      .insert([{
        course_id, year, content, type, options, answer, topic,
        submitted_by: req.user.id,
      }])
      .select();

    if (error) {
      // Unique violation on (course_id, content_hash) means this exact
      // question already exists — treat as a soft success, not a crash.
      if (error.code === '23505') {
        return res.status(409).json({ error: 'This question already exists in the bank' });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
