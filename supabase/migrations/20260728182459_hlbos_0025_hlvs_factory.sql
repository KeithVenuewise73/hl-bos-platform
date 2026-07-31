-- ===========================================================================
-- v0_hlvs_factory — HLVS Factory Interface, Software Catalog & Creation Control
--
-- HLVS is the technical blueprint + engineering intelligence + software catalog
-- for the Herman Legacy production facility. This migration builds the governed
-- closed loop that turns an approved software opportunity into an executable
-- development blueprint for Claude, validates the resulting work, and hands an
-- inert Factory Build Package to HL-BOS:
--
--   opportunity → CEO CREATE decision → catalog search → reuse/extend/create
--   → product technical blueprint → software creation order → Claude prompt
--   package → development run + checkpoint reports → build completion report
--   → deterministic blueprint conformance → catalog update proposal
--   → Factory Build Package → HL-BOS intake → HL-BOS feedback.
--
-- All new objects live in the NEW `hlvs` schema. It REUSES (never duplicates)
-- identity/tenancy/permissions, events + the CP5 shared dispatcher, workflows,
-- audit, storage_meta, the ai gateway, the CP6 discovery.module_catalog /
-- service_catalog (referenced), and the CP7 provisioning.factory_authorizations
-- (the commercial authorization the intake compares against).
--
-- Nothing here deploys, provisions, bills, messages, creates a tenant, enables a
-- module, activates an entitlement, calls Claude, or writes an external repo.
-- The Factory Build Package and HL-BOS intake are INERT; the furthest intake
-- status is `accepted_for_controlled_deployment_review`. AI is advisory only.
-- No enum value is added to an existing type.
--
-- rollback:
--   -- (destructive; requires approval)
--   DROP SCHEMA IF EXISTS hlvs CASCADE;
--   DELETE FROM events.handlers WHERE subscription_key = 'hlvs_factory_worker';
--   DELETE FROM events.subscriptions WHERE key = 'hlvs_factory_worker';
-- ===========================================================================

create schema if not exists hlvs;
comment on schema hlvs is 'Herman Legacy Software Factory: technical blueprint, engineering intelligence, and software catalog. Platform-internal; definer RPCs only. Governs software creation; does not operate customer workloads.';
revoke all on schema hlvs from public, anon, authenticated;
grant usage on schema hlvs to authenticated;
alter default privileges in schema hlvs revoke all on tables from public;
alter default privileges in schema hlvs revoke all on functions from public;

-- ===========================================================================
-- Enums
-- ===========================================================================
do $$ begin create type hlvs.lifecycle_status as enum ('draft','under_review','approved','deprecated','retired'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.determination as enum ('reuse_existing','configure_existing','extend_existing','create_adapter','create_new','reject_duplicate','requires_architecture_review'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.extraction_status as enum ('candidate','under_review','approved_for_extraction','extracted','rejected','deferred'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.blueprint_status as enum ('draft','architecture_review','approved','superseded'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.order_status as enum ('draft','architecture_review','ceo_review','approved','prompt_generated','development_active','blocked','development_complete','validation_active','accepted','rejected','superseded','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.run_status as enum ('initialized','prompt_delivered','in_progress','blocked','reports_submitted','completed','accepted','rejected','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.report_review as enum ('pending','accepted','accepted_with_conditions','rejected','revision_required'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.conformance_verdict as enum ('conformant','conformant_with_approved_exceptions','nonconformant','incomplete'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.package_status as enum ('draft','validation','architecture_approved','submitted_to_hlbos','accepted_by_hlbos','rejected_by_hlbos','superseded','withdrawn'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.intake_status as enum ('received','validating','accepted_for_controlled_deployment_review','rejected','revision_requested'); exception when duplicate_object then null; end $$;
do $$ begin create type hlvs.readiness as enum ('ready','blocked','needs_review'); exception when duplicate_object then null; end $$;

-- ===========================================================================
-- Catalog: capabilities, engineering module registry, products, templates, editions
-- ===========================================================================
create table if not exists hlvs.capabilities (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  key extensions.citext unique not null,
  name text not null,
  description text not null default '',
  category extensions.citext not null,
  owning_system text,
  lifecycle hlvs.lifecycle_status not null default 'draft',
  reusable boolean not null default false,
  version integer not null default 1,
  approved_by uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capabilities_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists hlvs.modules (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  key extensions.citext unique not null,
  name text not null,
  description text not null default '',
  category extensions.citext not null,
  owning_system text,
  source_repository text,
  source_path text,
  schema_ownership jsonb not null default '[]'::jsonb,
  apis jsonb not null default '[]'::jsonb,
  rpcs jsonb not null default '[]'::jsonb,
  ui_components jsonb not null default '[]'::jsonb,
  worker_functions jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  test_suites jsonb not null default '[]'::jsonb,
  documentation jsonb not null default '[]'::jsonb,
  security_requirements jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,          -- capability keys delivered
  maturity text not null default 'experimental',
  current_version text not null default '0.1.0',
  lifecycle hlvs.lifecycle_status not null default 'draft',
  production_eligible boolean not null default false,
  licensing_eligibility text,
  discovery_module_key extensions.citext references discovery.module_catalog(key) on delete set null,  -- 1:1 link to the CP6 commercial catalog
  version integer not null default 1,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists hlvs.products (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  key extensions.citext unique not null,
  name text not null,
  description text not null default '',
  purpose text,
  target_users text,
  target_industry extensions.citext,
  business_problem text,
  commercial_model text,
  lifecycle hlvs.lifecycle_status not null default 'draft',
  published boolean not null default false,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists hlvs.industry_templates (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  key extensions.citext unique not null,
  name text not null,
  description text not null default '',
  industry extensions.citext not null,
  module_composition jsonb not null default '[]'::jsonb,
  lifecycle hlvs.lifecycle_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint industry_templates_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists hlvs.product_editions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  product_key extensions.citext not null references hlvs.products(key) on delete cascade,
  key extensions.citext not null,
  name text not null,
  tier text,
  included_modules jsonb not null default '[]'::jsonb,
  licensing text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint product_editions_unique unique (product_key, key)
);

create table if not exists hlvs.extraction_candidates (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  source_system text not null,
  source_repository text,
  source_object text,
  observed_capability text not null,
  proposed_capability_key extensions.citext,
  potential_duplicate_modules jsonb not null default '[]'::jsonb,
  extraction_status hlvs.extraction_status not null default 'candidate',
  migration_strategy text,
  shared_platform_suitability text,
  vertical_remainder text,
  reviewer_decision text,
  reviewed_by uuid references auth.users(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hlvs.duplicate_checks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  requirement text not null,
  determination hlvs.determination not null,
  ai_recommended hlvs.determination,                        -- advisory only
  rationale text,
  matched_capability_key extensions.citext,
  matched_module_key extensions.citext,
  approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Product Technical Blueprint (immutable once approved) + Software Creation Order
-- ===========================================================================
create table if not exists hlvs.product_blueprints (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  product_key extensions.citext not null references hlvs.products(key) on delete restrict,
  version integer not null default 1,
  status hlvs.blueprint_status not null default 'draft',
  content jsonb not null default '{}'::jsonb,                -- the full technical field set
  immutable boolean not null default false,
  architecture_approved_by uuid references auth.users(id) on delete set null,
  ceo_approved_by uuid references auth.users(id) on delete set null,
  workflow_instance_id uuid references workflows.instances(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_blueprints_version_unique unique (product_key, version)
);

create table if not exists hlvs.software_creation_orders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  blueprint_id uuid not null references hlvs.product_blueprints(id) on delete restrict,
  version integer not null default 1,
  status hlvs.order_status not null default 'draft',
  business_definition jsonb not null default '{}'::jsonb,
  build_scope jsonb not null default '{}'::jsonb,            -- reuse/configure/extend/adapters/new/excluded/prohibited
  technical_context jsonb not null default '{}'::jsonb,
  execution_plan jsonb not null default '{}'::jsonb,
  governance jsonb not null default '{}'::jsonb,
  architecture_approved_by uuid references auth.users(id) on delete set null,
  ceo_approved_by uuid references auth.users(id) on delete set null,
  security_review_required boolean not null default true,
  workflow_instance_id uuid references workflows.instances(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hlvs.prompt_packages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null references hlvs.software_creation_orders(id) on delete cascade,
  version integer not null default 1,
  content jsonb not null default '{}'::jsonb,
  text_export text,
  markdown_export text,
  json_export jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint prompt_packages_version_unique unique (order_id, version)
);

create table if not exists hlvs.development_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null references hlvs.software_creation_orders(id) on delete restrict,
  order_version integer,
  prompt_package_id uuid references hlvs.prompt_packages(id) on delete set null,
  development_agent text not null default 'claude',
  model_identifier text,
  repository text,
  branch text,
  started_at timestamptz not null default now(),
  current_checkpoint integer not null default 0,
  status hlvs.run_status not null default 'initialized',
  blockers jsonb not null default '[]'::jsonb,
  human_decisions jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  final_disposition text,
  external_execution boolean not null default false,        -- ALWAYS false this checkpoint
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hlvs.checkpoint_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  run_id uuid not null references hlvs.development_runs(id) on delete cascade,
  checkpoint_number integer not null,
  checkpoint_name text not null,
  content jsonb not null default '{}'::jsonb,                -- summary/reuse/files/migrations/tests/security/etc
  review hlvs.report_review not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  commit_id text,
  branch text,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint checkpoint_reports_unique unique (run_id, checkpoint_number)
);

create table if not exists hlvs.build_completion_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  run_id uuid not null references hlvs.development_runs(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  drafted_by_ai boolean not null default false,
  review hlvs.report_review not null default 'pending',
  accepted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint build_completion_unique unique (run_id)
);

create table if not exists hlvs.conformance_results (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  run_id uuid not null references hlvs.development_runs(id) on delete cascade,
  blueprint_id uuid references hlvs.product_blueprints(id) on delete set null,
  order_id uuid references hlvs.software_creation_orders(id) on delete set null,
  verdict hlvs.conformance_verdict not null,
  checks jsonb not null default '{}'::jsonb,
  blocking jsonb not null default '[]'::jsonb,
  non_exceptionable jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists hlvs.conformance_exceptions (
  id bigint generated always as identity primary key,
  conformance_id uuid not null references hlvs.conformance_results(id) on delete cascade,
  rule_key text not null,
  reason text not null,
  approver uuid references auth.users(id) on delete set null,
  scope text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists hlvs.catalog_update_proposals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  run_id uuid references hlvs.development_runs(id) on delete set null,
  content jsonb not null default '{}'::jsonb,                -- before/after; new capabilities/modules/versions/deps/lifecycle
  status text not null default 'draft',                      -- draft | approved | rejected | published
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hlvs.factory_build_packages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  product_blueprint_id uuid not null references hlvs.product_blueprints(id) on delete restrict,
  product_version integer,
  run_id uuid references hlvs.development_runs(id) on delete set null,
  conformance_id uuid references hlvs.conformance_results(id) on delete set null,
  content jsonb not null default '{}'::jsonb,                -- manifests, dependency lock, evidence, restrictions
  status hlvs.package_status not null default 'draft',
  readiness hlvs.readiness not null default 'needs_review',
  blocking_reasons jsonb not null default '[]'::jsonb,
  architecture_approved_by uuid references auth.users(id) on delete set null,
  release_candidate text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hlvs.hlbos_intake (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  package_id uuid not null references hlvs.factory_build_packages(id) on delete cascade,
  status hlvs.intake_status not null default 'received',
  validation jsonb not null default '{}'::jsonb,
  rejection_reasons jsonb not null default '[]'::jsonb,
  commercial_authorization_id uuid references provisioning.factory_authorizations(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hlbos_intake_package_unique unique (package_id)
);

create table if not exists hlvs.hlbos_feedback (
  id bigint generated always as identity primary key,
  package_id uuid not null references hlvs.factory_build_packages(id) on delete cascade,
  feedback_type text not null,
  detail jsonb not null default '{}'::jsonb,
  external_execution boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Immutability + append-only triggers
-- ===========================================================================
-- An approved blueprint's content is frozen; changes require a new version.
create or replace function hlvs.freeze_approved_blueprint()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.immutable and (new.content is distinct from old.content or new.status is distinct from old.status
                        and new.status <> 'superseded') then
    raise exception 'an approved blueprint is immutable; create a new version' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end; $$;
create or replace trigger product_blueprints_freeze before update on hlvs.product_blueprints
  for each row execute function hlvs.freeze_approved_blueprint();

-- A checkpoint report is append-only once accepted.
create or replace function hlvs.freeze_accepted_report()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.review in ('accepted','accepted_with_conditions')
     and (new.content is distinct from old.content or new.review is distinct from old.review) then
    raise exception 'an accepted checkpoint report is append-only' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end; $$;
create or replace trigger checkpoint_reports_freeze before update on hlvs.checkpoint_reports
  for each row execute function hlvs.freeze_accepted_report();

-- updated_at + audit
do $$
declare r record;
begin
  for r in select unnest(array['capabilities','modules','products','extraction_candidates','product_blueprints',
    'software_creation_orders','development_runs','catalog_update_proposals','factory_build_packages','hlbos_intake']) as t
  loop
    execute format('create or replace trigger %I_set_updated_at before update on hlvs.%I for each row execute function platform.set_updated_at()', r.t, r.t);
  end loop;
  for r in select unnest(array['capabilities','modules','products','product_editions','industry_templates',
    'extraction_candidates','duplicate_checks','product_blueprints','software_creation_orders','prompt_packages',
    'development_runs','checkpoint_reports','build_completion_reports','conformance_results','catalog_update_proposals',
    'factory_build_packages','hlbos_intake']) as t
  loop
    execute format('create or replace trigger %I_audit after insert or update or delete on hlvs.%I for each row execute function audit.emit()', r.t, r.t);
  end loop;
end $$;

-- ===========================================================================
-- RLS: every table FORCE; reads require the platform read permission
-- ===========================================================================
do $$
declare r record;
begin
  for r in select unnest(array['capabilities','modules','products','product_editions','industry_templates',
    'extraction_candidates','duplicate_checks','product_blueprints','software_creation_orders','prompt_packages',
    'development_runs','checkpoint_reports','build_completion_reports','conformance_results','conformance_exceptions',
    'catalog_update_proposals','factory_build_packages','hlbos_intake','hlbos_feedback']) as t
  loop
    execute format('alter table hlvs.%I enable row level security', r.t);
    execute format('alter table hlvs.%I force row level security', r.t);
    execute format('drop policy if exists %I_select on hlvs.%I', r.t, r.t);
    execute format($p$create policy %I_select on hlvs.%I for select to authenticated using (identity.has_platform_permission('hlvs.catalog.read'))$p$, r.t, r.t);
    execute format('grant select on hlvs.%I to authenticated', r.t);
  end loop;
end $$;

-- ===========================================================================
-- Permissions (platform scope; explicit, not broad role assumptions)
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('hlvs.catalog.read',     'Read the HLVS catalog and factory records.', 'platform'),
  ('hlvs.catalog.manage',   'Register/approve capabilities, modules, products, editions, templates; approve duplicate determinations.', 'platform'),
  ('hlvs.blueprint.manage', 'Create and approve product technical blueprints.', 'platform'),
  ('hlvs.order.manage',     'Create and approve software creation orders; generate prompt packages.', 'platform'),
  ('hlvs.run.manage',       'Manage development runs; review checkpoint and completion reports.', 'platform'),
  ('hlvs.conformance.manage','Run conformance, grant conformance exceptions, approve catalog updates.', 'platform'),
  ('hlvs.package.manage',   'Build, approve, and submit Factory Build Packages.', 'platform'),
  ('hlvs.intake.manage',    'Perform HL-BOS intake review and record feedback.', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key)
select r, p from unnest(array['platform_owner','platform_admin']) r,
  unnest(array['hlvs.catalog.read','hlvs.catalog.manage','hlvs.blueprint.manage','hlvs.order.manage',
    'hlvs.run.manage','hlvs.conformance.manage','hlvs.package.manage','hlvs.intake.manage']) p
on conflict do nothing;

-- ===========================================================================
-- Guard helper: require a platform permission or raise
-- ===========================================================================
create or replace function hlvs._require(p_perm extensions.citext)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission(p_perm) then
    raise exception 'insufficient privilege: % required', p_perm using errcode = 'insufficient_privilege';
  end if;
end; $$;
revoke all on function hlvs._require(extensions.citext) from public, anon, authenticated;

-- ===========================================================================
-- Catalog registration + governance RPCs
-- ===========================================================================
create or replace function hlvs.register_capability(p_key extensions.citext, p_name text, p_category extensions.citext, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform hlvs._require('hlvs.catalog.manage');
  insert into hlvs.capabilities (key, name, category, description, owning_system, notes, created_by)
  values (p_key, p_name, p_category, coalesce(p_attrs->>'description',''), p_attrs->>'owning_system', p_attrs->>'notes', auth.uid())
  on conflict (key) do update set name = excluded.name, category = excluded.category, description = excluded.description
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.register_capability(extensions.citext, text, extensions.citext, jsonb) from public, anon;
grant execute on function hlvs.register_capability(extensions.citext, text, extensions.citext, jsonb) to authenticated;

-- Declaring a capability reusable is a human approval (advance lifecycle).
create or replace function hlvs.approve_capability(p_key extensions.citext, p_reusable boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.catalog.manage');
  update hlvs.capabilities set lifecycle = 'approved', reusable = p_reusable,
     approved_by = auth.uid(), version = version + 1 where key = p_key;
  if not found then raise exception 'capability % not found', p_key using errcode = 'no_data_found'; end if;
end; $$;
revoke all on function hlvs.approve_capability(extensions.citext, boolean) from public, anon;
grant execute on function hlvs.approve_capability(extensions.citext, boolean) to authenticated;

create or replace function hlvs.register_module(p_key extensions.citext, p_name text, p_category extensions.citext, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform hlvs._require('hlvs.catalog.manage');
  insert into hlvs.modules (key, name, category, description, owning_system, source_repository, source_path,
     schema_ownership, apis, rpcs, ui_components, worker_functions, dependencies, test_suites, documentation,
     security_requirements, capabilities, maturity, current_version, discovery_module_key, licensing_eligibility, created_by)
  values (p_key, p_name, p_category, coalesce(p_attrs->>'description',''), p_attrs->>'owning_system',
     p_attrs->>'source_repository', p_attrs->>'source_path',
     coalesce(p_attrs->'schema_ownership','[]'::jsonb), coalesce(p_attrs->'apis','[]'::jsonb),
     coalesce(p_attrs->'rpcs','[]'::jsonb), coalesce(p_attrs->'ui_components','[]'::jsonb),
     coalesce(p_attrs->'worker_functions','[]'::jsonb), coalesce(p_attrs->'dependencies','[]'::jsonb),
     coalesce(p_attrs->'test_suites','[]'::jsonb), coalesce(p_attrs->'documentation','[]'::jsonb),
     coalesce(p_attrs->'security_requirements','[]'::jsonb), coalesce(p_attrs->'capabilities','[]'::jsonb),
     coalesce(p_attrs->>'maturity','experimental'), coalesce(p_attrs->>'current_version','0.1.0'),
     nullif(p_attrs->>'discovery_module_key','')::extensions.citext, p_attrs->>'licensing_eligibility', auth.uid())
  on conflict (key) do update set name = excluded.name, category = excluded.category, description = excluded.description
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.register_module(extensions.citext, text, extensions.citext, jsonb) from public, anon;
grant execute on function hlvs.register_module(extensions.citext, text, extensions.citext, jsonb) to authenticated;

-- Marking a module production-eligible is a human approval.
create or replace function hlvs.approve_module_production(p_key extensions.citext)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.catalog.manage');
  update hlvs.modules set lifecycle = 'approved', production_eligible = true, approved_by = auth.uid(), version = version + 1 where key = p_key;
  if not found then raise exception 'module % not found', p_key using errcode = 'no_data_found'; end if;
end; $$;
revoke all on function hlvs.approve_module_production(extensions.citext) from public, anon;
grant execute on function hlvs.approve_module_production(extensions.citext) to authenticated;

create or replace function hlvs.register_product(p_key extensions.citext, p_name text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform hlvs._require('hlvs.catalog.manage');
  insert into hlvs.products (key, name, description, purpose, target_users, target_industry, business_problem, commercial_model, created_by)
  values (p_key, p_name, coalesce(p_attrs->>'description',''), p_attrs->>'purpose', p_attrs->>'target_users',
     nullif(p_attrs->>'target_industry','')::extensions.citext, p_attrs->>'business_problem', p_attrs->>'commercial_model', auth.uid())
  on conflict (key) do update set name = excluded.name, description = excluded.description
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.register_product(extensions.citext, text, jsonb) from public, anon;
grant execute on function hlvs.register_product(extensions.citext, text, jsonb) to authenticated;

create or replace function hlvs.publish_product(p_key extensions.citext)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.catalog.manage');
  update hlvs.products set lifecycle = 'approved', published = true, version = version + 1 where key = p_key;
  if not found then raise exception 'product % not found', p_key using errcode = 'no_data_found'; end if;
end; $$;
revoke all on function hlvs.publish_product(extensions.citext) from public, anon;
grant execute on function hlvs.publish_product(extensions.citext) to authenticated;

-- Deterministic duplicate-risk check. AI may pass an advisory recommendation in
-- p_ai_recommended; it is stored but the deterministic determination governs.
create or replace function hlvs.duplicate_check(p_requirement text, p_capability extensions.citext default null, p_module extensions.citext default null, p_ai_recommended hlvs.determination default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_det hlvs.determination; v_cap extensions.citext; v_mod extensions.citext; v_id uuid;
begin
  perform hlvs._require('hlvs.catalog.manage');
  -- deterministic rule set
  if p_module is not null and exists (select 1 from hlvs.modules where key = p_module and lifecycle = 'approved') then
    v_det := 'reuse_existing'; v_mod := p_module;
  elsif p_capability is not null and exists (select 1 from hlvs.capabilities where key = p_capability and lifecycle = 'approved' and reusable) then
    v_det := 'extend_existing'; v_cap := p_capability;
  elsif exists (select 1 from hlvs.modules where lifecycle = 'approved' and name ilike '%'||p_requirement||'%')
     or exists (select 1 from hlvs.capabilities where lifecycle = 'approved' and name ilike '%'||p_requirement||'%') then
    v_det := 'requires_architecture_review';
  else
    v_det := 'create_new';
  end if;
  insert into hlvs.duplicate_checks (requirement, determination, ai_recommended, matched_capability_key, matched_module_key, created_by)
  values (p_requirement, v_det, p_ai_recommended, v_cap, v_mod, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.duplicate_check(text, extensions.citext, extensions.citext, hlvs.determination) from public, anon;
grant execute on function hlvs.duplicate_check(text, extensions.citext, extensions.citext, hlvs.determination) to authenticated;

-- Human approval of a determination (AI can never approve one).
create or replace function hlvs.approve_determination(p_check uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.catalog.manage');
  update hlvs.duplicate_checks set approved = true, approved_by = auth.uid() where id = p_check;
  if not found then raise exception 'duplicate_check % not found', p_check using errcode = 'no_data_found'; end if;
end; $$;
revoke all on function hlvs.approve_determination(uuid) from public, anon;
grant execute on function hlvs.approve_determination(uuid) to authenticated;

create or replace function hlvs.record_extraction_candidate(p_source_system text, p_observed text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform hlvs._require('hlvs.catalog.manage');
  insert into hlvs.extraction_candidates (source_system, source_repository, source_object, observed_capability,
     proposed_capability_key, potential_duplicate_modules, migration_strategy, shared_platform_suitability, vertical_remainder, evidence, created_by)
  values (p_source_system, p_attrs->>'source_repository', p_attrs->>'source_object', p_observed,
     nullif(p_attrs->>'proposed_capability_key','')::extensions.citext, coalesce(p_attrs->'potential_duplicate_modules','[]'::jsonb),
     p_attrs->>'migration_strategy', p_attrs->>'shared_platform_suitability', p_attrs->>'vertical_remainder',
     coalesce(p_attrs->'evidence','{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.record_extraction_candidate(text, text, jsonb) from public, anon;
grant execute on function hlvs.record_extraction_candidate(text, text, jsonb) to authenticated;

create or replace function hlvs.review_extraction_candidate(p_id uuid, p_status hlvs.extraction_status, p_decision text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.catalog.manage');
  update hlvs.extraction_candidates set extraction_status = p_status, reviewer_decision = p_decision, reviewed_by = auth.uid() where id = p_id;
  if not found then raise exception 'extraction candidate % not found', p_id using errcode = 'no_data_found'; end if;
end; $$;
revoke all on function hlvs.review_extraction_candidate(uuid, hlvs.extraction_status, text) from public, anon;
grant execute on function hlvs.review_extraction_candidate(uuid, hlvs.extraction_status, text) to authenticated;

-- ===========================================================================
-- Product Technical Blueprint lifecycle
-- ===========================================================================
create or replace function hlvs.create_product_blueprint(p_product extensions.citext, p_content jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_ver integer; v_id uuid;
begin
  perform hlvs._require('hlvs.blueprint.manage');
  if not exists (select 1 from hlvs.products where key = p_product) then
    raise exception 'product % not found', p_product using errcode = 'foreign_key_violation'; end if;
  select coalesce(max(version),0)+1 into v_ver from hlvs.product_blueprints where product_key = p_product;
  insert into hlvs.product_blueprints (product_key, version, status, content, created_by)
  values (p_product, v_ver, 'draft', coalesce(p_content,'{}'::jsonb), auth.uid()) returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.create_product_blueprint(extensions.citext, jsonb) from public, anon;
grant execute on function hlvs.create_product_blueprint(extensions.citext, jsonb) to authenticated;

create or replace function hlvs.approve_product_blueprint(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.blueprint.manage');
  update hlvs.product_blueprints
     set status = 'approved', immutable = true, architecture_approved_by = auth.uid(), ceo_approved_by = auth.uid()
   where id = p_id and status <> 'approved';
  if not found then raise exception 'blueprint % not found or already approved', p_id using errcode = 'no_data_found'; end if;
  perform events.emit('hlvs.product_blueprint.approved', null, jsonb_build_object('blueprint', p_id));
end; $$;
revoke all on function hlvs.approve_product_blueprint(uuid) from public, anon;
grant execute on function hlvs.approve_product_blueprint(uuid) to authenticated;

-- ===========================================================================
-- Software Creation Order lifecycle (never handed to Claude unless approved)
-- ===========================================================================
create or replace function hlvs.create_software_creation_order(p_blueprint uuid, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_status hlvs.blueprint_status; v_ver integer; v_id uuid;
begin
  perform hlvs._require('hlvs.order.manage');
  select status into v_status from hlvs.product_blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if v_status <> 'approved' then
    raise exception 'a software creation order requires an approved blueprint' using errcode = 'invalid_parameter_value'; end if;
  select coalesce(max(version),0)+1 into v_ver from hlvs.software_creation_orders where blueprint_id = p_blueprint;
  insert into hlvs.software_creation_orders (blueprint_id, version, status, business_definition, build_scope, technical_context, execution_plan, governance, created_by)
  values (p_blueprint, v_ver, 'draft', coalesce(p_attrs->'business_definition','{}'::jsonb), coalesce(p_attrs->'build_scope','{}'::jsonb),
     coalesce(p_attrs->'technical_context','{}'::jsonb), coalesce(p_attrs->'execution_plan','{}'::jsonb), coalesce(p_attrs->'governance','{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.create_software_creation_order(uuid, jsonb) from public, anon;
grant execute on function hlvs.create_software_creation_order(uuid, jsonb) to authenticated;

create or replace function hlvs.approve_software_creation_order(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.order.manage');
  update hlvs.software_creation_orders
     set status = 'approved', architecture_approved_by = auth.uid(), ceo_approved_by = auth.uid()
   where id = p_id and status in ('draft','architecture_review','ceo_review');
  if not found then raise exception 'order % not found or not approvable', p_id using errcode = 'no_data_found'; end if;
  perform events.emit('hlvs.software_creation_order.approved', null, jsonb_build_object('order', p_id));
end; $$;
revoke all on function hlvs.approve_software_creation_order(uuid) from public, anon;
grant execute on function hlvs.approve_software_creation_order(uuid) to authenticated;

-- Deterministic prompt-package generator. Requires an APPROVED order.
create or replace function hlvs.generate_prompt_package(p_order uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_status hlvs.order_status; v_ver integer; v_id uuid; v_content jsonb; v_bp uuid;
begin
  perform hlvs._require('hlvs.order.manage');
  select status, blueprint_id into v_status, v_bp from hlvs.software_creation_orders where id = p_order;
  if not found then raise exception 'order % not found', p_order using errcode = 'no_data_found'; end if;
  if v_status not in ('approved','prompt_generated') then
    raise exception 'a prompt package requires an approved order (is %)', v_status using errcode = 'invalid_parameter_value'; end if;
  select coalesce(max(version),0)+1 into v_ver from hlvs.prompt_packages where order_id = p_order;
  v_content := jsonb_build_object(
    'order', p_order, 'blueprint', v_bp,
    'mandatory_reuse_analysis', true,
    'prohibited_duplication', true,
    'repository_and_branch_restrictions', true,
    'supabase_hlbos_requirements', true,
    'human_review_gates', true,
    'live_production_restrictions', true,
    'required_completion_report_format', 'hlvs.checkpoint_report.v1',
    'live_execution', false);
  insert into hlvs.prompt_packages (order_id, version, content, text_export, markdown_export, json_export, created_by)
  values (p_order, v_ver, v_content,
     'HLVS PROMPT PACKAGE v'||v_ver||E'\n(see json_export for the structured contract)',
     '# HLVS Prompt Package v'||v_ver||E'\n\n- Mandatory reuse analysis\n- Prohibited duplication\n- Repository/branch restrictions\n- No live production\n',
     v_content, auth.uid())
  returning id into v_id;
  update hlvs.software_creation_orders set status = 'prompt_generated' where id = p_order;
  perform events.emit('hlvs.prompt_package.generated', null, jsonb_build_object('order', p_order, 'package', v_id, 'version', v_ver));
  return v_id;
end; $$;
revoke all on function hlvs.generate_prompt_package(uuid) from public, anon;
grant execute on function hlvs.generate_prompt_package(uuid) to authenticated;

-- ===========================================================================
-- Development run + checkpoint reports + build completion
-- ===========================================================================
create or replace function hlvs.start_development_run(p_order uuid, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_status hlvs.order_status; v_pkg uuid; v_id uuid;
begin
  perform hlvs._require('hlvs.run.manage');
  select status into v_status from hlvs.software_creation_orders where id = p_order;
  if not found then raise exception 'order % not found', p_order using errcode = 'no_data_found'; end if;
  if v_status <> 'prompt_generated' then
    raise exception 'a development run requires a generated prompt package' using errcode = 'invalid_parameter_value'; end if;
  select id into v_pkg from hlvs.prompt_packages where order_id = p_order order by version desc limit 1;
  insert into hlvs.development_runs (order_id, prompt_package_id, development_agent, model_identifier, repository, branch, status, external_execution, created_by)
  values (p_order, v_pkg, coalesce(p_attrs->>'development_agent','claude'), p_attrs->>'model_identifier',
     p_attrs->>'repository', p_attrs->>'branch', 'initialized', false, auth.uid())
  returning id into v_id;
  update hlvs.software_creation_orders set status = 'development_active' where id = p_order;
  perform events.emit('hlvs.development_run.started', null, jsonb_build_object('run', v_id, 'order', p_order));
  return v_id;
end; $$;
revoke all on function hlvs.start_development_run(uuid, jsonb) from public, anon;
grant execute on function hlvs.start_development_run(uuid, jsonb) to authenticated;

create or replace function hlvs.submit_checkpoint_report(p_run uuid, p_number integer, p_name text, p_content jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform hlvs._require('hlvs.run.manage');
  if not exists (select 1 from hlvs.development_runs where id = p_run) then
    raise exception 'run % not found', p_run using errcode = 'no_data_found'; end if;
  insert into hlvs.checkpoint_reports (run_id, checkpoint_number, checkpoint_name, content, commit_id, branch, created_by)
  values (p_run, p_number, p_name, coalesce(p_content,'{}'::jsonb), p_content->>'commit_id', p_content->>'branch', auth.uid())
  returning id into v_id;
  update hlvs.development_runs set current_checkpoint = greatest(current_checkpoint, p_number), status = 'reports_submitted' where id = p_run;
  perform events.emit('hlvs.checkpoint_report.submitted', null, jsonb_build_object('run', p_run, 'report', v_id, 'checkpoint', p_number));
  return v_id;
end; $$;
revoke all on function hlvs.submit_checkpoint_report(uuid, integer, text, jsonb) from public, anon;
grant execute on function hlvs.submit_checkpoint_report(uuid, integer, text, jsonb) to authenticated;

create or replace function hlvs.review_checkpoint_report(p_report uuid, p_review hlvs.report_review)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_run uuid;
begin
  perform hlvs._require('hlvs.run.manage');
  select run_id into v_run from hlvs.checkpoint_reports where id = p_report;
  if not found then raise exception 'report % not found', p_report using errcode = 'no_data_found'; end if;
  update hlvs.checkpoint_reports set review = p_review, reviewed_by = auth.uid(),
     accepted_at = case when p_review in ('accepted','accepted_with_conditions') then now() else accepted_at end
   where id = p_report;
  if p_review in ('accepted','accepted_with_conditions') then
    perform events.emit('hlvs.checkpoint_report.accepted', null, jsonb_build_object('report', p_report, 'run', v_run));
  end if;
end; $$;
revoke all on function hlvs.review_checkpoint_report(uuid, hlvs.report_review) from public, anon;
grant execute on function hlvs.review_checkpoint_report(uuid, hlvs.report_review) to authenticated;

-- Build completion report — only after every checkpoint report is accepted.
create or replace function hlvs.submit_build_completion_report(p_run uuid, p_content jsonb default '{}'::jsonb, p_drafted_by_ai boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_pending integer; v_id uuid;
begin
  perform hlvs._require('hlvs.run.manage');
  if not exists (select 1 from hlvs.development_runs where id = p_run) then
    raise exception 'run % not found', p_run using errcode = 'no_data_found'; end if;
  select count(*) into v_pending from hlvs.checkpoint_reports
   where run_id = p_run and review not in ('accepted','accepted_with_conditions');
  if v_pending > 0 or not exists (select 1 from hlvs.checkpoint_reports where run_id = p_run) then
    raise exception 'all checkpoint reports must be accepted before a build completion report' using errcode = 'invalid_parameter_value'; end if;
  insert into hlvs.build_completion_reports (run_id, content, drafted_by_ai, created_by)
  values (p_run, coalesce(p_content,'{}'::jsonb), p_drafted_by_ai, auth.uid())
  on conflict (run_id) do update set content = excluded.content, drafted_by_ai = excluded.drafted_by_ai
  returning id into v_id;
  update hlvs.development_runs set status = 'completed', completed_at = now() where id = p_run;
  perform events.emit('hlvs.build_completion_report.submitted', null, jsonb_build_object('run', p_run, 'report', v_id));
  return v_id;
end; $$;
revoke all on function hlvs.submit_build_completion_report(uuid, jsonb, boolean) from public, anon;
grant execute on function hlvs.submit_build_completion_report(uuid, jsonb, boolean) to authenticated;

create or replace function hlvs.accept_build_completion_report(p_run uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hlvs._require('hlvs.run.manage');
  update hlvs.build_completion_reports set review = 'accepted', accepted_by = auth.uid() where run_id = p_run;
  if not found then raise exception 'no build completion report for run %', p_run using errcode = 'no_data_found'; end if;
end; $$;
revoke all on function hlvs.accept_build_completion_report(uuid) from public, anon;
grant execute on function hlvs.accept_build_completion_report(uuid) to authenticated;

-- ===========================================================================
-- Deterministic conformance engine
-- ===========================================================================
-- Non-exceptionable rule keys — a human can NEVER except these.
create or replace function hlvs.non_exceptionable_rules()
returns text[] language sql immutable as $$
  select array['unapproved_production_deployment','secret_exposure','unapproved_tenant_creation',
    'unapproved_billing_activation','missing_human_approval','unauthorized_module_duplication','missing_security_controls'];
$$;

create or replace function hlvs.run_conformance(p_run uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_order uuid; v_bp uuid; v_scope jsonb; blocking jsonb := '[]'::jsonb; nonx jsonb := '[]'::jsonb;
        v_verdict hlvs.conformance_verdict; v_reported jsonb; v_required jsonb; v_id uuid; v_bcr jsonb; r text;
begin
  perform hlvs._require('hlvs.conformance.manage');
  select dr.order_id, o.blueprint_id, o.build_scope
    into v_order, v_bp, v_scope
    from hlvs.development_runs dr join hlvs.software_creation_orders o on o.id = dr.order_id
   where dr.id = p_run;
  if not found then raise exception 'run % not found', p_run using errcode = 'no_data_found'; end if;

  -- required modules from the order's build scope
  v_required := coalesce(v_scope->'required_modules', '[]'::jsonb);
  -- reported modules: union of checkpoint reports' created + reused modules
  select coalesce(jsonb_agg(distinct m), '[]'::jsonb) into v_reported
    from hlvs.checkpoint_reports cr,
         lateral (select jsonb_array_elements_text(coalesce(cr.content->'modules_created','[]'::jsonb) || coalesce(cr.content->'modules_reused','[]'::jsonb)) m) x
   where cr.run_id = p_run;

  -- every required module accounted for
  for r in select jsonb_array_elements_text(v_required) loop
    if not (v_reported ? r) then blocking := blocking || to_jsonb('required_module_missing:'||r); end if;
  end loop;
  -- build completion report present
  select content into v_bcr from hlvs.build_completion_reports where run_id = p_run;
  if v_bcr is null then blocking := blocking || '["build_completion_report_missing"]'::jsonb; end if;
  -- non-exceptionable: any reported unauthorized production action / secret exposure
  if exists (select 1 from hlvs.checkpoint_reports where run_id = p_run
             and ((content->>'production_action')::boolean is true or (content->>'secret_exposure')::boolean is true)) then
    nonx := nonx || '["unapproved_production_deployment","secret_exposure"]'::jsonb;
    blocking := blocking || '["unapproved_production_deployment"]'::jsonb;
  end if;
  -- unauthorized module duplication: a created module not in required + not an approved new-module authorization
  if exists (select 1 from hlvs.checkpoint_reports cr,
               lateral jsonb_array_elements_text(coalesce(cr.content->'modules_created','[]'::jsonb)) c
             where cr.run_id = p_run and not (v_required ? c.value)
               and not (coalesce(v_scope->'new_modules_authorized','[]'::jsonb) ? c.value)) then
    nonx := nonx || '["unauthorized_module_duplication"]'::jsonb;
    blocking := blocking || '["unauthorized_module_duplication"]'::jsonb;
  end if;

  if jsonb_array_length(blocking) = 0 then v_verdict := 'conformant';
  elsif v_bcr is null then v_verdict := 'incomplete';
  else v_verdict := 'nonconformant';
  end if;

  insert into hlvs.conformance_results (run_id, blueprint_id, order_id, verdict, checks, blocking, non_exceptionable, created_by)
  values (p_run, v_bp, v_order, v_verdict,
     jsonb_build_object('required', v_required, 'reported', v_reported), blocking, nonx, auth.uid())
  returning id into v_id;
  perform events.emit('hlvs.blueprint_conformance.completed', null, jsonb_build_object('run', p_run, 'conformance', v_id, 'verdict', v_verdict));
  return v_id;
end; $$;
revoke all on function hlvs.run_conformance(uuid) from public, anon;
grant execute on function hlvs.run_conformance(uuid) to authenticated;

-- Grant a conformance exception (human). Non-exceptionable rules are rejected.
create or replace function hlvs.grant_conformance_exception(p_conformance uuid, p_rule text, p_reason text, p_scope text default null, p_expires timestamptz default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform hlvs._require('hlvs.conformance.manage');
  if p_rule = any (hlvs.non_exceptionable_rules()) then
    raise exception 'rule % is non-exceptionable', p_rule using errcode = 'invalid_parameter_value'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'an exception requires a reason' using errcode = 'invalid_parameter_value'; end if;
  insert into hlvs.conformance_exceptions (conformance_id, rule_key, reason, approver, scope, expires_at)
  values (p_conformance, p_rule, p_reason, auth.uid(), p_scope, p_expires) returning id into v_id;
  -- recompute verdict: conformant_with_approved_exceptions if all remaining blocking are excepted
  update hlvs.conformance_results cr set verdict = 'conformant_with_approved_exceptions'
   where cr.id = p_conformance and cr.verdict = 'nonconformant'
     and not exists (
       select 1 from jsonb_array_elements_text(cr.blocking) b
       where b.value = any (hlvs.non_exceptionable_rules())
          or b.value not in (select rule_key from hlvs.conformance_exceptions where conformance_id = cr.id
                             and (expires_at is null or expires_at > now())));
  perform audit.log_security_event('hlvs.conformance_exception','allowed','warning', null,'hlvs.conformance_results',p_conformance::text, jsonb_build_object('rule', p_rule));
  return v_id;
end; $$;
revoke all on function hlvs.grant_conformance_exception(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function hlvs.grant_conformance_exception(uuid, text, text, text, timestamptz) to authenticated;

-- ===========================================================================
-- Catalog update proposal
-- ===========================================================================
create or replace function hlvs.create_catalog_update_proposal(p_run uuid, p_content jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform hlvs._require('hlvs.run.manage');
  insert into hlvs.catalog_update_proposals (run_id, content, status, created_by)
  values (p_run, coalesce(p_content,'{}'::jsonb), 'draft', auth.uid()) returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.create_catalog_update_proposal(uuid, jsonb) from public, anon;
grant execute on function hlvs.create_catalog_update_proposal(uuid, jsonb) to authenticated;

create or replace function hlvs.approve_catalog_update_proposal(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  perform hlvs._require('hlvs.conformance.manage');
  update hlvs.catalog_update_proposals set status = 'approved', approved_by = auth.uid() where id = p_id and status = 'draft';
  if not found then raise exception 'catalog update proposal % not found or not draft', p_id using errcode = 'no_data_found'; end if;
  perform events.emit('hlvs.catalog_update.approved', null, jsonb_build_object('proposal', p_id));
end; $$;
revoke all on function hlvs.approve_catalog_update_proposal(uuid) from public, anon;
grant execute on function hlvs.approve_catalog_update_proposal(uuid) to authenticated;

-- ===========================================================================
-- Factory Build Package + deterministic readiness
-- ===========================================================================
create or replace function hlvs.evaluate_package_readiness(p_run uuid, p_conformance uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare reasons jsonb := '[]'::jsonb; v_order uuid; v_bp uuid; v_ostatus hlvs.order_status; v_bpstatus hlvs.blueprint_status;
        v_verdict hlvs.conformance_verdict; v_bcr uuid; v_cat integer; v_rejected integer;
begin
  select dr.order_id into v_order from hlvs.development_runs dr where dr.id = p_run;
  select o.status, o.blueprint_id into v_ostatus, v_bp from hlvs.software_creation_orders o where o.id = v_order;
  select status into v_bpstatus from hlvs.product_blueprints where id = v_bp;
  if v_bpstatus is distinct from 'approved' then reasons := reasons || '["blueprint_not_approved"]'::jsonb; end if;
  if v_ostatus not in ('approved','prompt_generated','development_active','development_complete','validation_active','accepted') then
    reasons := reasons || '["order_not_approved"]'::jsonb; end if;
  -- checkpoint reports: none rejected, at least one accepted
  select count(*) into v_rejected from hlvs.checkpoint_reports where run_id = p_run and review = 'rejected';
  if v_rejected > 0 then reasons := reasons || '["checkpoint_report_rejected"]'::jsonb; end if;
  if not exists (select 1 from hlvs.checkpoint_reports where run_id = p_run and review in ('accepted','accepted_with_conditions')) then
    reasons := reasons || '["required_checkpoint_incomplete"]'::jsonb; end if;
  -- build completion report accepted
  select id into v_bcr from hlvs.build_completion_reports where run_id = p_run and review = 'accepted';
  if v_bcr is null then reasons := reasons || '["build_completion_report_missing"]'::jsonb; end if;
  -- conformance passed
  select verdict into v_verdict from hlvs.conformance_results where id = p_conformance;
  if v_verdict is null then reasons := reasons || '["conformance_missing"]'::jsonb;
  elsif v_verdict not in ('conformant','conformant_with_approved_exceptions') then reasons := reasons || '["conformance_not_passed"]'::jsonb; end if;
  -- any non-exceptionable blocking present
  if exists (select 1 from hlvs.conformance_results where id = p_conformance and jsonb_array_length(non_exceptionable) > 0) then
    reasons := reasons || '["prohibited_deviation"]'::jsonb; end if;
  -- catalog update reviewed
  select count(*) into v_cat from hlvs.catalog_update_proposals where run_id = p_run and status not in ('approved','published');
  if v_cat > 0 then reasons := reasons || '["catalog_update_not_reviewed"]'::jsonb; end if;
  return reasons;
end; $$;
revoke all on function hlvs.evaluate_package_readiness(uuid, uuid) from public, anon;
grant execute on function hlvs.evaluate_package_readiness(uuid, uuid) to authenticated;

create or replace function hlvs.build_factory_package(p_run uuid, p_conformance uuid, p_content jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_order uuid; v_bp uuid; v_bpver integer; v_id uuid; reasons jsonb; v_ready hlvs.readiness;
begin
  perform hlvs._require('hlvs.package.manage');
  select dr.order_id into v_order from hlvs.development_runs dr where dr.id = p_run;
  if not found then raise exception 'run % not found', p_run using errcode = 'no_data_found'; end if;
  select o.blueprint_id into v_bp from hlvs.software_creation_orders o where o.id = v_order;
  select version into v_bpver from hlvs.product_blueprints where id = v_bp;
  reasons := hlvs.evaluate_package_readiness(p_run, p_conformance);
  v_ready := case when jsonb_array_length(reasons) = 0 then 'ready' else 'blocked' end;
  insert into hlvs.factory_build_packages (product_blueprint_id, product_version, run_id, conformance_id, content, status, readiness, blocking_reasons, release_candidate, created_by)
  values (v_bp, v_bpver, p_run, p_conformance, coalesce(p_content,'{}'::jsonb), 'draft', v_ready, reasons,
     'rc-'||left(replace(p_run::text,'-',''),8), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.build_factory_package(uuid, uuid, jsonb) from public, anon;
grant execute on function hlvs.build_factory_package(uuid, uuid, jsonb) to authenticated;

create or replace function hlvs.approve_factory_package(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_ready hlvs.readiness;
begin
  perform hlvs._require('hlvs.package.manage');
  select readiness into v_ready from hlvs.factory_build_packages where id = p_id;
  if not found then raise exception 'package % not found', p_id using errcode = 'no_data_found'; end if;
  if v_ready <> 'ready' then raise exception 'package is not ready (%.)', v_ready using errcode = 'invalid_parameter_value'; end if;
  update hlvs.factory_build_packages set status = 'architecture_approved', architecture_approved_by = auth.uid() where id = p_id;
end; $$;
revoke all on function hlvs.approve_factory_package(uuid) from public, anon;
grant execute on function hlvs.approve_factory_package(uuid) to authenticated;

-- Submit to HL-BOS — creates the inert intake record + emits both sides' events.
create or replace function hlvs.submit_factory_package(p_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_status hlvs.package_status; v_intake uuid;
begin
  perform hlvs._require('hlvs.package.manage');
  select status into v_status from hlvs.factory_build_packages where id = p_id;
  if not found then raise exception 'package % not found', p_id using errcode = 'no_data_found'; end if;
  if v_status <> 'architecture_approved' then
    raise exception 'package must be architecture_approved before submission (is %)', v_status using errcode = 'invalid_parameter_value'; end if;
  update hlvs.factory_build_packages set status = 'submitted_to_hlbos' where id = p_id;
  insert into hlvs.hlbos_intake (package_id, status, created_by) values (p_id, 'received', auth.uid())
  on conflict (package_id) do update set status = 'received' returning id into v_intake;
  perform events.emit('hlvs.factory_build_package.submitted', null, jsonb_build_object('package', p_id));
  perform events.emit('hlbos.factory_build_package.received', null, jsonb_build_object('package', p_id, 'intake', v_intake));
  return v_intake;
end; $$;
revoke all on function hlvs.submit_factory_package(uuid) from public, anon;
grant execute on function hlvs.submit_factory_package(uuid) to authenticated;

-- ===========================================================================
-- HL-BOS intake (inert) + feedback
-- ===========================================================================
create or replace function hlvs.hlbos_intake_review(p_intake uuid, p_accept boolean, p_commercial_auth uuid default null, p_reasons jsonb default '[]'::jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_pkg uuid; v_ready hlvs.readiness;
begin
  perform hlvs._require('hlvs.intake.manage');
  select package_id into v_pkg from hlvs.hlbos_intake where id = p_intake;
  if not found then raise exception 'intake % not found', p_intake using errcode = 'no_data_found'; end if;
  select readiness into v_ready from hlvs.factory_build_packages where id = v_pkg;
  if p_accept then
    if v_ready <> 'ready' then
      raise exception 'cannot accept an unready package' using errcode = 'invalid_parameter_value'; end if;
    -- If a CP7 commercial authorization is referenced, it must exist AND be
    -- ready; otherwise the technical package does not match a commercial
    -- authorization and intake is refused.
    if p_commercial_auth is not null and not exists (
      select 1 from provisioning.factory_authorizations fa where fa.id = p_commercial_auth and fa.readiness = 'ready') then
      raise exception 'commercial authorization mismatch' using errcode = 'invalid_parameter_value'; end if;
    update hlvs.hlbos_intake set status = 'accepted_for_controlled_deployment_review',
       commercial_authorization_id = p_commercial_auth, reviewed_by = auth.uid() where id = p_intake;
    update hlvs.factory_build_packages set status = 'accepted_by_hlbos' where id = v_pkg;
    perform events.emit('hlbos.factory_build_package.accepted', null, jsonb_build_object('package', v_pkg, 'intake', p_intake));
    perform events.emit('hlbos.production_review.ready', null, jsonb_build_object('package', v_pkg));
  else
    update hlvs.hlbos_intake set status = 'rejected', rejection_reasons = coalesce(p_reasons,'[]'::jsonb), reviewed_by = auth.uid() where id = p_intake;
    update hlvs.factory_build_packages set status = 'rejected_by_hlbos' where id = v_pkg;
    perform events.emit('hlbos.factory_build_package.rejected', null, jsonb_build_object('package', v_pkg, 'reasons', p_reasons));
    perform events.emit('hlbos.production_review.blocked', null, jsonb_build_object('package', v_pkg));
  end if;
end; $$;
revoke all on function hlvs.hlbos_intake_review(uuid, boolean, uuid, jsonb) from public, anon;
grant execute on function hlvs.hlbos_intake_review(uuid, boolean, uuid, jsonb) to authenticated;

create or replace function hlvs.record_hlbos_feedback(p_package uuid, p_type text, p_detail jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform hlvs._require('hlvs.intake.manage');
  insert into hlvs.hlbos_feedback (package_id, feedback_type, detail, external_execution)
  values (p_package, p_type, coalesce(p_detail,'{}'::jsonb), false) returning id into v_id;
  return v_id;
end; $$;
revoke all on function hlvs.record_hlbos_feedback(uuid, text, jsonb) from public, anon;
grant execute on function hlvs.record_hlbos_feedback(uuid, text, jsonb) to authenticated;

-- ===========================================================================
-- Wire the inert HLVS factory worker on the CP5 shared dispatcher
-- ===========================================================================
insert into events.subscriptions (key, topic, consumer_module, active) values
  ('hlvs_factory_worker', 'hlvs.software_creation_order.approved', 'hlvs', true)
on conflict (key) do nothing;
insert into events.handlers (subscription_key, handler_ref, max_attempts, backoff_seconds, timeout_seconds) values
  ('hlvs_factory_worker', 'hlvs-factory-worker', 3, 60, 120)
on conflict (subscription_key) do nothing;

-- ===========================================================================
-- Seeds: a starter catalog + extraction candidates for the named systems
-- ===========================================================================
insert into hlvs.capabilities (key, name, category, description, lifecycle, reusable) values
  ('ai_receptionist','AI Receptionist','ai','AI-assisted call/chat answering.','approved',true),
  ('reputation_recovery','Reputation Recovery','marketing','Recover from negative reputation events.','draft',false),
  ('scheduling','Scheduling','customer_experience','Appointments and calendars.','approved',true),
  ('event_management','Event Management','operations','Manage events and registrations.','draft',false),
  ('registration','Registration','operations','Participant registration.','draft',false),
  ('route_assessment','Route Assessment','transportation','Assess and optimize routes.','draft',false),
  ('kpi_scoring','KPI Scoring','analytics','Score performance against KPIs.','draft',false),
  ('communications','Communications','communications','Email/SMS with consent.','approved',true),
  ('tenant_identity','Tenant Identity','identity','Users, roles, tenancy.','approved',true),
  ('document_extraction','Document Extraction','operations','Extract data from documents.','draft',false)
on conflict (key) do nothing;

insert into hlvs.products (key, name, description, target_industry) values
  ('reception_ai','ReceptionAI','AI receptionist product.','services'),
  ('salon_ai','SalonAI','Salon operating product.','salon'),
  ('transportation_ai','TransportationAI','Transportation operating product.','transportation'),
  ('home_huddle','HomeHuddle','Home services product.','home_services'),
  ('athlete_huddle','AthleteHuddle','Sports organization product.','sports'),
  ('reputation_recovery_product','Reputation Recovery','Reputation recovery product.','services'),
  ('review_management','Review Management','Review management product.','services')
on conflict (key) do nothing;

insert into hlvs.industry_templates (key, name, industry) values
  ('salon','Salon','salon'), ('barbershop','Barbershop','barbershop'), ('transportation','Transportation','transportation'),
  ('sports_organization','Sports Organization','sports'), ('home_services','Home Services','home_services'),
  ('consulting','Consulting','consulting'), ('school_district','School District','education')
on conflict (key) do nothing;

insert into hlvs.extraction_candidates (source_system, observed_capability, extraction_status) values
  ('Venuewise','Event management + registration','candidate'),
  ('HomeHuddle','Home services scheduling + communications','candidate'),
  ('AthleteHuddle','Roster + KPI scoring','candidate'),
  ('CoachesHuddle','Coaching workflows','candidate'),
  ('5-Star Sports Media','Media publishing','candidate'),
  ('SalonAI','Salon scheduling + AI receptionist','candidate'),
  ('HSCS','Case management','candidate'),
  ('HSCS Government','Government case management','candidate'),
  ('VisibilityAI','Website assessment + discovery','candidate'),
  ('TransportationAI','Route assessment','candidate'),
  ('FleetHuddle','Fleet management','candidate'),
  ('HL-BOS core','Identity, tenancy, billing, events','candidate')
on conflict do nothing;
