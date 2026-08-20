-- ===========================================================================
-- hlbos_0036_vstudio_rising — measuring growth instead of assuming it
--
-- PURELY ADDITIVE. One new table, one new column, three new functions, and two
-- CHECK constraints WIDENED to admit a new value. No column is dropped, no
-- row is rewritten, and no existing value becomes invalid.
--
-- THE PROBLEM THIS SOLVES
--
-- The discovery corpus is a photograph: 62,250 repositories as they stood the
-- day they were found. A photograph cannot tell you what is accelerating. The
-- temptation is to treat a high star count as "rising", which is exactly the
-- invention the brief forbids — a popular project and a growing project are
-- different claims, and only one of them is supported by a single reading.
--
-- So growth here requires TWO observations of the same repository, taken the
-- same way, and the rising score stays NULL/'unknown' until both exist. The
-- first observation is flagged is_baseline: a baseline is not a trend, and the
-- UI says so rather than drawing a flat line.
--
-- WHY OBSERVATION RUNS ARE RECORDED
--
-- A second pass over 62,214 repositories produces mostly nothing: a project
-- that gained one star in three days has not accelerated. Writing 62,214 rows
-- to record that would be noise. So a run records what it OBSERVED, and only
-- materially-changed repositories get an observation row.
--
-- That makes the absence of a row meaningful, and meaning must be written
-- down: vstudio.observation_runs stores the scope, the materiality bar and
-- both counts. "No row in run R" then means "observed in run R, below the
-- stated bar" — a checkable fact — rather than "we do not know".
--
-- rollback: (manual, pre-approval only)
--   ALTER TABLE vstudio.metric_observations DROP COLUMN IF EXISTS run_id;
--   DROP TABLE IF EXISTS vstudio.observation_runs;
--   DROP FUNCTION IF EXISTS vstudio.seed_metric_baseline();
--   DROP FUNCTION IF EXISTS vstudio.score_rising();
--   DROP FUNCTION IF EXISTS vstudio.build_rising_portfolio();
--   -- the widened CHECKs can be narrowed again once no 'rising' rows remain
--
-- VERIFICATION (after apply): vstudio.seed_metric_baseline() returns the corpus
--   size; vstudio.score_rising() returns 0 until a second observation exists.
--   pgTAP: supabase/tests/36_vstudio_rising.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Observation runs — the ledger that makes a missing row mean something
-- ---------------------------------------------------------------------------
create table if not exists vstudio.observation_runs (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  source          text not null default 'github',
  -- What was looked at, in words the CEO can read. A run that covered only
  -- part of the corpus must say so here.
  scope           text not null,
  -- The bar a change had to clear to be worth a row. Stated, not implied.
  materiality     text not null default '',
  method          text not null default '',
  observed_count  integer not null default 0 check (observed_count >= 0),
  recorded_count  integer not null default 0 check (recorded_count >= 0),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint observation_runs_recorded_within_observed
    check (recorded_count <= observed_count)
);
comment on table vstudio.observation_runs is
  'One pass of re-measuring repositories. Records scope, materiality bar and both counts, so that a repository WITHOUT an observation row in this run is known to have been observed and found unchanged, rather than simply unknown.';

alter table vstudio.metric_observations
  add column if not exists run_id uuid references vstudio.observation_runs(id) on delete set null;
create index if not exists metric_observations_run_idx
  on vstudio.metric_observations (run_id);

-- RLS posture identical to the rest of the intelligence layer.
alter table vstudio.observation_runs enable row level security;
alter table vstudio.observation_runs force row level security;
revoke all on vstudio.observation_runs from anon;
drop policy if exists observation_runs_select on vstudio.observation_runs;
create policy observation_runs_select on vstudio.observation_runs
  for select to authenticated
  using (identity.has_platform_permission('vstudio.opportunity.read'));
grant select on vstudio.observation_runs to authenticated;

-- ---------------------------------------------------------------------------
-- Widen two CHECKs to admit 'rising'
--
-- Widening only: every value that was legal before is still legal, so no
-- existing row can be invalidated by this.
-- ---------------------------------------------------------------------------
alter table vstudio.portfolios
  drop constraint if exists portfolios_rank_by_check;
alter table vstudio.portfolios
  add constraint portfolios_rank_by_check
  check (rank_by in ('popularity','suitability','pain','rising'));

alter table vstudio.portfolio_members
  drop constraint if exists portfolio_members_ranking_basis_check;
alter table vstudio.portfolio_members
  add constraint portfolio_members_ranking_basis_check
  check (ranking_basis in ('popularity','suitability','pain','rising'));

update vstudio.portfolios set rank_by = 'rising', updated_at = now() where key = 'rising';

-- ---------------------------------------------------------------------------
-- Baseline: the corpus reading itself, promoted to observation number one
-- ---------------------------------------------------------------------------
-- Not a new measurement. These are the exact figures GitHub reported when each
-- repository was discovered, moved into the time series so a later reading has
-- something to be compared against. Flagged is_baseline so nothing mistakes
-- them for a trend.
create or replace function vstudio.seed_metric_baseline()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_run uuid; v_rows integer;
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

  insert into vstudio.observation_runs (source, scope, materiality, method, observed_count, finished_at)
  select 'github',
         'Every opportunity carrying repository metrics, promoted from the discovery capture itself.',
         'None — the baseline records every row, because there is nothing yet to compare it against.',
         'Copied from vstudio.opportunities as captured at discovery time. No new API call was made.',
         count(*), now()
  from vstudio.opportunities where stars is not null or forks is not null
  returning id into v_run;

  insert into vstudio.metric_observations
    (opportunity_id, observed_at, source, is_baseline, stars, forks, open_issues, pushed_at, archived, run_id, raw)
  select o.id,
         coalesce(o.discovered_at, o.created_at),
         coalesce(o.source_type, 'github'),
         true,
         o.stars, o.forks, o.open_issues, o.pushed_at, o.archived,
         v_run,
         jsonb_build_object('origin', 'discovery-capture')
  from vstudio.opportunities o
  where (o.stars is not null or o.forks is not null)
  on conflict (opportunity_id, observed_at) do nothing;

  get diagnostics v_rows = row_count;
  update vstudio.observation_runs set recorded_count = v_rows where id = v_run;
  return v_rows;
end;
$fn$;
revoke all on function vstudio.seed_metric_baseline() from public, anon;
grant execute on function vstudio.seed_metric_baseline() to authenticated;

-- ---------------------------------------------------------------------------
-- Rising score — computed only where two readings exist
-- ---------------------------------------------------------------------------
create or replace function vstudio.score_rising()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer; v_version text := '2026-08-20-v1';
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

  with pairs as (
    select
      o.opportunity_id,
      min(o.observed_at) as first_at,
      max(o.observed_at) as last_at,
      count(*) as observations,
      (array_agg(o.stars       order by o.observed_at))[1]                as first_stars,
      (array_agg(o.stars       order by o.observed_at desc))[1]           as last_stars,
      (array_agg(o.forks       order by o.observed_at desc))[1]           as last_forks,
      (array_agg(o.forks       order by o.observed_at))[1]                as first_forks,
      (array_agg(o.open_issues order by o.observed_at desc))[1]           as last_issues,
      (array_agg(o.open_issues order by o.observed_at))[1]                as first_issues
    from vstudio.metric_observations o
    group by o.opportunity_id
    -- TWO readings. This is the whole point: one reading is a photograph.
    having count(*) >= 2
  ),
  measured as (
    select p.*,
      greatest(extract(epoch from (p.last_at - p.first_at)) / 86400.0, 0)::numeric as days,
      coalesce(p.last_stars,0) - coalesce(p.first_stars,0)   as star_delta,
      coalesce(p.last_forks,0) - coalesce(p.first_forks,0)   as fork_delta,
      coalesce(p.last_issues,0) - coalesce(p.first_issues,0) as issue_delta
    from pairs p
    -- A window shorter than half a day cannot distinguish growth from noise.
    where extract(epoch from (p.last_at - p.first_at)) / 86400.0 >= 0.5
  ),
  scored as (
    select m.*,
      -- Absolute velocity: stars per day, log-normalized. A project adding 50
      -- stars a day is extraordinary; the log keeps 5/day from disappearing.
      greatest(0::numeric, least(1::numeric,
        log(10::numeric, greatest(0, m.star_delta)::numeric / greatest(m.days, 0.5) + 1) / log(10::numeric, 51))) as v_abs,
      -- Relative growth: a project going 40 -> 80 doubled, and that matters
      -- more than a 500,000-star project adding 400. Rising is about
      -- acceleration, not size — size is what the popularity score is for.
      greatest(0::numeric, least(1::numeric,
        (greatest(0, m.star_delta)::numeric / greatest(coalesce(m.first_stars,0), 1)) / 0.10)) as v_rel,
      greatest(0::numeric, least(1::numeric,
        log(10::numeric, greatest(0, m.fork_delta)::numeric / greatest(m.days, 0.5) + 1) / log(10::numeric, 11))) as v_forks,
      greatest(0::numeric, least(1::numeric,
        log(10::numeric, greatest(0, m.issue_delta)::numeric / greatest(m.days, 0.5) + 1) / log(10::numeric, 11))) as v_issues
    from measured m
  )
  update vstudio.opportunity_scores s
     set rising_score = round((z.v_abs * 40 + z.v_rel * 35 + z.v_forks * 15 + z.v_issues * 10) / 100 * 100)::int,
         rising_status = 'measured',
         rising_components = jsonb_build_array(
           jsonb_build_object('c','star_velocity','v',round(z.v_abs,4),'w',40),
           jsonb_build_object('c','relative_growth','v',round(z.v_rel,4),'w',35),
           jsonb_build_object('c','fork_velocity','v',round(z.v_forks,4),'w',15),
           jsonb_build_object('c','issue_velocity','v',round(z.v_issues,4),'w',10)
         ),
         evidence = s.evidence || jsonb_build_object('rising', jsonb_build_object(
           'observations', z.observations,
           'window_days', round(z.days, 2),
           'first_observed', z.first_at,
           'last_observed', z.last_at,
           'stars_from', z.first_stars, 'stars_to', z.last_stars, 'star_delta', z.star_delta,
           'fork_delta', z.fork_delta, 'issue_delta', z.issue_delta
         ))
    from scored z
   where s.opportunity_id = z.opportunity_id
     and s.scoring_version = v_version;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;
revoke all on function vstudio.score_rising() from public, anon;
grant execute on function vstudio.score_rising() to authenticated;
comment on function vstudio.score_rising() is
  'Compute the rising score wherever two observations exist. Repositories with only a baseline keep rising_score NULL and rising_status unknown — a photograph is not a trend.';

-- ---------------------------------------------------------------------------
-- The Rising Opportunities portfolio
-- ---------------------------------------------------------------------------
-- Deliberately NOT limited to Top-100 members: the point is to catch things
-- before they are obvious, and an opportunity that is already obvious has
-- already been caught.
create or replace function vstudio.build_rising_portfolio()
returns uuid
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  v_def vstudio.portfolios%rowtype;
  v_snapshot uuid; v_corpus integer; v_eligible integer; v_members integer;
  v_version text := '2026-08-20-v1';
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_def from vstudio.portfolios where key = 'rising';
  select count(*) into v_corpus from vstudio.opportunities;
  select count(*) into v_eligible from vstudio.opportunity_scores
   where scoring_version = v_version and rising_score is not null and rising_score > 0;

  insert into vstudio.portfolio_snapshots
    (portfolio_key, scoring_version, corpus_size, eligible_count, member_count, method, is_current)
  values ('rising', v_version, v_corpus, v_eligible, 0,
    'Ranked on measured growth between two observations. ' || v_eligible ||
    ' of ' || v_corpus || ' corpus records had two readings far enough apart to measure and showed growth; ' ||
    'the rest keep an unknown rising score rather than an assumed flat one.',
    false)
  returning id into v_snapshot;

  insert into vstudio.portfolio_members (
    snapshot_id, opportunity_id, rank,
    popularity_score, popularity_status, suitability_score, suitability_status, rising_score,
    ranking_basis, ranking_score, qualification
  )
  select v_snapshot, e.opportunity_id, e.rn,
         e.popularity_score, e.popularity_status, e.suitability_score, e.suitability_status, e.rising_score,
         'rising', e.rising_score,
         jsonb_build_object(
           'basis', 'measured growth between two observations',
           'rising', e.evidence->'rising'
         )
  from (
    select s.*, row_number() over (
      order by s.rising_score desc, s.popularity_score desc nulls last, s.opportunity_id
    ) as rn
    from vstudio.opportunity_scores s
    where s.scoring_version = v_version and s.rising_score is not null and s.rising_score > 0
  ) e
  where e.rn <= v_def.target_size;

  get diagnostics v_members = row_count;
  update vstudio.portfolio_snapshots set member_count = v_members where id = v_snapshot;
  update vstudio.portfolio_snapshots set is_current = false
   where portfolio_key = 'rising' and is_current and id <> v_snapshot;
  update vstudio.portfolio_snapshots set is_current = true where id = v_snapshot;
  return v_snapshot;
end;
$fn$;
revoke all on function vstudio.build_rising_portfolio() from public, anon;
grant execute on function vstudio.build_rising_portfolio() to authenticated;
