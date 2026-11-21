do $$ begin
  create type vstudio.pain_population as enum (
    'developer_technical', 'consumer', 'small_business', 'enterprise',
    'operations', 'logistics', 'sports', 'parents_families', 'education',
    'healthcare', 'home_services', 'creators', 'other', 'unknown');
exception when duplicate_object then null; end $$;
do $$ begin
  create type vstudio.pain_source_state as enum (
    'connected', 'accessible_not_connected', 'requires_credential',
    'technically_restricted', 'tos_review_required', 'not_currently_feasible');
exception when duplicate_object then null; end $$;
create table if not exists vstudio.pain_discovery_runs (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  source         text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  returned_count integer not null default 0 check (returned_count  >= 0),
  verified_count integer not null default 0 check (verified_count  >= 0),
  matched_count  integer not null default 0 check (matched_count   >= 0),
  stored_count   integer not null default 0 check (stored_count    >= 0),
  scope          text not null default '',
  method         text not null default '',
  engine_version text not null default '',
  constraint pain_run_funnel_is_consistent check (
    verified_count <= returned_count and stored_count <= verified_count)
);
comment on table vstudio.pain_discovery_runs is
  'One pain collection pass. Records the whole funnel -- returned, verified, theme-matched, stored -- so any signal count can be reconciled against what the source actually gave back.';
create table if not exists vstudio.pain_sources (
  key            text primary key,
  label          text not null,
  state          vstudio.pain_source_state not null,
  state_reason   text not null default '',
  population_hint vstudio.pain_population not null default 'unknown',
  first_collected_at timestamptz,
  last_collected_at  timestamptz,
  evidence_url   text,
  checked_at     timestamptz not null default now(),
  notes          text not null default ''
);
comment on table vstudio.pain_sources is
  'Which public sources HLVS has actually reached, and which it has not. A source is `connected` only when a real run stored real rows; every other state names the specific obstacle.';
alter table vstudio.pain_signals
  add column if not exists discovery_run_id    uuid references vstudio.pain_discovery_runs(id) on delete set null,
  add column if not exists source_community    text,
  add column if not exists source_type         text,
  add column if not exists population_type     vstudio.pain_population not null default 'unknown',
  add column if not exists normalized_problem  text,
  add column if not exists normalized_status   vstudio.metric_status not null default 'unknown',
  add column if not exists discovery_query     text,
  add column if not exists language            text,
  add column if not exists content_fingerprint text,
  add column if not exists engagement          jsonb not null default '{}'::jsonb;
alter table vstudio.pain_signals
  drop constraint if exists pain_normalized_status_matches;
alter table vstudio.pain_signals
  add constraint pain_normalized_status_matches check (
    (normalized_problem is null and normalized_status = 'unknown') or
    (normalized_problem is not null and normalized_status = 'estimated'));
create index if not exists pain_signals_population_idx  on vstudio.pain_signals (population_type);
create index if not exists pain_signals_community_idx   on vstudio.pain_signals (source_community);
create index if not exists pain_signals_fingerprint_idx on vstudio.pain_signals (content_fingerprint)
  where content_fingerprint is not null;
create index if not exists pain_signals_run_idx         on vstudio.pain_signals (discovery_run_id);
create table if not exists vstudio.market_needs (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  slug               text not null unique,
  title              text not null,
  need_statement     text not null default '',
  who_has_it         text not null default '',
  evidence_count     integer not null default 0 check (evidence_count     >= 0),
  distinct_sources   integer not null default 0 check (distinct_sources   >= 0),
  distinct_communities integer not null default 0 check (distinct_communities >= 0),
  distinct_populations integer not null default 0 check (distinct_populations >= 0),
  first_observed_at  timestamptz,
  last_observed_at   timestamptz,
  population_mix     jsonb not null default '{}'::jsonb,
  hlg_vertical       text check (hlg_vertical in
    ('supply_chain_logistics','business_transformation','sports','service_industry',
     'hld_digital_services','cross_vertical','outside_hlg_core')),
  hlg_disposition    text check (hlg_disposition in
    ('BUILD','BUY','PARTNER','TRANSFORM','MONITOR','IGNORE')),
  disposition_status vstudio.metric_status not null default 'unknown',
  method             text not null default '',
  engine_version     text not null default '',
  human_review_required boolean not null default true,
  computed_at        timestamptz not null default now(),
  constraint market_need_disposition_status_matches check (
    (hlg_disposition is null and disposition_status = 'unknown') or
    (hlg_disposition is not null and disposition_status <> 'unknown'))
);
comment on table vstudio.market_needs is
  'A recurring problem people are trying to solve, inferred from pain signals across sources. Strength is stored as components (evidence, sources, communities, populations) rather than one blended number, because cross-source confirmation is the thing that matters and it cannot be faked by volume from a single source.';
create table if not exists vstudio.market_need_signals (
  market_need_id uuid not null references vstudio.market_needs(id) on delete cascade,
  signal_id      bigint not null references vstudio.pain_signals(id) on delete cascade,
  contribution   text not null default '',
  linked_at      timestamptz not null default now(),
  primary key (market_need_id, signal_id)
);
comment on table vstudio.market_need_signals is
  'The evidence trail: which public complaints support which need. Deleting a need never deletes the evidence.';
create table if not exists vstudio.market_need_solutions (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  market_need_id uuid references vstudio.market_needs(id) on delete cascade,
  signal_id      bigint references vstudio.pain_signals(id) on delete cascade,
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  relation       text not null check (relation in ('evidence_source','candidate_solution')),
  addresses_score  integer check (addresses_score between 0 and 100),
  addresses_status vstudio.metric_status not null default 'unknown',
  remaining_gap    text not null default '',
  rationale        text not null default '',
  linked_at      timestamptz not null default now(),
  constraint need_solution_subject check (
    (relation = 'evidence_source'    and signal_id is not null) or
    (relation = 'candidate_solution' and market_need_id is not null)),
  constraint need_solution_addresses_status_matches check (
    (addresses_score is null and addresses_status = 'unknown') or
    (addresses_score is not null and addresses_status <> 'unknown')),
  constraint need_solution_unique unique nulls not distinct
    (market_need_id, signal_id, opportunity_id, relation)
);
comment on table vstudio.market_need_solutions is
  'Links the demand side to the supply side. `relation` separates "this complaint came from this repository" (a fact) from "this repository could help solve this need" (an assessment). They are never the same claim.';
create index if not exists need_solutions_opportunity_idx on vstudio.market_need_solutions (opportunity_id);
create index if not exists need_solutions_relation_idx    on vstudio.market_need_solutions (relation);
create index if not exists need_signals_signal_idx        on vstudio.market_need_signals (signal_id);
alter table vstudio.pain_discovery_runs   enable row level security;
alter table vstudio.pain_discovery_runs   force row level security;
alter table vstudio.pain_sources          enable row level security;
alter table vstudio.pain_sources          force row level security;
alter table vstudio.market_needs          enable row level security;
alter table vstudio.market_needs          force row level security;
alter table vstudio.market_need_signals   enable row level security;
alter table vstudio.market_need_signals   force row level security;
alter table vstudio.market_need_solutions enable row level security;
alter table vstudio.market_need_solutions force row level security;
do $$
declare t text;
begin
  foreach t in array array['pain_discovery_runs','pain_sources','market_needs',
                           'market_need_signals','market_need_solutions'] loop
    execute format(
      'drop policy if exists %I on vstudio.%I', t || '_read', t);
    execute format(
      'create policy %I on vstudio.%I for select using (identity.has_platform_permission(%L))',
      t || '_read', t, 'vstudio.opportunity.read');
  end loop;
end $$;
grant select on vstudio.pain_discovery_runs, vstudio.pain_sources, vstudio.market_needs,
                vstudio.market_need_signals, vstudio.market_need_solutions to authenticated;