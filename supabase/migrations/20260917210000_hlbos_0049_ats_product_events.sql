-- ===========================================================================
-- ats.product_events — the nine counters the private beta turns on
--
-- Purpose: answer one question — do people who sign up actually export a
-- resume? Everything else in this table exists to make that number
-- trustworthy, and nothing exists to profile a person.
--
-- WHAT THIS TABLE DELIBERATELY CANNOT HOLD. No resume text, no job titles, no
-- employer names, no URLs, no free-form strings. `event_name` is constrained
-- to a fixed list and `props` is sanitised in the application to numbers,
-- booleans and short identifiers before it ever arrives. A behavioural log of
-- one person's job search is exactly the kind of data this product promises to
-- hold carefully, so the schema refuses to become one.
--
-- Same ownership model as every other table in this schema: owned by one auth
-- user, RLS enabled AND forced, no anon grants, no service-role escape hatch.
-- A person can read and write their own events and nobody else's — including
-- whoever operates the platform.
--
-- There is no UPDATE policy and no DELETE policy by design: an event is a fact
-- about something that happened. Deleting the account removes them by cascade.
--
-- rollback:
--   DROP TABLE IF EXISTS ats.product_events;
--   (Additive: one new table in an existing schema, nothing else touched.)
-- ===========================================================================

create table if not exists ats.product_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  event_name  text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint product_events_known_name check (event_name in (
    'account_created',
    'resume_uploaded',
    'job_analyzed',
    'analysis_completed',
    'resume_generated',
    'resume_exported',
    'cover_letter_generated',
    'interview_prep_opened',
    'payment_clicked',
    'value_feedback'
  )),
  -- props is a flat object, never an array and never nested. Enforced here so
  -- a future caller cannot quietly start storing a document in it.
  constraint product_events_props_is_object check (jsonb_typeof(props) = 'object')
);

create index if not exists product_events_owner_idx
  on ats.product_events (owner_id, created_at desc);
create index if not exists product_events_name_idx
  on ats.product_events (event_name, created_at desc);

alter table ats.product_events enable row level security;
alter table ats.product_events force row level security;

revoke all on ats.product_events from public, anon;
grant select, insert on ats.product_events to authenticated;

drop policy if exists product_events_select_own on ats.product_events;
create policy product_events_select_own on ats.product_events
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists product_events_insert_own on ats.product_events;
create policy product_events_insert_own on ats.product_events
  for insert to authenticated
  with check (owner_id = auth.uid());

comment on table ats.product_events is
  'Fixed-vocabulary product counters for one user. No resume, posting or document content may be stored here; props is sanitised to numbers, booleans and short identifiers by the application.';
