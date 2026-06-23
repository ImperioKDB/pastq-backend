const { createClient } = require('@supabase/supabase-js');

// Server-side client uses the service role key so it can write to the DB
// without being blocked by RLS policies that require auth.uid().
// NEVER expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
