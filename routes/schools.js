const express = require('express');
const router = express.Router();
const supabase = require('../db');

// Get all schools
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .order('name');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
