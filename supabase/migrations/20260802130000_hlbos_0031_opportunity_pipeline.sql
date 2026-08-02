-- ===========================================================================
-- v0_opportunity_pipeline — HLVS V2 Workstream B2 (successor to the HLVS Think Tank)
--
-- The Opportunity Intelligence Pipeline: continuously ingest, organise, relate,
-- score and prioritise opportunities. ASSEMBLES on the existing `vstudio`
-- opportunity model (0029) and reuses identity/permissions, ai.runs (AI
-- provenance), events.emit. It does NOT duplicate:
--   * connectors are the reusable `integrations` registry + `discovery`
--     collectors (defined as a code registry here; rows/edge-functions added
--     without redesign) — NOT a new connector system,
--   * reuse scoring stays in @hl-bos/catalog, recommendation in
--     vstudio.recommendations (advisory), AI runs in ai.runs.
--
-- Net-new (thin, additive): opportunity relationships (incl. duplicate links),
-- a NON-AUTHORITATIVE AI opportunity summary carrying honest estimates, and a
-- few source-tracking / priority columns on opportunities.
--
-- AI stays advisory; the CEO decision (0029) remains the only authoritative act.
--
-- rollback: (manual, pre-approval only — this migration is not auto-applied)
--   DROP FUNCTION IF EXISTS vstudio.set_opportunity_priority(uuid, integer, text);
--   DROP FUNCTION IF EXISTS vstudio.record_opportunity_summary(uuid, jsonb);
--   DROP FUNCTION IF EXISTS vstudio.relate_opportunities(uuid, uuid, vstudio.relationship_type, jsonb);
--   DROP TABLE IF EXISTS vstudio.opportunity_summaries CASCADE;
--   DROP TABLE IF EXISTS vstudio.opportunity_relationships CASCADE;
--   DROP INDEX IF EXISTS vstudio.opportunities_external_ref_idx;
--   ALTER TABLE vstudio.opportunities
--     DROP COLUMN IF EXISTS priority_tier, DROP COLUMN IF EXISTS priority_score,
--     DROP COLUMN IF EXISTS external_ref, DROP COLUMN IF EXISTS source_connector;
--   DROP TYPE IF EXISTS vstudio.relationship_type;
--
-- VERIFICATION (after apply): 2 new tables (RLS forced), opportunities gains
--   source_connector/external_ref/priority_score/priority_tier, 3 SECURITY
--   DEFINER RPCs. pgTAP: supabase/tests/24_opportunity_pipeline.sql.
-- ===========================================================================

do $$ begin
  create type vstudio.relationship_type as enum
    ('duplicate_of','related_to','supersedes','depends_on','merged_into');
exception when duplicate_object then null; end $$;

-- Source tracking + priority on the existing opportunity (the Inbox).
alter table vstudio.opportunities
  add column if not exists source_connector extensions.citext,   -- connector key (in-code registry)
  add column if not exists external_ref     text,                -- stable id from the source (dedup)
  add column if not exists priority_score   integer check (priority_score is null or priority_score between 0 and 100),
  add column if not exists priority_tier    text check (priority_tier is null or priority_tier in ('now','soon','later','watch'));

comment on column vstudio.opportunities.source_connector is
  'Which in-code Opportunity Connector produced this (github|reddit|…). NULL for manual capture. Not an authorization input.';
comment on column vstudio.opportunities.external_ref is
  'Stable identifier from the source system, used to avoid re-ingesting the same discovery.';

-- One row per (connector, external ref) — prevents duplicate ingestion.
create unique index if not exists opportunities_external_ref_idx
  on vstudio.opportunities (source_connector, external_ref)
  where source_connector is not null and external_ref is not null;

-- Opportunity relationships (related / duplicate / supersedes / depends_on).
create table if not exists vstudio.opportunity_relationships (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  from_opportunity_id   uuid not null references vstudio.opportunities(id) on delete cascade,
  to_opportunity_id     uuid not null references vstudio.opportunities(id) on delete cascade,
  relationship_type     vstudio.relationship_type not null default 'related_to',
  similarity            numeric(5,2) check (similarity is null or (similarity >= 0 and similarity <= 100)),
  note                  text not null default '',
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint opp_rel_distinct check (from_opportunity_id <> to_opportunity_id),
  constraint opp_rel_unique unique (from_opportunity_id, to_opportunity_id, relationship_type)
);
comment on table vstudio.opportunity_relationships is
  'Directed relationships between opportunities. duplicate_of links are produced by deterministic duplicate detection (a suggestion) and confirmed by an operator.';
create index if not exists opp_rel_from_idx on vstudio.opportunity_relationships (from_opportunity_id);
create index if not exists opp_rel_to_idx   on vstudio.opportunity_relationships (to_opportunity_id);

-- NON-AUTHORITATIVE AI opportunity summary (with honest estimates).
create table if not exists vstudio.opportunity_summaries (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id        uuid not null references vstudio.opportunities(id) on delete cascade,
  summary               text not null default '',
  category              text not null default '',
  confidence            text check (confidence is null or confidence in ('high','medium','low')),
  build_effort_value    numeric,
  build_effort_unit     text not null default 'weeks',
  build_effort_status   vstudio.metric_status not null default 'unknown',
  revenue_value         numeric,
  revenue_unit          text not null default 'USD/yr',
  revenue_status        vstudio.metric_status not null default 'unknown',
  recommendation        vstudio.recommendation,        -- advisory mirror; the authoritative rec lives in vstudio.recommendations
  ai_run_id             bigint references ai.runs(id) on delete set null,
  model                 text,
  -- HARD INVARIANT: a summary is AI-assisted and never authoritative.
  authoritative         boolean not null default false check (authoritative = false),
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now()
);
comment on table vstudio.opportunity_summaries is
  'AI-assisted opportunity summary. Non-authoritative (CHECK). Estimates carry a measured/estimated/unknown status — a bare number is never stored as fact.';
create index if not exists opp_summary_opportunity_idx on vstudio.opportunity_summaries (opportunity_id);

-- RLS — force on both; SELECT gated on vstudio.opportunity.read; no anon.
do $$
declare r text;
begin
  foreach r in array array['opportunity_relationships','opportunity_summaries']
  loop
    execute format('alter table vstudio.%I enable row level security', r);
    execute format('alter table vstudio.%I force row level security', r);
    execute format('revoke all on vstudio.%I from anon', r);
    execute format('drop policy if exists %I_select on vstudio.%I', r, r);
    execute format($p$create policy %I_select on vstudio.%I for select to authenticated using (identity.has_platform_permission('vstudio.opportunity.read'))$p$, r, r);
    execute format('grant select on vstudio.%I to authenticated', r);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Write RPCs (SECURITY DEFINER; permission-checked; auth.uid() provenance)
-- ---------------------------------------------------------------------------

create or replace function vstudio.relate_opportunities(
  p_from uuid, p_to uuid, p_type vstudio.relationship_type, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  if p_from = p_to then
    raise exception 'an opportunity cannot relate to itself' using errcode = 'check_violation'; end if;
  select tenant_id into v_tenant from vstudio.opportunities where id = p_from;
  if v_tenant is null then
    raise exception 'opportunity % not found', p_from using errcode = 'no_data_found'; end if;
  if not exists (select 1 from vstudio.opportunities where id = p_to) then
    raise exception 'opportunity % not found', p_to using errcode = 'no_data_found'; end if;
  insert into vstudio.opportunity_relationships
    (from_opportunity_id, to_opportunity_id, relationship_type, similarity, note, created_by)
  values
    (p_from, p_to, p_type, nullif(p_attrs->>'similarity','')::numeric,
     coalesce(p_attrs->>'note',''), auth.uid())
  on conflict (from_opportunity_id, to_opportunity_id, relationship_type) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from vstudio.opportunity_relationships
      where from_opportunity_id = p_from and to_opportunity_id = p_to and relationship_type = p_type; end if;
  perform events.emit('vstudio.opportunity.related', v_tenant,
    jsonb_build_object('from', p_from, 'to', p_to, 'type', p_type::text));
  return v_id;
end; $$;
revoke all on function vstudio.relate_opportunities(uuid, uuid, vstudio.relationship_type, jsonb) from public, anon;
grant execute on function vstudio.relate_opportunities(uuid, uuid, vstudio.relationship_type, jsonb) to authenticated;

create or replace function vstudio.record_opportunity_summary(
  p_opportunity uuid, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  select tenant_id into v_tenant from vstudio.opportunities where id = p_opportunity;
  if v_tenant is null then
    raise exception 'opportunity % not found', p_opportunity using errcode = 'no_data_found'; end if;
  insert into vstudio.opportunity_summaries
    (opportunity_id, summary, category, confidence,
     build_effort_value, build_effort_unit, build_effort_status,
     revenue_value, revenue_unit, revenue_status,
     recommendation, ai_run_id, model, created_by)
  values
    (p_opportunity, coalesce(p_attrs->>'summary',''), coalesce(p_attrs->>'category',''),
     nullif(p_attrs->>'confidence',''),
     nullif(p_attrs->>'build_effort_value','')::numeric, coalesce(p_attrs->>'build_effort_unit','weeks'),
     coalesce(nullif(p_attrs->>'build_effort_status','')::vstudio.metric_status,'unknown'),
     nullif(p_attrs->>'revenue_value','')::numeric, coalesce(p_attrs->>'revenue_unit','USD/yr'),
     coalesce(nullif(p_attrs->>'revenue_status','')::vstudio.metric_status,'unknown'),
     nullif(p_attrs->>'recommendation','')::vstudio.recommendation,
     nullif(p_attrs->>'ai_run_id','')::bigint, nullif(p_attrs->>'model',''), auth.uid())
  returning id into v_id;
  perform events.emit('vstudio.opportunity.summarized', v_tenant,
    jsonb_build_object('opportunity', p_opportunity, 'summary', v_id));
  return v_id;
end; $$;
revoke all on function vstudio.record_opportunity_summary(uuid, jsonb) from public, anon;
grant execute on function vstudio.record_opportunity_summary(uuid, jsonb) to authenticated;

create or replace function vstudio.set_opportunity_priority(
  p_opportunity uuid, p_score integer, p_tier text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  if p_score is not null and (p_score < 0 or p_score > 100) then
    raise exception 'priority score must be 0..100' using errcode = 'check_violation'; end if;
  if p_tier is not null and p_tier not in ('now','soon','later','watch') then
    raise exception 'invalid priority tier' using errcode = 'check_violation'; end if;
  update vstudio.opportunities
     set priority_score = p_score, priority_tier = p_tier, updated_at = now()
   where id = p_opportunity returning tenant_id into v_tenant;
  if not found then
    raise exception 'opportunity % not found', p_opportunity using errcode = 'no_data_found'; end if;
  perform events.emit('vstudio.opportunity.prioritized', v_tenant,
    jsonb_build_object('opportunity', p_opportunity, 'score', p_score, 'tier', p_tier));
end; $$;
revoke all on function vstudio.set_opportunity_priority(uuid, integer, text) from public, anon;
grant execute on function vstudio.set_opportunity_priority(uuid, integer, text) to authenticated;
