const express = require('express');
const router = express.Router();
const supabase = require('../db');

// Get questions with filters
router.get('/', async (req, res) => {
  const { course_id, year, type, topic } = req.query;

  let query = supabase.from('questions').select('*, courses(code, title)');
  if (course_id) query = query.eq('course_id', course_id);
  if (year) query = query.eq('year', year);
  if (type) query = query.eq('type', type);
  if (topic) query = query.ilike('topic', `%${topic}%`);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Submit a question manually
router.post('/', async (req, res) => {
  try {
    const { course_id, year, content, type, options, answer, topic } = req.body;

    if (!course_id || !content) {
      return res.status(400).json({ error: 'course_id and content are required' });
    }

    const { data, error } = await supabase
      .from('questions')
      .insert([{ course_id, year, content, type, options, answer, topic }])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
                        
