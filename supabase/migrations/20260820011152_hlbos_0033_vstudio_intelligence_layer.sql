-- ===========================================================================
-- hlbos_0033_vstudio_intelligence_layer — Top-100 portfolios, Rising, Pain
--
-- PURELY ADDITIVE. Seven new tables in `vstudio`. Nothing existing is dropped,
-- renamed, retyped or rewritten, and NOT ONE ROW of the 62,250-record
-- discovery corpus is modified by this migration. The intelligence layer sits
-- ABOVE the corpus: it ranks and groups by REFERENCE, never by reduction.
--
-- The corpus-preservation invariants this must not disturb are recorded in
-- .hlbos/corpus-baseline.json and re-checked by
-- supabase/checks/corpus-preservation.sql.
--
-- ---------------------------------------------------------------------------
-- THE FOUR INVARIANTS THIS SCHEMA ENFORCES STRUCTURALLY
-- ---------------------------------------------------------------------------
--
-- 1. TWO SCORES, NEVER COLLAPSED. There is no combined/overall score column
--    anywhere, and no view that averages the two. Popularity answers "do
--    people demonstrably care about this?"; suitability answers "is HLG
--    particularly positioned to do something commercially useful with it?".
--    A single number would hide exactly the distinction the CEO asked for
--    (high popularity + low fit is a REAL and useful answer, not a mediocre
--    one), so the schema makes collapsing them impossible rather than merely
--    discouraged.
--
-- 2. UNKNOWN IS A FIRST-CLASS ANSWER. Every score is paired with a
--    `metric_status` (measured / estimated / unknown), and a CHECK enforces
--    that a NULL score MUST be 'unknown' and a present score must NOT be.
--    You cannot store a number and call it unknown, and you cannot store
--    "unknown" while quietly carrying a number the UI might render.
--
-- 3. EVERY PAIN CLAIM IS TRACEABLE. `pain_signals.source_url` is NOT NULL and
--    CHECKed non-empty. There is no way to record public demand without
--    recording where it was observed. Clusters carry counts derived from
--    signals, never typed in.
--
-- 4. GROWTH IS MEASURED, NEVER ASSUMED. `metric_observations` is a time
--    series. A rising score requires two observations of the same repository;
--    with one, the schema records `is_baseline` and the rising score stays
--    NULL/'unknown'. Point-in-time popularity is not a trend and this schema
--    will not let it masquerade as one.
--
-- ---------------------------------------------------------------------------
-- STAGED ANALYSIS (analysis_level)
-- ---------------------------------------------------------------------------
--   0  DISCOVERY           — the raw corpus record and its source evidence
--   1  MACHINE TRIAGE      — deterministic scoring from discovery metadata
--   2  PORTFOLIO ANALYSIS  — candidates that qualified for a portfolio
--   3  DEEP RESEARCH       — survivors of Level 2, externally researched
--   4  EXECUTIVE DILIGENCE — under serious consideration by the CEO
-- Levels are stored, not inferred, so the Executive Overview counts are real.
--
-- ---------------------------------------------------------------------------
-- rollback: (manual, pre-approval only — additive, so dropping these leaves
--            the discovery corpus exactly as it is today)
--   DROP TABLE IF EXISTS vstudio.portfolio_members;
--   DROP TABLE IF EXISTS vstudio.portfolio_snapshots;
--   DROP TABLE IF EXISTS vstudio.portfolios;
--   DROP TABLE IF EXISTS vstudio.pain_signals;
--   DROP TABLE IF EXISTS vstudio.pain_clusters;
--   DROP TABLE IF EXISTS vstudio.metric_observations;
--   DROP TABLE IF EXISTS vstudio.opportunity_scores;
--   DELETE FROM identity.role_permissions WHERE permission_key = 'vstudio.intelligence.manage';
--   DELETE FROM identity.permissions      WHERE key            = 'vstudio.intelligence.manage';
--
-- VERIFICATION (after apply): expect 7 new tables in vstudio, RLS forced on
--   all 7, SELECT gated on vstudio.opportunity.read, and
--   vstudio.opportunities row count UNCHANGED at 62250.
--   pgTAP: supabase/tests/33_vstudio_intelligence_layer.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Scores — one row per (opportunity, scoring version)
-- ---------------------------------------------------------------------------
-- Re-scoring writes a NEW version rather than overwriting, so a ranking can
-- always be explained after the fact: "this was rank 7 under v1 because these
-- components had these values". Rankings are reproducible or they are opinion.
create table if not exists vstudio.opportunity_scores (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id        uuid not null references vstudio.opportunities(id) on delete cascade,
  scoring_version       text not null,

  -- Staged analysis depth actually reached for this opportunity.
  analysis_level        smallint not null default 1 check (analysis_level between 0 and 4),

  -- SCORE 1 — popularity / market evidence.
  popularity_score      integer check (popularity_score between 0 and 100),
  popularity_status     vstudio.metric_status not null default 'unknown',
  -- Component breakdown: [{component, value, weight, contribution, basis}].
  -- The CEO asked to SEE the component evidence, so an opaque total is not
  -- acceptable — the breakdown is stored alongside, not derivable later.
  popularity_components jsonb not null default '[]'::jsonb,

  -- SCORE 2 — HLG suitability. Deliberately a separate pair of columns.
  suitability_score      integer check (suitability_score between 0 and 100),
  suitability_status     vstudio.metric_status not null default 'unknown',
  suitability_components jsonb not null default '[]'::jsonb,

  -- SCORE 3 (optional) — rising/momentum. NULL until two observations exist.
  rising_score          integer check (rising_score between 0 and 100),
  rising_status         vstudio.metric_status not null default 'unknown',
  rising_components     jsonb not null default '[]'::jsonb,

  -- The measured inputs the scores were computed from, captured at compute
  -- time so a score never silently re-interprets changed source data.
  evidence              jsonb not null default '{}'::jsonb,
  -- Human-readable description of HOW, e.g. which normalization was applied.
  method                text not null default '',
  computed_at           timestamptz not null default now(),

  -- Unknown means unknown. A score and its status can never disagree.
  constraint popularity_status_matches_score check (
    (popularity_score is null and popularity_status = 'unknown') or
    (popularity_score is not null and popularity_status <> 'unknown')),
  constraint suitability_status_matches_score check (
    (suitability_score is null and suitability_status = 'unknown') or
    (suitability_score is not null and suitability_status <> 'unknown')),
  constraint rising_status_matches_score check (
    (rising_score is null and rising_status = 'unknown') or
    (rising_score is not null and rising_status <> 'unknown')),

  constraint opportunity_scores_version_key unique (opportunity_id, scoring_version)
);
comment on table vstudio.opportunity_scores is
  'Two independent scores per opportunity — popularity/market evidence and HLG suitability — plus an optional rising score. They are NEVER combined: there is no overall column, by design. One row per scoring version so any past ranking stays reproducible.';
comment on column vstudio.opportunity_scores.popularity_components is
  'Component breakdown [{component,value,weight,contribution,basis}] so the total can be audited rather than trusted.';
comment on column vstudio.opportunity_scores.rising_score is
  'NULL until at least two metric_observations exist for the opportunity. A point-in-time measurement is not growth.';

create index if not exists opportunity_scores_opportunity_idx
  on vstudio.opportunity_scores (opportunity_id);
create index if not exists opportunity_scores_popularity_idx
  on vstudio.opportunity_scores (scoring_version, popularity_score desc nulls last);
create index if not exists opportunity_scores_suitability_idx
  on vstudio.opportunity_scores (scoring_version, suitability_score desc nulls last);
create index if not exists opportunity_scores_rising_idx
  on vstudio.opportunity_scores (scoring_version, rising_score desc nulls last);
create index if not exists opportunity_scores_level_idx
  on vstudio.opportunity_scores (scoring_version, analysis_level);

-- ---------------------------------------------------------------------------
-- Metric observations — the time series that makes "rising" honest
-- ---------------------------------------------------------------------------
create table if not exists vstudio.metric_observations (
  id             bigint generated always as identity primary key,
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  observed_at    timestamptz not null default now(),
  source         text not null default 'github',
  -- The FIRST observation for an opportunity. Explicitly labelled so the UI
  -- can say "baseline — no trend yet" instead of implying a flat trend.
  is_baseline    boolean not null default false,
  stars          integer,
  forks          integer,
  open_issues    integer,
  pushed_at      timestamptz,
  archived       boolean,
  raw            jsonb not null default '{}'::jsonb,
  constraint metric_observations_unique unique (opportunity_id, observed_at)
);
comment on table vstudio.metric_observations is
  'Point-in-time repository metrics. Two rows are required before any growth can be computed; the first is flagged is_baseline and yields no trend.';
create index if not exists metric_observations_opportunity_idx
  on vstudio.metric_observations (opportunity_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- Portfolios — definitions, so Top-100 lists are configuration, not code
-- ---------------------------------------------------------------------------
create table if not exists vstudio.portfolios (
  key            text primary key,
  label          text not null,
  description    text not null default '',
  -- Which of the two scores orders THIS portfolio. Never a blend of both.
  rank_by        text not null check (rank_by in ('popularity','suitability','pain')),
  target_size    integer not null default 100 check (target_size between 1 and 1000),
  -- Declarative qualification rules (categories, topic/keyword matches,
  -- exclusions). Data, so the CEO's definition of "logistics" can change
  -- without a code deploy and without a new migration.
  qualification  jsonb not null default '{}'::jsonb,
  display_order  integer not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table vstudio.portfolios is
  'Definition of each saved ranked view over the discovery universe. A portfolio is a SELECTION, never a replacement dataset — the corpus underneath is untouched.';

-- ---------------------------------------------------------------------------
-- Portfolio snapshots — every recomputation is kept, so rankings are auditable
-- ---------------------------------------------------------------------------
create table if not exists vstudio.portfolio_snapshots (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  portfolio_key   text not null references vstudio.portfolios(key) on delete cascade,
  scoring_version text not null,
  computed_at     timestamptz not null default now(),
  -- Honesty counters: how big the universe was, how many qualified at all, and
  -- how many made the cut. If eligible < target_size the UI must say so rather
  -- than present a short list as if it were a full hundred.
  corpus_size     integer not null check (corpus_size >= 0),
  eligible_count  integer not null check (eligible_count >= 0),
  member_count    integer not null check (member_count >= 0),
  method          text not null default '',
  is_current      boolean not null default false
);
comment on table vstudio.portfolio_snapshots is
  'One row per recomputation of a portfolio. corpus_size/eligible_count/member_count exist so a short list can never be presented as a full hundred.';
-- Exactly one current snapshot per portfolio.
create unique index if not exists portfolio_snapshots_current_key
  on vstudio.portfolio_snapshots (portfolio_key) where is_current;
create index if not exists portfolio_snapshots_portfolio_idx
  on vstudio.portfolio_snapshots (portfolio_key, computed_at desc);

-- ---------------------------------------------------------------------------
-- Portfolio members — the ranked selection itself
-- ---------------------------------------------------------------------------
create table if not exists vstudio.portfolio_members (
  id                 bigint generated always as identity primary key,
  snapshot_id        uuid not null references vstudio.portfolio_snapshots(id) on delete cascade,
  opportunity_id     uuid references vstudio.opportunities(id) on delete cascade,
  -- The pain portfolio ranks CLUSTERS, not repositories. Exactly one of the
  -- two references is set — a member is one thing or the other, never both
  -- and never neither.
  pain_cluster_id    uuid,
  rank               integer not null check (rank >= 1),

  -- Scores copied from opportunity_scores at snapshot time. Copied on purpose:
  -- a rank must remain explicable even after the scores are recomputed.
  popularity_score   integer check (popularity_score between 0 and 100),
  popularity_status  vstudio.metric_status not null default 'unknown',
  suitability_score  integer check (suitability_score between 0 and 100),
  suitability_status vstudio.metric_status not null default 'unknown',
  rising_score       integer check (rising_score between 0 and 100),

  -- Which score produced THIS ordering. A pointer, not a blend: the two
  -- scores stay separate above and this records which one was used.
  ranking_basis      text not null check (ranking_basis in ('popularity','suitability','pain')),
  ranking_score      integer not null check (ranking_score between 0 and 100),

  -- Why this record qualified: matched terms, category, exclusions considered.
  qualification      jsonb not null default '{}'::jsonb,

  constraint portfolio_members_subject check (
    (opportunity_id is not null and pain_cluster_id is null) or
    (opportunity_id is null and pain_cluster_id is not null)),
  constraint portfolio_members_rank_key unique (snapshot_id, rank)
);
comment on table vstudio.portfolio_members is
  'The ranked selection for one snapshot. Scores are copied in so a historical rank stays explicable after re-scoring. ranking_basis names which score ordered the list — the two scores are never averaged.';
create index if not exists portfolio_members_snapshot_idx
  on vstudio.portfolio_members (snapshot_id, rank);
create index if not exists portfolio_members_opportunity_idx
  on vstudio.portfolio_members (opportunity_id);
create unique index if not exists portfolio_members_snapshot_opportunity_key
  on vstudio.portfolio_members (snapshot_id, opportunity_id) where opportunity_id is not null;

-- ---------------------------------------------------------------------------
-- Pain clusters — recurring public problems, assembled from real evidence
-- ---------------------------------------------------------------------------
create table if not exists vstudio.pain_clusters (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  title              text not null,
  problem_statement  text not null default '',
  -- How the cluster was formed (keyword set, method, version). Stated so a
  -- cluster is reproducible rather than an editorial act.
  method             text not null default '',
  keywords           text[] not null default '{}'::text[],
  -- Counts are DERIVED from pain_signals by the clustering run; they are
  -- recorded here for query speed and must always be reconcilable.
  signal_count       integer not null default 0 check (signal_count >= 0),
  source_count       integer not null default 0 check (source_count >= 0),
  first_observed_at  timestamptz,
  last_observed_at   timestamptz,
  -- Momentum only where measurable, and explicitly statused.
  momentum_score     integer check (momentum_score between 0 and 100),
  momentum_status    vstudio.metric_status not null default 'unknown',
  -- HLG relevance is an assessment, so it carries its own status too.
  hlg_relevance      integer check (hlg_relevance between 0 and 100),
  hlg_relevance_status vstudio.metric_status not null default 'unknown',
  -- BUILD / IMPROVE_EXISTING / INTEGRATE / ACQUIRE / PARTNER / RESEARCH /
  -- WATCH / PASS — or NULL, meaning not yet assessed.
  suggested_response text check (suggested_response in
    ('BUILD','IMPROVE_EXISTING','INTEGRATE','ACQUIRE','PARTNER','RESEARCH','WATCH','PASS')),
  confidence         text check (confidence in ('high','medium','low')),
  -- A cluster is machine-assembled. It is a research lead, not a finding,
  -- until a human has looked at it.
  human_review_required boolean not null default true,
  computed_at        timestamptz not null default now(),

  constraint pain_momentum_status_matches check (
    (momentum_score is null and momentum_status = 'unknown') or
    (momentum_score is not null and momentum_status <> 'unknown')),
  constraint pain_relevance_status_matches check (
    (hlg_relevance is null and hlg_relevance_status = 'unknown') or
    (hlg_relevance is not null and hlg_relevance_status <> 'unknown'))
);
comment on table vstudio.pain_clusters is
  'A recurring public problem assembled from pain_signals. Counts are derived from the signals, never typed in, and human_review_required defaults TRUE — a cluster is a lead, not a finding.';
create index if not exists pain_clusters_signal_count_idx
  on vstudio.pain_clusters (signal_count desc);

-- ---------------------------------------------------------------------------
-- Pain signals — the raw public evidence, each with a URL anyone can open
-- ---------------------------------------------------------------------------
create table if not exists vstudio.pain_signals (
  id                bigint generated always as identity primary key,
  -- Optional: a signal may be about a repository we already hold, or not.
  opportunity_id    uuid references vstudio.opportunities(id) on delete set null,
  cluster_id        uuid references vstudio.pain_clusters(id) on delete set null,
  source            text not null,
  -- NOT NULL and non-empty: there is no way to record public demand without
  -- recording where it was publicly observed. This is invariant 3.
  source_url        text not null check (length(btrim(source_url)) > 0),
  external_id       text not null,
  title             text not null default '',
  -- An EXCERPT, not a copy: enough to judge relevance, with the URL for the
  -- rest. We link to public discussion, we do not republish it.
  body_excerpt      text not null default '',
  labels            text[] not null default '{}'::text[],
  reactions         integer,
  comments          integer,
  state             text,
  created_at_source timestamptz,
  collected_at      timestamptz not null default now(),
  -- Which of the CEO's pain phrasings matched, kept so a signal's inclusion
  -- can be checked rather than trusted.
  matched_phrases   text[] not null default '{}'::text[],
  constraint pain_signals_external_key unique (source, external_id)
);
comment on table vstudio.pain_signals is
  'One piece of real, publicly observable pain evidence. source_url is mandatory and non-empty: every pain claim must be traceable to something a person can open and read.';
create index if not exists pain_signals_cluster_idx on vstudio.pain_signals (cluster_id);
create index if not exists pain_signals_opportunity_idx on vstudio.pain_signals (opportunity_id);
create index if not exists pain_signals_created_idx on vstudio.pain_signals (created_at_source desc nulls last);

-- ---------------------------------------------------------------------------
-- RLS — identical posture to the 0029 foundation: forced, no anon, SELECT
-- gated on the same platform permission that already guards the corpus.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select unnest(array['opportunity_scores','metric_observations','portfolios',
                               'portfolio_snapshots','portfolio_members',
                               'pain_clusters','pain_signals']) as t
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
-- Permission for running the analysis (distinct from reading its results)
-- ---------------------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('vstudio.intelligence.manage',
   'Run scoring, recompute portfolio snapshots and collect public pain evidence.',
   'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key)
select r, 'vstudio.intelligence.manage'
from unnest(array['platform_owner','platform_admin']) r
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Portfolio DEFINITIONS
--
-- These are configuration the CEO named in the directive, not discovered data,
-- so seeding them here is a statement of intent rather than invented content.
-- Qualification term lists live in the package
-- (packages/venture-studio/src/portfolios.ts) and are written into
-- `qualification` by the scoring run; the rows below establish identity,
-- ordering and which score ranks each list.
-- ---------------------------------------------------------------------------
insert into vstudio.portfolios (key, label, description, rank_by, target_size, display_order) values
  ('logistics', 'Logistics, Supply Chain & Operations',
   'Supply chain, transportation, final and middle mile, warehousing, routing, dispatch, fleet, inventory, procurement, 3PL and field/workforce operations. Ranked on HLG suitability because this is the domain HLG can most readily commercialize.',
   'suitability', 100, 10),
  ('transformation', 'Business Transformation & Service Business',
   'SMB operating systems, CRM, lead acquisition, marketing automation, scheduling, quoting, payments, workflow automation, AI agents, field and home services, vertical SaaS. Ranked on HLG suitability against Herman Legacy Digital, HLD Creative Studios, BTI, HL-BOS and HSCS.',
   'suitability', 100, 20),
  ('sports', 'Sports, Youth Sports & Sports Media',
   'Youth sports, team and league management, coaching, player development, recruiting, film and analytics, highlights, broadcasting, sponsorship, tournaments, facilities and fan engagement. Ranked on HLG suitability, with overlap against HomeHuddle, AthleteHuddle, CoachesHuddle, CoachAI, BroadcastAI, HighlightAI, Venuewise and 5-Star Sports Media noted rather than assumed to mean "build".',
   'suitability', 100, 30),
  ('outside-core', 'Outside HLG Core Markets',
   'Deliberately ranked on POPULARITY, not HLG fit. This portfolio exists to defeat tunnel vision: it surfaces the strongest demonstrated demand OUTSIDE the verticals HLG already operates in, and does not penalize an opportunity for being unfamiliar.',
   'popularity', 100, 40),
  ('pain', 'Public Pain Points & Unmet Needs',
   'Recurring problems people are publicly asking someone to solve, clustered from real evidence. Ranks pain clusters rather than repositories; every cluster is traceable to signals with public URLs.',
   'pain', 100, 50),
  ('rising', 'Rising Opportunities',
   'Accelerating projects and problems, detected from repeated observations rather than a single point in time. Membership does NOT require Top-100 standing. Empty until a second observation exists — a baseline is not a trend.',
   'popularity', 100, 60)
on conflict (key) do nothing;
