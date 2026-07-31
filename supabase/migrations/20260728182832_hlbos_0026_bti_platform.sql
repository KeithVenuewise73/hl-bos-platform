-- ===========================================================================
-- v0_bti_platform — HL-BTI: Business Transformation Intelligence Platform
-- Product Creation Order #1 (first flagship product of the HL-BOS Software Factory)
--
-- HL-BTI is a PRODUCT-ORCHESTRATION layer, not a new platform. It assembles the
-- already-built pipeline — Discovery (0020) -> Blueprint Engine (0023) ->
-- Sales/Proposals (0024) -> Provisioning (0024) — into a governed consulting
-- engagement, and adds ONLY the capabilities that do not yet exist:
--   * a portfolio BUSINESS registry + a cross-business CEO dashboard,
--   * the 13-stage ENGAGEMENT lifecycle,
--   * an executive INTELLIGENCE framework (6 domains) + 7 executive SCORES,
--   * consulting DELIVERY (projects/milestones/tasks) + ROI tracking.
--
-- Reuses (NO duplication): identity/permissions/tenancy, audit, events + the CP5
-- shared dispatcher (no second bus), workflows (every human gate), discovery
-- (profiles/assessments/scoring/blueprints/recommendations), sales (proposals),
-- provisioning (software work orders), billing, comms, ai gateway, storage_meta.
-- See docs/products/hl-bti/12-reuse-analysis.md.
--
-- Deterministic-vs-AI: the 7 executive scores, the stage machine, the Venuewise
-- ANALYSIS-ONLY cap, ROI math and dashboard aggregation are deterministic (DB is
-- authority; a TS mirror lives in _shared/bti). AI is advisory only and approves
-- nothing. Scores derive ONLY from real ratings (honest nulls) — never invented.
--
-- Venuewise boundary (hard PCO requirement): a business flagged analysis_only
-- yields analysis + recommendations ONLY. The stage machine REFUSES to advance
-- such an engagement past 'blueprint', and delivery/ROI RPCs refuse it. No
-- Venuewise migration/rebuild/auth/payment change is introduced here.
--
-- Local development only. No remote apply, no deploy, no provider activation, no
-- prices created (pricing stays a CEO decision). New lifecycle vocabularies are
-- NEW enum types (never ALTER an existing type inside a migration transaction).
--
-- rollback:
--   DROP SCHEMA IF EXISTS bti CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'bti.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'bti.%';
-- ===========================================================================

create schema if not exists bti;
comment on schema bti is 'HL-BTI: Business Transformation Intelligence Platform (product orchestration over discovery/blueprint/sales/provisioning). NOT exposed via PostgREST.';
revoke all on schema bti from public, anon, authenticated;
grant usage on schema bti to authenticated;
alter default privileges in schema bti revoke all on tables from public;
alter default privileges in schema bti revoke all on functions from public;

-- --- new enum vocabularies (created fresh; never ALTER an existing type) -----
do $$ begin create type bti.engagement_mode as enum ('full_transformation','analysis_only'); exception when duplicate_object then null; end $$;
do $$ begin create type bti.engagement_stage as enum
  ('prospect','lead_qualification','business_discovery','assessment','executive_analysis',
   'blueprint','proposal','customer_approval','implementation','project_management',
   'roi_tracking','monthly_partnership','declined','on_hold');
exception when duplicate_object then null; end $$;
do $$ begin create type bti.assessment_status as enum ('draft','scoring','in_review','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type bti.project_status as enum ('planned','active','on_hold','completed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type bti.milestone_status as enum ('pending','active','completed','blocked'); exception when duplicate_object then null; end $$;
do $$ begin create type bti.task_status as enum ('todo','in_progress','blocked','done','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type bti.roi_status as enum ('baseline','projected','realized'); exception when duplicate_object then null; end $$;

-- ===========================================================================
-- Data-driven catalogs (platform config; readable by any authenticated context)
-- ===========================================================================

-- The 6 executive intelligence domains (extensible by row).
create table if not exists bti.intelligence_domains (
  key                  extensions.citext primary key,
  name                 text not null,
  description          text not null default '',
  transformation_weight integer not null default 5,   -- weight toward the overall Transformation Score
  display_order        integer not null default 0,
  is_active            boolean not null default true,
  constraint domains_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint domains_weight_pos check (transformation_weight > 0)
);
comment on table bti.intelligence_domains is 'The 6 executive intelligence domains. Rows, not code — new domains are additive.';

-- Dimensions that make up each domain (extensible; optional industry scoping).
create table if not exists bti.domain_dimensions (
  domain_key    extensions.citext not null references bti.intelligence_domains(key) on delete cascade,
  dimension_key extensions.citext not null,
  name          text not null,
  weight        integer not null default 5,
  guidance      text not null default '',
  display_order integer not null default 0,
  industry_pack extensions.citext,                     -- null = applies to all industries
  primary key (domain_key, dimension_key),
  constraint domain_dims_weight_pos check (weight > 0),
  constraint domain_dims_key_format check (dimension_key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table bti.domain_dimensions is 'Scored dimensions per domain. Industry packs extend the engine by adding rows, never replacing it.';

-- Industry packs — the extension mechanism ("future industries extend, not replace").
create table if not exists bti.industry_packs (
  key                 extensions.citext primary key,
  name                text not null,
  description         text not null default '',
  applicable_domains  jsonb not null default '[]'::jsonb,   -- domain keys emphasized for this industry
  default_services    jsonb not null default '[]'::jsonb,   -- discovery.service_catalog keys
  is_active           boolean not null default true,
  version             text not null default 'bti-pack-0.1.0',
  created_at          timestamptz not null default now(),
  constraint industry_packs_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table bti.industry_packs is 'Industry configuration (transportation, sports, salon, …). Adding an industry is a row, not a migration.';

-- ===========================================================================
-- Portfolio: the businesses under transformation (feeds the CEO dashboard)
-- ===========================================================================
create table if not exists bti.businesses (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  key              extensions.citext not null,               -- unique per tenant
  name             text not null,
  industry         extensions.citext,
  industry_pack    extensions.citext references bti.industry_packs(key) on delete set null,
  analysis_only    boolean not null default false,           -- true => HL-BTI advises only (e.g. Venuewise)
  dashboard_visible boolean not null default true,
  notes            text not null default '',
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint businesses_key_unique unique (tenant_id, key),
  constraint businesses_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
create index if not exists businesses_tenant_idx on bti.businesses (tenant_id, dashboard_visible);

-- ===========================================================================
-- The customer transformation lifecycle
-- ===========================================================================
create table if not exists bti.engagements (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  business_id          uuid not null references bti.businesses(id) on delete cascade,
  mode                 bti.engagement_mode not null default 'full_transformation',
  stage                bti.engagement_stage not null default 'prospect',
  profile_id           uuid references discovery.profiles(id) on delete set null,     -- reuse: Unified Business Profile
  blueprint_id         uuid references discovery.blueprints(id) on delete set null,   -- reuse: 0023 blueprint
  proposal_id          uuid references sales.proposals(id) on delete set null,        -- reuse: 0024 proposal
  workflow_instance_id uuid references workflows.instances(id) on delete set null,    -- reuse: stage-advance approval
  opened_by            uuid references auth.users(id) on delete set null,
  opened_at            timestamptz not null default now(),
  closed_at            timestamptz,
  notes                text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists engagements_tenant_idx on bti.engagements (tenant_id, stage);
create index if not exists engagements_business_idx on bti.engagements (business_id, stage);

-- ===========================================================================
-- Executive assessment (rolls up over a discovery assessment)
-- ===========================================================================
create table if not exists bti.assessments (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id             uuid not null references platform.tenants(id) on delete cascade,
  engagement_id         uuid not null references bti.engagements(id) on delete cascade,
  discovery_assessment_id uuid references discovery.assessments(id) on delete set null, -- reuse link
  status                bti.assessment_status not null default 'draft',
  workflow_instance_id  uuid references workflows.instances(id) on delete set null,
  assessed_by           uuid references auth.users(id) on delete set null,
  assessed_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists bti_assessments_engagement_idx on bti.assessments (engagement_id, status);

-- Raw 0-5 ratings per (domain, dimension) — the honest inputs.
create table if not exists bti.dimension_ratings (
  id            bigint generated always as identity primary key,
  assessment_id uuid not null references bti.assessments(id) on delete cascade,
  domain_key    extensions.citext not null,
  dimension_key extensions.citext not null,
  rating        integer not null,
  note          text,
  constraint dimension_ratings_unique unique (assessment_id, domain_key, dimension_key),
  constraint dimension_ratings_range check (rating between 0 and 5),
  foreign key (domain_key, dimension_key) references bti.domain_dimensions(domain_key, dimension_key) on delete restrict
);

-- Derived per-domain score (0-100). Populated deterministically by compute_scores.
create table if not exists bti.domain_scores (
  id            bigint generated always as identity primary key,
  assessment_id uuid not null references bti.assessments(id) on delete cascade,
  domain_key    extensions.citext not null references bti.intelligence_domains(key) on delete restrict,
  score         integer not null,
  constraint domain_scores_unique unique (assessment_id, domain_key),
  constraint domain_scores_range check (score between 0 and 100)
);

-- The 7 executive scores (one row per assessment). Any may be null (honest).
create table if not exists bti.executive_scores (
  assessment_id        uuid primary key references bti.assessments(id) on delete cascade,
  business_health      integer,
  operations           integer,
  growth               integer,
  technology           integer,
  ai_readiness         integer,
  financial_opportunity integer,
  transformation       integer,
  computed_at          timestamptz not null default now(),
  constraint exec_scores_ranges check (
    (business_health is null or business_health between 0 and 100) and
    (operations is null or operations between 0 and 100) and
    (growth is null or growth between 0 and 100) and
    (technology is null or technology between 0 and 100) and
    (ai_readiness is null or ai_readiness between 0 and 100) and
    (financial_opportunity is null or financial_opportunity between 0 and 100) and
    (transformation is null or transformation between 0 and 100))
);

-- ===========================================================================
-- Implementation delivery (consulting projects — distinct from software provisioning)
-- ===========================================================================
create table if not exists bti.projects (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id       uuid not null references platform.tenants(id) on delete cascade,
  engagement_id   uuid not null references bti.engagements(id) on delete cascade,
  name            text not null,
  status          bti.project_status not null default 'planned',
  start_date      date,
  target_end_date date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists bti_projects_engagement_idx on bti.projects (engagement_id, status);

create table if not exists bti.milestones (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  project_id   uuid not null references bti.projects(id) on delete cascade,
  name         text not null,
  status       bti.milestone_status not null default 'pending',
  sequence     integer not null default 0,
  due_date     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists bti_milestones_project_idx on bti.milestones (project_id, sequence);

create table if not exists bti.tasks (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  milestone_id uuid not null references bti.milestones(id) on delete cascade,
  title        text not null,
  status       bti.task_status not null default 'todo',
  assignee     uuid references auth.users(id) on delete set null,
  sequence     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists bti_tasks_milestone_idx on bti.tasks (milestone_id, sequence);

-- ===========================================================================
-- ROI tracking (baseline -> projected -> realized)
-- ===========================================================================
create table if not exists bti.roi_metrics (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  engagement_id uuid not null references bti.engagements(id) on delete cascade,
  label         text not null,
  unit          text not null default '',
  baseline_value  numeric,
  projected_value numeric,
  realized_value  numeric,
  status        bti.roi_status not null default 'baseline',
  captured_at   timestamptz not null default now(),
  note          text not null default ''
);
create index if not exists bti_roi_engagement_idx on bti.roi_metrics (engagement_id, status);

-- --- triggers ---------------------------------------------------------------
create trigger businesses_set_updated_at  before update on bti.businesses  for each row execute function platform.set_updated_at();
create trigger engagements_set_updated_at before update on bti.engagements for each row execute function platform.set_updated_at();
create trigger assessments_set_updated_at before update on bti.assessments for each row execute function platform.set_updated_at();
create trigger projects_set_updated_at    before update on bti.projects    for each row execute function platform.set_updated_at();
create trigger milestones_set_updated_at  before update on bti.milestones  for each row execute function platform.set_updated_at();
create trigger tasks_set_updated_at       before update on bti.tasks       for each row execute function platform.set_updated_at();

create trigger businesses_audit  after insert or update or delete on bti.businesses  for each row execute function audit.emit();
create trigger engagements_audit after insert or update or delete on bti.engagements for each row execute function audit.emit();
create trigger assessments_audit after insert or update or delete on bti.assessments for each row execute function audit.emit();
create trigger projects_audit    after insert or update or delete on bti.projects    for each row execute function audit.emit();
create trigger roi_audit         after insert or update or delete on bti.roi_metrics  for each row execute function audit.emit();

-- ===========================================================================
-- RLS + FORCE on every table
-- ===========================================================================
alter table bti.intelligence_domains enable row level security; alter table bti.intelligence_domains force row level security;
alter table bti.domain_dimensions    enable row level security; alter table bti.domain_dimensions    force row level security;
alter table bti.industry_packs       enable row level security; alter table bti.industry_packs       force row level security;
alter table bti.businesses           enable row level security; alter table bti.businesses           force row level security;
alter table bti.engagements          enable row level security; alter table bti.engagements          force row level security;
alter table bti.assessments          enable row level security; alter table bti.assessments          force row level security;
alter table bti.dimension_ratings    enable row level security; alter table bti.dimension_ratings    force row level security;
alter table bti.domain_scores        enable row level security; alter table bti.domain_scores        force row level security;
alter table bti.executive_scores     enable row level security; alter table bti.executive_scores     force row level security;
alter table bti.projects             enable row level security; alter table bti.projects             force row level security;
alter table bti.milestones           enable row level security; alter table bti.milestones           force row level security;
alter table bti.tasks                enable row level security; alter table bti.tasks                force row level security;
alter table bti.roi_metrics          enable row level security; alter table bti.roi_metrics          force row level security;

-- catalogs: readable by any authenticated context
drop policy if exists domains_select on bti.intelligence_domains;
create policy domains_select on bti.intelligence_domains for select to authenticated using (true);
drop policy if exists domain_dims_select on bti.domain_dimensions;
create policy domain_dims_select on bti.domain_dimensions for select to authenticated using (true);
drop policy if exists industry_packs_select on bti.industry_packs;
create policy industry_packs_select on bti.industry_packs for select to authenticated using (true);

-- tenant data: read by permission; NO tenant write path (definer RPCs only)
drop policy if exists businesses_select on bti.businesses;
create policy businesses_select on bti.businesses for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.business.read'));
drop policy if exists engagements_select on bti.engagements;
create policy engagements_select on bti.engagements for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.engagement.read'));
drop policy if exists bti_assessments_select on bti.assessments;
create policy bti_assessments_select on bti.assessments for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.assessment.read'));
drop policy if exists dimension_ratings_select on bti.dimension_ratings;
create policy dimension_ratings_select on bti.dimension_ratings for select to authenticated
  using (exists (select 1 from bti.assessments a where a.id = assessment_id
                 and identity.has_permission(a.tenant_id, 'bti.assessment.read')));
drop policy if exists domain_scores_select on bti.domain_scores;
create policy domain_scores_select on bti.domain_scores for select to authenticated
  using (exists (select 1 from bti.assessments a where a.id = assessment_id
                 and identity.has_permission(a.tenant_id, 'bti.assessment.read')));
drop policy if exists executive_scores_select on bti.executive_scores;
create policy executive_scores_select on bti.executive_scores for select to authenticated
  using (exists (select 1 from bti.assessments a where a.id = assessment_id
                 and identity.has_permission(a.tenant_id, 'bti.assessment.read')));
drop policy if exists bti_projects_select on bti.projects;
create policy bti_projects_select on bti.projects for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.delivery.read'));
drop policy if exists bti_milestones_select on bti.milestones;
create policy bti_milestones_select on bti.milestones for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.delivery.read'));
drop policy if exists bti_tasks_select on bti.tasks;
create policy bti_tasks_select on bti.tasks for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.delivery.read'));
drop policy if exists bti_roi_select on bti.roi_metrics;
create policy bti_roi_select on bti.roi_metrics for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.roi.read'));

grant select on bti.intelligence_domains, bti.domain_dimensions, bti.industry_packs,
                bti.businesses, bti.engagements, bti.assessments, bti.dimension_ratings,
                bti.domain_scores, bti.executive_scores, bti.projects, bti.milestones,
                bti.tasks, bti.roi_metrics to authenticated;

-- ===========================================================================
-- Catalog management (platform)
-- ===========================================================================
create or replace function bti.register_industry_pack(
  p_key extensions.citext, p_name text, p_domains jsonb default '[]'::jsonb,
  p_services jsonb default '[]'::jsonb, p_active boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('bti.catalog.manage') then
    raise exception 'only a platform administrator may manage the BTI catalog' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.industry_packs (key, name, applicable_domains, default_services, is_active)
  values (p_key, p_name, coalesce(p_domains,'[]'::jsonb), coalesce(p_services,'[]'::jsonb), p_active)
  on conflict (key) do update set name = excluded.name, applicable_domains = excluded.applicable_domains,
    default_services = excluded.default_services, is_active = excluded.is_active;
end; $$;
revoke all on function bti.register_industry_pack(extensions.citext, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function bti.register_industry_pack(extensions.citext, text, jsonb, jsonb, boolean) to authenticated;

-- ===========================================================================
-- Business registry
-- ===========================================================================
create or replace function bti.register_business(
  p_tenant uuid, p_key extensions.citext, p_name text, p_industry extensions.citext default null,
  p_pack extensions.citext default null, p_analysis_only boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'bti.business.manage') then
    raise exception 'insufficient privilege to register a business' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.businesses (tenant_id, key, name, industry, industry_pack, analysis_only, created_by)
  values (p_tenant, p_key, p_name, p_industry, p_pack, p_analysis_only, auth.uid())
  returning id into v_id;
  perform events.emit('bti.business.registered', p_tenant,
    jsonb_build_object('business', v_id, 'key', p_key, 'analysis_only', p_analysis_only));
  return v_id;
end; $$;
revoke all on function bti.register_business(uuid, extensions.citext, text, extensions.citext, extensions.citext, boolean) from public, anon;
grant execute on function bti.register_business(uuid, extensions.citext, text, extensions.citext, extensions.citext, boolean) to authenticated;

-- ===========================================================================
-- Engagement lifecycle — the deterministic stage machine
-- ===========================================================================

-- Ordered "full transformation" path. declined/on_hold are side states.
create or replace function bti._stage_rank(p_stage bti.engagement_stage)
returns integer language sql immutable set search_path = '' as $$
  select case p_stage
    when 'prospect' then 1 when 'lead_qualification' then 2 when 'business_discovery' then 3
    when 'assessment' then 4 when 'executive_analysis' then 5 when 'blueprint' then 6
    when 'proposal' then 7 when 'customer_approval' then 8 when 'implementation' then 9
    when 'project_management' then 10 when 'roi_tracking' then 11 when 'monthly_partnership' then 12
    else 0 end;   -- declined / on_hold => 0 (side states)
$$;

create or replace function bti.open_engagement(p_tenant uuid, p_business uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_analysis boolean; v_btenant uuid;
begin
  if not identity.has_permission(p_tenant, 'bti.engagement.manage') then
    raise exception 'insufficient privilege to open an engagement' using errcode = 'insufficient_privilege';
  end if;
  select tenant_id, analysis_only into v_btenant, v_analysis from bti.businesses where id = p_business;
  if not found then raise exception 'business % not found', p_business using errcode = 'no_data_found'; end if;
  if v_btenant <> p_tenant then
    raise exception 'business belongs to a different tenant' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.engagements (tenant_id, business_id, mode, stage, opened_by)
  values (p_tenant, p_business, case when v_analysis then 'analysis_only'::bti.engagement_mode
                                     else 'full_transformation'::bti.engagement_mode end, 'prospect', auth.uid())
  returning id into v_id;
  perform events.emit('bti.engagement.opened', p_tenant, jsonb_build_object('engagement', v_id, 'business', p_business));
  return v_id;
end; $$;
revoke all on function bti.open_engagement(uuid, uuid) from public, anon;
grant execute on function bti.open_engagement(uuid, uuid) to authenticated;

create or replace function bti.link_profile(p_engagement uuid, p_profile uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_ptenant uuid;
begin
  select tenant_id into v_tenant from bti.engagements where id = p_engagement;
  if not found then raise exception 'engagement % not found', p_engagement using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.engagement.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  select tenant_id into v_ptenant from discovery.profiles where id = p_profile;
  if not found or v_ptenant <> v_tenant then
    raise exception 'profile not found in this tenant' using errcode = 'insufficient_privilege';
  end if;
  update bti.engagements set profile_id = p_profile where id = p_engagement;
end; $$;
revoke all on function bti.link_profile(uuid, uuid) from public, anon;
grant execute on function bti.link_profile(uuid, uuid) to authenticated;

-- The stage machine. Advances one ordered step at a time (or to a side state).
-- Deterministically enforces the Venuewise ANALYSIS-ONLY cap: an analysis_only
-- engagement may not advance past 'blueprint'.
create or replace function bti.advance_stage(p_engagement uuid, p_to bti.engagement_stage)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_mode bti.engagement_mode; v_cur bti.engagement_stage;
        v_cur_rank integer; v_to_rank integer; v_cap constant integer := 6;  -- 'blueprint'
begin
  select tenant_id, mode, stage into v_tenant, v_mode, v_cur from bti.engagements where id = p_engagement;
  if not found then raise exception 'engagement % not found', p_engagement using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.engagement.manage') then
    raise exception 'insufficient privilege to advance an engagement' using errcode = 'insufficient_privilege';
  end if;

  -- side states are always reachable
  if p_to in ('declined','on_hold') then
    update bti.engagements set stage = p_to,
      closed_at = case when p_to = 'declined' then now() else closed_at end where id = p_engagement;
    perform events.emit('bti.engagement.stage_changed', v_tenant,
      jsonb_build_object('engagement', p_engagement, 'from', v_cur, 'to', p_to));
    return;
  end if;

  v_cur_rank := bti._stage_rank(v_cur);
  v_to_rank  := bti._stage_rank(p_to);

  -- ANALYSIS-ONLY cap (Venuewise): never past 'blueprint'
  if v_mode = 'analysis_only' and v_to_rank > v_cap then
    perform audit.log_security_event('bti.advance_stage','denied','warning', v_tenant,'bti.engagements',p_engagement::text,
      jsonb_build_object('mode','analysis_only','attempted', p_to));
    raise exception 'analysis-only engagement may not advance past blueprint (HL-BTI advises only)' using errcode = 'insufficient_privilege';
  end if;

  -- forward, one ordered step at a time (re-entering a side state is handled above)
  if v_cur_rank = 0 then
    raise exception 'engagement is in a side state; cannot advance forward' using errcode = 'check_violation';
  end if;
  if v_to_rank <> v_cur_rank + 1 then
    raise exception 'stage must advance exactly one step (from % rank % to rank %)', v_cur, v_cur_rank, v_to_rank
      using errcode = 'check_violation';
  end if;

  update bti.engagements set stage = p_to,
    closed_at = case when p_to = 'monthly_partnership' then closed_at else closed_at end where id = p_engagement;
  perform events.emit('bti.engagement.stage_changed', v_tenant,
    jsonb_build_object('engagement', p_engagement, 'from', v_cur, 'to', p_to));
end; $$;
revoke all on function bti.advance_stage(uuid, bti.engagement_stage) from public, anon;
grant execute on function bti.advance_stage(uuid, bti.engagement_stage) to authenticated;

-- ===========================================================================
-- Executive assessment + the deterministic 7-score engine
-- ===========================================================================
create or replace function bti.start_assessment(p_engagement uuid, p_discovery_assessment uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from bti.engagements where id = p_engagement;
  if not found then raise exception 'engagement % not found', p_engagement using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.assessment.manage') then
    raise exception 'insufficient privilege to run an assessment' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.assessments (tenant_id, engagement_id, discovery_assessment_id, status)
  values (v_tenant, p_engagement, p_discovery_assessment, 'draft') returning id into v_id;
  perform events.emit('bti.assessment.started', v_tenant, jsonb_build_object('assessment', v_id, 'engagement', p_engagement));
  return v_id;
end; $$;
revoke all on function bti.start_assessment(uuid, uuid) from public, anon;
grant execute on function bti.start_assessment(uuid, uuid) to authenticated;

create or replace function bti.rate_dimension(
  p_assessment uuid, p_domain extensions.citext, p_dimension extensions.citext, p_rating integer, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from bti.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.assessment.manage') then
    raise exception 'insufficient privilege to rate' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from bti.domain_dimensions where domain_key = p_domain and dimension_key = p_dimension) then
    raise exception 'unknown domain/dimension %/%', p_domain, p_dimension using errcode = 'foreign_key_violation';
  end if;
  insert into bti.dimension_ratings (assessment_id, domain_key, dimension_key, rating, note)
  values (p_assessment, p_domain, p_dimension, p_rating, p_note)
  on conflict (assessment_id, domain_key, dimension_key) do update set rating = excluded.rating, note = excluded.note;
  update bti.assessments set status = 'scoring' where id = p_assessment and status = 'draft';
end; $$;
revoke all on function bti.rate_dimension(uuid, extensions.citext, extensions.citext, integer, text) from public, anon;
grant execute on function bti.rate_dimension(uuid, extensions.citext, extensions.citext, integer, text) to authenticated;

-- The deterministic engine. Per-domain score = weighted mean of 0-5 ratings,
-- scaled to 0-100. Executive scores map each named domain to its score.
-- Transformation = weighted mean of domain scores by transformation_weight.
-- Any domain with NO ratings yields NULL — never a fabricated number.
create or replace function bti.compute_scores(p_assessment uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from bti.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.assessment.manage') then
    raise exception 'insufficient privilege to compute scores' using errcode = 'insufficient_privilege';
  end if;

  -- per-domain rollup (only domains that have at least one rating)
  delete from bti.domain_scores where assessment_id = p_assessment;
  insert into bti.domain_scores (assessment_id, domain_key, score)
  select r.assessment_id, r.domain_key,
         round(sum(r.rating::numeric * d.weight) / nullif(sum(d.weight),0) / 5 * 100)::int
    from bti.dimension_ratings r
    join bti.domain_dimensions d on d.domain_key = r.domain_key and d.dimension_key = r.dimension_key
   where r.assessment_id = p_assessment
   group by r.assessment_id, r.domain_key;

  -- executive scorecard (honest nulls where a domain was not scored)
  insert into bti.executive_scores as e
    (assessment_id, business_health, operations, growth, technology, ai_readiness, financial_opportunity, transformation, computed_at)
  select p_assessment,
         max(score) filter (where domain_key = 'business'),
         max(score) filter (where domain_key = 'operations'),
         max(score) filter (where domain_key = 'growth'),
         max(score) filter (where domain_key = 'technology'),
         max(score) filter (where domain_key = 'ai_readiness'),
         max(score) filter (where domain_key = 'financial'),
         -- Transformation Score: weighted mean of the domain scores present
         (select round(sum(ds.score::numeric * dom.transformation_weight)
                       / nullif(sum(dom.transformation_weight),0))::int
            from bti.domain_scores ds
            join bti.intelligence_domains dom on dom.key = ds.domain_key
           where ds.assessment_id = p_assessment),
         now()
    from bti.domain_scores where assessment_id = p_assessment
  on conflict (assessment_id) do update set
    business_health = excluded.business_health, operations = excluded.operations, growth = excluded.growth,
    technology = excluded.technology, ai_readiness = excluded.ai_readiness,
    financial_opportunity = excluded.financial_opportunity, transformation = excluded.transformation,
    computed_at = excluded.computed_at;

  perform events.emit('bti.scores.computed', v_tenant, jsonb_build_object('assessment', p_assessment));
end; $$;
revoke all on function bti.compute_scores(uuid) from public, anon;
grant execute on function bti.compute_scores(uuid) to authenticated;

create or replace function bti.submit_assessment_for_review(p_assessment uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id into v_tenant from bti.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.assessment.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_instance := workflows.request_approval(v_tenant, 'bti.assessment.review', 'bti.assessment', p_assessment::text, 'tenant_admin');
  update bti.assessments set status = 'in_review', workflow_instance_id = v_instance where id = p_assessment;
  return v_instance;
end; $$;
revoke all on function bti.submit_assessment_for_review(uuid) from public, anon;
grant execute on function bti.submit_assessment_for_review(uuid) to authenticated;

-- Completion requires an APPROVED human review (reused workflow gate). Recomputes
-- scores at completion so the sealed scorecard reflects the final ratings.
create or replace function bti.complete_assessment(p_assessment uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id, workflow_instance_id into v_tenant, v_instance from bti.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.assessment.manage') then
    raise exception 'insufficient privilege to complete' using errcode = 'insufficient_privilege';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'assessment cannot complete without an approved human review' using errcode = 'insufficient_privilege';
  end if;
  perform bti.compute_scores(p_assessment);
  update bti.assessments set status = 'completed', assessed_by = auth.uid(), assessed_at = now()
   where id = p_assessment;
  perform audit.log_security_event('bti.assessment.complete','allowed','info',
    v_tenant,'bti.assessments',p_assessment::text, jsonb_build_object('assessment', p_assessment));
  perform events.emit('bti.assessment.completed', v_tenant, jsonb_build_object('assessment', p_assessment));
end; $$;
revoke all on function bti.complete_assessment(uuid) from public, anon;
grant execute on function bti.complete_assessment(uuid) to authenticated;

-- ===========================================================================
-- Implementation delivery — refuses analysis-only engagements (Venuewise cap)
-- ===========================================================================
create or replace function bti.create_project(p_engagement uuid, p_name text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_mode bti.engagement_mode; v_id uuid;
begin
  select tenant_id, mode into v_tenant, v_mode from bti.engagements where id = p_engagement;
  if not found then raise exception 'engagement % not found', p_engagement using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.delivery.manage') then
    raise exception 'insufficient privilege to manage delivery' using errcode = 'insufficient_privilege';
  end if;
  if v_mode = 'analysis_only' then
    raise exception 'analysis-only engagement has no implementation delivery (HL-BTI advises only)' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.projects (tenant_id, engagement_id, name, created_by)
  values (v_tenant, p_engagement, p_name, auth.uid()) returning id into v_id;
  perform events.emit('bti.project.created', v_tenant, jsonb_build_object('project', v_id, 'engagement', p_engagement));
  return v_id;
end; $$;
revoke all on function bti.create_project(uuid, text) from public, anon;
grant execute on function bti.create_project(uuid, text) to authenticated;

create or replace function bti.add_milestone(p_project uuid, p_name text, p_sequence integer default 0, p_due date default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from bti.projects where id = p_project;
  if not found then raise exception 'project % not found', p_project using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.delivery.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.milestones (tenant_id, project_id, name, sequence, due_date)
  values (v_tenant, p_project, p_name, p_sequence, p_due) returning id into v_id;
  return v_id;
end; $$;
revoke all on function bti.add_milestone(uuid, text, integer, date) from public, anon;
grant execute on function bti.add_milestone(uuid, text, integer, date) to authenticated;

create or replace function bti.add_task(p_milestone uuid, p_title text, p_sequence integer default 0, p_assignee uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from bti.milestones where id = p_milestone;
  if not found then raise exception 'milestone % not found', p_milestone using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.delivery.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.tasks (tenant_id, milestone_id, title, sequence, assignee)
  values (v_tenant, p_milestone, p_title, p_sequence, p_assignee) returning id into v_id;
  return v_id;
end; $$;
revoke all on function bti.add_task(uuid, text, integer, uuid) from public, anon;
grant execute on function bti.add_task(uuid, text, integer, uuid) to authenticated;

create or replace function bti.set_task_status(p_task uuid, p_status bti.task_status)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from bti.tasks where id = p_task;
  if not found then raise exception 'task % not found', p_task using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.delivery.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update bti.tasks set status = p_status where id = p_task;
end; $$;
revoke all on function bti.set_task_status(uuid, bti.task_status) from public, anon;
grant execute on function bti.set_task_status(uuid, bti.task_status) to authenticated;

-- ===========================================================================
-- ROI tracking
-- ===========================================================================
create or replace function bti.record_roi_metric(
  p_engagement uuid, p_label text, p_unit text default '', p_baseline numeric default null, p_projected numeric default null, p_note text default '')
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_mode bti.engagement_mode; v_id bigint;
begin
  select tenant_id, mode into v_tenant, v_mode from bti.engagements where id = p_engagement;
  if not found then raise exception 'engagement % not found', p_engagement using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.roi.manage') then
    raise exception 'insufficient privilege to record ROI' using errcode = 'insufficient_privilege';
  end if;
  if v_mode = 'analysis_only' then
    raise exception 'analysis-only engagement does not track realized ROI (HL-BTI advises only)' using errcode = 'insufficient_privilege';
  end if;
  insert into bti.roi_metrics (tenant_id, engagement_id, label, unit, baseline_value, projected_value,
    status, note)
  values (v_tenant, p_engagement, p_label, p_unit, p_baseline, p_projected,
    case when p_projected is not null then 'projected'::bti.roi_status else 'baseline'::bti.roi_status end, coalesce(p_note,''))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function bti.record_roi_metric(uuid, text, text, numeric, numeric, text) from public, anon;
grant execute on function bti.record_roi_metric(uuid, text, text, numeric, numeric, text) to authenticated;

create or replace function bti.realize_roi_metric(p_metric bigint, p_realized numeric)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from bti.roi_metrics where id = p_metric;
  if not found then raise exception 'roi metric % not found', p_metric using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'bti.roi.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update bti.roi_metrics set realized_value = p_realized, status = 'realized', captured_at = now() where id = p_metric;
end; $$;
revoke all on function bti.realize_roi_metric(bigint, numeric) from public, anon;
grant execute on function bti.realize_roi_metric(bigint, numeric) to authenticated;

-- ===========================================================================
-- CEO dashboard — cross-business transformation status (deterministic read)
-- Platform-permission gated (bti.dashboard.read). Reports only REAL rows; a
-- business with no engagement/scores shows nulls, never invented status.
-- ===========================================================================
create or replace function bti.ceo_dashboard()
returns table (
  business_id uuid, business_key extensions.citext, business_name text, industry extensions.citext,
  analysis_only boolean, latest_stage bti.engagement_stage, engagement_mode bti.engagement_mode,
  transformation_score integer, active_projects integer, realized_roi numeric, open_engagements integer
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('bti.dashboard.read') then
    raise exception 'insufficient privilege to read the CEO dashboard' using errcode = 'insufficient_privilege';
  end if;
  return query
  with latest_eng as (
    select distinct on (e.business_id) e.business_id, e.id as engagement_id, e.stage, e.mode
      from bti.engagements e order by e.business_id, e.opened_at desc
  ),
  latest_score as (
    select distinct on (a.engagement_id) a.engagement_id, s.transformation
      from bti.assessments a join bti.executive_scores s on s.assessment_id = a.id
     order by a.engagement_id, a.assessed_at desc nulls last, a.created_at desc
  )
  select b.id, b.key, b.name, b.industry, b.analysis_only, le.stage, le.mode,
         ls.transformation,
         (select count(*)::int from bti.projects p where p.engagement_id = le.engagement_id and p.status = 'active'),
         (select coalesce(sum(r.realized_value),0) from bti.roi_metrics r where r.engagement_id = le.engagement_id and r.status = 'realized'),
         (select count(*)::int from bti.engagements e2 where e2.business_id = b.id and e2.stage not in ('declined'))
    from bti.businesses b
    left join latest_eng le on le.business_id = b.id
    left join latest_score ls on ls.engagement_id = le.engagement_id
   where b.dashboard_visible
   order by b.name;
end; $$;
revoke all on function bti.ceo_dashboard() from public, anon;
grant execute on function bti.ceo_dashboard() to authenticated;

-- ===========================================================================
-- Permissions
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('bti.business.read',    'Read HL-BTI businesses.', 'tenant'),
  ('bti.business.manage',  'Register/configure HL-BTI businesses.', 'tenant'),
  ('bti.engagement.read',  'Read transformation engagements.', 'tenant'),
  ('bti.engagement.manage','Open and advance transformation engagements.', 'tenant'),
  ('bti.assessment.read',  'Read executive assessments and scores.', 'tenant'),
  ('bti.assessment.manage','Run, score, and complete executive assessments.', 'tenant'),
  ('bti.delivery.read',    'Read implementation projects, milestones, tasks.', 'tenant'),
  ('bti.delivery.manage',  'Manage implementation delivery.', 'tenant'),
  ('bti.roi.read',         'Read ROI metrics.', 'tenant'),
  ('bti.roi.manage',       'Record and realize ROI metrics.', 'tenant'),
  ('bti.catalog.manage',   'Manage the BTI catalog (industry packs).', 'platform'),
  ('bti.dashboard.read',   'Read the cross-business CEO dashboard.', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','bti.business.read'),('tenant_owner','bti.business.manage'),
  ('tenant_owner','bti.engagement.read'),('tenant_owner','bti.engagement.manage'),
  ('tenant_owner','bti.assessment.read'),('tenant_owner','bti.assessment.manage'),
  ('tenant_owner','bti.delivery.read'),('tenant_owner','bti.delivery.manage'),
  ('tenant_owner','bti.roi.read'),('tenant_owner','bti.roi.manage'),
  ('tenant_admin','bti.business.read'),('tenant_admin','bti.business.manage'),
  ('tenant_admin','bti.engagement.read'),('tenant_admin','bti.engagement.manage'),
  ('tenant_admin','bti.assessment.read'),('tenant_admin','bti.assessment.manage'),
  ('tenant_admin','bti.delivery.read'),('tenant_admin','bti.delivery.manage'),
  ('tenant_admin','bti.roi.read'),('tenant_admin','bti.roi.manage'),
  ('manager','bti.business.read'),('manager','bti.engagement.read'),('manager','bti.engagement.manage'),
  ('manager','bti.assessment.read'),('manager','bti.assessment.manage'),
  ('manager','bti.delivery.read'),('manager','bti.delivery.manage'),('manager','bti.roi.read'),('manager','bti.roi.manage'),
  ('staff','bti.business.read'),('staff','bti.engagement.read'),('staff','bti.assessment.read'),('staff','bti.delivery.read'),('staff','bti.roi.read'),
  ('viewer','bti.business.read'),('viewer','bti.engagement.read'),('viewer','bti.assessment.read'),('viewer','bti.delivery.read'),('viewer','bti.roi.read'),
  ('platform_owner','bti.catalog.manage'),('platform_owner','bti.dashboard.read'),
  ('platform_admin','bti.catalog.manage'),('platform_admin','bti.dashboard.read')
on conflict do nothing;

-- ===========================================================================
-- Seeds — the 6 intelligence domains, their dimensions, and industry packs
-- ===========================================================================
insert into bti.intelligence_domains (key, name, description, transformation_weight, display_order) values
  ('business',    'Business Intelligence',    'Maturity, leadership, processes, customer experience, growth readiness.', 9, 1),
  ('operations',  'Operations Intelligence',  'Operations, supply chain, scheduling, reporting, automation, fleet, utilization, warehouse, transportation.', 8, 2),
  ('growth',      'Growth Intelligence',      'Website, SEO, AI search, GBP, reviews, content, social, competitors, lead gen, conversion, brand, tech stack.', 8, 3),
  ('technology',  'Technology Intelligence',  'Software, security, cloud readiness, architecture, technical debt, scalability, HL-BOS compatibility.', 7, 4),
  ('ai_readiness','AI Readiness',             'Automation opportunities, AI assistants, support, marketing automation, internal AI, future AI products.', 7, 5),
  ('financial',   'Financial Intelligence',   'Cost reduction, revenue growth, automation ROI, transformation ROI.', 8, 6)
on conflict (key) do nothing;

insert into bti.domain_dimensions (domain_key, dimension_key, name, weight, display_order) values
  -- Business Intelligence
  ('business','business_maturity','Business Maturity',7,1),
  ('business','leadership','Leadership',6,2),
  ('business','processes','Processes',6,3),
  ('business','customer_experience','Customer Experience',7,4),
  ('business','growth_readiness','Growth Readiness',7,5),
  -- Operations Intelligence
  ('operations','operations','Operations',7,1),
  ('operations','supply_chain','Supply Chain',7,2),
  ('operations','scheduling','Scheduling',5,3),
  ('operations','reporting','Reporting',5,4),
  ('operations','automation','Automation',6,5),
  ('operations','fleet','Fleet',5,6),
  ('operations','resource_utilization','Resource Utilization',6,7),
  ('operations','warehouse_operations','Warehouse Operations',6,8),
  ('operations','transportation','Transportation',6,9),
  -- Growth Intelligence
  ('growth','website','Website',7,1),
  ('growth','seo','SEO',7,2),
  ('growth','ai_search_optimization','AI Search Optimization',6,3),
  ('growth','google_business_profile','Google Business Profile',5,4),
  ('growth','reviews','Reviews',5,5),
  ('growth','content','Content',5,6),
  ('growth','social_media','Social Media',5,7),
  ('growth','competitors','Competitors',5,8),
  ('growth','lead_generation','Lead Generation',7,9),
  ('growth','conversion','Conversion',7,10),
  ('growth','brand_authority','Brand Authority',5,11),
  ('growth','technology_stack','Technology Stack',5,12),
  -- Technology Intelligence
  ('technology','software','Software',6,1),
  ('technology','security','Security',7,2),
  ('technology','cloud_readiness','Cloud Readiness',6,3),
  ('technology','architecture','Architecture',6,4),
  ('technology','technical_debt','Technical Debt',6,5),
  ('technology','scalability','Scalability',6,6),
  ('technology','hlbos_compatibility','HL-BOS Compatibility',6,7),
  -- AI Readiness
  ('ai_readiness','automation_opportunities','Automation Opportunities',7,1),
  ('ai_readiness','ai_assistants','AI Assistants',6,2),
  ('ai_readiness','customer_support','Customer Support',6,3),
  ('ai_readiness','marketing_automation','Marketing Automation',6,4),
  ('ai_readiness','internal_ai_workflows','Internal AI Workflows',6,5),
  ('ai_readiness','future_ai_products','Future AI Products',5,6),
  -- Financial Intelligence
  ('financial','cost_reduction','Cost Reduction',7,1),
  ('financial','revenue_growth','Revenue Growth',8,2),
  ('financial','automation_roi','Automation ROI',7,3),
  ('financial','transformation_roi','Transformation ROI',7,4)
on conflict (domain_key, dimension_key) do nothing;

insert into bti.industry_packs (key, name, description, applicable_domains) values
  ('general',              'General Business',        'Baseline pack — all six domains.', '["business","operations","growth","technology","ai_readiness","financial"]'::jsonb),
  ('transportation',       'Transportation & Logistics','Warehouses, transportation, distribution, fleet, logistics.', '["operations","business","financial","technology","growth","ai_readiness"]'::jsonb),
  ('sports',               'Sports & Media',          'Sports organizations, media, community platforms.', '["growth","business","ai_readiness","technology","operations","financial"]'::jsonb),
  ('salon',                'Salon',                   'Salons and personal-care services.', '["growth","business","operations","financial","ai_readiness","technology"]'::jsonb),
  ('barbershop',           'Barbershop',              'Barbershops and grooming services.', '["growth","business","operations","financial","ai_readiness","technology"]'::jsonb),
  ('restaurant',           'Restaurant',              'Restaurants and food service.', '["operations","growth","business","financial","ai_readiness","technology"]'::jsonb),
  ('healthcare',           'Healthcare',              'Healthcare and clinical services.', '["technology","operations","business","financial","ai_readiness","growth"]'::jsonb),
  ('professional_services','Professional Services',   'Consulting, legal, accounting and similar.', '["business","growth","financial","technology","ai_readiness","operations"]'::jsonb),
  ('construction',         'Construction',            'Construction and trades.', '["operations","business","financial","growth","technology","ai_readiness"]'::jsonb),
  ('manufacturing',        'Manufacturing',           'Manufacturers and producers.', '["operations","technology","financial","business","ai_readiness","growth"]'::jsonb)
on conflict (key) do nothing;
