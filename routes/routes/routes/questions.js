const express = require('express');
const router = express.Router();
const supabase = require('../db');

// Get questions with filters
router.get('/', async (req, res) => {
  const { course_id, year, type } = req.query;

  let query = supabase.from('questions').select('*, courses(code, title)');
  if (course_id) query = query.eq('course_id', course_id);
  if (year) query = query.eq('year', year);
  if (type) query = query.eq('type', type);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Submit a question manually
router.post('/', async (req, res) => {
  const { course_id, year, content, type, options, answer, topic } = req.body;

  const { data, error } = await supabase
    .from('questions')
    .insert([{ course_id, year, content, type, options, answer, topic }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

module.exports = router;
