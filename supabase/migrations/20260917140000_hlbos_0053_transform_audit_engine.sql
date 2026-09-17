-- ===========================================================================
-- hlbos_0053 — Business Transformation Audit: the pre-sale diagnostic engine
--
-- PROVENANCE: the second half of the BarberOS reconstruction begun in
-- 0049–0052. See docs/products/barberos/02-production-drift-map.md.
--
-- This reconstructs the END STATE of the `transform_audit` schema as it already
-- exists in canonical production, where it was applied under the names
-- hlbos_0049_transform_audit, hlbos_0050_citext_guard_semantics and
-- hlbos_0051_unknown_is_not_complete. ALREADY APPLIED THERE — do not re-apply.
-- As in 0049–0052 this is the end state read out of the live catalog, not a
-- replay of that history: the database records what exists, not which migration
-- created it, and a plausible-looking split would be invented history.
--
-- WHAT THIS IS
--
-- The engine that audits a barbershop BEFORE it is a customer. A campaign
-- decides which dimensions matter and how much; a run scores one prospect
-- against them; findings are the evidence; recommendations are what to do
-- about it, and they resolve to real BarberOS capabilities.
--
-- It is agency-tenant scoped: the tenant here is Herman Legacy doing the
-- auditing, not the barbershop being audited. The shop is a
-- `visibility.prospects` row, which is why shop_profiles extends that table
-- rather than replacing it.
--
-- THE HONESTY GUARDS, WHICH ARE THE POINT
--
-- This schema's whole job is to produce a claim about someone else's business
-- that we will then put in front of them. Every one of these exists so that
-- claim cannot be softer than the evidence behind it:
--
--   * findings are APPEND-ONLY. deny_finding_mutation() refuses UPDATE and
--     DELETE outright. A recorded observation cannot be revised after a report
--     has been built on it.
--   * 'unknown' confidence and a null score are the SAME FACT, tied together
--     by a CHECK. A dimension we could not reach is not a dimension that
--     scored zero.
--   * a dimension cannot be scored 'verified' unless some finding on that run
--     carries an evidence URL (enforce_verified_has_evidence). "Verified"
--     means we looked, and the trigger makes us prove it.
--   * composite_score and dimensions_scored are DERIVED. deny_derived_write()
--     blocks writing them directly; only recompute_composite() may, and it
--     announces itself with a session GUC to do so.
--   * a weighted dimension counts as assessed only if it has a row that is not
--     'unknown'. finish_run() therefore returns 'partially_completed', not
--     'completed', when anything is still unknown — which is why every one of
--     the 40 real runs in production reads partially or scores 0.
--   * the outreach hook must CITE a finding from its own run
--     (enforce_hook_provenance + a CHECK tying hook and finding together).
--     There is no way to record a sales line that no observation supports.
--   * a shop cannot be its own competitor.
--
-- rollback:
--   DROP SCHEMA IF EXISTS transform_audit CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'transform_audit.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'transform_audit.%';
-- ===========================================================================

create schema if not exists transform_audit;
comment on schema transform_audit is 'HL-BOS: Business Transformation Analysis Tool -- pre-sale digital-presence audits. Agency-tenant scoped. NOT exposed via PostgREST.';
revoke all on schema transform_audit from public, anon;
grant usage on schema transform_audit to authenticated;
alter default privileges in schema transform_audit revoke all on tables from public;
alter default privileges in schema transform_audit revoke all on functions from public;

do $$ begin create type transform_audit.dimension as enum ('website','google_business','social','competitor');
exception when duplicate_object then null; end $$;
do $$ begin create type transform_audit.run_status as enum ('running','completed','partially_completed','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type transform_audit.confidence as enum ('verified','inferred','unknown');
exception when duplicate_object then null; end $$;
do $$ begin create type transform_audit.severity as enum ('critical','high','medium','info');
exception when duplicate_object then null; end $$;
do $$ begin create type transform_audit.priority as enum ('quick_win','structural');
exception when duplicate_object then null; end $$;
do $$ begin create type transform_audit.campaign_status as enum ('draft','active','closed');
exception when duplicate_object then null; end $$;

-- --- campaigns: which dimensions matter, and how much -----------------------
create table if not exists transform_audit.campaigns (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  key        extensions.citext not null,
  name       text not null,
  status     transform_audit.campaign_status not null default 'draft',
  notes      text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_key_format check (key::text ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint campaigns_key_unique unique (tenant_id, key)
);

create table if not exists transform_audit.campaign_weights (
  campaign_id uuid not null references transform_audit.campaigns(id) on delete cascade,
  dimension   transform_audit.dimension not null,
  weight      integer not null,
  primary key (campaign_id, dimension),
  constraint campaign_weights_positive check (weight > 0)
);

-- --- the shop being audited -------------------------------------------------
-- Extends visibility.prospects rather than duplicating it: the prospect record
-- is the shop, this is the barbershop-specific detail hung off it.
create table if not exists transform_audit.shop_profiles (
  prospect_id      uuid primary key references visibility.prospects(id) on delete cascade,
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  address_line1    text,
  locality         text,
  region           text,
  postal_code      text,
  website_platform extensions.citext,
  gbp_place_id     text,
  gbp_url          text,
  instagram_url    text,
  facebook_url     text,
  source_file      text,
  source_row       integer,
  dedupe_key       extensions.citext not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint shop_profiles_dedupe_unique unique (tenant_id, dedupe_key),
  constraint shop_profiles_source_row_pos check (source_row is null or source_row > 0)
);
create index if not exists shop_profiles_tenant_idx on transform_audit.shop_profiles (tenant_id);

-- --- a run: one prospect, one campaign, one scoring pass --------------------
create table if not exists transform_audit.runs (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references platform.tenants(id) on delete cascade,
  campaign_id              uuid not null references transform_audit.campaigns(id) on delete cascade,
  prospect_id              uuid not null references visibility.prospects(id) on delete cascade,
  status                   transform_audit.run_status not null default 'running',
  weights                  jsonb not null,
  composite_score          integer,
  dimensions_scored        integer not null default 0,
  dimensions_possible      integer not null,
  outreach_hook            text,
  outreach_hook_finding_id bigint,
  started_at               timestamptz not null default now(),
  finished_at              timestamptz,
  error                    text,
  constraint runs_composite_range check (composite_score is null or (composite_score >= 0 and composite_score <= 100)),
  constraint runs_dimensions_sane check (dimensions_scored >= 0 and dimensions_scored <= dimensions_possible),
  -- The weights are frozen onto the run, so re-weighting a campaign later
  -- cannot silently restate a score that was already reported.
  constraint runs_weights_not_empty check (jsonb_typeof(weights) = 'object' and weights <> '{}'::jsonb),
  -- A sales line and the observation that justifies it stand or fall together.
  constraint runs_hook_needs_evidence check ((outreach_hook is null) = (outreach_hook_finding_id is null))
);
create index if not exists runs_campaign_idx on transform_audit.runs (campaign_id, started_at desc);
create index if not exists runs_prospect_idx on transform_audit.runs (prospect_id, started_at desc);

-- --- findings: the evidence, append-only ------------------------------------
create table if not exists transform_audit.findings (
  id           bigint generated always as identity primary key,
  run_id       uuid not null references transform_audit.runs(id) on delete cascade,
  dimension    transform_audit.dimension not null,
  code         extensions.citext not null,
  statement    text not null,
  evidence_url text,
  observed     jsonb not null default '{}'::jsonb,
  confidence   transform_audit.confidence not null,
  severity     transform_audit.severity not null default 'info',
  detector     extensions.citext not null,
  created_at   timestamptz not null default now(),
  constraint findings_code_format check (code::text ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint findings_statement_present check (length(btrim(statement)) > 0),
  -- If we do not know, we cannot also be citing a page that proves it.
  constraint findings_unknown_has_no_evidence
    check (confidence <> 'unknown' or evidence_url is null)
);
create index if not exists findings_run_idx on transform_audit.findings (run_id, dimension);

-- The hook FK closes a cycle (runs -> findings -> runs), so it is added after
-- both tables exist rather than inline.
do $$ begin
  alter table transform_audit.runs
    add constraint runs_hook_finding_fk
    foreign key (outreach_hook_finding_id)
    references transform_audit.findings(id) on delete set null;
exception when duplicate_object then null; end $$;

-- --- the scorecard ----------------------------------------------------------
create table if not exists transform_audit.dimension_scores (
  run_id         uuid not null references transform_audit.runs(id) on delete cascade,
  dimension      transform_audit.dimension not null,
  score          integer,
  confidence     transform_audit.confidence not null,
  rubric_version extensions.citext not null,
  note           text not null default '',
  scored_at      timestamptz not null default now(),
  primary key (run_id, dimension),
  constraint dimension_scores_range check (score is null or (score >= 0 and score <= 100)),
  -- "We could not tell" and "it scored nothing" are different facts, and this
  -- makes them impossible to confuse.
  constraint dimension_scores_unknown_is_unscored
    check ((confidence = 'unknown') = (score is null))
);

-- --- what to do about it ----------------------------------------------------
create table if not exists transform_audit.recommendations (
  id                   bigint generated always as identity primary key,
  run_id               uuid not null references transform_audit.runs(id) on delete cascade,
  priority             transform_audit.priority not null,
  rank                 integer not null default 1,
  title                text not null,
  detail               text not null default '',
  -- The BarberOS catalog is the vocabulary: a recommendation resolves to a
  -- real capability or to none, never to an invented module.
  capability_key       extensions.citext references barberos.capabilities(key) on delete restrict,
  addresses_finding_id bigint references transform_audit.findings(id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint recommendations_rank_pos check (rank > 0),
  constraint recommendations_title_present check (length(btrim(title)) > 0)
);
create index if not exists recommendations_run_idx
  on transform_audit.recommendations (run_id, priority, rank);

create table if not exists transform_audit.run_competitors (
  run_id                 uuid not null references transform_audit.runs(id) on delete cascade,
  competitor_prospect_id uuid not null references visibility.prospects(id) on delete cascade,
  confirmed_by           uuid references auth.users(id) on delete set null,
  confirmed_at           timestamptz,
  note                   text not null default '',
  primary key (run_id, competitor_prospect_id),
  constraint run_competitors_confirmation_consistent
    check ((confirmed_by is null) = (confirmed_at is null))
);

-- --- the guards -------------------------------------------------------------
create or replace function transform_audit.deny_finding_mutation()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  raise exception 'transform_audit.findings is append-only: a recorded observation cannot be % after the fact',
    lower(tg_op) using errcode = 'insufficient_privilege';
end; $function$;

create or replace function transform_audit.deny_derived_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if pg_catalog.current_setting('transform_audit.deriving', true) = 'on' then
    return new;
  end if;
  if new.composite_score is distinct from old.composite_score
     or new.dimensions_scored is distinct from old.dimensions_scored then
    raise exception
      'composite_score and dimensions_scored are derived from dimension_scores and cannot be written directly'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end; $function$;

create or replace function transform_audit.enforce_verified_has_evidence()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.confidence = 'verified'
     and not exists (
       select 1 from transform_audit.findings f
        where f.run_id = new.run_id
          and f.dimension = new.dimension
          and f.evidence_url is not null) then
    raise exception
      'dimension % cannot be scored ''verified'': no finding on this run carries an evidence URL',
      new.dimension using errcode = 'check_violation';
  end if;
  return new;
end; $function$;

create or replace function transform_audit.enforce_hook_provenance()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_run uuid;
begin
  if new.outreach_hook_finding_id is null then return new; end if;
  select f.run_id into v_run from transform_audit.findings f
   where f.id = new.outreach_hook_finding_id;
  if v_run is distinct from new.id then
    raise exception 'the outreach hook must cite a finding from this run'
      using errcode = 'check_violation';
  end if;
  return new;
end; $function$;

create or replace function transform_audit.enforce_profile_tenant()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid;
begin
  select p.tenant_id into v_tenant from visibility.prospects p where p.id = new.prospect_id;
  if v_tenant is null then
    raise exception 'prospect % does not exist', new.prospect_id using errcode = 'no_data_found';
  end if;
  if v_tenant <> new.tenant_id then
    raise exception 'shop profile tenant % does not match prospect tenant %',
      new.tenant_id, v_tenant using errcode = 'check_violation';
  end if;
  return new;
end; $function$;

create or replace function transform_audit.enforce_competitor_distinct()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_subject uuid;
begin
  select r.prospect_id into v_subject from transform_audit.runs r where r.id = new.run_id;
  if v_subject = new.competitor_prospect_id then
    raise exception 'a shop cannot be its own competitor' using errcode = 'check_violation';
  end if;
  return new;
end; $function$;

drop trigger if exists findings_append_only on transform_audit.findings;
create trigger findings_append_only before update or delete on transform_audit.findings
  for each row execute function transform_audit.deny_finding_mutation();
drop trigger if exists runs_deny_derived_write on transform_audit.runs;
create trigger runs_deny_derived_write before update on transform_audit.runs
  for each row execute function transform_audit.deny_derived_write();
drop trigger if exists runs_hook_provenance on transform_audit.runs;
create trigger runs_hook_provenance before insert or update on transform_audit.runs
  for each row execute function transform_audit.enforce_hook_provenance();
drop trigger if exists runs_audit on transform_audit.runs;
create trigger runs_audit after insert or update or delete on transform_audit.runs
  for each row execute function audit.emit();
drop trigger if exists dimension_scores_verified_needs_evidence on transform_audit.dimension_scores;
create trigger dimension_scores_verified_needs_evidence before insert or update on transform_audit.dimension_scores
  for each row execute function transform_audit.enforce_verified_has_evidence();
drop trigger if exists run_competitors_distinct on transform_audit.run_competitors;
create trigger run_competitors_distinct before insert or update on transform_audit.run_competitors
  for each row execute function transform_audit.enforce_competitor_distinct();
drop trigger if exists shop_profiles_tenant_match on transform_audit.shop_profiles;
create trigger shop_profiles_tenant_match before insert or update on transform_audit.shop_profiles
  for each row execute function transform_audit.enforce_profile_tenant();
drop trigger if exists shop_profiles_set_updated_at on transform_audit.shop_profiles;
create trigger shop_profiles_set_updated_at before update on transform_audit.shop_profiles
  for each row execute function platform.set_updated_at();
drop trigger if exists shop_profiles_audit on transform_audit.shop_profiles;
create trigger shop_profiles_audit after insert or update or delete on transform_audit.shop_profiles
  for each row execute function audit.emit();
drop trigger if exists campaigns_set_updated_at on transform_audit.campaigns;
create trigger campaigns_set_updated_at before update on transform_audit.campaigns
  for each row execute function platform.set_updated_at();
drop trigger if exists campaigns_audit on transform_audit.campaigns;
create trigger campaigns_audit after insert or update or delete on transform_audit.campaigns
  for each row execute function audit.emit();

-- --- RLS --------------------------------------------------------------------
alter table transform_audit.campaigns        enable row level security; alter table transform_audit.campaigns        force row level security;
alter table transform_audit.campaign_weights enable row level security; alter table transform_audit.campaign_weights force row level security;
alter table transform_audit.shop_profiles    enable row level security; alter table transform_audit.shop_profiles    force row level security;
alter table transform_audit.runs             enable row level security; alter table transform_audit.runs             force row level security;
alter table transform_audit.findings         enable row level security; alter table transform_audit.findings         force row level security;
alter table transform_audit.dimension_scores enable row level security; alter table transform_audit.dimension_scores force row level security;
alter table transform_audit.recommendations  enable row level security; alter table transform_audit.recommendations  force row level security;
alter table transform_audit.run_competitors  enable row level security; alter table transform_audit.run_competitors  force row level security;

drop policy if exists campaigns_select on transform_audit.campaigns;
create policy campaigns_select on transform_audit.campaigns for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read') or identity.is_platform_admin());
drop policy if exists shop_profiles_select on transform_audit.shop_profiles;
create policy shop_profiles_select on transform_audit.shop_profiles for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read') or identity.is_platform_admin());
drop policy if exists runs_select on transform_audit.runs;
create policy runs_select on transform_audit.runs for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read') or identity.is_platform_admin());

-- The child tables inherit reachability from the parent row, which is itself
-- permission-gated above.
drop policy if exists campaign_weights_select on transform_audit.campaign_weights;
create policy campaign_weights_select on transform_audit.campaign_weights for select to authenticated
  using (exists (select 1 from transform_audit.campaigns c where c.id = campaign_weights.campaign_id));
drop policy if exists findings_select on transform_audit.findings;
create policy findings_select on transform_audit.findings for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = findings.run_id));
drop policy if exists dimension_scores_select on transform_audit.dimension_scores;
create policy dimension_scores_select on transform_audit.dimension_scores for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = dimension_scores.run_id));
drop policy if exists recommendations_select on transform_audit.recommendations;
create policy recommendations_select on transform_audit.recommendations for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = recommendations.run_id));
drop policy if exists run_competitors_select on transform_audit.run_competitors;
create policy run_competitors_select on transform_audit.run_competitors for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = run_competitors.run_id));

grant select on transform_audit.campaigns, transform_audit.campaign_weights,
                transform_audit.shop_profiles, transform_audit.runs,
                transform_audit.findings, transform_audit.dimension_scores,
                transform_audit.recommendations, transform_audit.run_competitors
  to authenticated;

-- --- permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('transform_audit.audit.read',       'Read shop audits, findings and recommendations.', 'tenant'),
  ('transform_audit.audit.create',     'Run an audit and record its findings and scores.', 'tenant'),
  ('transform_audit.campaign.manage',  'Create audit campaigns and set their dimension weighting.', 'tenant'),
  ('transform_audit.shop.manage',      'Import and edit the shops being audited.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','transform_audit.audit.read'),('tenant_owner','transform_audit.audit.create'),
  ('tenant_owner','transform_audit.campaign.manage'),('tenant_owner','transform_audit.shop.manage'),
  ('tenant_admin','transform_audit.audit.read'),('tenant_admin','transform_audit.audit.create'),
  ('tenant_admin','transform_audit.campaign.manage'),('tenant_admin','transform_audit.shop.manage'),
  ('manager','transform_audit.audit.read'),('manager','transform_audit.audit.create'),
  ('manager','transform_audit.shop.manage'),
  ('staff','transform_audit.audit.read'),
  ('viewer','transform_audit.audit.read')
on conflict do nothing;

-- --- campaigns and shops ----------------------------------------------------
create or replace function transform_audit.upsert_campaign(
  p_tenant uuid, p_key extensions.citext, p_name text,
  p_weights jsonb default '{"website": 100}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_id uuid; v_dim text; v_weight integer;
begin
  if not identity.has_permission(p_tenant, 'transform_audit.campaign.manage') then
    raise exception 'insufficient privilege to manage an audit campaign'
      using errcode = 'insufficient_privilege';
  end if;
  if p_weights is null or pg_catalog.jsonb_typeof(p_weights) <> 'object'
     or p_weights = '{}'::jsonb then
    raise exception 'a campaign must weight at least one dimension'
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.campaigns (tenant_id, key, name, created_by)
  values (p_tenant, p_key, p_name, auth.uid())
  on conflict (tenant_id, key) do update set name = excluded.name, updated_at = now()
  returning id into v_id;

  -- Weights are replaced wholesale: a partial update would leave a dimension
  -- weighted by a value nobody chose this time.
  delete from transform_audit.campaign_weights w where w.campaign_id = v_id;
  for v_dim, v_weight in select k, v::text::integer from pg_catalog.jsonb_each_text(p_weights) as t(k, v)
  loop
    insert into transform_audit.campaign_weights (campaign_id, dimension, weight)
    values (v_id, v_dim::transform_audit.dimension, v_weight);
  end loop;
  return v_id;
end; $function$;

create or replace function transform_audit.import_shop(p_tenant uuid, p_row jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_name text := pg_catalog.btrim(coalesce(p_row->>'business_name', ''));
  v_postal text := pg_catalog.btrim(coalesce(p_row->>'postal_code', ''));
  v_dedupe extensions.citext;
  v_prospect uuid;
begin
  if not identity.has_permission(p_tenant, 'transform_audit.shop.manage') then
    raise exception 'insufficient privilege to import a shop'
      using errcode = 'insufficient_privilege';
  end if;
  if v_name = '' then
    raise exception 'a shop row must carry a business_name' using errcode = 'check_violation';
  end if;
  v_dedupe := (pg_catalog.lower(v_name) || '|' || pg_catalog.lower(v_postal))::extensions.citext;

  select sp.prospect_id into v_prospect
    from transform_audit.shop_profiles sp
   where sp.tenant_id = p_tenant and sp.dedupe_key = v_dedupe;

  if v_prospect is null then
    insert into visibility.prospects
      (tenant_id, business_name, phone, industry, city, website_url, created_by)
    values (p_tenant, v_name, p_row->>'phone',
            coalesce(p_row->>'industry', 'barbershop')::extensions.citext,
            p_row->>'locality', p_row->>'website_url', auth.uid())
    returning id into v_prospect;
  else
    update visibility.prospects p
       set business_name = v_name,
           phone         = coalesce(p_row->>'phone', p.phone),
           city          = coalesce(p_row->>'locality', p.city),
           website_url   = coalesce(p_row->>'website_url', p.website_url),
           updated_at    = now()
     where p.id = v_prospect;
  end if;

  insert into transform_audit.shop_profiles
    (prospect_id, tenant_id, address_line1, locality, region, postal_code,
     website_platform, gbp_place_id, gbp_url, instagram_url, facebook_url,
     source_file, source_row, dedupe_key)
  values (v_prospect, p_tenant, p_row->>'address_line1', p_row->>'locality',
          p_row->>'region', nullif(v_postal, ''),
          (p_row->>'website_platform')::extensions.citext,
          p_row->>'gbp_place_id', p_row->>'gbp_url',
          p_row->>'instagram_url', p_row->>'facebook_url',
          p_row->>'source_file', (p_row->>'source_row')::integer, v_dedupe)
  on conflict (prospect_id) do update
    set address_line1    = coalesce(excluded.address_line1, transform_audit.shop_profiles.address_line1),
        locality         = coalesce(excluded.locality, transform_audit.shop_profiles.locality),
        region           = coalesce(excluded.region, transform_audit.shop_profiles.region),
        postal_code      = coalesce(excluded.postal_code, transform_audit.shop_profiles.postal_code),
        website_platform = coalesce(excluded.website_platform, transform_audit.shop_profiles.website_platform),
        gbp_place_id     = coalesce(excluded.gbp_place_id, transform_audit.shop_profiles.gbp_place_id),
        gbp_url          = coalesce(excluded.gbp_url, transform_audit.shop_profiles.gbp_url),
        instagram_url    = coalesce(excluded.instagram_url, transform_audit.shop_profiles.instagram_url),
        facebook_url     = coalesce(excluded.facebook_url, transform_audit.shop_profiles.facebook_url),
        source_file      = coalesce(excluded.source_file, transform_audit.shop_profiles.source_file),
        source_row       = coalesce(excluded.source_row, transform_audit.shop_profiles.source_row),
        updated_at       = now();
  return v_prospect;
end; $function$;

-- --- the run lifecycle ------------------------------------------------------
create or replace function transform_audit.start_run(p_campaign uuid, p_prospect uuid)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_weights jsonb; v_count integer; v_id uuid;
begin
  select c.tenant_id into v_tenant from transform_audit.campaigns c where c.id = p_campaign;
  if v_tenant is null then
    raise exception 'campaign % not found', p_campaign using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to run an audit'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from visibility.prospects p
                  where p.id = p_prospect and p.tenant_id = v_tenant) then
    raise exception 'prospect % does not belong to this campaign''s tenant', p_prospect
      using errcode = 'check_violation';
  end if;

  select pg_catalog.jsonb_object_agg(w.dimension::text, w.weight), pg_catalog.count(*)
    into v_weights, v_count
    from transform_audit.campaign_weights w where w.campaign_id = p_campaign;
  if v_count is null or v_count = 0 then
    raise exception 'campaign % weights no dimensions, so a run could not be scored', p_campaign
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.runs
    (tenant_id, campaign_id, prospect_id, weights, dimensions_possible)
  values (v_tenant, p_campaign, p_prospect, v_weights, v_count)
  returning id into v_id;

  perform events.emit('transform_audit.run.started', v_tenant,
    jsonb_build_object('run', v_id, 'campaign', p_campaign, 'prospect', p_prospect));
  return v_id;
end; $function$;

create or replace function transform_audit.record_finding(
  p_run uuid, p_dimension transform_audit.dimension, p_code extensions.citext,
  p_statement text, p_confidence transform_audit.confidence,
  p_severity transform_audit.severity default 'info', p_evidence_url text default null,
  p_observed jsonb default '{}'::jsonb, p_detector extensions.citext default 'manual')
returns bigint language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_status transform_audit.run_status; v_id bigint;
begin
  select r.tenant_id, r.status into v_tenant, v_status
    from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to record a finding'
      using errcode = 'insufficient_privilege';
  end if;
  -- A finished run's evidence is closed. Adding to it later would let a report
  -- change after it was sent, which append-only findings exist to prevent.
  if v_status <> 'running' then
    raise exception 'run % is % and no longer accepts findings', p_run, v_status
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.findings
    (run_id, dimension, code, statement, evidence_url, observed, confidence, severity, detector)
  values (p_run, p_dimension, p_code, p_statement, p_evidence_url,
          coalesce(p_observed, '{}'::jsonb), p_confidence, p_severity, p_detector)
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function transform_audit.recompute_composite(p_run uuid)
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_weights jsonb; v_num numeric := 0; v_den numeric := 0; v_n integer := 0;
        v_composite integer; r record;
begin
  select r2.weights into v_weights from transform_audit.runs r2 where r2.id = p_run;
  if v_weights is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;

  for r in
    select ds.dimension, ds.score from transform_audit.dimension_scores ds
     where ds.run_id = p_run and ds.score is not null
  loop
    -- A dimension the campaign does not weight cannot influence the composite,
    -- even if something scored it.
    if v_weights ? r.dimension::text then
      v_num := v_num + (r.score * (v_weights->>r.dimension::text)::numeric);
      v_den := v_den + (v_weights->>r.dimension::text)::numeric;
      v_n := v_n + 1;
    end if;
  end loop;

  v_composite := case when v_den > 0 then pg_catalog.round(v_num / v_den)::integer else null end;

  perform pg_catalog.set_config('transform_audit.deriving', 'on', true);
  update transform_audit.runs r3
     set composite_score = v_composite, dimensions_scored = v_n
   where r3.id = p_run;
  perform pg_catalog.set_config('transform_audit.deriving', 'off', true);
  return v_composite;
end; $function$;

create or replace function transform_audit.record_dimension(
  p_run uuid, p_dimension transform_audit.dimension, p_score integer,
  p_confidence transform_audit.confidence, p_rubric_version extensions.citext,
  p_note text default '')
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_status transform_audit.run_status;
begin
  select r.tenant_id, r.status into v_tenant, v_status
    from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to score a dimension'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'running' then
    raise exception 'run % is % and can no longer be scored', p_run, v_status
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.dimension_scores
    (run_id, dimension, score, confidence, rubric_version, note)
  values (p_run, p_dimension, p_score, p_confidence, p_rubric_version, coalesce(p_note, ''))
  on conflict (run_id, dimension) do update
    set score = excluded.score, confidence = excluded.confidence,
        rubric_version = excluded.rubric_version, note = excluded.note,
        scored_at = now();

  return transform_audit.recompute_composite(p_run);
end; $function$;

create or replace function transform_audit.add_recommendation(
  p_run uuid, p_priority transform_audit.priority, p_title text,
  p_detail text default '', p_capability extensions.citext default null,
  p_addresses bigint default null, p_rank integer default 1)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_id bigint;
begin
  select r.tenant_id into v_tenant from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to add a recommendation'
      using errcode = 'insufficient_privilege';
  end if;
  -- A recommendation that answers a finding must answer one from THIS run.
  if p_addresses is not null
     and not exists (select 1 from transform_audit.findings f
                      where f.id = p_addresses and f.run_id = p_run) then
    raise exception 'finding % does not belong to run %', p_addresses, p_run
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.recommendations
    (run_id, priority, rank, title, detail, capability_key, addresses_finding_id)
  values (p_run, p_priority, coalesce(p_rank, 1), p_title, coalesce(p_detail, ''),
          p_capability, p_addresses)
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function transform_audit.set_outreach_hook(p_run uuid, p_finding bigint, p_hook text)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid;
begin
  select r.tenant_id into v_tenant from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to set the outreach hook'
      using errcode = 'insufficient_privilege';
  end if;
  update transform_audit.runs r2
     set outreach_hook = p_hook, outreach_hook_finding_id = p_finding
   where r2.id = p_run;
end; $function$;

create or replace function transform_audit.finish_run(p_run uuid, p_error text default null)
returns transform_audit.run_status language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_weights jsonb; v_unassessed integer; v_status transform_audit.run_status;
begin
  select r.tenant_id, r.weights into v_tenant, v_weights
    from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to finish an audit'
      using errcode = 'insufficient_privilege';
  end if;

  -- A weighted dimension counts as assessed only if it has a row that is NOT
  -- 'unknown'. Missing and unreachable are different reasons for the same
  -- fact: this run does not know.
  select pg_catalog.count(*) into v_unassessed
    from pg_catalog.jsonb_object_keys(v_weights) as k(dim)
   where not exists (
     select 1 from transform_audit.dimension_scores ds
      where ds.run_id = p_run
        and ds.dimension::text = k.dim
        and ds.confidence <> 'unknown');

  if p_error is not null then
    v_status := 'failed';
  elsif v_unassessed > 0 then
    v_status := 'partially_completed';
  else
    v_status := 'completed';
  end if;

  update transform_audit.runs r2
     set status = v_status, finished_at = now(), error = p_error
   where r2.id = p_run;

  perform events.emit('transform_audit.run.finished', v_tenant,
    jsonb_build_object('run', p_run, 'status', v_status,
                       'unassessed_dimensions', v_unassessed));
  return v_status;
end; $function$;

-- --- reading the result -----------------------------------------------------
create or replace function transform_audit.report(p_run uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_run transform_audit.runs%rowtype; v_result jsonb;
begin
  select * into v_run from transform_audit.runs where id = p_run;
  if v_run.id is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not (identity.has_permission(v_run.tenant_id, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this audit'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'shop', (select jsonb_build_object('business_name', p.business_name,
                                       'website_url', p.website_url,
                                       'city', p.city)
               from visibility.prospects p where p.id = v_run.prospect_id),
    'weights', v_run.weights,
    'coverage', jsonb_build_object('scored', v_run.dimensions_scored,
                                   'possible', v_run.dimensions_possible),
    'composite_score', v_run.composite_score,
    'scorecard', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dimension', ds.dimension, 'score', ds.score,
               'confidence', ds.confidence, 'rubric_version', ds.rubric_version,
               'note', ds.note) order by ds.dimension)
        from transform_audit.dimension_scores ds where ds.run_id = p_run), '[]'::jsonb),
    -- Every weighted dimension the composite does NOT cover: never recorded,
    -- or recorded as unreachable. The scorecard says which.
    'unscored_dimensions', coalesce((
      select jsonb_agg(k.dim order by k.dim)
        from pg_catalog.jsonb_object_keys(v_run.weights) as k(dim)
       where not exists (select 1 from transform_audit.dimension_scores ds
                          where ds.run_id = p_run
                            and ds.dimension::text = k.dim
                            and ds.confidence <> 'unknown')), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'dimension', f.dimension, 'statement', f.statement,
               'evidence_url', f.evidence_url, 'confidence', f.confidence,
               'severity', f.severity, 'detector', f.detector) order by f.id)
        from transform_audit.findings f where f.run_id = p_run), '[]'::jsonb),
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'priority', rc.priority, 'rank', rc.rank, 'title', rc.title,
               'detail', rc.detail, 'capability_key', rc.capability_key,
               'addresses_finding_id', rc.addresses_finding_id)
             -- Structural first, EXPLICITLY. Ordering by the enum would lead
             -- with quick wins purely because of declaration order, which
             -- inverts the analysis's own ranking.
             order by (rc.priority <> 'structural'), rc.rank, rc.id)
        from transform_audit.recommendations rc where rc.run_id = p_run), '[]'::jsonb),
    'outreach_hook', v_run.outreach_hook
  ) into v_result;
  return v_result;
end; $function$;

-- Which BarberOS capabilities this audit points at, and whether each has
-- actually shipped. is_shipped is what stops a recommendation reading as an
-- offer of something that does not exist yet.
create or replace function transform_audit.recommended_bundle(p_run uuid)
returns table(capability_key extensions.citext, capability_name text,
              status barberos.capability_status, is_shipped boolean,
              priority transform_audit.priority, rank integer)
language sql stable security definer set search_path = '' as $function$
  select distinct on (r.capability_key)
         r.capability_key, c.name, c.status, (c.status = 'available'),
         r.priority, r.rank
    from transform_audit.recommendations r
    join barberos.capabilities c on c.key = r.capability_key
    join transform_audit.runs run on run.id = r.run_id
   where r.run_id = p_run
     and r.capability_key is not null
     and (identity.has_permission(run.tenant_id, 'transform_audit.audit.read')
          or identity.is_platform_admin())
   order by r.capability_key, r.priority, r.rank;
$function$;

revoke all on function transform_audit.upsert_campaign(uuid, extensions.citext, text, jsonb) from public, anon;
revoke all on function transform_audit.import_shop(uuid, jsonb) from public, anon;
revoke all on function transform_audit.start_run(uuid, uuid) from public, anon;
revoke all on function transform_audit.record_finding(uuid, transform_audit.dimension, extensions.citext, text, transform_audit.confidence, transform_audit.severity, text, jsonb, extensions.citext) from public, anon;
revoke all on function transform_audit.recompute_composite(uuid) from public, anon;
revoke all on function transform_audit.record_dimension(uuid, transform_audit.dimension, integer, transform_audit.confidence, extensions.citext, text) from public, anon;
revoke all on function transform_audit.add_recommendation(uuid, transform_audit.priority, text, text, extensions.citext, bigint, integer) from public, anon;
revoke all on function transform_audit.set_outreach_hook(uuid, bigint, text) from public, anon;
revoke all on function transform_audit.finish_run(uuid, text) from public, anon;
revoke all on function transform_audit.report(uuid) from public, anon;
revoke all on function transform_audit.recommended_bundle(uuid) from public, anon;

grant execute on function transform_audit.upsert_campaign(uuid, extensions.citext, text, jsonb) to authenticated;
grant execute on function transform_audit.import_shop(uuid, jsonb) to authenticated;
grant execute on function transform_audit.start_run(uuid, uuid) to authenticated;
grant execute on function transform_audit.record_finding(uuid, transform_audit.dimension, extensions.citext, text, transform_audit.confidence, transform_audit.severity, text, jsonb, extensions.citext) to authenticated;
-- recompute_composite is deliberately NOT granted to authenticated, matching
-- production. It is reached only through record_dimension(), which is SECURITY
-- DEFINER and runs it as the owner. Granting it directly would hand a caller
-- the one function permitted to write the derived columns.
grant execute on function transform_audit.record_dimension(uuid, transform_audit.dimension, integer, transform_audit.confidence, extensions.citext, text) to authenticated;
grant execute on function transform_audit.add_recommendation(uuid, transform_audit.priority, text, text, extensions.citext, bigint, integer) to authenticated;
grant execute on function transform_audit.set_outreach_hook(uuid, bigint, text) to authenticated;
grant execute on function transform_audit.finish_run(uuid, text) to authenticated;
grant execute on function transform_audit.report(uuid) to authenticated;
grant execute on function transform_audit.recommended_bundle(uuid) to authenticated;
