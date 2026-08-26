const supabase = require('../db');

// PastQ backend uses the Supabase service role key (see db.js), which
// bypasses RLS entirely. That means every route in this file was, until
// now, wide open: anyone with the URL could POST arbitrary rows into the
// question bank or trigger the AI extraction pipeline for free.
//
// This middleware requires a valid Supabase-issued JWT (the same one the
// frontend already gets from supabase.auth.getSession()) on any route
// that writes data. Read routes stay public on purpose — the bank itself
// is meant to be open.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = data.user;
  next();
}

module.exports = { requireAuth };
