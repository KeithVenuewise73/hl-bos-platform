-- hlbos_0041: source-neutral Pain / Need Discovery foundation
--
-- HLVS is two discovery universes joined by an intelligence bridge:
--
--   SUPPLY  vstudio.opportunities        what technology exists      (62,250)
--   DEMAND  vstudio.pain_signals         what problems people have      (439)
--   BRIDGE  vstudio.market_needs         what recurs, and what could serve it
--
-- The demand side was built against ONE source, GitHub issues, because that is
-- the only source this platform's egress policy permits today. That produced a
-- real but narrow population: developers, writing about developer tooling. The
-- fix is more sources, not different maths -- so this migration makes the
-- schema source-NEUTRAL first, and leaves every existing row exactly where it
-- is.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   * It does not delete, rewrite, re-rank or reclassify any existing row.
--   * It does not create Market Needs. The tables are empty on purpose: there
--     is not yet enough independent evidence to name one honestly, and an
--     empty table that explains itself beats a populated one that guesses.
--   * It adds no capability of ingesting Reddit. Reddit is unreachable from
--     this environment (egress policy denies CONNECT); see vstudio.pain_sources
--     below, which records that as data rather than as a comment.
--
-- SEPARATION OF CONCERNS -- the rule the CEO set, encoded in the schema:
--
--   RAW EVIDENCE   pain_signals.source_url + body_excerpt   (what was said)
--   PAIN SIGNAL    pain_signals.normalized_problem          (what it means)
--   MARKET NEED    market_needs                             (what recurs)
--   SOLUTION MATCH market_need_solutions                    (what could serve it)
--
-- Each is a separate row in a separate table so a claim can always be walked
-- back to the public page it came from.
--
-- rollback:
--   drop table if exists vstudio.market_need_solutions;
--   drop table if exists vstudio.market_need_signals;
--   drop table if exists vstudio.market_needs;
--   drop table if exists vstudio.pain_sources;
--   alter table vstudio.pain_signals
--     drop column if exists discovery_run_id,
--     drop column if exists source_community, drop column if exists source_type,
--     drop column if exists population_type, drop column if exists normalized_problem,
--     drop column if exists normalized_status, drop column if exists discovery_query,
--     drop column if exists language, drop column if exists content_fingerprint,
--     drop column if exists engagement;
--   drop table if exists vstudio.pain_discovery_runs;
--   drop type if exists vstudio.pain_population;
--   drop type if exists vstudio.pain_source_state;
--   The 439 existing signals survive this rollback: every column above is one
--   this migration added, and none carries data that existed before it.

-- ---------------------------------------------------------------------------
-- Vocabularies
-- ---------------------------------------------------------------------------
-- Population is the answer to "whose problem is this?". It is the single most
-- important column here: without it a need that appears 500 times looks strong
-- even when 92% of the evidence came from one kind of person.
do $$ begin
  create type vstudio.pain_population as enum (
    'developer_technical', 'consumer', 'small_business', 'enterprise',
    'operations', 'logistics', 'sports', 'parents_families', 'education',
    'healthcare', 'home_services', 'creators', 'other', 'unknown');
exception when duplicate_object then null; end $$;

-- Every state a source can be in, including the ones that mean "no data".
-- `connected` is the only state that may accompany stored signals, and the
-- check on pain_sources enforces exactly that.
do $$ begin
  create type vstudio.pain_source_state as enum (
    'connected', 'accessible_not_connected', 'requires_credential',
    'technically_restricted', 'tos_review_required', 'not_currently_feasible');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Discovery runs -- the same shape as vstudio.observation_runs, deliberately
-- ---------------------------------------------------------------------------
create table if not exists vstudio.pain_discovery_runs (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  source         text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  -- The funnel, in numbers, so a stored count can always be reconciled with
  -- what the search actually returned.
  returned_count integer not null default 0 check (returned_count  >= 0),
  verified_count integer not null default 0 check (verified_count  >= 0),
  matched_count  integer not null default 0 check (matched_count   >= 0),
  stored_count   integer not null default 0 check (stored_count    >= 0),
  scope          text not null default '',
  method         text not null default '',
  engine_version text not null default '',
  -- Stored can never exceed verified: that would mean storing evidence the
  -- collector never confirmed.
  constraint pain_run_funnel_is_consistent check (
    verified_count <= returned_count and stored_count <= verified_count)
);
comment on table vstudio.pain_discovery_runs is
  'One pain collection pass. Records the whole funnel -- returned, verified, theme-matched, stored -- so any signal count can be reconciled against what the source actually gave back.';

-- ---------------------------------------------------------------------------
-- Source registry AS DATA
-- ---------------------------------------------------------------------------
-- packages/venture-studio/src/sources.ts declares 13 sources with a type that
-- has exactly one variant, "not_connected" -- it cannot represent a connected
-- source at all, and it went stale the moment GitHub issues started returning
-- real rows. A registry that cannot express the truth is worse than none.
create table if not exists vstudio.pain_sources (
  key            text primary key,
  label          text not null,
  state          vstudio.pain_source_state not null,
  -- Why it is in that state, in words a non-engineer can act on.
  state_reason   text not null default '',
  population_hint vstudio.pain_population not null default 'unknown',
  -- Set only when a real collection has run against it.
  first_collected_at timestamptz,
  last_collected_at  timestamptz,
  evidence_url   text,
  checked_at     timestamptz not null default now(),
  notes          text not null default ''
);
comment on table vstudio.pain_sources is
  'Which public sources HLVS has actually reached, and which it has not. A source is `connected` only when a real run stored real rows; every other state names the specific obstacle.';

-- ---------------------------------------------------------------------------
-- pain_signals becomes source-neutral -- IN PLACE
-- ---------------------------------------------------------------------------
-- ADD COLUMN with no default does not rewrite the table, so the 439 existing
-- rows are untouched and keep their ids, URLs and cluster links. Every column
-- is nullable because for some sources the value genuinely will not exist, and
-- NULL that means "unknown" is worth more than a default that means "wrong".
alter table vstudio.pain_signals
  add column if not exists discovery_run_id    uuid references vstudio.pain_discovery_runs(id) on delete set null,
  -- Where the conversation happened: a repository, a subreddit, an app listing.
  add column if not exists source_community    text,
  -- issue | discussion | post | comment | review | question | answer
  add column if not exists source_type         text,
  add column if not exists population_type     vstudio.pain_population not null default 'unknown',
  -- The problem in one sentence, source-neutral. This is the first genuinely
  -- INFERRED field in HLVS. vstudio.metric_status has exactly three values --
  -- measured, estimated, unknown -- and an inference is `estimated`, the same
  -- label HLG suitability carries. No new enum value is introduced for it: the
  -- point of that vocabulary is that it stays small enough to mean something.
  -- The raw excerpt always stays beside the inference.
  add column if not exists normalized_problem  text,
  add column if not exists normalized_status   vstudio.metric_status not null default 'unknown',
  add column if not exists discovery_query     text,
  add column if not exists language            text,
  -- Cross-source dedupe: the same complaint reposted in three places is one
  -- problem, not three. Computed at collection time so a later pass never has
  -- to re-read the corpus to find duplicates.
  add column if not exists content_fingerprint text,
  -- Source-specific engagement (score, upvotes, stars, helpful-votes) without
  -- inventing a column per source. reactions/comments stay where they are.
  add column if not exists engagement          jsonb not null default '{}'::jsonb;

-- A normalized problem statement is an inference. It may never masquerade as a
-- measurement, and there must be no way to store one without saying so.
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

-- ---------------------------------------------------------------------------
-- Market needs -- the demand-side intelligence layer
-- ---------------------------------------------------------------------------
-- EMPTY ON PURPOSE. A market need asserts that many independent people want
-- the same thing. Today's evidence is one source and one population, which can
-- support a product-complaint theme but not that assertion. The table exists so
-- the next source has somewhere to land.
create table if not exists vstudio.market_needs (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  slug               text not null unique,
  title              text not null,
  need_statement     text not null default '',
  who_has_it         text not null default '',
  -- Strength COMPONENTS, not a blended score. Weighting one source against
  -- another is meaningless until there is more than one source to weigh.
  evidence_count     integer not null default 0 check (evidence_count     >= 0),
  distinct_sources   integer not null default 0 check (distinct_sources   >= 0),
  distinct_communities integer not null default 0 check (distinct_communities >= 0),
  distinct_populations integer not null default 0 check (distinct_populations >= 0),
  first_observed_at  timestamptz,
  last_observed_at   timestamptz,
  -- Bias, measured. "500 signals, 92% from developers" is a fact this column
  -- makes reportable rather than a caveat someone has to remember.
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

-- Need <- evidence. Many-to-many: one signal can support more than one need.
create table if not exists vstudio.market_need_signals (
  market_need_id uuid not null references vstudio.market_needs(id) on delete cascade,
  signal_id      bigint not null references vstudio.pain_signals(id) on delete cascade,
  contribution   text not null default '',
  linked_at      timestamptz not null default now(),
  primary key (market_need_id, signal_id)
);
comment on table vstudio.market_need_signals is
  'The evidence trail: which public complaints support which need. Deleting a need never deletes the evidence.';

-- Need <-> supply universe. The `relation` column carries the distinction the
-- CEO drew and it is the whole point of this table:
--
--   evidence_source   this complaint CAME FROM this repository
--   candidate_solution this repository MIGHT HELP solve the need
--
-- A repository that generates complaints is frequently the worst candidate to
-- solve them. Collapsing these two into one link would quietly assert the
-- opposite, so the primary key includes `relation` and both can coexist.
create table if not exists vstudio.market_need_solutions (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  market_need_id uuid references vstudio.market_needs(id) on delete cascade,
  signal_id      bigint references vstudio.pain_signals(id) on delete cascade,
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  relation       text not null check (relation in ('evidence_source','candidate_solution')),
  -- How well it addresses the need, and what is left over. Both null until
  -- somebody or something has actually assessed it.
  addresses_score  integer check (addresses_score between 0 and 100),
  addresses_status vstudio.metric_status not null default 'unknown',
  remaining_gap    text not null default '',
  rationale        text not null default '',
  linked_at      timestamptz not null default now(),
  -- The two relations answer to different subjects, and saying so here stops a
  -- nonsense row existing at all:
  --   evidence_source    is a fact about ONE SIGNAL -- this complaint was filed
  --                      in this repository -- so it must name that signal.
  --   candidate_solution is an assessment against a NEED -- this repository
  --                      might help -- so it must name that need.
  -- A candidate_solution with no need is an opinion about nothing.
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

-- ---------------------------------------------------------------------------
-- Row-level security -- same posture as the rest of the intelligence layer
-- ---------------------------------------------------------------------------
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
