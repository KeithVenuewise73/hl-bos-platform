-- ===========================================================================
-- hlbos_0048_hscs_assessment_intake
--
-- The HSCS Operations Assessment intake — the front door to Herman Supply
-- Chain Solutions' consulting practice, and the single primary conversion of
-- the HSCS website (Website IA §8, Page Specifications §4.9).
--
-- This is NOT the Business Transformation intake (migration 0031, schema
-- `intake.transformation_submissions`). That is a different product with a
-- different ten-section questionnaire. They share only the private `intake`
-- schema and the same security model, and either can be applied without the
-- other — both create the schema with IF NOT EXISTS.
--
-- SECURITY MODEL (deliberately identical to 0031, which was reviewed):
--   * The private schema `intake` is NOT in the PostgREST allow-list in
--     supabase/config.toml. It is unreachable over HTTP.
--   * The table has RLS ENABLED + FORCED with ZERO policies and no grants to
--     anon/authenticated — it fails CLOSED.
--   * The ONLY anonymous write path is
--     public.submit_operations_assessment_request(jsonb), a SECURITY DEFINER
--     function that validates and inserts. anon gets EXECUTE on that and
--     nothing else: no SELECT, no INSERT, no table access of any kind.
--   * Reads and status changes go through
--     public.list_operations_assessment_requests(),
--     public.get_operations_assessment_request() and
--     public.set_operations_assessment_request_status(), all gated on
--     identity.is_platform_admin(). anon is stripped from all three.
--
-- Storage is STRUCTURED: the facts needed to triage a lead are columns; the
-- rest is grouped JSONB (one object per form section), never one blob.
--
-- A row is always a REQUEST to be assessed, never a completed assessment
-- (Principle 10). Status starts at 'new' and only a human moves it.
--
-- NOT YET APPLIED to any environment. Applying it is a separate, explicitly
-- authorized CEO step. This file is additive and reversible.
--
-- rollback:
--   DROP FUNCTION IF EXISTS public.set_operations_assessment_request_status(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.get_operations_assessment_request(uuid);
--   DROP FUNCTION IF EXISTS public.list_operations_assessment_requests(text, integer);
--   DROP FUNCTION IF EXISTS public.submit_operations_assessment_request(jsonb);
--   DROP TABLE IF EXISTS intake.operations_assessment_requests;
--   DROP TYPE  IF EXISTS intake.assessment_request_status;
--   (the `intake` schema is left alone: migration 0031 may also own it)
-- ===========================================================================

-- --- Private schema (NOT API-exposed) --------------------------------------
create schema if not exists intake;
revoke all on schema intake from public;
-- USAGE only, so SECURITY DEFINER helpers resolve names for a signed-in staff
-- member. It confers NO object privileges; the grants below are all revokes.
grant usage on schema intake to authenticated;

-- --- Status vocabulary ------------------------------------------------------
do $$ begin
  create type intake.assessment_request_status as enum
    ('new','reviewing','contacted','scheduled','declined','archived');
exception when duplicate_object then null; end $$;

-- --- Requests table ---------------------------------------------------------
create table if not exists intake.operations_assessment_requests (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  reference         text not null unique,
  status            intake.assessment_request_status not null default 'new',

  -- Triage facts (searchable columns).
  company_name      text not null,
  contact_name      text not null,
  contact_email     extensions.citext not null,
  contact_phone     text,
  contact_role      text,
  primary_concern   text,
  what_prompted     text,
  operation_scale   text,

  -- Full detail, grouped by form section.
  operation         jsonb not null default '{}'::jsonb,
  priorities        jsonb not null default '{}'::jsonb,
  context           jsonb not null default '{}'::jsonb,

  -- Consent + provenance.
  consent_privacy   boolean not null,
  consent_contact   boolean not null,
  consent_at        timestamptz not null default now(),
  source_page       text,
  attribution       jsonb not null default '{}'::jsonb,

  -- Internal workflow.
  internal_notes    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint oar_privacy_ack    check (consent_privacy = true),
  constraint oar_contact_ack    check (consent_contact = true),
  constraint oar_company_len    check (char_length(company_name) between 1 and 300),
  constraint oar_contact_len    check (char_length(contact_name) between 1 and 300),
  constraint oar_email_len      check (char_length(contact_email::text) between 3 and 300),
  constraint oar_reference_fmt  check (reference ~ '^HSCS-OA-[0-9A-F]{8}$')
);

comment on table intake.operations_assessment_requests is
  'Public HSCS Operations Assessment requests. Written ONLY via public.submit_operations_assessment_request(); read/updated ONLY via platform-admin-gated public RPCs. RLS forced, no direct grants. A row is a REQUEST, never a completed assessment.';

create index if not exists oar_status_created_idx
  on intake.operations_assessment_requests (status, created_at desc);
create index if not exists oar_email_created_idx
  on intake.operations_assessment_requests (contact_email, created_at desc);

-- --- Fail closed: RLS on, forced, zero policies, no grants ------------------
alter table intake.operations_assessment_requests enable row level security;
alter table intake.operations_assessment_requests force row level security;
-- Deliberately NO policies and NO grants. All access is mediated by the
-- SECURITY DEFINER functions below (owned by postgres, which bypasses RLS).
-- Any direct API access fails closed.
revoke all on intake.operations_assessment_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC 1 — anonymous submit (the ONLY anon write path)
-- ---------------------------------------------------------------------------
create or replace function public.submit_operations_assessment_request(payload jsonb)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_company text;
  v_contact text;
  v_email   extensions.citext;
  v_id      uuid;
  v_ref     text;
begin
  -- Hard cap on total payload size (defence against abuse; the app caps
  -- per-field, but the database must not trust the app).
  if pg_catalog.length(payload::text) > 100000 then
    raise exception 'submission too large' using errcode = 'check_violation';
  end if;

  v_company := pg_catalog.btrim(coalesce(payload->'contact'->>'companyName', ''));
  v_contact := pg_catalog.btrim(coalesce(payload->'contact'->>'contactName', ''));
  v_email   := pg_catalog.lower(pg_catalog.btrim(coalesce(payload->'contact'->>'email', '')))::extensions.citext;

  -- Required contact fields.
  if v_company = '' or v_contact = '' or v_email::text = '' then
    raise exception 'missing required contact fields' using errcode = 'check_violation';
  end if;

  -- Minimal server-side email shape check. The app checks too; this is the
  -- check that actually holds, because the app can be bypassed.
  if v_email::text !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;

  -- Privacy acknowledgment + contact consent are mandatory and never
  -- pre-checked in the form. Absent or false is a refusal, not a default.
  if coalesce((payload->'consent'->>'privacy')::boolean, false) is not true
     or coalesce((payload->'consent'->>'contact')::boolean, false) is not true then
    raise exception 'privacy acknowledgment and contact consent are required'
      using errcode = 'check_violation';
  end if;

  -- Light duplicate-rapid guard: same email within 60 seconds. Stops a double
  -- submit (and the crudest abuse) without holding state anywhere.
  if exists (
    select 1 from intake.operations_assessment_requests
    where contact_email = v_email
      and created_at > pg_catalog.now() - interval '60 seconds'
  ) then
    raise exception 'please wait a moment before submitting again'
      using errcode = 'check_violation';
  end if;

  -- Reference is derived from the row's own id, so it is unique for the same
  -- reason the id is, and carries no sequence anyone could count submissions by.
  v_id  := pg_catalog.gen_random_uuid();
  v_ref := 'HSCS-OA-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_id::text, '-', ''), 1, 8));

  insert into intake.operations_assessment_requests (
    id, reference,
    company_name, contact_name, contact_email, contact_phone, contact_role,
    primary_concern, what_prompted, operation_scale,
    operation, priorities, context,
    consent_privacy, consent_contact,
    source_page, attribution
  ) values (
    v_id, v_ref,
    pg_catalog.left(v_company, 300),
    pg_catalog.left(v_contact, 300),
    v_email,
    nullif(pg_catalog.btrim(coalesce(payload->'contact'->>'phone', '')), ''),
    nullif(pg_catalog.btrim(coalesce(payload->'contact'->>'role', '')), ''),
    nullif(pg_catalog.btrim(coalesce(payload->'priorities'->>'primaryConcern', '')), ''),
    nullif(pg_catalog.btrim(coalesce(payload->'context'->>'whatPrompted', '')), ''),
    nullif(pg_catalog.btrim(coalesce(payload->'operation'->>'scale', '')), ''),
    coalesce(payload->'operation',  '{}'::jsonb),
    coalesce(payload->'priorities', '{}'::jsonb),
    coalesce(payload->'context',    '{}'::jsonb),
    true, true,
    pg_catalog.left(coalesce(payload->>'sourcePage', ''), 300),
    coalesce(payload->'attribution', '{}'::jsonb)
  );

  return v_ref;
end; $$;

comment on function public.submit_operations_assessment_request(jsonb) is
  'Anonymous HSCS Operations Assessment submit. The ONLY anon write path. Validates + inserts as owner; anon has no table access. Returns the human-quotable reference.';

revoke all on function public.submit_operations_assessment_request(jsonb) from public;
grant execute on function public.submit_operations_assessment_request(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC 2 — the intake queue (platform-admin only)
-- ---------------------------------------------------------------------------
create or replace function public.list_operations_assessment_requests(
  p_status text default null,
  p_limit  integer default 100)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not identity.is_platform_admin() then
    raise exception 'insufficient privilege to read assessment requests'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(obj), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'id',              r.id,
      'reference',       r.reference,
      'status',          r.status,
      'company_name',    r.company_name,
      'contact_name',    r.contact_name,
      'email',           r.contact_email,
      'phone',           r.contact_phone,
      'primary_concern', r.primary_concern,
      'what_prompted',   r.what_prompted,
      'operation_scale', r.operation_scale,
      'created_at',      r.created_at
    ) as obj
    from intake.operations_assessment_requests r
    where p_status is null or r.status = p_status::intake.assessment_request_status
    order by r.created_at desc
    limit greatest(1, least(p_limit, 500))
  ) t;

  return v;
end; $$;

comment on function public.list_operations_assessment_requests(text, integer) is
  'Platform-admin-only HSCS assessment queue: reference, status, company, contact, concern, trigger.';

revoke all on function public.list_operations_assessment_requests(text, integer) from public, anon;
grant execute on function public.list_operations_assessment_requests(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC 3 — open one request in full (platform-admin only)
--
-- The queue above is a summary. Without this, the grouped section detail the
-- form collects would be WRITE-ONLY: stored, RLS-forced, and unreadable by the
-- only people entitled to it. Collecting an operator's answers and then having
-- no way to read them back would make the form a worse-than-useless control.
-- This gap was found by the pgTAP suite failing, not by review.
-- ---------------------------------------------------------------------------
create or replace function public.get_operations_assessment_request(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not identity.is_platform_admin() then
    raise exception 'insufficient privilege to read an assessment request'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'id',              r.id,
    'reference',       r.reference,
    'status',          r.status,
    'company_name',    r.company_name,
    'contact_name',    r.contact_name,
    'email',           r.contact_email,
    'phone',           r.contact_phone,
    'role',            r.contact_role,
    'primary_concern', r.primary_concern,
    'what_prompted',   r.what_prompted,
    'operation_scale', r.operation_scale,
    'operation',       r.operation,
    'priorities',      r.priorities,
    'context',         r.context,
    'consent_at',      r.consent_at,
    'source_page',     r.source_page,
    'attribution',     r.attribution,
    'internal_notes',  r.internal_notes,
    'created_at',      r.created_at,
    'updated_at',      r.updated_at
  ) into v
  from intake.operations_assessment_requests r
  where r.id = p_id;

  if v is null then
    raise exception 'no such assessment request' using errcode = 'no_data_found';
  end if;

  return v;
end; $$;

comment on function public.get_operations_assessment_request(uuid) is
  'Platform-admin-only: the full HSCS assessment request including the grouped section detail. Without this the collected detail would be write-only.';

revoke all on function public.get_operations_assessment_request(uuid) from public, anon;
grant execute on function public.get_operations_assessment_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC 4 — advance status / add a note (platform-admin only)
-- ---------------------------------------------------------------------------
create or replace function public.set_operations_assessment_request_status(
  p_id     uuid,
  p_status text,
  p_note   text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.is_platform_admin() then
    raise exception 'insufficient privilege to update assessment requests'
      using errcode = 'insufficient_privilege';
  end if;

  update intake.operations_assessment_requests
     set status         = p_status::intake.assessment_request_status,
         internal_notes = coalesce(p_note, internal_notes),
         updated_at     = pg_catalog.now()
   where id = p_id;

  if not found then
    raise exception 'no such assessment request' using errcode = 'no_data_found';
  end if;
end; $$;

comment on function public.set_operations_assessment_request_status(uuid, text, text) is
  'Platform-admin-only: advance an HSCS assessment request status and optionally append an internal note.';

revoke all on function public.set_operations_assessment_request_status(uuid, text, text) from public, anon;
grant execute on function public.set_operations_assessment_request_status(uuid, text, text) to authenticated;
