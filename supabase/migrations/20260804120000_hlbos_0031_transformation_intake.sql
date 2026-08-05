-- ===========================================================================
-- hlbos_0031_transformation_intake
--
-- The Business Transformation Digital Intake (BTDI) store — the public front
-- door to a Herman Legacy Digital transformation.
--
-- SECURITY MODEL (the whole point of this migration):
--   * A NEW private schema `intake`, deliberately NOT added to the PostgREST
--     API allow-list in supabase/config.toml. It is unreachable over HTTP.
--   * The submissions table has RLS ENABLED + FORCED with ZERO policies and no
--     table grants to anon/authenticated — it fails CLOSED. Nobody reads or
--     writes it directly over the API.
--   * The ONLY anonymous write path is `public.submit_business_transformation_
--     intake(jsonb)` — a SECURITY DEFINER function that validates and inserts.
--     anon gets EXECUTE on that function and nothing else. No table access, no
--     SELECT, no direct INSERT, no service-role key anywhere.
--   * Internal reads/updates go through `public.list_transformation_intake()`
--     and `public.set_transformation_intake_status()`, gated by
--     identity.is_platform_admin(). anon is stripped from both.
--
-- Storage is STRUCTURED: denormalized handoff facts are columns; the full
-- section-by-section detail is grouped JSONB (one object per intake section),
-- never one unsearchable blob.
--
-- A submission is always a REQUEST to begin (status 'new' — "Business
-- Transformation Investigation Pending"). It never represents a completed
-- assessment (Principle 10).
--
-- NOT YET APPLIED to any environment. Applying it is a separate, explicitly
-- authorized CEO step. This file is additive and reversible.
--
-- rollback:
--   DROP FUNCTION IF EXISTS public.set_transformation_intake_status(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.list_transformation_intake(text, integer);
--   DROP FUNCTION IF EXISTS public.submit_business_transformation_intake(jsonb);
--   DROP TABLE IF EXISTS intake.transformation_submissions;
--   DROP TYPE  IF EXISTS intake.submission_status;
--   DROP SCHEMA IF EXISTS intake;
-- ===========================================================================

-- --- Private schema (NOT API-exposed) --------------------------------------
create schema if not exists intake;
revoke all on schema intake from public;
-- authenticated needs USAGE only so SECURITY DEFINER helpers resolve names when
-- called by a logged-in staff member; it still gets NO object privileges below.
grant usage on schema intake to authenticated;

-- --- Status vocabulary ------------------------------------------------------
do $$ begin
  create type intake.submission_status as enum
    ('new','reviewing','contacted','accepted','declined','archived');
exception when duplicate_object then null; end $$;

-- --- Submissions table ------------------------------------------------------
create table if not exists intake.transformation_submissions (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  status                intake.submission_status not null default 'new',

  -- Denormalized handoff facts (searchable columns).
  business_name         text not null,
  primary_contact       text not null,
  contact_email         extensions.citext not null,
  contact_phone         text,
  industry              text,
  business_stage        text,
  main_challenge        text,
  ninety_day_goal       text,
  growth_priority       text,

  -- Full detail, grouped by intake section (structured, not one blob).
  company               jsonb not null default '{}'::jsonb,
  mission               jsonb not null default '{}'::jsonb,
  market                jsonb not null default '{}'::jsonb,
  challenges            jsonb not null default '{}'::jsonb,
  marketing             jsonb not null default '{}'::jsonb,
  digital               jsonb not null default '{}'::jsonb,
  operations            jsonb not null default '{}'::jsonb,
  goals                 jsonb not null default '{}'::jsonb,
  worklife              jsonb not null default '{}'::jsonb,
  readiness             jsonb not null default '{}'::jsonb,

  -- Consent + provenance.
  consent_public_review boolean not null default false,
  consent_privacy       boolean not null,
  consent_contact       boolean not null,
  consent_at            timestamptz not null default now(),
  source_page           text,
  attribution           jsonb not null default '{}'::jsonb,
  spam_signals          jsonb not null default '{}'::jsonb,

  -- Internal workflow.
  internal_notes        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint tsub_privacy_ack       check (consent_privacy = true),
  constraint tsub_contact_ack       check (consent_contact = true),
  constraint tsub_business_name_len check (char_length(business_name) between 1 and 300),
  constraint tsub_contact_len       check (char_length(primary_contact) between 1 and 300),
  constraint tsub_email_len         check (char_length(contact_email::text) between 3 and 300)
);

comment on table intake.transformation_submissions is
  'Public Business Transformation intake submissions. Written ONLY via public.submit_business_transformation_intake(); read/updated ONLY via platform-admin-gated public RPCs. RLS forced, no direct grants.';

create index if not exists tsub_status_created_idx
  on intake.transformation_submissions (status, created_at desc);
create index if not exists tsub_email_created_idx
  on intake.transformation_submissions (contact_email, created_at desc);

-- --- Fail closed: RLS on, forced, zero policies, no grants ------------------
alter table intake.transformation_submissions enable row level security;
alter table intake.transformation_submissions force row level security;
-- Deliberately NO policies and NO grants to anon/authenticated. All access is
-- mediated by the SECURITY DEFINER functions below (owned by postgres, which
-- bypasses RLS). Any direct API access fails closed.
revoke all on intake.transformation_submissions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC 1 — anonymous submit (the ONLY anon write path)
-- ---------------------------------------------------------------------------
create or replace function public.submit_business_transformation_intake(payload jsonb)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_business text;
  v_contact  text;
  v_email    extensions.citext;
  v_id       uuid;
begin
  -- Hard cap on total payload size (defence against abuse; app caps per-field).
  if length(payload::text) > 200000 then
    raise exception 'submission too large' using errcode = 'check_violation';
  end if;

  v_business := btrim(coalesce(payload->'contact'->>'businessName', ''));
  v_contact  := btrim(coalesce(payload->'contact'->>'primaryContact', ''));
  v_email    := lower(btrim(coalesce(payload->'contact'->>'email', '')))::extensions.citext;

  -- Required contact fields.
  if v_business = '' or v_contact = '' or v_email::text = '' then
    raise exception 'missing required contact fields' using errcode = 'check_violation';
  end if;
  -- Minimal server-side email shape check.
  if v_email::text !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;
  -- Privacy acknowledgment + contact consent are mandatory (never pre-checked).
  if coalesce((payload->'consent'->>'privacy')::boolean, false) is not true
     or coalesce((payload->'consent'->>'contact')::boolean, false) is not true then
    raise exception 'privacy acknowledgment and contact consent are required'
      using errcode = 'check_violation';
  end if;

  -- Light rate limit / duplicate-rapid guard: same email within 60 seconds.
  if exists (
    select 1 from intake.transformation_submissions
    where contact_email = v_email
      and created_at > now() - interval '60 seconds'
  ) then
    raise exception 'please wait a moment before submitting again'
      using errcode = 'check_violation';
  end if;

  insert into intake.transformation_submissions (
    business_name, primary_contact, contact_email, contact_phone,
    industry, business_stage, main_challenge, ninety_day_goal, growth_priority,
    company, mission, market, challenges, marketing, digital, operations, goals, worklife, readiness,
    consent_public_review, consent_privacy, consent_contact,
    source_page, attribution
  ) values (
    left(v_business, 300),
    left(v_contact, 300),
    v_email,
    nullif(btrim(coalesce(payload->'contact'->>'phone', '')), ''),
    nullif(payload->'sections'->'company'->>'industry', ''),
    nullif(payload->'summary'->>'businessStage', ''),
    nullif(payload->'summary'->>'mainChallenge', ''),
    nullif(payload->'summary'->>'ninetyDayGoal', ''),
    nullif(payload->'sections'->'goals'->>'growthPriority', ''),
    coalesce(payload->'sections'->'company',    '{}'::jsonb),
    coalesce(payload->'sections'->'mission',    '{}'::jsonb),
    coalesce(payload->'sections'->'market',     '{}'::jsonb),
    coalesce(payload->'sections'->'challenges', '{}'::jsonb),
    coalesce(payload->'sections'->'marketing',  '{}'::jsonb),
    coalesce(payload->'sections'->'digital',    '{}'::jsonb),
    coalesce(payload->'sections'->'operations', '{}'::jsonb),
    coalesce(payload->'sections'->'goals',      '{}'::jsonb),
    coalesce(payload->'sections'->'worklife',   '{}'::jsonb),
    coalesce(payload->'sections'->'readiness',  '{}'::jsonb),
    coalesce((payload->'consent'->>'publicReview')::boolean, false),
    true, true,
    left(coalesce(payload->>'source_page', ''), 300),
    coalesce(payload->'attribution', '{}'::jsonb)
  ) returning id into v_id;

  return 'HLD-BT-' || upper(substr(replace(v_id::text, '-', ''), 1, 6));
end; $$;

comment on function public.submit_business_transformation_intake(jsonb) is
  'Anonymous BTDI submit. The ONLY anon write path. Validates + inserts as owner; anon has no table access.';

revoke all on function public.submit_business_transformation_intake(jsonb) from public;
grant execute on function public.submit_business_transformation_intake(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC 2 — internal list (platform-admin only). The intake queue.
-- ---------------------------------------------------------------------------
create or replace function public.list_transformation_intake(
  p_status text default null,
  p_limit  integer default 100)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not identity.is_platform_admin() then
    raise exception 'insufficient privilege to read intake submissions'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(obj), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'id',              s.id,
      'status',          s.status,
      'business_name',   s.business_name,
      'primary_contact', s.primary_contact,
      'email',           s.contact_email,
      'business_stage',  s.business_stage,
      'main_challenge',  s.main_challenge,
      'ninety_day_goal', s.ninety_day_goal,
      'created_at',      s.created_at
    ) as obj
    from intake.transformation_submissions s
    where p_status is null or s.status = p_status::intake.submission_status
    order by s.created_at desc
    limit greatest(1, least(p_limit, 500))
  ) t;

  return v;
end; $$;

comment on function public.list_transformation_intake(text, integer) is
  'Platform-admin-only BTDI queue: id, status, business, contact, stage, main challenge, 90-day goal.';

revoke all on function public.list_transformation_intake(text, integer) from public, anon;
grant execute on function public.list_transformation_intake(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC 3 — advance status / add a note (platform-admin only)
-- ---------------------------------------------------------------------------
create or replace function public.set_transformation_intake_status(
  p_id     uuid,
  p_status text,
  p_note   text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.is_platform_admin() then
    raise exception 'insufficient privilege to update intake submissions'
      using errcode = 'insufficient_privilege';
  end if;

  update intake.transformation_submissions
     set status         = p_status::intake.submission_status,
         internal_notes = coalesce(p_note, internal_notes),
         updated_at     = now()
   where id = p_id;

  if not found then
    raise exception 'no such submission' using errcode = 'no_data_found';
  end if;
end; $$;

comment on function public.set_transformation_intake_status(uuid, text, text) is
  'Platform-admin-only: advance a BTDI submission status and optionally append an internal note.';

revoke all on function public.set_transformation_intake_status(uuid, text, text) from public, anon;
grant execute on function public.set_transformation_intake_status(uuid, text, text) to authenticated;
