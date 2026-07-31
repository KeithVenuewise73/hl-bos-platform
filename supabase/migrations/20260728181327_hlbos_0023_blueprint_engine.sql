-- ===========================================================================
-- v0_blueprint_engine — Business Transformation Blueprint Engine (Checkpoint 6)
--
-- A generation + governance layer OVER the Business Discovery Engine (0020). It
-- converts assessment evidence + scores into a structured, versioned, evidence-
-- traceable Business Transformation Blueprint. It introduces NO second
-- assessment, recommendation, approval, catalog, proposal, or provisioning
-- system:
--   * EXTENDS discovery.blueprints (versioning + controlled lifecycle + workflow
--     link + rule/model versions) and discovery.recommendations (origin, state,
--     confidence, rule, priority band/factors, effort/cost, evidence refs,
--     service/module links) — additively, so 0020's RPCs keep working.
--   * ADDS data-driven catalogs (service_catalog, module_catalog,
--     roadmap_phases), a versioned recommendation_rules table, and blueprint
--     sub-structures (blueprint_sections, blueprint_findings, roadmap_items,
--     impact_estimates) — each tenant-scoped, RLS+FORCE, audited.
--   * REUSES workflows for approval, events + the CP5 shared dispatcher for
--     handler invocation, ai for narrative (mock locally), storage/comms by
--     reference only. An AI run can never approve a Blueprint (permission + an
--     approved workflow instance are both required).
--
-- Local development only. No remote apply, no deploy, no provider activation,
-- no created prices (pricing is a reference/placeholder pending CEO decision).
--
-- No enum value is added to any existing type (ALTER TYPE ADD VALUE cannot run
-- inside a migration transaction). New lifecycle/state vocabularies are new
-- enum types. Roadmap phases are a CONFIGURABLE CATALOG (a table), not an enum.
--
-- rollback:
--   -- (destructive; requires approval) drop the CP6 objects and columns:
--   DROP TABLE IF EXISTS discovery.impact_estimates, discovery.roadmap_items,
--     discovery.blueprint_findings, discovery.blueprint_sections,
--     discovery.recommendation_rules, discovery.roadmap_phases,
--     discovery.module_catalog, discovery.service_catalog CASCADE;
--   ALTER TABLE discovery.recommendations DROP COLUMN IF EXISTS blueprint_id, ... ;
--   ALTER TABLE discovery.blueprints DROP COLUMN IF EXISTS version, ... ;
--   DROP TYPE IF EXISTS discovery.blueprint_status, discovery.recommendation_origin,
--     discovery.recommendation_state, discovery.priority_band, discovery.effort_band,
--     discovery.cost_band, discovery.delivery_type, discovery.finding_urgency,
--     discovery.availability_status, discovery.readiness_status;
--   DELETE FROM events.handlers WHERE subscription_key = 'discovery_blueprint_worker';
--   DELETE FROM events.subscriptions WHERE key = 'discovery_blueprint_worker';
-- ===========================================================================

-- --- new enum vocabularies (created fresh; never ALTER an existing type) -----
do $$ begin create type discovery.blueprint_status as enum
  ('draft','generating','generated','partially_generated','awaiting_review',
   'changes_requested','approved','rejected','superseded','ready_for_proposal','archived');
exception when duplicate_object then null; end $$;

do $$ begin create type discovery.recommendation_origin as enum
  ('deterministic','ai_assisted','human'); exception when duplicate_object then null; end $$;

do $$ begin create type discovery.recommendation_state as enum
  ('proposed','accepted','rejected','deferred','overridden','included_in_proposal',
   'excluded_from_proposal','customer_selected','awaiting_pricing','awaiting_technical_review');
exception when duplicate_object then null; end $$;

do $$ begin create type discovery.priority_band as enum
  ('critical','high','medium','low','future'); exception when duplicate_object then null; end $$;

do $$ begin create type discovery.effort_band as enum
  ('xs','s','m','l','xl'); exception when duplicate_object then null; end $$;

do $$ begin create type discovery.cost_band as enum
  ('low','medium','high'); exception when duplicate_object then null; end $$;

do $$ begin create type discovery.delivery_type as enum
  ('one_time','recurring','hybrid'); exception when duplicate_object then null; end $$;

do $$ begin create type discovery.finding_urgency as enum
  ('immediate','near_term','planned','monitor'); exception when duplicate_object then null; end $$;

do $$ begin create type discovery.availability_status as enum
  ('available','coming_soon','unavailable','deprecated'); exception when duplicate_object then null; end $$;

do $$ begin create type discovery.readiness_status as enum
  ('ready','in_development','planned','unavailable'); exception when duplicate_object then null; end $$;

-- ===========================================================================
-- Data-driven catalogs (platform config; readable by any authenticated context)
-- ===========================================================================
create table if not exists discovery.service_catalog (
  key                    extensions.citext primary key,
  public_name            text not null,
  internal_name          text,
  description            text not null default '',
  category               extensions.citext not null,
  delivery_type          discovery.delivery_type not null default 'one_time',
  is_recurring           boolean not null default false,
  eligible_business_types jsonb not null default '[]'::jsonb,
  required_evidence      jsonb not null default '[]'::jsonb,   -- evidence keys that justify recommending it
  relevant_dimensions    jsonb not null default '[]'::jsonb,   -- maturity/health dimension keys
  prerequisites          jsonb not null default '[]'::jsonb,   -- other service keys
  dependencies           jsonb not null default '[]'::jsonb,
  default_priority       discovery.priority_band not null default 'medium',
  availability           discovery.availability_status not null default 'available',
  requires_human_review  boolean not null default true,
  pricing_ref            text,                                 -- REFERENCE only, never a price
  version                text not null default 'svc-cat-0.1.0',
  effective_from         timestamptz not null default now(),
  effective_to           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint service_catalog_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists discovery.module_catalog (
  key                    extensions.citext primary key,
  display_name           text not null,
  description            text not null default '',
  capability_category    extensions.citext not null,
  required_dependencies  jsonb not null default '[]'::jsonb,   -- other module keys
  eligible_verticals     jsonb not null default '[]'::jsonb,
  provisioning_readiness discovery.readiness_status not null default 'planned',
  availability           discovery.availability_status not null default 'coming_soon',
  entitlement_key        extensions.citext,                    -- links to entitlements (not activated here)
  implementation_effort  discovery.effort_band not null default 'm',
  requires_human_review  boolean not null default true,
  version                text not null default 'mod-cat-0.1.0',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint module_catalog_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists discovery.roadmap_phases (
  key             extensions.citext primary key,
  name            text not null,
  description     text not null default '',
  default_sequence integer not null,
  is_active       boolean not null default true,
  version         text not null default 'phase-cat-0.1.0',
  created_at      timestamptz not null default now(),
  constraint roadmap_phases_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists discovery.recommendation_rules (
  key          extensions.citext primary key,
  name         text not null,
  description  text not null default '',
  rule_version text not null default 'rules-0.1.0',
  kind         discovery.recommendation_kind not null,
  conditions   jsonb not null default '{}'::jsonb,   -- evidence keys/values, dimension thresholds, business type…
  output       jsonb not null default '{}'::jsonb,   -- service_key/module_key/title/severity/effort/cost/priority
  confidence   numeric(3,2) not null default 0.90,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint recommendation_rules_conf check (confidence >= 0 and confidence <= 1)
);

-- ===========================================================================
-- Extend the CP4 containers (additive — 0020 RPCs keep working unchanged)
-- ===========================================================================
alter table discovery.blueprints add column if not exists version                integer not null default 1;
alter table discovery.blueprints add column if not exists lifecycle              discovery.blueprint_status not null default 'draft';
alter table discovery.blueprints add column if not exists workflow_instance_id   uuid references workflows.instances(id) on delete set null;
alter table discovery.blueprints add column if not exists rule_version           text;
alter table discovery.blueprints add column if not exists priority_model_version text;
alter table discovery.blueprints add column if not exists impact_model_version   text;
alter table discovery.blueprints add column if not exists partial                boolean not null default false;
alter table discovery.blueprints add column if not exists superseded_by          uuid references discovery.blueprints(id) on delete set null;
alter table discovery.blueprints add column if not exists ai_run_ids             jsonb not null default '[]'::jsonb;
alter table discovery.blueprints add column if not exists generated_at           timestamptz;
alter table discovery.blueprints add column if not exists created_by             uuid references auth.users(id) on delete set null;
create unique index if not exists blueprints_assessment_version_idx on discovery.blueprints (assessment_id, version);

alter table discovery.recommendations add column if not exists blueprint_id        uuid references discovery.blueprints(id) on delete cascade;
alter table discovery.recommendations add column if not exists origin              discovery.recommendation_origin not null default 'deterministic';
alter table discovery.recommendations add column if not exists state               discovery.recommendation_state not null default 'proposed';
alter table discovery.recommendations add column if not exists confidence          numeric(3,2);
alter table discovery.recommendations add column if not exists severity            extensions.citext;
alter table discovery.recommendations add column if not exists rule_key            extensions.citext references discovery.recommendation_rules(key) on delete set null;
alter table discovery.recommendations add column if not exists rule_version        text;
alter table discovery.recommendations add column if not exists priority_band       discovery.priority_band;
alter table discovery.recommendations add column if not exists priority_factors    jsonb not null default '{}'::jsonb;
alter table discovery.recommendations add column if not exists effort_band         discovery.effort_band;
alter table discovery.recommendations add column if not exists cost_band           discovery.cost_band;
alter table discovery.recommendations add column if not exists evidence_refs       jsonb not null default '[]'::jsonb;
alter table discovery.recommendations add column if not exists affected_dimensions jsonb not null default '[]'::jsonb;
alter table discovery.recommendations add column if not exists service_key         extensions.citext references discovery.service_catalog(key) on delete set null;
alter table discovery.recommendations add column if not exists module_key          extensions.citext references discovery.module_catalog(key) on delete set null;
alter table discovery.recommendations add column if not exists problem_addressed   text;
alter table discovery.recommendations add column if not exists expected_benefit    text;
alter table discovery.recommendations add column if not exists timing              text;
alter table discovery.recommendations add column if not exists dependencies        jsonb not null default '[]'::jsonb;
alter table discovery.recommendations add column if not exists risks               jsonb not null default '[]'::jsonb;
alter table discovery.recommendations add column if not exists dedupe_group        extensions.citext;
alter table discovery.recommendations add column if not exists override_reason     text;
alter table discovery.recommendations add column if not exists reviewed_by         uuid references auth.users(id) on delete set null;
alter table discovery.recommendations add column if not exists updated_at          timestamptz not null default now();
create index if not exists recommendations_blueprint_idx on discovery.recommendations (blueprint_id, kind);
create index if not exists recommendations_dedupe_idx on discovery.recommendations (blueprint_id, dedupe_group);

-- ===========================================================================
-- Blueprint sub-structures (each references evidence for full traceability)
-- ===========================================================================
create table if not exists discovery.blueprint_sections (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  blueprint_id  uuid not null references discovery.blueprints(id) on delete cascade,
  section_kind  extensions.citext not null,  -- executive_summary | current_state | priority_findings | opportunities | roadmap | solution_stack | impact
  title         text,
  content       jsonb not null default '{}'::jsonb,
  origin        discovery.recommendation_origin not null default 'deterministic',
  confidence    numeric(3,2),
  evidence_refs jsonb not null default '[]'::jsonb,
  ai_run_id     bigint references ai.runs(id) on delete set null,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint blueprint_sections_unique unique (blueprint_id, section_kind)
);

create table if not exists discovery.blueprint_findings (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  blueprint_id  uuid not null references discovery.blueprints(id) on delete cascade,
  category      extensions.citext not null,
  title         text not null,
  description   text not null default '',
  severity      extensions.citext not null default 'medium',   -- critical|high|medium|info
  business_impact text,
  urgency       discovery.finding_urgency not null default 'planned',
  confidence    numeric(3,2) not null default 1.00,
  origin        discovery.recommendation_origin not null default 'deterministic',
  evidence_refs jsonb not null default '[]'::jsonb,
  affected_dimensions jsonb not null default '[]'::jsonb,
  priority_band discovery.priority_band,
  review_status extensions.citext not null default 'pending',   -- pending|accepted|rejected
  created_at    timestamptz not null default now(),
  constraint blueprint_findings_conf check (confidence >= 0 and confidence <= 1)
);
create index if not exists blueprint_findings_bp_idx on discovery.blueprint_findings (blueprint_id, severity);

create table if not exists discovery.roadmap_items (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  blueprint_id  uuid not null references discovery.blueprints(id) on delete cascade,
  sequence      integer not null,
  phase_key     extensions.citext not null references discovery.roadmap_phases(key) on delete restrict,
  objective     text not null,
  recommended_action text,
  dependencies  jsonb not null default '[]'::jsonb,   -- earlier roadmap sequences this depends on
  estimated_effort discovery.effort_band,
  duration_low_days  integer,
  duration_high_days integer,
  expected_impact text,
  responsible_party extensions.citext,                -- herman_legacy | customer | shared
  required_approvals jsonb not null default '[]'::jsonb,
  related_recommendations jsonb not null default '[]'::jsonb,
  related_evidence jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  constraint roadmap_items_unique unique (blueprint_id, sequence),
  constraint roadmap_items_duration check (duration_low_days is null or duration_high_days is null or duration_low_days <= duration_high_days)
);
create index if not exists roadmap_items_bp_idx on discovery.roadmap_items (blueprint_id, sequence);

create table if not exists discovery.impact_estimates (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null references platform.tenants(id) on delete cascade,
  blueprint_id      uuid not null references discovery.blueprints(id) on delete cascade,
  recommendation_id bigint references discovery.recommendations(id) on delete set null,
  category          extensions.citext not null,   -- lead_generation | conversion | time_savings | ...
  assumption        text not null,
  input_source      extensions.citext not null,   -- evidence | profile | illustrative | caveat
  calculation_method text not null default '',
  scenario_low      text,
  scenario_expected text,
  scenario_high     text,
  confidence        numeric(3,2) not null default 0.50,
  illustrative      boolean not null default true, -- true when no customer financial input exists
  caveats           text,
  created_at        timestamptz not null default now(),
  constraint impact_estimates_conf check (confidence >= 0 and confidence <= 1)
);
create index if not exists impact_estimates_bp_idx on discovery.impact_estimates (blueprint_id, category);

-- ===========================================================================
-- triggers: updated_at + audit (blueprints/recommendations were NOT audited)
-- ===========================================================================
create or replace trigger recommendations_set_updated_at before update on discovery.recommendations
  for each row execute function platform.set_updated_at();
create or replace trigger service_catalog_set_updated_at before update on discovery.service_catalog
  for each row execute function platform.set_updated_at();
create or replace trigger module_catalog_set_updated_at before update on discovery.module_catalog
  for each row execute function platform.set_updated_at();
create or replace trigger recommendation_rules_set_updated_at before update on discovery.recommendation_rules
  for each row execute function platform.set_updated_at();

create or replace trigger blueprints_audit         after insert or update or delete on discovery.blueprints         for each row execute function audit.emit();
create or replace trigger recommendations_audit    after insert or update or delete on discovery.recommendations    for each row execute function audit.emit();
create or replace trigger blueprint_sections_audit after insert or update or delete on discovery.blueprint_sections for each row execute function audit.emit();
create or replace trigger blueprint_findings_audit after insert or update or delete on discovery.blueprint_findings for each row execute function audit.emit();
create or replace trigger roadmap_items_audit      after insert or update or delete on discovery.roadmap_items      for each row execute function audit.emit();
create or replace trigger impact_estimates_audit   after insert or update or delete on discovery.impact_estimates   for each row execute function audit.emit();

-- ===========================================================================
-- RLS + FORCE + policies + grants
-- ===========================================================================
alter table discovery.service_catalog      enable row level security; alter table discovery.service_catalog      force row level security;
alter table discovery.module_catalog       enable row level security; alter table discovery.module_catalog       force row level security;
alter table discovery.roadmap_phases       enable row level security; alter table discovery.roadmap_phases       force row level security;
alter table discovery.recommendation_rules enable row level security; alter table discovery.recommendation_rules force row level security;
alter table discovery.blueprint_sections   enable row level security; alter table discovery.blueprint_sections   force row level security;
alter table discovery.blueprint_findings   enable row level security; alter table discovery.blueprint_findings   force row level security;
alter table discovery.roadmap_items        enable row level security; alter table discovery.roadmap_items        force row level security;
alter table discovery.impact_estimates     enable row level security; alter table discovery.impact_estimates     force row level security;

-- catalogs + rules: readable by any authenticated context (they are configuration)
drop policy if exists service_catalog_select on discovery.service_catalog;
create policy service_catalog_select on discovery.service_catalog for select to authenticated using (true);
drop policy if exists module_catalog_select on discovery.module_catalog;
create policy module_catalog_select on discovery.module_catalog for select to authenticated using (true);
drop policy if exists roadmap_phases_select on discovery.roadmap_phases;
create policy roadmap_phases_select on discovery.roadmap_phases for select to authenticated using (true);
drop policy if exists recommendation_rules_select on discovery.recommendation_rules;
create policy recommendation_rules_select on discovery.recommendation_rules for select to authenticated using (true);

-- tenant blueprint sub-structures: read by discovery.blueprint.read
drop policy if exists blueprint_sections_select on discovery.blueprint_sections;
create policy blueprint_sections_select on discovery.blueprint_sections for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.blueprint.read'));
drop policy if exists blueprint_findings_select on discovery.blueprint_findings;
create policy blueprint_findings_select on discovery.blueprint_findings for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.blueprint.read'));
drop policy if exists roadmap_items_select on discovery.roadmap_items;
create policy roadmap_items_select on discovery.roadmap_items for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.blueprint.read'));
drop policy if exists impact_estimates_select on discovery.impact_estimates;
create policy impact_estimates_select on discovery.impact_estimates for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.blueprint.read'));

grant select on discovery.service_catalog, discovery.module_catalog, discovery.roadmap_phases,
                discovery.recommendation_rules, discovery.blueprint_sections, discovery.blueprint_findings,
                discovery.roadmap_items, discovery.impact_estimates to authenticated;

-- ===========================================================================
-- Permissions (action vocab: read|create|update|delete|revoke|assign|manage)
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('discovery.blueprint.read',   'Read blueprints, findings, roadmap, recommendations, impact estimates.', 'tenant'),
  ('discovery.blueprint.create', 'Request and populate transformation blueprints.', 'tenant'),
  ('discovery.blueprint.manage', 'Approve, reject, override, version, and advance blueprints.', 'tenant'),
  ('discovery.catalog.manage',   'Register services, modules, roadmap phases, and recommendation rules (platform).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','discovery.blueprint.read'),('tenant_owner','discovery.blueprint.create'),('tenant_owner','discovery.blueprint.manage'),
  ('tenant_admin','discovery.blueprint.read'),('tenant_admin','discovery.blueprint.create'),('tenant_admin','discovery.blueprint.manage'),
  ('manager','discovery.blueprint.read'),('manager','discovery.blueprint.create'),
  ('staff','discovery.blueprint.read'),
  ('viewer','discovery.blueprint.read'),
  ('platform_owner','discovery.catalog.manage'),
  ('platform_admin','discovery.catalog.manage')
on conflict do nothing;

-- ===========================================================================
-- Catalog registration RPCs (platform config; catalog.manage)
-- ===========================================================================
create or replace function discovery.register_service(
  p_key extensions.citext, p_public_name text, p_category extensions.citext, p_attrs jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('discovery.catalog.manage') then
    raise exception 'only a platform administrator may register a service' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.service_catalog
    (key, public_name, internal_name, description, category, delivery_type, is_recurring,
     eligible_business_types, required_evidence, relevant_dimensions, prerequisites, dependencies,
     default_priority, availability, requires_human_review, pricing_ref, version, effective_to)
  values (
    p_key, p_public_name, p_attrs->>'internal_name', coalesce(p_attrs->>'description',''), p_category,
    coalesce((p_attrs->>'delivery_type')::discovery.delivery_type,'one_time'),
    coalesce((p_attrs->>'is_recurring')::boolean,false),
    coalesce(p_attrs->'eligible_business_types','[]'::jsonb), coalesce(p_attrs->'required_evidence','[]'::jsonb),
    coalesce(p_attrs->'relevant_dimensions','[]'::jsonb), coalesce(p_attrs->'prerequisites','[]'::jsonb),
    coalesce(p_attrs->'dependencies','[]'::jsonb),
    coalesce((p_attrs->>'default_priority')::discovery.priority_band,'medium'),
    coalesce((p_attrs->>'availability')::discovery.availability_status,'available'),
    coalesce((p_attrs->>'requires_human_review')::boolean,true),
    p_attrs->>'pricing_ref', coalesce(p_attrs->>'version','svc-cat-0.1.0'),
    (p_attrs->>'effective_to')::timestamptz)
  on conflict (key) do update set
    public_name = excluded.public_name, internal_name = excluded.internal_name,
    description = excluded.description, category = excluded.category,
    delivery_type = excluded.delivery_type, is_recurring = excluded.is_recurring,
    eligible_business_types = excluded.eligible_business_types, required_evidence = excluded.required_evidence,
    relevant_dimensions = excluded.relevant_dimensions, prerequisites = excluded.prerequisites,
    dependencies = excluded.dependencies, default_priority = excluded.default_priority,
    availability = excluded.availability, requires_human_review = excluded.requires_human_review,
    pricing_ref = excluded.pricing_ref, version = excluded.version, effective_to = excluded.effective_to;
end; $$;
revoke all on function discovery.register_service(extensions.citext, text, extensions.citext, jsonb) from public, anon, authenticated;
grant execute on function discovery.register_service(extensions.citext, text, extensions.citext, jsonb) to authenticated;

create or replace function discovery.register_module(
  p_key extensions.citext, p_display_name text, p_category extensions.citext, p_attrs jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('discovery.catalog.manage') then
    raise exception 'only a platform administrator may register a module' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.module_catalog
    (key, display_name, description, capability_category, required_dependencies, eligible_verticals,
     provisioning_readiness, availability, entitlement_key, implementation_effort, requires_human_review, version)
  values (
    p_key, p_display_name, coalesce(p_attrs->>'description',''), p_category,
    coalesce(p_attrs->'required_dependencies','[]'::jsonb), coalesce(p_attrs->'eligible_verticals','[]'::jsonb),
    coalesce((p_attrs->>'provisioning_readiness')::discovery.readiness_status,'planned'),
    coalesce((p_attrs->>'availability')::discovery.availability_status,'coming_soon'),
    p_attrs->>'entitlement_key',
    coalesce((p_attrs->>'implementation_effort')::discovery.effort_band,'m'),
    coalesce((p_attrs->>'requires_human_review')::boolean,true),
    coalesce(p_attrs->>'version','mod-cat-0.1.0'))
  on conflict (key) do update set
    display_name = excluded.display_name, description = excluded.description,
    capability_category = excluded.capability_category, required_dependencies = excluded.required_dependencies,
    eligible_verticals = excluded.eligible_verticals, provisioning_readiness = excluded.provisioning_readiness,
    availability = excluded.availability, entitlement_key = excluded.entitlement_key,
    implementation_effort = excluded.implementation_effort, requires_human_review = excluded.requires_human_review,
    version = excluded.version;
end; $$;
revoke all on function discovery.register_module(extensions.citext, text, extensions.citext, jsonb) from public, anon, authenticated;
grant execute on function discovery.register_module(extensions.citext, text, extensions.citext, jsonb) to authenticated;

create or replace function discovery.register_roadmap_phase(
  p_key extensions.citext, p_name text, p_sequence integer, p_attrs jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('discovery.catalog.manage') then
    raise exception 'only a platform administrator may register a roadmap phase' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.roadmap_phases (key, name, description, default_sequence, is_active, version)
  values (p_key, p_name, coalesce(p_attrs->>'description',''), p_sequence,
          coalesce((p_attrs->>'is_active')::boolean,true), coalesce(p_attrs->>'version','phase-cat-0.1.0'))
  on conflict (key) do update set name = excluded.name, description = excluded.description,
    default_sequence = excluded.default_sequence, is_active = excluded.is_active, version = excluded.version;
end; $$;
revoke all on function discovery.register_roadmap_phase(extensions.citext, text, integer, jsonb) from public, anon, authenticated;
grant execute on function discovery.register_roadmap_phase(extensions.citext, text, integer, jsonb) to authenticated;

create or replace function discovery.register_recommendation_rule(
  p_key extensions.citext, p_name text, p_kind discovery.recommendation_kind,
  p_conditions jsonb, p_output jsonb, p_attrs jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('discovery.catalog.manage') then
    raise exception 'only a platform administrator may register a recommendation rule' using errcode = 'insufficient_privilege';
  end if;
  insert into discovery.recommendation_rules (key, name, description, rule_version, kind, conditions, output, confidence, is_active)
  values (p_key, p_name, coalesce(p_attrs->>'description',''), coalesce(p_attrs->>'rule_version','rules-0.1.0'),
          p_kind, coalesce(p_conditions,'{}'::jsonb), coalesce(p_output,'{}'::jsonb),
          coalesce((p_attrs->>'confidence')::numeric,0.90), coalesce((p_attrs->>'is_active')::boolean,true))
  on conflict (key) do update set name = excluded.name, description = excluded.description,
    rule_version = excluded.rule_version, kind = excluded.kind, conditions = excluded.conditions,
    output = excluded.output, confidence = excluded.confidence, is_active = excluded.is_active;
end; $$;
revoke all on function discovery.register_recommendation_rule(extensions.citext, text, discovery.recommendation_kind, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function discovery.register_recommendation_rule(extensions.citext, text, discovery.recommendation_kind, jsonb, jsonb, jsonb) to authenticated;

-- ===========================================================================
-- Blueprint lifecycle RPCs
-- ===========================================================================
-- Request a blueprint for a COMPLETED assessment. Creates the next version;
-- a prior reviewed version is never overwritten (new row, new version number).
create or replace function discovery.request_blueprint(p_assessment uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_profile uuid; v_status discovery.assessment_status; v_ver integer; v_id uuid;
begin
  select tenant_id, profile_id, status into v_tenant, v_profile, v_status
    from discovery.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.create') then
    raise exception 'insufficient privilege to request a blueprint' using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'completed' then
    raise exception 'a blueprint requires a completed assessment' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(max(version),0) + 1 into v_ver from discovery.blueprints where assessment_id = p_assessment;
  insert into discovery.blueprints (tenant_id, profile_id, assessment_id, status, lifecycle, version, created_by)
  values (v_tenant, v_profile, p_assessment, 'draft', 'draft', v_ver, auth.uid())
  returning id into v_id;
  perform events.emit('blueprint.requested', v_tenant,
    jsonb_build_object('blueprint', v_id, 'assessment', p_assessment, 'version', v_ver));
  return v_id;
end; $$;
revoke all on function discovery.request_blueprint(uuid) from public, anon;
grant execute on function discovery.request_blueprint(uuid) to authenticated;

create or replace function discovery.start_blueprint_generation(p_blueprint uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.blueprints set lifecycle = 'generating' where id = p_blueprint and lifecycle = 'draft';
  perform events.emit('blueprint.generation_started', v_tenant, jsonb_build_object('blueprint', p_blueprint));
end; $$;
revoke all on function discovery.start_blueprint_generation(uuid) from public, anon;
grant execute on function discovery.start_blueprint_generation(uuid) to authenticated;

-- Internal guard: the blueprint must be in a populatable state, and the caller
-- must hold blueprint.create for its tenant. Returns the tenant + assessment.
create or replace function discovery._blueprint_writable(p_blueprint uuid, out o_tenant uuid, out o_assessment uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare v_life discovery.blueprint_status;
begin
  select tenant_id, assessment_id, lifecycle into o_tenant, o_assessment, v_life
    from discovery.blueprints where id = p_blueprint;
  if o_tenant is null then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(o_tenant, 'discovery.blueprint.create') then
    raise exception 'insufficient privilege to populate a blueprint' using errcode = 'insufficient_privilege';
  end if;
  if v_life not in ('draft','generating','changes_requested') then
    raise exception 'blueprint % is not in a writable state (%).', p_blueprint, v_life using errcode = 'invalid_parameter_value';
  end if;
end; $$;
revoke all on function discovery._blueprint_writable(uuid) from public, anon, authenticated;

create or replace function discovery.add_blueprint_section(
  p_blueprint uuid, p_kind extensions.citext, p_content jsonb, p_origin discovery.recommendation_origin default 'deterministic',
  p_evidence_refs jsonb default '[]'::jsonb, p_confidence numeric default null, p_ai_run bigint default null, p_order integer default 0)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_assess uuid; v_id bigint;
begin
  select * into v_tenant, v_assess from discovery._blueprint_writable(p_blueprint);
  if p_origin = 'ai_assisted' and (p_evidence_refs is null or jsonb_array_length(p_evidence_refs) = 0) then
    raise exception 'an AI-assisted section must reference supporting evidence' using errcode = 'invalid_parameter_value';
  end if;
  insert into discovery.blueprint_sections (tenant_id, blueprint_id, section_kind, title, content, origin, confidence, evidence_refs, ai_run_id, display_order)
  values (v_tenant, p_blueprint, p_kind, p_content->>'title', coalesce(p_content,'{}'::jsonb), p_origin, p_confidence, coalesce(p_evidence_refs,'[]'::jsonb), p_ai_run, p_order)
  on conflict (blueprint_id, section_kind) do update set
    content = excluded.content, origin = excluded.origin, confidence = excluded.confidence,
    evidence_refs = excluded.evidence_refs, ai_run_id = excluded.ai_run_id, display_order = excluded.display_order
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function discovery.add_blueprint_section(uuid, extensions.citext, jsonb, discovery.recommendation_origin, jsonb, numeric, bigint, integer) from public, anon;
grant execute on function discovery.add_blueprint_section(uuid, extensions.citext, jsonb, discovery.recommendation_origin, jsonb, numeric, bigint, integer) to authenticated;

create or replace function discovery.add_blueprint_finding(
  p_blueprint uuid, p_category extensions.citext, p_title text, p_severity extensions.citext,
  p_attrs jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_assess uuid; v_id bigint; v_origin discovery.recommendation_origin;
begin
  select * into v_tenant, v_assess from discovery._blueprint_writable(p_blueprint);
  v_origin := coalesce((p_attrs->>'origin')::discovery.recommendation_origin,'deterministic');
  if v_origin = 'ai_assisted' and (p_attrs->'evidence_refs' is null or jsonb_array_length(coalesce(p_attrs->'evidence_refs','[]'::jsonb)) = 0) then
    raise exception 'an AI-assisted finding must reference supporting evidence' using errcode = 'invalid_parameter_value';
  end if;
  insert into discovery.blueprint_findings
    (tenant_id, blueprint_id, category, title, description, severity, business_impact, urgency, confidence,
     origin, evidence_refs, affected_dimensions, priority_band, review_status)
  values (v_tenant, p_blueprint, p_category, p_title, coalesce(p_attrs->>'description',''), p_severity,
     p_attrs->>'business_impact', coalesce((p_attrs->>'urgency')::discovery.finding_urgency,'planned'),
     coalesce((p_attrs->>'confidence')::numeric,1.00), v_origin,
     coalesce(p_attrs->'evidence_refs','[]'::jsonb), coalesce(p_attrs->'affected_dimensions','[]'::jsonb),
     (p_attrs->>'priority_band')::discovery.priority_band, coalesce(p_attrs->>'review_status','pending'))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function discovery.add_blueprint_finding(uuid, extensions.citext, text, extensions.citext, jsonb) from public, anon;
grant execute on function discovery.add_blueprint_finding(uuid, extensions.citext, text, extensions.citext, jsonb) to authenticated;

-- Create a recommendation on a blueprint (the SINGLE recommendation engine).
-- Enforces: AI-assisted recs must cite evidence; inactive service/module excluded.
create or replace function discovery.recommend(
  p_blueprint uuid, p_kind discovery.recommendation_kind, p_title text, p_attrs jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_assess uuid; v_id bigint; v_origin discovery.recommendation_origin;
        v_service extensions.citext; v_module extensions.citext; v_avail discovery.availability_status; v_ready discovery.readiness_status;
begin
  select * into v_tenant, v_assess from discovery._blueprint_writable(p_blueprint);
  if v_assess is null then raise exception 'blueprint has no assessment' using errcode = 'invalid_parameter_value'; end if;
  v_origin  := coalesce((p_attrs->>'origin')::discovery.recommendation_origin,'deterministic');
  v_service := nullif(p_attrs->>'service_key','');
  v_module  := nullif(p_attrs->>'module_key','');

  if v_origin = 'ai_assisted' and (p_attrs->'evidence_refs' is null or jsonb_array_length(coalesce(p_attrs->'evidence_refs','[]'::jsonb)) = 0) then
    raise exception 'an AI-assisted recommendation must reference supporting evidence' using errcode = 'invalid_parameter_value';
  end if;
  if v_service is not null then
    select availability into v_avail from discovery.service_catalog where key = v_service;
    if not found then raise exception 'unknown service %', v_service using errcode = 'foreign_key_violation'; end if;
    if v_avail in ('unavailable','deprecated') then
      raise exception 'service % is not available and cannot be recommended', v_service using errcode = 'invalid_parameter_value';
    end if;
  end if;
  if v_module is not null then
    select availability, provisioning_readiness into v_avail, v_ready from discovery.module_catalog where key = v_module;
    if not found then raise exception 'unknown module %', v_module using errcode = 'foreign_key_violation'; end if;
    if v_avail in ('unavailable','deprecated') then
      raise exception 'module % is not available and cannot be recommended', v_module using errcode = 'invalid_parameter_value';
    end if;
  end if;

  insert into discovery.recommendations
    (tenant_id, assessment_id, blueprint_id, kind, title, detail,
     recommended_service, recommended_module, estimated_impact, priority,
     origin, state, confidence, severity, rule_key, rule_version, priority_band, priority_factors,
     effort_band, cost_band, evidence_refs, affected_dimensions, service_key, module_key,
     problem_addressed, expected_benefit, timing, dependencies, risks, dedupe_group)
  values (v_tenant, v_assess, p_blueprint, p_kind, p_title, coalesce(p_attrs->>'detail',''),
     p_attrs->>'recommended_service', (p_attrs->>'recommended_module')::extensions.citext, p_attrs->>'estimated_impact',
     coalesce((p_attrs->>'priority')::integer,3),
     v_origin, coalesce((p_attrs->>'state')::discovery.recommendation_state,'proposed'),
     (p_attrs->>'confidence')::numeric, (p_attrs->>'severity')::extensions.citext,
     (p_attrs->>'rule_key')::extensions.citext, p_attrs->>'rule_version',
     (p_attrs->>'priority_band')::discovery.priority_band, coalesce(p_attrs->'priority_factors','{}'::jsonb),
     (p_attrs->>'effort_band')::discovery.effort_band, (p_attrs->>'cost_band')::discovery.cost_band,
     coalesce(p_attrs->'evidence_refs','[]'::jsonb), coalesce(p_attrs->'affected_dimensions','[]'::jsonb),
     v_service, v_module,
     p_attrs->>'problem_addressed', p_attrs->>'expected_benefit', p_attrs->>'timing',
     coalesce(p_attrs->'dependencies','[]'::jsonb), coalesce(p_attrs->'risks','[]'::jsonb),
     (p_attrs->>'dedupe_group')::extensions.citext)
  returning id into v_id;
  perform events.emit('recommendation.created', v_tenant,
    jsonb_build_object('recommendation', v_id, 'blueprint', p_blueprint, 'kind', p_kind, 'origin', v_origin));
  return v_id;
end; $$;
revoke all on function discovery.recommend(uuid, discovery.recommendation_kind, text, jsonb) from public, anon;
grant execute on function discovery.recommend(uuid, discovery.recommendation_kind, text, jsonb) to authenticated;

-- Set a recommendation's workflow state (accept/reject/defer/proposal flags).
create or replace function discovery.set_recommendation_state(p_recommendation bigint, p_state discovery.recommendation_state)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.recommendations where id = p_recommendation;
  if not found then raise exception 'recommendation % not found', p_recommendation using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.recommendations set state = p_state where id = p_recommendation;
end; $$;
revoke all on function discovery.set_recommendation_state(bigint, discovery.recommendation_state) from public, anon;
grant execute on function discovery.set_recommendation_state(bigint, discovery.recommendation_state) to authenticated;

-- Human override: requires blueprint.manage and records who + why. Origin is
-- preserved; state becomes 'overridden'. Emits recommendation.overridden.
create or replace function discovery.override_recommendation(p_recommendation bigint, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_bp uuid;
begin
  select tenant_id, blueprint_id into v_tenant, v_bp from discovery.recommendations where id = p_recommendation;
  if not found then raise exception 'recommendation % not found', p_recommendation using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.manage') then
    raise exception 'insufficient privilege to override a recommendation' using errcode = 'insufficient_privilege';
  end if;
  update discovery.recommendations set state = 'overridden', override_reason = p_reason, reviewed_by = auth.uid()
   where id = p_recommendation;
  perform events.emit('recommendation.overridden', v_tenant,
    jsonb_build_object('recommendation', p_recommendation, 'blueprint', v_bp));
end; $$;
revoke all on function discovery.override_recommendation(bigint, text) from public, anon;
grant execute on function discovery.override_recommendation(bigint, text) to authenticated;

-- Consolidate duplicate recommendations within a dedupe_group: keep the highest
-- confidence proposed rec, defer the rest (traceable, not deleted).
create or replace function discovery.consolidate_recommendations(p_blueprint uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_assess uuid; v_deferred integer;
begin
  select * into v_tenant, v_assess from discovery._blueprint_writable(p_blueprint);
  with ranked as (
    select id, row_number() over (
      partition by dedupe_group
      order by coalesce(confidence,0) desc, id asc) as rn
    from discovery.recommendations
    where blueprint_id = p_blueprint and dedupe_group is not null and state = 'proposed')
  update discovery.recommendations r set state = 'deferred'
    from ranked where r.id = ranked.id and ranked.rn > 1;
  get diagnostics v_deferred = row_count;
  return v_deferred;
end; $$;
revoke all on function discovery.consolidate_recommendations(uuid) from public, anon;
grant execute on function discovery.consolidate_recommendations(uuid) to authenticated;

create or replace function discovery.add_roadmap_item(
  p_blueprint uuid, p_sequence integer, p_phase extensions.citext, p_objective text, p_attrs jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_assess uuid; v_id bigint;
begin
  select * into v_tenant, v_assess from discovery._blueprint_writable(p_blueprint);
  if not exists (select 1 from discovery.roadmap_phases where key = p_phase and is_active) then
    raise exception 'unknown or inactive roadmap phase %', p_phase using errcode = 'foreign_key_violation';
  end if;
  insert into discovery.roadmap_items
    (tenant_id, blueprint_id, sequence, phase_key, objective, recommended_action, dependencies,
     estimated_effort, duration_low_days, duration_high_days, expected_impact, responsible_party,
     required_approvals, related_recommendations, related_evidence)
  values (v_tenant, p_blueprint, p_sequence, p_phase, p_objective, p_attrs->>'recommended_action',
     coalesce(p_attrs->'dependencies','[]'::jsonb), (p_attrs->>'estimated_effort')::discovery.effort_band,
     (p_attrs->>'duration_low_days')::integer, (p_attrs->>'duration_high_days')::integer,
     p_attrs->>'expected_impact', (p_attrs->>'responsible_party')::extensions.citext,
     coalesce(p_attrs->'required_approvals','[]'::jsonb), coalesce(p_attrs->'related_recommendations','[]'::jsonb),
     coalesce(p_attrs->'related_evidence','[]'::jsonb))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function discovery.add_roadmap_item(uuid, integer, extensions.citext, text, jsonb) from public, anon;
grant execute on function discovery.add_roadmap_item(uuid, integer, extensions.citext, text, jsonb) to authenticated;

create or replace function discovery.add_impact_estimate(
  p_blueprint uuid, p_category extensions.citext, p_assumption text, p_input_source extensions.citext, p_attrs jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_assess uuid; v_id bigint;
begin
  select * into v_tenant, v_assess from discovery._blueprint_writable(p_blueprint);
  insert into discovery.impact_estimates
    (tenant_id, blueprint_id, recommendation_id, category, assumption, input_source, calculation_method,
     scenario_low, scenario_expected, scenario_high, confidence, illustrative, caveats)
  values (v_tenant, p_blueprint, (p_attrs->>'recommendation_id')::bigint, p_category, p_assumption, p_input_source,
     coalesce(p_attrs->>'calculation_method',''), p_attrs->>'scenario_low', p_attrs->>'scenario_expected',
     p_attrs->>'scenario_high', coalesce((p_attrs->>'confidence')::numeric,0.50),
     coalesce((p_attrs->>'illustrative')::boolean,true), p_attrs->>'caveats')
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function discovery.add_impact_estimate(uuid, extensions.citext, text, extensions.citext, jsonb) from public, anon;
grant execute on function discovery.add_impact_estimate(uuid, extensions.citext, text, extensions.citext, jsonb) to authenticated;

-- Mark generation complete. p_partial => 'partially_generated' (e.g. AI failed
-- but the deterministic blueprint stands). Records the engine versions used.
create or replace function discovery.mark_blueprint_generated(
  p_blueprint uuid, p_partial boolean default false,
  p_rule_version text default null, p_priority_model_version text default null, p_impact_model_version text default null,
  p_ai_run bigint default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.blueprints set
    lifecycle = (case when p_partial then 'partially_generated' else 'generated' end)::discovery.blueprint_status,
    partial = p_partial, generated_at = now(),
    rule_version = coalesce(p_rule_version, rule_version),
    priority_model_version = coalesce(p_priority_model_version, priority_model_version),
    impact_model_version = coalesce(p_impact_model_version, impact_model_version),
    ai_run_ids = case when p_ai_run is null then ai_run_ids else ai_run_ids || to_jsonb(p_ai_run) end
   where id = p_blueprint;
  perform events.emit(
    (case when p_partial then 'blueprint.partially_generated' else 'blueprint.generated' end)::extensions.citext,
    v_tenant, jsonb_build_object('blueprint', p_blueprint, 'partial', p_partial));
end; $$;
revoke all on function discovery.mark_blueprint_generated(uuid, boolean, text, text, text, bigint) from public, anon;
grant execute on function discovery.mark_blueprint_generated(uuid, boolean, text, text, text, bigint) to authenticated;

-- Submit for human review — opens a workflow instance (reused engine).
create or replace function discovery.submit_blueprint_for_review(p_blueprint uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_life discovery.blueprint_status; v_instance uuid;
begin
  select tenant_id, lifecycle into v_tenant, v_life from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_life not in ('generated','partially_generated','changes_requested') then
    raise exception 'blueprint must be generated before review (is %)', v_life using errcode = 'invalid_parameter_value';
  end if;
  v_instance := workflows.request_approval(v_tenant, 'discovery.blueprint.review', 'discovery.blueprint', p_blueprint::text, 'tenant_admin');
  update discovery.blueprints set lifecycle = 'awaiting_review', workflow_instance_id = v_instance where id = p_blueprint;
  perform events.emit('blueprint.review_requested', v_tenant, jsonb_build_object('blueprint', p_blueprint, 'instance', v_instance));
  return v_instance;
end; $$;
revoke all on function discovery.submit_blueprint_for_review(uuid) from public, anon;
grant execute on function discovery.submit_blueprint_for_review(uuid) to authenticated;

create or replace function discovery.request_blueprint_changes(p_blueprint uuid, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.blueprints set lifecycle = 'changes_requested' where id = p_blueprint;
  perform events.emit('blueprint.changes_requested', v_tenant, jsonb_build_object('blueprint', p_blueprint, 'note', p_note));
end; $$;
revoke all on function discovery.request_blueprint_changes(uuid, text) from public, anon;
grant execute on function discovery.request_blueprint_changes(uuid, text) to authenticated;

-- Approve — requires blueprint.manage AND an approved workflow instance. An AI
-- run cannot satisfy either gate, so AI can never approve a blueprint.
create or replace function discovery.approve_blueprint(p_blueprint uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id, workflow_instance_id into v_tenant, v_instance from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.manage') then
    raise exception 'insufficient privilege to approve a blueprint' using errcode = 'insufficient_privilege';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'blueprint cannot be approved without an approved human review' using errcode = 'insufficient_privilege';
  end if;
  update discovery.blueprints set lifecycle = 'approved' where id = p_blueprint;
  perform events.emit('blueprint.approved', v_tenant, jsonb_build_object('blueprint', p_blueprint));
  perform audit.log_security_event('discovery.blueprint.approve','allowed','info',
    v_tenant,'discovery.blueprints',p_blueprint::text, jsonb_build_object('instance', v_instance));
end; $$;
revoke all on function discovery.approve_blueprint(uuid) from public, anon;
grant execute on function discovery.approve_blueprint(uuid) to authenticated;

create or replace function discovery.reject_blueprint(p_blueprint uuid, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.blueprints set lifecycle = 'rejected' where id = p_blueprint;
  perform events.emit('blueprint.rejected', v_tenant, jsonb_build_object('blueprint', p_blueprint, 'reason', p_reason));
end; $$;
revoke all on function discovery.reject_blueprint(uuid, text) from public, anon;
grant execute on function discovery.reject_blueprint(uuid, text) to authenticated;

create or replace function discovery.mark_ready_for_proposal(p_blueprint uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_life discovery.blueprint_status;
begin
  select tenant_id, lifecycle into v_tenant, v_life from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_life <> 'approved' then
    raise exception 'only an approved blueprint can be marked ready for proposal (is %)', v_life using errcode = 'invalid_parameter_value';
  end if;
  update discovery.blueprints set lifecycle = 'ready_for_proposal' where id = p_blueprint;
  perform events.emit('blueprint.ready_for_proposal', v_tenant, jsonb_build_object('blueprint', p_blueprint));
end; $$;
revoke all on function discovery.mark_ready_for_proposal(uuid) from public, anon;
grant execute on function discovery.mark_ready_for_proposal(uuid) to authenticated;

-- New version: supersede the latest blueprint for the assessment (preserved,
-- never overwritten) and create a fresh draft at version+1.
create or replace function discovery.new_blueprint_version(p_assessment uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_profile uuid; v_prev uuid; v_ver integer; v_id uuid;
begin
  select tenant_id, profile_id into v_tenant, v_profile from discovery.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  select id, version into v_prev, v_ver from discovery.blueprints
    where assessment_id = p_assessment order by version desc limit 1;
  v_ver := coalesce(v_ver,0) + 1;
  insert into discovery.blueprints (tenant_id, profile_id, assessment_id, status, lifecycle, version, created_by)
  values (v_tenant, v_profile, p_assessment, 'draft', 'draft', v_ver, auth.uid()) returning id into v_id;
  if v_prev is not null then
    update discovery.blueprints set lifecycle = 'superseded', superseded_by = v_id
     where id = v_prev and lifecycle <> 'superseded';
  end if;
  perform events.emit('blueprint.requested', v_tenant,
    jsonb_build_object('blueprint', v_id, 'assessment', p_assessment, 'version', v_ver, 'supersedes', v_prev));
  return v_id;
end; $$;
revoke all on function discovery.new_blueprint_version(uuid) from public, anon;
grant execute on function discovery.new_blueprint_version(uuid) to authenticated;

create or replace function discovery.archive_blueprint(p_blueprint uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.blueprint.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.blueprints set lifecycle = 'archived' where id = p_blueprint;
end; $$;
revoke all on function discovery.archive_blueprint(uuid) from public, anon;
grant execute on function discovery.archive_blueprint(uuid) to authenticated;

-- ===========================================================================
-- Wire the inert blueprint worker via the CP5 shared dispatcher (no new queue)
-- ===========================================================================
insert into events.subscriptions (key, topic, consumer_module, active) values
  ('discovery_blueprint_worker', 'blueprint.requested', 'discovery', true)
on conflict (key) do nothing;

insert into events.handlers (subscription_key, handler_ref, max_attempts, backoff_seconds, timeout_seconds) values
  ('discovery_blueprint_worker', 'discovery-blueprint-worker', 3, 60, 120)
on conflict (subscription_key) do nothing;

-- ===========================================================================
-- Seeds: roadmap phase catalog (8, configurable/extensible)
-- ===========================================================================
insert into discovery.roadmap_phases (key, name, description, default_sequence) values
  ('immediate_stabilization','Immediate Stabilization','Fix urgent risks and blockers.',1),
  ('digital_foundation','Digital Foundation','Establish core web/identity/security presence.',2),
  ('customer_acquisition','Customer Acquisition','Search, local, social, and lead capture.',3),
  ('customer_experience','Customer Experience','Communications, scheduling, follow-up, reviews.',4),
  ('operational_automation','Operational Automation','Workflow automation and back-office efficiency.',5),
  ('ai_enablement','AI Enablement','AI receptionist, assistants, and augmentation.',6),
  ('analytics_optimization','Analytics and Optimization','Dashboards, reporting, and continuous tuning.',7),
  ('growth_expansion','Growth and Expansion','Scale, new channels, and vertical operating systems.',8)
on conflict (key) do nothing;

-- ===========================================================================
-- Seeds: Herman Legacy service catalog (provisional; pricing is a REFERENCE
-- placeholder pending CEO decision — no created prices).
-- ===========================================================================
insert into discovery.service_catalog (key, public_name, internal_name, description, category, delivery_type, is_recurring, relevant_dimensions, required_evidence, default_priority, availability, pricing_ref) values
  ('business_discovery','Business Discovery','discovery.intake','Structured discovery of the business and its digital footprint.','business_discovery','one_time',false,'["digital_presence"]','[]','high','available','pending-ceo:business_discovery'),
  ('website_creation','Website Creation','web.create','Design and build a modern business website.','website_creation','one_time',false,'["digital_presence","customer_experience"]','["title","https"]','high','available','pending-ceo:website_creation'),
  ('website_modernization','Website Modernization','web.modernize','Rebuild or upgrade an existing website.','website_modernization','one_time',false,'["digital_presence","security"]','["https","mixed_content"]','high','available','pending-ceo:website_modernization'),
  ('search_visibility','Search Visibility (SEO)','seo.core','Search-readiness and organic visibility improvements.','search_visibility','recurring',true,'["marketing","digital_presence"]','["meta_description","structured_data"]','medium','available','pending-ceo:search_visibility'),
  ('local_visibility','Local Visibility','local.core','Local listings, maps, and local search presence.','local_visibility','recurring',true,'["marketing","growth_readiness"]','["social_links"]','medium','available','pending-ceo:local_visibility'),
  ('content_creation','Content Creation','content.core','Ongoing content production.','content','recurring',true,'["marketing"]','[]','low','coming_soon','pending-ceo:content_creation'),
  ('social_presence','Social Presence','social.core','Social profile setup and management.','social_presence','recurring',true,'["marketing"]','["social_links"]','low','coming_soon','pending-ceo:social_presence'),
  ('lead_capture','Lead Capture','lead.capture','Forms, landing pages, and lead intake.','lead_generation','one_time',false,'["sales","customer_experience"]','["forms"]','high','available','pending-ceo:lead_capture'),
  ('crm_setup','CRM Setup','crm.setup','CRM configuration and pipeline design.','customer_experience','one_time',false,'["sales","operations"]','[]','medium','available','pending-ceo:crm_setup'),
  ('ai_receptionist','AI Receptionist','ai.receptionist','AI-assisted call/chat answering.','ai_enablement','recurring',true,'["communications","ai_adoption"]','["contact_signals"]','medium','coming_soon','pending-ceo:ai_receptionist'),
  ('appointment_scheduling','Appointment Scheduling','sched.core','Online booking and scheduling.','customer_experience','recurring',true,'["customer_experience"]','[]','medium','available','pending-ceo:appointment_scheduling'),
  ('review_management','Review Management','reviews.core','Review generation and monitoring.','reputation_management','recurring',true,'["marketing","customer_experience"]','[]','medium','available','pending-ceo:review_management'),
  ('reputation_recovery','Reputation Recovery','reviews.recovery','Recover from negative reputation events.','reputation_management','one_time',false,'["customer_experience"]','[]','high','coming_soon','pending-ceo:reputation_recovery'),
  ('communications','Email & SMS Communications','comms.core','Email and SMS messaging with consent.','communications','recurring',true,'["communications"]','["contact_signals"]','medium','available','pending-ceo:communications'),
  ('missed_call_recovery','Missed-Call Recovery','comms.missedcall','Automatic missed-call text-back.','communications','recurring',true,'["communications","customer_experience"]','["contact_signals"]','high','coming_soon','pending-ceo:missed_call_recovery'),
  ('customer_follow_up','Customer Follow-Up','comms.followup','Automated customer follow-up sequences.','communications','recurring',true,'["customer_experience","automation"]','[]','medium','coming_soon','pending-ceo:customer_follow_up'),
  ('payments','Payments','pay.core','Online and in-person payment acceptance.','customer_experience','recurring',true,'["operations"]','[]','medium','available','pending-ceo:payments'),
  ('dashboards','Dashboards','analytics.dashboards','Operational dashboards.','analytics','recurring',true,'["analytics"]','["analytics_tags"]','low','available','pending-ceo:dashboards'),
  ('reporting','Reporting','analytics.reporting','Scheduled business reporting.','analytics','recurring',true,'["analytics"]','["analytics_tags"]','low','coming_soon','pending-ceo:reporting'),
  ('workflow_automation','Workflow Automation','automation.core','Automate repetitive back-office workflows.','automation','one_time',false,'["automation","operations"]','[]','medium','coming_soon','pending-ceo:workflow_automation'),
  ('document_management','Document Management','docs.core','Central document storage and retrieval.','software_implementation','one_time',false,'["operations"]','[]','low','coming_soon','pending-ceo:document_management'),
  ('vertical_os','Vertical Operating System','vos.core','Industry-specific operating system.','software_implementation','one_time',false,'["operations","growth_readiness"]','[]','low','coming_soon','pending-ceo:vertical_os'),
  ('custom_software','Custom Software Module','custom.core','Bespoke software module.','software_implementation','one_time',false,'["operations"]','[]','low','coming_soon','pending-ceo:custom_software'),
  ('managed_services','Managed Services','managed.core','Ongoing managed support.','managed_services','recurring',true,'["operations"]','[]','low','available','pending-ceo:managed_services'),
  ('hosting_support','Hosting & Support','hosting.core','Website hosting and technical support.','hosting_and_support','recurring',true,'["security","operations"]','["https"]','medium','available','pending-ceo:hosting_support')
on conflict (key) do nothing;

-- ===========================================================================
-- Seeds: HL-BOS module catalog (provisionable capabilities; not activated here)
-- ===========================================================================
insert into discovery.module_catalog (key, display_name, description, capability_category, entitlement_key, provisioning_readiness, availability, implementation_effort) values
  ('identity','Identity','Users, roles, and tenancy.','identity','identity','ready','available','s'),
  ('crm','CRM','Contacts, pipelines, and deals.','customer_experience','crm','in_development','coming_soon','m'),
  ('communications','Communications','Email/SMS with consent + suppression.','communications','comms','in_development','coming_soon','m'),
  ('storage','Storage','Files and documents.','operations','storage','ready','available','s'),
  ('scheduling','Scheduling','Appointments and calendars.','customer_experience','scheduling','planned','coming_soon','m'),
  ('billing','Billing','Subscriptions and invoicing.','operations','billing','in_development','coming_soon','m'),
  ('payments','Payments','Payment processing.','operations','payments','planned','coming_soon','m'),
  ('reviews','Reviews','Review requests and monitoring.','marketing','reviews','planned','coming_soon','m'),
  ('reputation_recovery','Reputation Recovery','Negative-review recovery workflows.','marketing','reputation','planned','coming_soon','m'),
  ('ai_receptionist','AI Receptionist','AI call/chat answering.','ai_enablement','ai_receptionist','planned','coming_soon','l'),
  ('lead_capture','Lead Capture','Forms and lead intake.','sales','lead_capture','planned','coming_soon','s'),
  ('lead_recovery','Lead Recovery','Re-engage cold/abandoned leads.','sales','lead_recovery','planned','coming_soon','m'),
  ('analytics','Analytics','Metrics and insights.','analytics','analytics','planned','coming_soon','m'),
  ('dashboards','Dashboards','Operational dashboards.','analytics','dashboards','in_development','coming_soon','s'),
  ('workflow_automation','Workflow Automation','Event-driven automation.','automation','automation','planned','coming_soon','l'),
  ('website','Website','Managed business website.','digital_presence','website','planned','coming_soon','m'),
  ('seo','SEO','Search-readiness tooling.','marketing','seo','planned','coming_soon','m'),
  ('local_visibility','Local Visibility','Local listings management.','marketing','local','planned','coming_soon','m'),
  ('content_management','Content Management','Content authoring and publishing.','marketing','content','planned','coming_soon','m'),
  ('customer_portal','Customer Portal','Customer-facing portal.','customer_experience','customer_portal','planned','coming_soon','l'),
  ('staff_portal','Staff Portal','Internal staff portal.','operations','staff_portal','planned','coming_soon','l'),
  ('document_management','Document Management','Document lifecycle.','operations','documents','planned','coming_soon','m'),
  ('vertical_os','Vertical Operating System','Industry operating system.','operations','vertical_os','planned','coming_soon','xl')
on conflict (key) do nothing;

-- ===========================================================================
-- Seeds: recommendation rules (deterministic, versioned, data-driven).
-- The TS rule engine reads conditions/output; each produced recommendation
-- carries rule_key + rule_version for traceability. NO opaque AI list.
-- ===========================================================================
insert into discovery.recommendation_rules (key, name, description, kind, conditions, output, confidence) values
  ('rule_no_https','Insecure website','Site is not served over HTTPS.','service',
     '{"evidence":{"https":{"present":false}}}',
     '{"service_key":"website_modernization","title":"Secure the website with HTTPS","severity":"critical","priority_band":"critical","effort_band":"s","cost_band":"low","affected_dimensions":["security","digital_presence"]}', 1.00),
  ('rule_no_website','No usable website','No title/identity detected on the site.','service',
     '{"evidence":{"title":{"present":false}}}',
     '{"service_key":"website_creation","title":"Create a professional website","severity":"high","priority_band":"high","effort_band":"l","cost_band":"medium","affected_dimensions":["digital_presence","customer_experience"]}', 0.95),
  ('rule_weak_seo','Weak search readiness','Missing meta description / structured data.','service',
     '{"evidence":{"meta_description":{"present":false}}}',
     '{"service_key":"search_visibility","title":"Improve search visibility","severity":"medium","priority_band":"medium","effort_band":"m","cost_band":"medium","affected_dimensions":["marketing","digital_presence"]}', 0.85),
  ('rule_no_contact','No contact path','No phone/email contact signals.','service',
     '{"evidence":{"contact_signals":{"tel":false,"mailto":false}}}',
     '{"service_key":"missed_call_recovery","title":"Add reliable contact + missed-call recovery","severity":"high","priority_band":"high","effort_band":"s","cost_band":"low","affected_dimensions":["communications","customer_experience"]}', 0.9),
  ('rule_no_analytics','No analytics','No analytics tags detected.','hl_bos_module',
     '{"evidence":{"analytics_tags":{"empty":true}}}',
     '{"module_key":"analytics","title":"Enable analytics + dashboards","severity":"medium","priority_band":"medium","effort_band":"m","cost_band":"low","affected_dimensions":["analytics"]}', 0.8),
  ('rule_low_security_dim','Low security maturity','Security dimension scored low.','service',
     '{"dimension":{"framework":"maturity","key":"security","lte":2}}',
     '{"service_key":"hosting_support","title":"Harden security and hosting","severity":"high","priority_band":"high","effort_band":"m","cost_band":"medium","affected_dimensions":["security"]}', 0.85),
  ('rule_low_comms_dim','Low communications maturity','Communications dimension scored low.','hl_bos_module',
     '{"dimension":{"framework":"maturity","key":"communications","lte":2}}',
     '{"module_key":"communications","title":"Stand up email/SMS communications","severity":"medium","priority_band":"medium","effort_band":"m","cost_band":"medium","affected_dimensions":["communications"]}', 0.8)
on conflict (key) do nothing;
