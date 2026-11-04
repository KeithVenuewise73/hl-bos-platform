create table if not exists vstudio.opportunity_scores (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  opportunity_id        uuid not null references vstudio.opportunities(id) on delete cascade,
  scoring_version       text not null,
  analysis_level        smallint not null default 1 check (analysis_level between 0 and 4),
  popularity_score      integer check (popularity_score between 0 and 100),
  popularity_status     vstudio.metric_status not null default 'unknown',
  popularity_components jsonb not null default '[]'::jsonb,
  suitability_score      integer check (suitability_score between 0 and 100),
  suitability_status     vstudio.metric_status not null default 'unknown',
  suitability_components jsonb not null default '[]'::jsonb,
  rising_score          integer check (rising_score between 0 and 100),
  rising_status         vstudio.metric_status not null default 'unknown',
  rising_components     jsonb not null default '[]'::jsonb,
  evidence              jsonb not null default '{}'::jsonb,
  method                text not null default '',
  computed_at           timestamptz not null default now(),
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

create table if not exists vstudio.metric_observations (
  id             bigint generated always as identity primary key,
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  observed_at    timestamptz not null default now(),
  source         text not null default 'github',
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

create table if not exists vstudio.portfolios (
  key            text primary key,
  label          text not null,
  description    text not null default '',
  rank_by        text not null check (rank_by in ('popularity','suitability','pain')),
  target_size    integer not null default 100 check (target_size between 1 and 1000),
  qualification  jsonb not null default '{}'::jsonb,
  display_order  integer not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table vstudio.portfolios is
  'Definition of each saved ranked view over the discovery universe. A portfolio is a SELECTION, never a replacement dataset — the corpus underneath is untouched.';

create table if not exists vstudio.portfolio_snapshots (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  portfolio_key   text not null references vstudio.portfolios(key) on delete cascade,
  scoring_version text not null,
  computed_at     timestamptz not null default now(),
  corpus_size     integer not null check (corpus_size >= 0),
  eligible_count  integer not null check (eligible_count >= 0),
  member_count    integer not null check (member_count >= 0),
  method          text not null default '',
  is_current      boolean not null default false
);
comment on table vstudio.portfolio_snapshots is
  'One row per recomputation of a portfolio. corpus_size/eligible_count/member_count exist so a short list can never be presented as a full hundred.';
create unique index if not exists portfolio_snapshots_current_key
  on vstudio.portfolio_snapshots (portfolio_key) where is_current;
create index if not exists portfolio_snapshots_portfolio_idx
  on vstudio.portfolio_snapshots (portfolio_key, computed_at desc);

create table if not exists vstudio.portfolio_members (
  id                 bigint generated always as identity primary key,
  snapshot_id        uuid not null references vstudio.portfolio_snapshots(id) on delete cascade,
  opportunity_id     uuid references vstudio.opportunities(id) on delete cascade,
  pain_cluster_id    uuid,
  rank               integer not null check (rank >= 1),
  popularity_score   integer check (popularity_score between 0 and 100),
  popularity_status  vstudio.metric_status not null default 'unknown',
  suitability_score  integer check (suitability_score between 0 and 100),
  suitability_status vstudio.metric_status not null default 'unknown',
  rising_score       integer check (rising_score between 0 and 100),
  ranking_basis      text not null check (ranking_basis in ('popularity','suitability','pain')),
  ranking_score      integer not null check (ranking_score between 0 and 100),
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

create table if not exists vstudio.pain_clusters (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  title              text not null,
  problem_statement  text not null default '',
  method             text not null default '',
  keywords           text[] not null default '{}'::text[],
  signal_count       integer not null default 0 check (signal_count >= 0),
  source_count       integer not null default 0 check (source_count >= 0),
  first_observed_at  timestamptz,
  last_observed_at   timestamptz,
  momentum_score     integer check (momentum_score between 0 and 100),
  momentum_status    vstudio.metric_status not null default 'unknown',
  hlg_relevance      integer check (hlg_relevance between 0 and 100),
  hlg_relevance_status vstudio.metric_status not null default 'unknown',
  suggested_response text check (suggested_response in
    ('BUILD','IMPROVE_EXISTING','INTEGRATE','ACQUIRE','PARTNER','RESEARCH','WATCH','PASS')),
  confidence         text check (confidence in ('high','medium','low')),
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

create table if not exists vstudio.pain_signals (
  id                bigint generated always as identity primary key,
  opportunity_id    uuid references vstudio.opportunities(id) on delete set null,
  cluster_id        uuid references vstudio.pain_clusters(id) on delete set null,
  source            text not null,
  source_url        text not null check (length(btrim(source_url)) > 0),
  external_id       text not null,
  title             text not null default '',
  body_excerpt      text not null default '',
  labels            text[] not null default '{}'::text[],
  reactions         integer,
  comments          integer,
  state             text,
  created_at_source timestamptz,
  collected_at      timestamptz not null default now(),
  matched_phrases   text[] not null default '{}'::text[],
  constraint pain_signals_external_key unique (source, external_id)
);
comment on table vstudio.pain_signals is
  'One piece of real, publicly observable pain evidence. source_url is mandatory and non-empty: every pain claim must be traceable to something a person can open and read.';
create index if not exists pain_signals_cluster_idx on vstudio.pain_signals (cluster_id);
create index if not exists pain_signals_opportunity_idx on vstudio.pain_signals (opportunity_id);
create index if not exists pain_signals_created_idx on vstudio.pain_signals (created_at_source desc nulls last);

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

insert into identity.permissions (key, description, scope) values
  ('vstudio.intelligence.manage',
   'Run scoring, recompute portfolio snapshots and collect public pain evidence.',
   'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key)
select r, 'vstudio.intelligence.manage'
from unnest(array['platform_owner','platform_admin']) r
on conflict do nothing;

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