-- ===========================================================================
-- v0_venture_studio_foundation — HLVS V2 (Herman Legacy Venture Studio)
--
-- The thin `vstudio` intelligence schema: capture opportunity → attach evidence
-- → evaluate → (advisory) recommend → (authoritative) CEO decision → read-only
-- Factory readiness. It ASSEMBLES on HL-BOS and introduces NO new identity,
-- tenancy, AI, event, workflow or audit system — it references them.
--
-- Boundaries honored (V2-1):
--   * NO external connectors / crawling (sources are in-code, package-side).
--   * NO autonomous Factory work — decisions are recorded; the Factory handoff
--     is a read-only preview computed in the app, never written here.
--   * AI recommendations are advisory: `recommendations.authoritative` is a
--     generated column fixed to FALSE — it can never be stored true.
--   * The CEO decision is the single authoritative act, gated on a dedicated
--     platform permission (`vstudio.decision.record`) and insert-only.
--
-- Reuse:
--   identity (auth + permissions), platform.tenants (tenancy), ai.runs (AI
--   provenance FK), events.emit (append-only event trail), storage_meta.files
--   (document refs). Nothing duplicated. See
--   docs/products/hlvs-v2/V2_1_REUSE_AND_DUPLICATION_MATRIX.md.
--
-- ROLLBACK (manual, pre-approval only — this migration is not auto-applied):
--   DROP SCHEMA IF EXISTS vstudio CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'vstudio.%';
--   DELETE FROM identity.permissions WHERE key LIKE 'vstudio.%';
--
-- VERIFICATION (after apply): expect 6 tables, RLS forced on all, 6 permissions,
--   and 7 SECURITY DEFINER RPCs. pgTAP: supabase/tests/22_venture_studio.sql.
-- ===========================================================================

create schema if not exists vstudio;
comment on schema vstudio is
  'Herman Legacy Venture Studio (HLVS V2): executive opportunity-intelligence. Platform-internal; definer RPCs only. Decides what to pursue; never operates customer workloads and never writes to the hlvs Factory.';

revoke all on schema vstudio from public, anon, authenticated;
grant usage on schema vstudio to authenticated;
alter default privileges in schema vstudio revoke all on tables from public;
alter default privileges in schema vstudio revoke all on functions from public;

-- ---------------------------------------------------------------------------
-- Enums (mirror @hl-bos/venture-studio vocabularies exactly)
-- ---------------------------------------------------------------------------
do $$ begin create type vstudio.opportunity_status as enum ('inbox','researching','evaluated','watch','approved','rejected','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.opportunity_type as enum ('greenfield_product','feature_expansion','acquisition_target','partnership','open_source_leverage','research_to_product','market_gap'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.evidence_type as enum ('verified_fact','external_claim','estimate','inference','ceo_note'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.reliability as enum ('high','medium','low','unverified'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.relevance as enum ('direct','supporting','tangential'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.note_type as enum ('observation','hypothesis','risk','decision_input','follow_up'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.note_visibility as enum ('private','executive','team'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.recommendation as enum ('build','buy','partner','watch','ignore'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.decision as enum ('build','buy','partner','watch','ignore','defer'); exception when duplicate_object then null; end $$;
do $$ begin create type vstudio.metric_status as enum ('measured','estimated','unknown'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables (6) — thin; heavy relationships are FKs into existing schemas
-- ---------------------------------------------------------------------------
create table if not exists vstudio.opportunities (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id          uuid not null references platform.tenants(id) on delete cascade,
  title              text not null check (length(title) between 1 and 300),
  summary            text not null default '',
  problem_statement  text not null default '',
  proposed_customer  text not null default '',
  industry           text not null default '',
  opportunity_type   vstudio.opportunity_type,
  source_type        text not null default 'manual',   -- V2-1: always manual (no connectors)
  source_url         text check (source_url is null or source_url ~ '^https?://'),
  discovery_date     date not null default current_date,
  initial_hypothesis text not null default '',
  related_product    extensions.citext,                -- app-registry key of a related HL product, if any
  tags               text[] not null default '{}',
  status             vstudio.opportunity_status not null default 'inbox',
  is_demonstration   boolean not null default false,   -- labeled DEMONSTRATION / NOT LIVE EXTERNAL INTELLIGENCE
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table vstudio.opportunities is 'Executive-captured software opportunities. V2-1 intake is manual; no external intelligence is fabricated.';
create index if not exists opportunities_tenant_idx on vstudio.opportunities (tenant_id);
create index if not exists opportunities_status_idx on vstudio.opportunities (status);
create index if not exists opportunities_tags_idx on vstudio.opportunities using gin (tags);

create table if not exists vstudio.evidence (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  evidence_type  vstudio.evidence_type not null,
  title          text not null check (length(title) between 1 and 300),
  source_url     text check (source_url is null or source_url ~ '^https?://'),
  source_name    text not null default '',
  captured_date  date not null default current_date,
  excerpt        text not null default '',
  reliability    vstudio.reliability not null default 'unverified',
  relevance      vstudio.relevance not null default 'supporting',
  notes          text not null default '',
  document_ref   uuid references storage_meta.files(id) on delete set null,  -- reuse the shared document store
  provenance     text not null default '',
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table vstudio.evidence is 'Evidence attached to an opportunity, typed by trust (verified_fact/external_claim/estimate/inference/ceo_note).';
create index if not exists evidence_opportunity_idx on vstudio.evidence (opportunity_id);

create table if not exists vstudio.notes (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  note_type      vstudio.note_type not null default 'observation',
  body           text not null check (length(body) between 1 and 10000),
  visibility     vstudio.note_visibility not null default 'executive',
  decision_relevant boolean not null default false,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table vstudio.notes is 'Durable CEO/executive notes on an opportunity. Reuses identity; distinct from comms (outbound messaging).';
create index if not exists notes_opportunity_idx on vstudio.notes (opportunity_id);

create table if not exists vstudio.evaluations (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  -- Per-dimension scores as [{dimension,score,status,confidence,methodology,evidenceBasis}]
  dimension_scores jsonb not null default '[]'::jsonb,
  composite      integer check (composite is null or composite between 0 and 100),
  composite_status vstudio.metric_status not null default 'estimated',
  confidence     text check (confidence in ('high','medium','low')),
  methodology    text not null default '',
  evaluated_by   uuid references auth.users(id) on delete set null,
  evaluator_model text,                                -- set only when a model assisted
  evaluated_at   timestamptz not null default now()
);
comment on table vstudio.evaluations is 'Structured strategic evaluation. Composite is a weighted mean over scored dimensions; unknown dimensions are excluded (absent is not zero).';
create index if not exists evaluations_opportunity_idx on vstudio.evaluations (opportunity_id);

create table if not exists vstudio.recommendations (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  recommendation vstudio.recommendation not null,
  rationale      text not null default '',
  confidence     text check (confidence in ('high','medium','low')),
  reuse_snapshot jsonb not null default '{}'::jsonb,   -- deterministic reuse analysis captured at generation time
  ai_run_id      uuid references ai.runs(id) on delete set null,  -- metered gateway provenance
  model          text,
  prompt_version text,
  -- HARD INVARIANT: an AI recommendation can never be authoritative.
  authoritative  boolean not null generated always as (false) stored,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table vstudio.recommendations is 'Advisory Build/Buy/Partner/Watch/Ignore. authoritative is a generated column fixed FALSE — never a decision.';
create index if not exists recommendations_opportunity_idx on vstudio.recommendations (opportunity_id);

create table if not exists vstudio.decisions (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  decision       vstudio.decision not null,
  rationale      text not null default '',
  conditions     text not null default '',
  decided_by     uuid not null references auth.users(id) on delete restrict,
  decided_at     timestamptz not null default now(),
  revisit_date   date,
  factory_authorized boolean not null default false     -- V2-1: informational; no Factory order is created
);
comment on table vstudio.decisions is 'The authoritative CEO decision — insert-only, distinct from any AI recommendation. Gated on vstudio.decision.record.';
create index if not exists decisions_opportunity_idx on vstudio.decisions (opportunity_id);

-- ---------------------------------------------------------------------------
-- RLS — force on every table; SELECT gated on a platform permission; no anon.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select unnest(array['opportunities','evidence','notes','evaluations','recommendations','decisions']) as t
  loop
    execute format('alter table vstudio.%I enable row level security', r.t);
    execute format('alter table vstudio.%I force row level security', r.t);
    execute format('revoke all on vstudio.%I from anon', r.t);
    execute format('drop policy if exists %I_select on vstudio.%I', r.t, r.t);
    execute format($p$create policy %I_select on vstudio.%I for select to authenticated using (identity.has_platform_permission('vstudio.opportunity.read'))$p$, r.t, r.t);
    execute format('grant select on vstudio.%I to authenticated', r.t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Permissions (platform scope; explicit least-privilege)
-- ---------------------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('vstudio.opportunity.read',    'Read Venture Studio opportunities, evidence, evaluations, recommendations and decisions.', 'platform'),
  ('vstudio.opportunity.manage',  'Create and update opportunities; attach evidence and notes.', 'platform'),
  ('vstudio.evaluation.manage',   'Record structured evaluations.', 'platform'),
  ('vstudio.recommendation.generate', 'Generate advisory (non-authoritative) recommendations.', 'platform'),
  ('vstudio.decision.record',     'Record the authoritative CEO decision (CEO-level only).', 'platform')
on conflict (key) do nothing;

-- Read + manage + evaluate + recommend go to owner and admin. The authoritative
-- CEO decision is granted to platform_owner ONLY — the CEO-level role.
insert into identity.role_permissions (role_key, permission_key)
select r, p from unnest(array['platform_owner','platform_admin']) r,
  unnest(array['vstudio.opportunity.read','vstudio.opportunity.manage','vstudio.evaluation.manage','vstudio.recommendation.generate']) p
on conflict do nothing;
insert into identity.role_permissions (role_key, permission_key) values
  ('platform_owner','vstudio.decision.record')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Guard helper
-- ---------------------------------------------------------------------------
create or replace function vstudio._require(p_perm extensions.citext)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission(p_perm) then
    raise exception 'insufficient privilege: % required', p_perm using errcode = 'insufficient_privilege';
  end if;
end; $$;
revoke all on function vstudio._require(extensions.citext) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Write RPCs (SECURITY DEFINER; permission-checked; auth.uid() provenance)
-- ---------------------------------------------------------------------------
create or replace function vstudio.create_opportunity(
  p_tenant uuid, p_title text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  insert into vstudio.opportunities
    (tenant_id, title, summary, problem_statement, proposed_customer, industry,
     opportunity_type, source_type, source_url, initial_hypothesis, related_product,
     tags, is_demonstration, created_by)
  values
    (p_tenant, p_title, coalesce(p_attrs->>'summary',''), coalesce(p_attrs->>'problem_statement',''),
     coalesce(p_attrs->>'proposed_customer',''), coalesce(p_attrs->>'industry',''),
     nullif(p_attrs->>'opportunity_type','')::vstudio.opportunity_type,
     coalesce(p_attrs->>'source_type','manual'), nullif(p_attrs->>'source_url',''),
     coalesce(p_attrs->>'initial_hypothesis',''), nullif(p_attrs->>'related_product','')::extensions.citext,
     coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_attrs->'tags','[]'::jsonb))), '{}'),
     coalesce((p_attrs->>'is_demonstration')::boolean, false), auth.uid())
  returning id into v_id;
  perform events.emit('vstudio.opportunity.created', p_tenant, jsonb_build_object('opportunity', v_id));
  return v_id;
end; $$;
revoke all on function vstudio.create_opportunity(uuid, text, jsonb) from public, anon;
grant execute on function vstudio.create_opportunity(uuid, text, jsonb) to authenticated;

create or replace function vstudio.set_opportunity_status(p_id uuid, p_status vstudio.opportunity_status)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  update vstudio.opportunities set status = p_status, updated_at = now()
   where id = p_id returning tenant_id into v_tenant;
  if not found then raise exception 'opportunity % not found', p_id using errcode = 'no_data_found'; end if;
  perform events.emit('vstudio.opportunity.updated', v_tenant, jsonb_build_object('opportunity', p_id, 'status', p_status));
end; $$;
revoke all on function vstudio.set_opportunity_status(uuid, vstudio.opportunity_status) from public, anon;
grant execute on function vstudio.set_opportunity_status(uuid, vstudio.opportunity_status) to authenticated;

create or replace function vstudio.add_evidence(p_opportunity uuid, p_type vstudio.evidence_type, p_title text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  select tenant_id into v_tenant from vstudio.opportunities where id = p_opportunity;
  if v_tenant is null then raise exception 'opportunity % not found', p_opportunity using errcode = 'no_data_found'; end if;
  insert into vstudio.evidence
    (opportunity_id, evidence_type, title, source_url, source_name, excerpt, reliability, relevance, notes, provenance, created_by)
  values
    (p_opportunity, p_type, p_title, nullif(p_attrs->>'source_url',''), coalesce(p_attrs->>'source_name',''),
     coalesce(p_attrs->>'excerpt',''), coalesce(nullif(p_attrs->>'reliability','')::vstudio.reliability,'unverified'),
     coalesce(nullif(p_attrs->>'relevance','')::vstudio.relevance,'supporting'), coalesce(p_attrs->>'notes',''),
     coalesce(p_attrs->>'provenance',''), auth.uid())
  returning id into v_id;
  perform events.emit('vstudio.evidence.added', v_tenant, jsonb_build_object('opportunity', p_opportunity, 'evidence', v_id));
  return v_id;
end; $$;
revoke all on function vstudio.add_evidence(uuid, vstudio.evidence_type, text, jsonb) from public, anon;
grant execute on function vstudio.add_evidence(uuid, vstudio.evidence_type, text, jsonb) to authenticated;

create or replace function vstudio.add_note(p_opportunity uuid, p_body text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  if not exists (select 1 from vstudio.opportunities where id = p_opportunity) then
    raise exception 'opportunity % not found', p_opportunity using errcode = 'no_data_found'; end if;
  insert into vstudio.notes (opportunity_id, note_type, body, visibility, decision_relevant, created_by)
  values (p_opportunity, coalesce(nullif(p_attrs->>'note_type','')::vstudio.note_type,'observation'),
     p_body, coalesce(nullif(p_attrs->>'visibility','')::vstudio.note_visibility,'executive'),
     coalesce((p_attrs->>'decision_relevant')::boolean,false), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function vstudio.add_note(uuid, text, jsonb) from public, anon;
grant execute on function vstudio.add_note(uuid, text, jsonb) to authenticated;

create or replace function vstudio.record_evaluation(p_opportunity uuid, p_dimension_scores jsonb, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform vstudio._require('vstudio.evaluation.manage');
  select tenant_id into v_tenant from vstudio.opportunities where id = p_opportunity;
  if v_tenant is null then raise exception 'opportunity % not found', p_opportunity using errcode = 'no_data_found'; end if;
  insert into vstudio.evaluations
    (opportunity_id, dimension_scores, composite, composite_status, confidence, methodology, evaluated_by, evaluator_model)
  values
    (p_opportunity, coalesce(p_dimension_scores,'[]'::jsonb),
     nullif(p_attrs->>'composite','')::integer, coalesce(nullif(p_attrs->>'composite_status','')::vstudio.metric_status,'estimated'),
     nullif(p_attrs->>'confidence',''), coalesce(p_attrs->>'methodology',''), auth.uid(), nullif(p_attrs->>'evaluator_model',''))
  returning id into v_id;
  perform events.emit('vstudio.evaluation.completed', v_tenant, jsonb_build_object('opportunity', p_opportunity, 'evaluation', v_id));
  return v_id;
end; $$;
revoke all on function vstudio.record_evaluation(uuid, jsonb, jsonb) from public, anon;
grant execute on function vstudio.record_evaluation(uuid, jsonb, jsonb) to authenticated;

create or replace function vstudio.generate_recommendation(p_opportunity uuid, p_recommendation vstudio.recommendation, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform vstudio._require('vstudio.recommendation.generate');
  select tenant_id into v_tenant from vstudio.opportunities where id = p_opportunity;
  if v_tenant is null then raise exception 'opportunity % not found', p_opportunity using errcode = 'no_data_found'; end if;
  insert into vstudio.recommendations
    (opportunity_id, recommendation, rationale, confidence, reuse_snapshot, ai_run_id, model, prompt_version, created_by)
  values
    (p_opportunity, p_recommendation, coalesce(p_attrs->>'rationale',''), nullif(p_attrs->>'confidence',''),
     coalesce(p_attrs->'reuse_snapshot','{}'::jsonb), nullif(p_attrs->>'ai_run_id','')::uuid,
     nullif(p_attrs->>'model',''), nullif(p_attrs->>'prompt_version',''), auth.uid())
  returning id into v_id;
  perform events.emit('vstudio.recommendation.generated', v_tenant, jsonb_build_object('opportunity', p_opportunity, 'recommendation', v_id));
  return v_id;
end; $$;
revoke all on function vstudio.generate_recommendation(uuid, vstudio.recommendation, jsonb) from public, anon;
grant execute on function vstudio.generate_recommendation(uuid, vstudio.recommendation, jsonb) to authenticated;

-- The authoritative act. Gated on vstudio.decision.record (CEO-level only).
create or replace function vstudio.record_decision(p_opportunity uuid, p_decision vstudio.decision, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform vstudio._require('vstudio.decision.record');
  select tenant_id into v_tenant from vstudio.opportunities where id = p_opportunity;
  if v_tenant is null then raise exception 'opportunity % not found', p_opportunity using errcode = 'no_data_found'; end if;
  insert into vstudio.decisions (opportunity_id, decision, rationale, conditions, decided_by, revisit_date, factory_authorized)
  values (p_opportunity, p_decision, coalesce(p_attrs->>'rationale',''), coalesce(p_attrs->>'conditions',''),
     auth.uid(), nullif(p_attrs->>'revisit_date','')::date, coalesce((p_attrs->>'factory_authorized')::boolean,false))
  returning id into v_id;
  perform events.emit('vstudio.ceo_decision.recorded', v_tenant,
    jsonb_build_object('opportunity', p_opportunity, 'decision', p_decision, 'decision_id', v_id));
  return v_id;
end; $$;
revoke all on function vstudio.record_decision(uuid, vstudio.decision, jsonb) from public, anon;
grant execute on function vstudio.record_decision(uuid, vstudio.decision, jsonb) to authenticated;
