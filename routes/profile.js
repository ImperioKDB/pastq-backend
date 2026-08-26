const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/profile/courses — all courses this user has added, primary first.
router.get('/courses', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_courses')
    .select('course_id, is_primary, added_at, courses(id, code, title, department_id)')
    .eq('user_id', req.user.id)
    .order('is_primary', { ascending: false })
    .order('added_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/profile/courses { course_id, is_primary? } — add a workspace.
router.post('/courses', requireAuth, async (req, res) => {
  const { course_id, is_primary = false } = req.body;
  if (!course_id) return res.status(400).json({ error: 'course_id is required' });

  if (is_primary) {
    await supabase.from('user_courses').update({ is_primary: false }).eq('user_id', req.user.id);
  }

  const { data, error } = await supabase
    .from('user_courses')
    .upsert({ user_id: req.user.id, course_id, is_primary }, { onConflict: 'user_id,course_id' })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// DELETE /api/profile/courses/:course_id
router.delete('/courses/:course_id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_courses')
    .delete()
    .eq('user_id', req.user.id)
    .eq('course_id', req.params.course_id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// POST /api/profile/mastery — called after each quiz question is answered.
// Body: { course_id, topic, correct: boolean }
router.post('/mastery', requireAuth, async (req, res) => {
  const { course_id, topic, correct } = req.body;
  if (!course_id || !topic || typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'course_id, topic, and correct are required' });
  }

  const { data: existing } = await supabase
    .from('topic_mastery')
    .select('attempts, correct')
    .eq('user_id', req.user.id)
    .eq('course_id', course_id)
    .eq('topic', topic)
    .maybeSingle();

  const attempts = (existing?.attempts || 0) + 1;
  const correctCount = (existing?.correct || 0) + (correct ? 1 : 0);

  const { error } = await supabase
    .from('topic_mastery')
    .upsert({
      user_id: req.user.id,
      course_id,
      topic,
      attempts,
      correct: correctCount,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,course_id,topic' });

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// GET /api/profile/mastery?course_id= — weak-spot list for the dashboard.
router.get('/mastery', requireAuth, async (req, res) => {
  const { course_id } = req.query;
  let query = supabase
    .from('topic_mastery')
    .select('*')
    .eq('user_id', req.user.id);

  if (course_id) query = query.eq('course_id', course_id);

  const { data, error } = await query.order('last_seen_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
