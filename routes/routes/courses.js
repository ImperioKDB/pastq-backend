const express = require('express');
const router = express.Router();
const supabase = require('../db');

// Get courses by department
router.get('/', async (req, res) => {
  const { department_id } = req.query;

  let query = supabase.from('courses').select('*, departments(name, school_id)');
  if (department_id) query = query.eq('department_id', department_id);

  const { data, error } = await query.order('code');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
