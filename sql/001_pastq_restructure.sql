-- PastQ restructuring migration
-- Run in Supabase SQL editor, or via `supabase db push` if you use the CLI.
-- Idempotent where possible (IF NOT EXISTS) so it's safe to re-run.

-- 1. Content-hash dedup at the DB layer instead of pulling every row into
--    Node memory on every upload.
alter table questions
  add column if not exists content_hash text
  generated always as (
    encode(digest(lower(trim(substring(content from 1 for 200))), 'sha256'), 'hex')
  ) stored;

create unique index if not exists questions_course_content_hash_idx
  on questions (course_id, content_hash);

-- pgcrypto is needed for digest(); enable it if not already.
create extension if not exists pgcrypto;

-- 2. Multi-course support. user_profiles kept as-is (primary/home course),
--    user_courses is the "workspaces" a student has added.
create table if not exists user_courses (
  user_id    uuid not null references auth.users(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  is_primary boolean not null default false,
  added_at   timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index if not exists user_courses_user_idx on user_courses (user_id);

-- 3. Per-topic mastery tracking, fed by quiz results instead of discarded
--    client-side state.
create table if not exists topic_mastery (
  user_id       uuid not null references auth.users(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,
  topic         text not null,
  attempts      integer not null default 0,
  correct       integer not null default 0,
  last_seen_at  timestamptz not null default now(),
  primary key (user_id, course_id, topic)
);

-- 4. Row Level Security
alter table questions enable row level security;
alter table user_courses enable row level security;
alter table topic_mastery enable row level security;

-- Anyone can read questions (public bank), only authenticated users can
-- propose new ones directly against Supabase (the Express route uses the
-- service role key and does its own auth check, this is defense in depth).
drop policy if exists "questions_select_public" on questions;
create policy "questions_select_public" on questions
  for select using (true);

drop policy if exists "questions_insert_authenticated" on questions;
create policy "questions_insert_authenticated" on questions
  for insert to authenticated with check (true);

drop policy if exists "user_courses_owner" on user_courses;
create policy "user_courses_owner" on user_courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "topic_mastery_owner" on topic_mastery;
create policy "topic_mastery_owner" on topic_mastery
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4b. Track who submitted a manually-added question (uploads already
--     track via the uploads table; this covers direct POSTs).
alter table questions
  add column if not exists submitted_by uuid references auth.users(id);

-- 5. Upload job status, so the background worker's progress survives a
--    process restart and the frontend can poll it instead of guessing.
alter table uploads
  add column if not exists error_message text,
  add column if not exists questions_extracted integer default 0,
  add column if not exists uploaded_by uuid references auth.users(id);
