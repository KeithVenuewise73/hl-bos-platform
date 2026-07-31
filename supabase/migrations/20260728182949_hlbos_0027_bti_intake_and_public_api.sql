-- ===========================================================================
-- HL-BOS migration 0027 — HL-BTI intake fields + browser-reachable public API
-- ===========================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- 0026 built the whole `bti` schema, but it is deliberately NOT exposed via
-- PostgREST (only the `public` schema is — see supabase/config.toml). Every bti
-- RPC is `bti`-schema, `authenticated`-only, and unreachable from a browser.
-- A deployable customer-facing app therefore has NO way to create a business,
-- run an analysis, or read results back. This migration adds the missing
-- browser-reachable surface, without weakening the security model:
--
--   1. Intake columns on bti.businesses (website/location/contact/email/phone/
--      goals) — the CEO intake screen captures these; 0026 had none of them.
--   2. bti.analysis_snapshots — persists a full analysis (profile, findings,
--      blueprint, proposal) as produced by the engine, so results survive
--      across sessions and devices. Tenant-scoped, FORCE RLS.
--   3. A small set of `public.` SECURITY DEFINER wrapper RPCs — the ONLY new
--      API surface. Each re-checks identity.has_permission(tenant, …) exactly
--      like every 0026 write RPC, then delegates to the existing bti functions.
--      Callable by `authenticated` only; `anon` is stripped. This is the
--      documented "thin public wrapper" reuse path, not a new auth system.
--
-- Reuse, not reinvention: authentication = Supabase Auth; identity/tenancy =
-- platform.tenants + identity.memberships; permissions = identity.has_permission;
-- audit = the existing triggers + events.emit. Nothing here duplicates them.
--
-- Safety note (SEC-3 class): a SECURITY DEFINER function in an API-exposed
-- schema is dangerous ONLY if it skips authorization. Every function below
-- checks identity.has_permission(...) BEFORE it touches tenant data, and is
-- REVOKEd from anon. A missing permission raises insufficient_privilege.
--
-- rollback:
--   DROP FUNCTION IF EXISTS public.bti_my_tenants();
--   DROP FUNCTION IF EXISTS public.bti_register_business(uuid, text, text, extensions.citext, extensions.citext, text, text, extensions.citext, text, text, boolean);
--   DROP FUNCTION IF EXISTS public.bti_save_analysis(uuid, integer, jsonb);
--   DROP FUNCTION IF EXISTS public.bti_list_businesses(uuid);
--   DROP FUNCTION IF EXISTS public.bti_latest_analysis(uuid);
--   DROP TABLE IF EXISTS bti.analysis_snapshots;
--   ALTER TABLE bti.businesses
--     DROP COLUMN IF EXISTS website, DROP COLUMN IF EXISTS location,
--     DROP COLUMN IF EXISTS primary_contact, DROP COLUMN IF EXISTS contact_email,
--     DROP COLUMN IF EXISTS contact_phone, DROP COLUMN IF EXISTS goals;
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Intake columns on the business registry
-- ---------------------------------------------------------------------------
alter table bti.businesses add column if not exists website         text;
alter table bti.businesses add column if not exists location        text;
alter table bti.businesses add column if not exists primary_contact text;
alter table bti.businesses add column if not exists contact_email   extensions.citext;
alter table bti.businesses add column if not exists contact_phone   text;
alter table bti.businesses add column if not exists goals           text;

comment on column bti.businesses.website is 'Business website URL captured at intake (real evidence source for analysis).';
comment on column bti.businesses.goals is 'Business goals stated by the owner at intake; consultant-supplied, not inferred.';

-- ---------------------------------------------------------------------------
-- 2 · Analysis persistence — one immutable snapshot per completed analysis
-- ---------------------------------------------------------------------------
-- The snapshot is the store of record for the CEO-facing app: it holds the
-- full BusinessAnalysis payload (Business Intelligence Profile, findings,
-- Executive Blueprint narrative, and Proposal lines) produced deterministically
-- by @hl-bos/bti-engine. Storing the produced artifact — rather than only the
-- granular bti.assessments/ratings — is what lets the CEO reopen a saved
-- business on any device and see exactly the results as generated.
create table if not exists bti.analysis_snapshots (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  business_id          uuid not null references bti.businesses(id) on delete cascade,
  transformation_score integer,
  payload              jsonb not null default '{}'::jsonb,   -- full BusinessAnalysis (findings/blueprint/proposal)
  created_by           uuid references auth.users(id) on delete set null,
  produced_at          timestamptz not null default now(),
  constraint analysis_snapshots_score_range
    check (transformation_score is null or transformation_score between 0 and 100)
);
create index if not exists analysis_snapshots_business_idx
  on bti.analysis_snapshots (business_id, produced_at desc);
create index if not exists analysis_snapshots_tenant_idx
  on bti.analysis_snapshots (tenant_id);

comment on table bti.analysis_snapshots is
  'Immutable snapshot of a full HL-BTI analysis (profile, findings, blueprint, proposal) for a business. Tenant-scoped; read by permission; written only via the public RPC. Persists results across sessions and devices.';

-- RLS: same house style as every 0026 tenant table — FORCE, read by permission,
-- no direct tenant write path (writes go through the definer RPC below).
alter table bti.analysis_snapshots enable row level security;
alter table bti.analysis_snapshots force row level security;

drop policy if exists analysis_snapshots_select on bti.analysis_snapshots;
create policy analysis_snapshots_select on bti.analysis_snapshots
  for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.assessment.read'));

grant select on bti.analysis_snapshots to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · The public, browser-reachable API (SECURITY DEFINER, permission-checked)
-- ---------------------------------------------------------------------------

-- 3.1 · Which tenants may this signed-in user run HL-BTI in?
-- Lets the app resolve the caller's workspace(s) in one call. Read-only.
create or replace function public.bti_my_tenants()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'tenant_id',  t.id,
               'name',       t.name,
               'slug',       t.slug,
               'can_manage', identity.has_permission(t.id, 'bti.business.manage')
             )
             order by t.name
           ),
           '[]'::jsonb)
    into v
    from platform.tenants t
   where t.id in (select identity.my_tenant_ids())
     and identity.has_permission(t.id, 'bti.business.read');
  return v;
end; $$;
revoke all on function public.bti_my_tenants() from public, anon;
grant execute on function public.bti_my_tenants() to authenticated;

-- 3.2 · Create a business record from the intake screen.
-- Generates a valid unique per-tenant key, delegates the core insert +
-- permission check + event to bti.register_business, then stores intake fields.
create or replace function public.bti_register_business(
  p_tenant          uuid,
  p_name            text,
  p_website         text default '',
  p_industry        extensions.citext default null,
  p_pack            extensions.citext default null,
  p_location        text default '',
  p_primary_contact text default '',
  p_email           extensions.citext default null,
  p_phone           text default '',
  p_goals           text default '',
  p_analysis_only   boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id   uuid;
  v_base text;
  v_try  text;
  v_n    integer := 0;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'business name is required' using errcode = 'check_violation';
  end if;

  -- Derive a key that satisfies businesses_key_format: ^[a-z][a-z0-9_]{2,63}$
  v_base := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '_', 'g'));
  v_base := regexp_replace(v_base, '^_+|_+$', '', 'g');
  if v_base is null or v_base = '' then v_base := 'business'; end if;
  if v_base !~ '^[a-z]' then v_base := 'b_' || v_base; end if;
  if length(v_base) < 3 then v_base := v_base || '_biz'; end if;
  v_base := left(v_base, 60);

  v_try := v_base;
  loop
    exit when not exists (
      select 1 from bti.businesses
      where tenant_id = p_tenant and key = v_try::extensions.citext);
    v_n := v_n + 1;
    v_try := left(v_base, 56) || '_' || v_n::text;
  end loop;

  -- Permission (bti.business.manage) is enforced inside register_business; it
  -- raises before any row is written if the caller lacks it.
  v_id := bti.register_business(
            p_tenant, v_try::extensions.citext, p_name, p_industry, p_pack, p_analysis_only);

  update bti.businesses
     set website         = nullif(btrim(p_website), ''),
         location        = nullif(btrim(p_location), ''),
         primary_contact = nullif(btrim(p_primary_contact), ''),
         contact_email   = p_email,
         contact_phone   = nullif(btrim(p_phone), ''),
         goals           = nullif(btrim(p_goals), ''),
         updated_at      = now()
   where id = v_id;

  return v_id;
end; $$;
revoke all on function public.bti_register_business(
  uuid, text, text, extensions.citext, extensions.citext, text, text,
  extensions.citext, text, text, boolean) from public, anon;
grant execute on function public.bti_register_business(
  uuid, text, text, extensions.citext, extensions.citext, text, text,
  extensions.citext, text, text, boolean) to authenticated;

-- 3.3 · Save a completed analysis (findings + blueprint + proposal) for a business.
create or replace function public.bti_save_analysis(
  p_business             uuid,
  p_transformation_score integer,
  p_payload              jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from bti.businesses where id = p_business;
  if v_tenant is null then
    raise exception 'no such business' using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'bti.assessment.manage') then
    raise exception 'insufficient privilege to save an analysis'
      using errcode = 'insufficient_privilege';
  end if;

  insert into bti.analysis_snapshots (tenant_id, business_id, transformation_score, payload, created_by)
  values (v_tenant, p_business, p_transformation_score, coalesce(p_payload, '{}'::jsonb), auth.uid())
  returning id into v_id;

  perform events.emit('bti.business.registered', v_tenant,
    jsonb_build_object('business', p_business, 'snapshot', v_id, 'kind', 'analysis_saved'));
  return v_id;
end; $$;
revoke all on function public.bti_save_analysis(uuid, integer, jsonb) from public, anon;
grant execute on function public.bti_save_analysis(uuid, integer, jsonb) to authenticated;

-- 3.4 · List the tenant's businesses with a summary of their latest analysis.
create or replace function public.bti_list_businesses(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not identity.has_permission(p_tenant, 'bti.business.read') then
    raise exception 'insufficient privilege to list businesses'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',              b.id,
               'name',            b.name,
               'website',         b.website,
               'industry',        b.industry,
               'industry_pack',   b.industry_pack,
               'location',        b.location,
               'primary_contact', b.primary_contact,
               'email',           b.contact_email,
               'phone',           b.contact_phone,
               'goals',           b.goals,
               'analysis_only',   b.analysis_only,
               'created_at',      b.created_at,
               'latest',          (
                 select jsonb_build_object(
                          'id',                   s.id,
                          'produced_at',          s.produced_at,
                          'transformation_score', s.transformation_score)
                 from bti.analysis_snapshots s
                 where s.business_id = b.id
                 order by s.produced_at desc
                 limit 1)
             )
             order by b.created_at desc)
           , '[]'::jsonb)
    into v
    from bti.businesses b
   where b.tenant_id = p_tenant;
  return v;
end; $$;
revoke all on function public.bti_list_businesses(uuid) from public, anon;
grant execute on function public.bti_list_businesses(uuid) to authenticated;

-- 3.5 · Fetch the latest saved analysis payload for a business (for reload).
create or replace function public.bti_latest_analysis(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tenant uuid; v jsonb;
begin
  select tenant_id into v_tenant from bti.businesses where id = p_business;
  if v_tenant is null then
    raise exception 'no such business' using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'bti.assessment.read') then
    raise exception 'insufficient privilege to read analyses'
      using errcode = 'insufficient_privilege';
  end if;
  select payload into v
    from bti.analysis_snapshots
   where business_id = p_business
   order by produced_at desc
   limit 1;
  return v;   -- null when the business has no saved analysis yet
end; $$;
revoke all on function public.bti_latest_analysis(uuid) from public, anon;
grant execute on function public.bti_latest_analysis(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · PostgREST schema cache reload (so the new RPCs are served immediately)
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_catalog.pg_notify('pgrst', 'reload schema');
exception when others then
  null;  -- notify is best-effort; a manual reload/redeploy also picks it up
end $$;
