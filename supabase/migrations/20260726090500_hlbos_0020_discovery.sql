-- ===========================================================================
-- v0_discovery — the reusable Business Discovery Engine (HL-BOS shared capability)
--
-- A business-maturity-agnostic discovery platform: multiple evidence COLLECTORS
-- (website assessment, business interview, social, documents, integrations) all
-- feed ONE canonical Unified Business Profile. Two data-driven scoring
-- frameworks (Digital Maturity + Business Health). Reuses the spine
-- (identity/permissions/audit), events, workflows (human review), storage
-- (documents), AI (analysis), integrations (connectors), billing (subscription
-- recommendation). No second tenant model, bus, approval engine, or connector
-- registry. This is the foundation VisibilityAI is assembled from.
--
-- Scanning logic is NOT implemented here (CP5). Collectors are a catalog (rows,
-- not an enum) so new ones are added without a migration. Weights/dimensions are
-- rows too — nothing hard-coded. Output objects (blueprint/recommendations) are
-- reusable containers; no report is generated this checkpoint.
--
-- See docs/visibilityai/phase-1-enablement/12-checkpoint4-reuse-analysis.md.
--
-- rollback:
--   DROP SCHEMA IF EXISTS discovery CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'discovery.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'discovery.%';
-- ===========================================================================

create schema if not exists discovery;
comment on schema discovery is 'HL-BOS: reusable Business Discovery Engine (profiles, evidence, maturity/health scoring). NOT exposed via PostgREST.';
revoke all on schema discovery from public, anon, authenticated;
grant usage on schema discovery to authenticated;
alter default privileges in schema discovery revoke all on tables from public;
alter default privileges in schema discovery revoke all on functions from public;

do $$ begin create type discovery.profile_status as enum ('draft','active','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type discovery.collection_status as enum ('pending','collecting','collected','failed'); exception when duplicate_object then null; end $$;
do $$ begin create type discovery.assessment_status as enum ('draft','in_review','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type discovery.score_framework as enum ('maturity','health'); exception when duplicate_object then null; end $$;
do $$ begin create type discovery.recommendation_kind as enum ('service','hl_bos_module','quick_win','roadmap_item','risk'); exception when duplicate_object then null; end $$;

-- --- Collector registry (rows, not enum -> extensible) ----------------------
create table if not exists discovery.collectors (
  key             extensions.citext primary key,
  name            text not null,
  kind            extensions.citext not null,             -- website_assessment | business_interview | social_presence | document_analysis | integration
  description     text not null default '',
  is_active       boolean not null default false,         -- placeholders ship inactive
  produces_evidence boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint collectors_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table discovery.collectors is 'Discovery Modules. A catalog (rows), so adding a collector is a row not a migration. Website scanner registers here in CP5.';

-- --- Interview question catalog (Module 2) ----------------------------------
create table if not exists discovery.interview_questions (
  key           extensions.citext primary key,
  field         extensions.citext not null,               -- evidence key produced
  prompt        text not null,
  display_order integer not null default 0,
  help          text not null default ''
);

-- --- Scoring dimension catalog (both frameworks; data-driven) ---------------
create table if not exists discovery.score_dimensions (
  key           extensions.citext not null,
  framework     discovery.score_framework not null,
  name          text not null,
  weight        integer not null default 5,
  display_order integer not null default 0,
  guidance      text not null default '',
  primary key (framework, key),
  constraint score_dimensions_weight_pos check (weight > 0)
);
comment on table discovery.score_dimensions is 'Digital Maturity + Business Health dimensions and weights. Rows, not code — new dimensions are additive.';

-- --- The Unified Business Profile (canonical) -------------------------------
create table if not exists discovery.profiles (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  business_name text not null,
  industry      extensions.citext,
  status        discovery.profile_status not null default 'draft',
  prospect_id   uuid references visibility.prospects(id) on delete set null,  -- optional link to a VisibilityAI lead
  summary       jsonb not null default '{}'::jsonb,        -- rolled-up, denormalized snapshot
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists profiles_tenant_idx on discovery.profiles (tenant_id, status);

-- --- A collector run --------------------------------------------------------
create table if not exists discovery.collections (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  profile_id    uuid not null references discovery.profiles(id) on delete cascade,
  collector_key extensions.citext not null references discovery.collectors(key) on delete restrict,
  status        discovery.collection_status not null default 'pending',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  stats         jsonb,
  error         text
);
create index if not exists collections_profile_idx on discovery.collections (profile_id, status);

-- --- The unified evidence store (every collector writes here) ---------------
create table if not exists discovery.evidence (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  profile_id    uuid not null references discovery.profiles(id) on delete cascade,
  collection_id uuid references discovery.collections(id) on delete set null,
  collector_key extensions.citext not null references discovery.collectors(key) on delete restrict,
  source        extensions.citext not null,               -- website | interview | document | social | financial | crm | ai | manual
  key           extensions.citext not null,               -- e.g. business_name, has_ssl, monthly_revenue
  value         jsonb not null default '{}'::jsonb,
  confidence    numeric(3,2) not null default 1.00,
  refs          jsonb not null default '[]'::jsonb,        -- supporting references (urls, file ids, message ids)
  file_id       uuid references storage_meta.files(id) on delete set null,  -- document/screenshot evidence
  ai_run_id     bigint references ai.runs(id) on delete set null,           -- AI-derived evidence
  collected_by  uuid references auth.users(id) on delete set null,
  collected_at  timestamptz not null default now(),
  constraint evidence_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint evidence_source_format check (source ~ '^[a-z][a-z0-9_]{2,31}$')
);
create index if not exists evidence_profile_idx on discovery.evidence (profile_id, source);
create index if not exists evidence_key_idx on discovery.evidence (profile_id, key);

-- --- Assessment summary (lifecycle via workflows) ---------------------------
create table if not exists discovery.assessments (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  profile_id           uuid not null references discovery.profiles(id) on delete cascade,
  status               discovery.assessment_status not null default 'draft',
  maturity_score       integer,                           -- 0-100, derived
  health_score         integer,                           -- 0-100, derived
  workflow_instance_id uuid references workflows.instances(id) on delete set null,
  assessed_by          uuid references auth.users(id) on delete set null,
  assessed_at          timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint assessments_maturity_range check (maturity_score is null or maturity_score between 0 and 100),
  constraint assessments_health_range check (health_score is null or health_score between 0 and 100)
);
create index if not exists assessments_profile_idx on discovery.assessments (profile_id, status);

create table if not exists discovery.profile_scores (
  id            bigint generated always as identity primary key,
  assessment_id uuid not null references discovery.assessments(id) on delete cascade,
  framework     discovery.score_framework not null,
  dimension_key extensions.citext not null,
  score         integer not null,                          -- 0-5
  note          text,
  constraint profile_scores_unique unique (assessment_id, framework, dimension_key),
  constraint profile_scores_range check (score between 0 and 5),
  foreign key (framework, dimension_key) references discovery.score_dimensions(framework, key) on delete restrict
);

-- --- Reusable output containers (NO generation this checkpoint) -------------
create table if not exists discovery.blueprints (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  profile_id    uuid not null references discovery.profiles(id) on delete cascade,
  assessment_id uuid references discovery.assessments(id) on delete set null,
  status        text not null default 'draft',
  -- reusable sections filled later: transformation, roadmap, roi, subscription_recommendation
  content       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists discovery.recommendations (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  assessment_id uuid not null references discovery.assessments(id) on delete cascade,
  kind          discovery.recommendation_kind not null,
  title         text not null,
  detail        text not null default '',
  recommended_service text,                                -- a Herman Legacy service
  recommended_module  extensions.citext,                   -- an HL-BOS module key
  estimated_impact    text,
  priority      integer not null default 3,
  created_at    timestamptz not null default now()
);
create index if not exists recommendations_assessment_idx on discovery.recommendations (assessment_id, kind);

-- --- triggers ---------------------------------------------------------------
create trigger profiles_set_updated_at   before update on discovery.profiles   for each row execute function platform.set_updated_at();
create trigger assessments_set_updated_at before update on discovery.assessments for each row execute function platform.set_updated_at();
create trigger blueprints_set_updated_at  before update on discovery.blueprints  for each row execute function platform.set_updated_at();
create trigger profiles_audit    after insert or update or delete on discovery.profiles    for each row execute function audit.emit();
create trigger collections_audit after insert or update or delete on discovery.collections for each row execute function audit.emit();
create trigger evidence_audit    after insert or update or delete on discovery.evidence    for each row execute function audit.emit();
create trigger assessments_audit after insert or update or delete on discovery.assessments for each row execute function audit.emit();

-- --- RLS --------------------------------------------------------------------
alter table discovery.collectors          enable row level security; alter table discovery.collectors          force row level security;
alter table discovery.interview_questions enable row level security; alter table discovery.interview_questions force row level security;
alter table discovery.score_dimensions    enable row level security; alter table discovery.score_dimensions    force row level security;
alter table discovery.profiles            enable row level security; alter table discovery.profiles            force row level security;
alter table discovery.collections         enable row level security; alter table discovery.collections         force row level security;
alter table discovery.evidence            enable row level security; alter table discovery.evidence            force row level security;
alter table discovery.assessments         enable row level security; alter table discovery.assessments         force row level security;
alter table discovery.profile_scores      enable row level security; alter table discovery.profile_scores      force row level security;
alter table discovery.blueprints          enable row level security; alter table discovery.blueprints          force row level security;
alter table discovery.recommendations     enable row level security; alter table discovery.recommendations     force row level security;

-- catalogs: readable by any authenticated context
drop policy if exists collectors_select on discovery.collectors;
create policy collectors_select on discovery.collectors for select to authenticated using (true);
drop policy if exists interview_questions_select on discovery.interview_questions;
create policy interview_questions_select on discovery.interview_questions for select to authenticated using (true);
drop policy if exists score_dimensions_select on discovery.score_dimensions;
create policy score_dimensions_select on discovery.score_dimensions for select to authenticated using (true);

-- tenant data: read by permission; NO tenant write path (definer RPCs only)
drop policy if exists profiles_select on discovery.profiles;
create policy profiles_select on discovery.profiles for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.profile.read'));
drop policy if exists collections_select on discovery.collections;
create policy collections_select on discovery.collections for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.evidence.read'));
drop policy if exists evidence_select on discovery.evidence;
create policy evidence_select on discovery.evidence for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.evidence.read'));
drop policy if exists assessments_select on discovery.assessments;
create policy assessments_select on discovery.assessments for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.assessment.read'));
drop policy if exists profile_scores_select on discovery.profile_scores;
create policy profile_scores_select on discovery.profile_scores for select to authenticated
  using (exists (select 1 from discovery.assessments a
                 where a.id = assessment_id and identity.has_permission(a.tenant_id, 'discovery.assessment.read')));
drop policy if exists blueprints_select on discovery.blueprints;
create policy blueprints_select on discovery.blueprints for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.assessment.read'));
drop policy if exists recommendations_select on discovery.recommendations;
create policy recommendations_select on discovery.recommendations for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.assessment.read'));

grant select on discovery.collectors, discovery.interview_questions, discovery.score_dimensions,
                discovery.profiles, discovery.collections, discovery.evidence, discovery.assessments,
                discovery.profile_scores, discovery.blueprints, discovery.recommendations to authenticated;

-- ===========================================================================
-- Collector registration (platform) — the extension point for new modules
-- ===========================================================================
create or replace function discovery.register_collector(
  p_key extensions.citext, p_name text, p_kind extensions.citext, p_active boolean default false)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('discovery.collector.manage') then
    raise exception 'only a platform administrator may register a collector' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.collectors (key, name, kind, is_active)
  values (p_key, p_name, p_kind, p_active)
  on conflict (key) do update set name = excluded.name, kind = excluded.kind, is_active = excluded.is_active;
end; $$;
revoke all on function discovery.register_collector(extensions.citext, text, extensions.citext, boolean) from public, anon;
grant execute on function discovery.register_collector(extensions.citext, text, extensions.citext, boolean) to authenticated;

-- ===========================================================================
-- Profile lifecycle
-- ===========================================================================
create or replace function discovery.create_profile(
  p_tenant uuid, p_business text, p_industry extensions.citext default null, p_prospect uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'discovery.profile.create') then
    raise exception 'insufficient privilege to create a business profile' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.profiles (tenant_id, business_name, industry, prospect_id, status, created_by)
  values (p_tenant, p_business, p_industry, p_prospect, 'active', auth.uid())
  returning id into v_id;
  perform events.emit('discovery.profile.created', p_tenant, jsonb_build_object('profile', v_id, 'business', p_business));
  return v_id;
end; $$;
revoke all on function discovery.create_profile(uuid, text, extensions.citext, uuid) from public, anon;
grant execute on function discovery.create_profile(uuid, text, extensions.citext, uuid) to authenticated;

create or replace function discovery.update_profile_summary(p_profile uuid, p_summary jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.profiles where id = p_profile;
  if not found then raise exception 'profile % not found', p_profile using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.profile.update') then
    raise exception 'insufficient privilege to update a profile' using errcode = 'insufficient_privilege';
  end if;
  update discovery.profiles set summary = coalesce(p_summary, '{}'::jsonb) where id = p_profile;
end; $$;
revoke all on function discovery.update_profile_summary(uuid, jsonb) from public, anon;
grant execute on function discovery.update_profile_summary(uuid, jsonb) to authenticated;

-- ===========================================================================
-- Evidence collection (the reusable ingestion path every collector uses)
-- ===========================================================================
create or replace function discovery.start_collection(p_profile uuid, p_collector extensions.citext)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_active boolean; v_id uuid;
begin
  select tenant_id into v_tenant from discovery.profiles where id = p_profile;
  if not found then raise exception 'profile % not found', p_profile using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.evidence.create') then
    raise exception 'insufficient privilege to collect evidence' using errcode = 'insufficient_privilege';
  end if;
  select is_active into v_active from discovery.collectors where key = p_collector;
  if not found then raise exception 'unknown collector %', p_collector using errcode = 'foreign_key_violation'; end if;
  if not v_active then
    -- extension point: placeholder collectors (e.g. website_assessment in CP5) are inert until activated
    raise exception 'collector % is not active yet', p_collector using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.collections (tenant_id, profile_id, collector_key, status)
  values (v_tenant, p_profile, p_collector, 'collecting') returning id into v_id;
  perform events.emit('discovery.collection.started', v_tenant, jsonb_build_object('collection', v_id, 'collector', p_collector));
  return v_id;
end; $$;
revoke all on function discovery.start_collection(uuid, extensions.citext) from public, anon;
grant execute on function discovery.start_collection(uuid, extensions.citext) to authenticated;

create or replace function discovery.record_evidence(
  p_profile uuid, p_collector extensions.citext, p_source extensions.citext, p_key extensions.citext,
  p_value jsonb, p_confidence numeric default 1.00, p_refs jsonb default '[]'::jsonb,
  p_collection uuid default null, p_file uuid default null, p_ai_run bigint default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id bigint;
begin
  select tenant_id into v_tenant from discovery.profiles where id = p_profile;
  if not found then raise exception 'profile % not found', p_profile using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.evidence.create') then
    raise exception 'insufficient privilege to record evidence' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.evidence (tenant_id, profile_id, collection_id, collector_key, source, key, value, confidence, refs, file_id, ai_run_id, collected_by)
  values (v_tenant, p_profile, p_collection, p_collector, p_source, p_key, coalesce(p_value,'{}'::jsonb), p_confidence, coalesce(p_refs,'[]'::jsonb), p_file, p_ai_run, auth.uid())
  returning id into v_id;
  perform events.emit('discovery.evidence.recorded', v_tenant, jsonb_build_object('profile', p_profile, 'source', p_source, 'key', p_key));
  return v_id;
end; $$;
revoke all on function discovery.record_evidence(uuid, extensions.citext, extensions.citext, extensions.citext, jsonb, numeric, jsonb, uuid, uuid, bigint) from public, anon;
grant execute on function discovery.record_evidence(uuid, extensions.citext, extensions.citext, extensions.citext, jsonb, numeric, jsonb, uuid, uuid, bigint) to authenticated;

-- Module 2 convenience: record an interview answer as evidence
create or replace function discovery.record_interview_answer(p_profile uuid, p_question extensions.citext, p_answer text)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_field extensions.citext;
begin
  select field into v_field from discovery.interview_questions where key = p_question;
  if not found then raise exception 'unknown interview question %', p_question using errcode = 'foreign_key_violation'; end if;
  return discovery.record_evidence(p_profile, 'business_interview', 'interview', v_field,
    jsonb_build_object('answer', p_answer), 1.00, '[]'::jsonb);
end; $$;
revoke all on function discovery.record_interview_answer(uuid, extensions.citext, text) from public, anon;
grant execute on function discovery.record_interview_answer(uuid, extensions.citext, text) to authenticated;

-- ===========================================================================
-- Assessment lifecycle (reuses the workflow engine for human review)
-- ===========================================================================
create or replace function discovery.start_assessment(p_profile uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from discovery.profiles where id = p_profile;
  if not found then raise exception 'profile % not found', p_profile using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.assessment.manage') then
    raise exception 'insufficient privilege to run an assessment' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.assessments (tenant_id, profile_id, status) values (v_tenant, p_profile, 'draft')
  returning id into v_id;
  perform events.emit('discovery.assessment.started', v_tenant, jsonb_build_object('assessment', v_id, 'profile', p_profile));
  return v_id;
end; $$;
revoke all on function discovery.start_assessment(uuid) from public, anon;
grant execute on function discovery.start_assessment(uuid) to authenticated;

create or replace function discovery.score_dimension(
  p_assessment uuid, p_framework discovery.score_framework, p_dimension extensions.citext, p_score integer, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.assessment.manage') then
    raise exception 'insufficient privilege to score' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from discovery.score_dimensions where framework = p_framework and key = p_dimension) then
    raise exception 'unknown %-dimension %', p_framework, p_dimension using errcode = 'foreign_key_violation';
  end if;
  insert into discovery.profile_scores (assessment_id, framework, dimension_key, score, note)
  values (p_assessment, p_framework, p_dimension, p_score, p_note)
  on conflict (assessment_id, framework, dimension_key) do update set score = excluded.score, note = excluded.note;
end; $$;
revoke all on function discovery.score_dimension(uuid, discovery.score_framework, extensions.citext, integer, text) from public, anon;
grant execute on function discovery.score_dimension(uuid, discovery.score_framework, extensions.citext, integer, text) to authenticated;

-- Submit for human review: opens a workflow instance (reused engine)
create or replace function discovery.submit_assessment_for_review(p_assessment uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id into v_tenant from discovery.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.assessment.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_instance := workflows.request_approval(v_tenant, 'discovery.assessment.review', 'discovery.assessment', p_assessment::text, 'tenant_admin');
  update discovery.assessments set status = 'in_review', workflow_instance_id = v_instance where id = p_assessment;
  return v_instance;
end; $$;
revoke all on function discovery.submit_assessment_for_review(uuid) from public, anon;
grant execute on function discovery.submit_assessment_for_review(uuid) to authenticated;

-- Complete: composite scores derive ONLY from real scored dimensions (honest),
-- and completion REQUIRES an approved human review (reused workflow gate).
create or replace function discovery.complete_assessment(p_assessment uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid; v_maturity integer; v_health integer;
begin
  select tenant_id, workflow_instance_id into v_tenant, v_instance from discovery.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.assessment.manage') then
    raise exception 'insufficient privilege to complete' using errcode = 'insufficient_privilege';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'assessment cannot complete without an approved human review' using errcode = 'insufficient_privilege';
  end if;
  -- weighted mean of 0-5 scores per framework, scaled to 0-100; null if none scored
  select round(sum(ps.score::numeric * d.weight) / nullif(sum(d.weight),0) / 5 * 100)::int
    into v_maturity
    from discovery.profile_scores ps
    join discovery.score_dimensions d on d.framework = ps.framework and d.key = ps.dimension_key
   where ps.assessment_id = p_assessment and ps.framework = 'maturity';
  select round(sum(ps.score::numeric * d.weight) / nullif(sum(d.weight),0) / 5 * 100)::int
    into v_health
    from discovery.profile_scores ps
    join discovery.score_dimensions d on d.framework = ps.framework and d.key = ps.dimension_key
   where ps.assessment_id = p_assessment and ps.framework = 'health';
  update discovery.assessments
     set status = 'completed', maturity_score = v_maturity, health_score = v_health,
         assessed_by = auth.uid(), assessed_at = now()
   where id = p_assessment;
  perform events.emit('discovery.assessment.completed', v_tenant,
    jsonb_build_object('assessment', p_assessment, 'maturity', v_maturity, 'health', v_health));
  perform audit.log_security_event('discovery.assessment.complete','allowed','info',
    v_tenant,'discovery.assessments',p_assessment::text, jsonb_build_object('maturity', v_maturity, 'health', v_health));
end; $$;
revoke all on function discovery.complete_assessment(uuid) from public, anon;
grant execute on function discovery.complete_assessment(uuid) to authenticated;

-- ===========================================================================
-- Reusable output containers (NO generation — just recordable structure)
-- ===========================================================================
create or replace function discovery.draft_blueprint(p_assessment uuid, p_content jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_profile uuid; v_id uuid;
begin
  select tenant_id, profile_id into v_tenant, v_profile from discovery.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.assessment.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.blueprints (tenant_id, profile_id, assessment_id, content)
  values (v_tenant, v_profile, p_assessment, coalesce(p_content,'{}'::jsonb)) returning id into v_id;
  return v_id;
end; $$;
revoke all on function discovery.draft_blueprint(uuid, jsonb) from public, anon;
grant execute on function discovery.draft_blueprint(uuid, jsonb) to authenticated;

create or replace function discovery.add_recommendation(
  p_assessment uuid, p_kind discovery.recommendation_kind, p_title text, p_detail text default '',
  p_service text default null, p_module extensions.citext default null, p_impact text default null, p_priority integer default 3)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id bigint;
begin
  select tenant_id into v_tenant from discovery.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.assessment.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.recommendations (tenant_id, assessment_id, kind, title, detail, recommended_service, recommended_module, estimated_impact, priority)
  values (v_tenant, p_assessment, p_kind, p_title, coalesce(p_detail,''), p_service, p_module, p_impact, p_priority)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function discovery.add_recommendation(uuid, discovery.recommendation_kind, text, text, text, extensions.citext, text, integer) from public, anon;
grant execute on function discovery.add_recommendation(uuid, discovery.recommendation_kind, text, text, text, extensions.citext, text, integer) to authenticated;

-- ===========================================================================
-- Permissions
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('discovery.profile.read',    'Read business profiles.', 'tenant'),
  ('discovery.profile.create',  'Create business profiles.', 'tenant'),
  ('discovery.profile.update',  'Update business profiles.', 'tenant'),
  ('discovery.evidence.read',   'Read discovery evidence and collections.', 'tenant'),
  ('discovery.evidence.create', 'Collect and record discovery evidence.', 'tenant'),
  ('discovery.assessment.read', 'Read assessments, scores, blueprints, recommendations.', 'tenant'),
  ('discovery.assessment.manage','Run, score, and complete assessments.', 'tenant'),
  ('discovery.collector.manage','Register/activate discovery collectors (platform).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','discovery.profile.read'),('tenant_owner','discovery.profile.create'),('tenant_owner','discovery.profile.update'),
  ('tenant_owner','discovery.evidence.read'),('tenant_owner','discovery.evidence.create'),
  ('tenant_owner','discovery.assessment.read'),('tenant_owner','discovery.assessment.manage'),
  ('tenant_admin','discovery.profile.read'),('tenant_admin','discovery.profile.create'),('tenant_admin','discovery.profile.update'),
  ('tenant_admin','discovery.evidence.read'),('tenant_admin','discovery.evidence.create'),
  ('tenant_admin','discovery.assessment.read'),('tenant_admin','discovery.assessment.manage'),
  ('manager','discovery.profile.read'),('manager','discovery.profile.create'),('manager','discovery.profile.update'),
  ('manager','discovery.evidence.read'),('manager','discovery.evidence.create'),
  ('manager','discovery.assessment.read'),('manager','discovery.assessment.manage'),
  ('staff','discovery.profile.read'),('staff','discovery.evidence.read'),('staff','discovery.evidence.create'),('staff','discovery.assessment.read'),
  ('viewer','discovery.profile.read'),('viewer','discovery.evidence.read'),('viewer','discovery.assessment.read'),
  ('service_account','discovery.evidence.create'),
  ('platform_owner','discovery.collector.manage'),
  ('platform_admin','discovery.collector.manage')
on conflict do nothing;

-- ===========================================================================
-- Seeds: collectors (Modules 1-5), interview questions (Module 2), dimensions
-- ===========================================================================
insert into discovery.collectors (key, name, kind, is_active, produces_evidence) values
  ('business_interview', 'Business Discovery Interview', 'business_interview', true,  true),
  ('website_assessment', 'Website Assessment',           'website_assessment', false, true),
  ('social_presence',    'Social Presence',              'social_presence',    false, true),
  ('document_analysis',  'Document Analysis',            'document_analysis',  false, true),
  ('integrations',       'Business System Integrations', 'integration',        false, true)
on conflict (key) do nothing;

insert into discovery.interview_questions (key, field, prompt, display_order) values
  ('q_business_name','business_name','What is the business name?',1),
  ('q_industry','industry','What industry are you in?',2),
  ('q_products','products','What products do you sell?',3),
  ('q_services','services','What services do you provide?',4),
  ('q_employees','employees','How many employees do you have?',5),
  ('q_customers','customers','Who are your customers?',6),
  ('q_goals','goals','What are your goals?',7),
  ('q_challenges','challenges','What challenges are you facing?',8),
  ('q_geo_market','geographic_market','What geographic market do you serve?',9),
  ('q_current_marketing','current_marketing','How do you market today?',10),
  ('q_current_technology','current_technology','What technology do you use today?',11),
  ('q_current_operations','current_operations','How do you run operations today?',12),
  ('q_growth_objectives','growth_objectives','What are your growth objectives?',13),
  ('q_pain_points','pain_points','What are your biggest pain points?',14),
  ('q_competitive_landscape','competitive_landscape','Who are your competitors?',15)
on conflict (key) do nothing;

insert into discovery.score_dimensions (key, framework, name, weight, display_order) values
  -- Digital Maturity (12)
  ('digital_presence','maturity','Digital Presence',8,1),
  ('marketing','maturity','Marketing',7,2),
  ('sales','maturity','Sales',7,3),
  ('customer_experience','maturity','Customer Experience',7,4),
  ('operations','maturity','Operations',6,5),
  ('automation','maturity','Automation',6,6),
  ('analytics','maturity','Analytics',5,7),
  ('ai_adoption','maturity','AI Adoption',5,8),
  ('security','maturity','Security',6,9),
  ('business_processes','maturity','Business Processes',6,10),
  ('communications','maturity','Communications',6,11),
  ('growth_readiness','maturity','Growth Readiness',7,12),
  -- Business Health (8)
  ('operational_health','health','Operational Health',8,1),
  ('customer_engagement','health','Customer Engagement',8,2),
  ('revenue_readiness','health','Revenue Readiness',9,3),
  ('technology_readiness','health','Technology Readiness',6,4),
  ('competitive_position','health','Competitive Position',6,5),
  ('growth_potential','health','Growth Potential',7,6),
  ('risk_indicators','health','Risk Indicators',6,7),
  ('automation_opportunity','health','Automation Opportunity',6,8)
on conflict (framework, key) do nothing;
