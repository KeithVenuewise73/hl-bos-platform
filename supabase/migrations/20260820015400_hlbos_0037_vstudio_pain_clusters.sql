-- ===========================================================================
-- hlbos_0037_vstudio_pain_clusters — turning public complaints into pain points
--
-- PURELY ADDITIVE. One new column, one unique index, three functions. No
-- existing column, row or constraint is removed or narrowed.
--
-- WHAT A PAIN CLUSTER IS, AND IS NOT
--
-- It is a RECURRING problem, assembled from individual public complaints that
-- each carry a URL anyone can open. It is not a summary, not a paraphrase and
-- not an estimate of how many people are affected.
--
-- The counts on a cluster are DERIVED from its signals by
-- vstudio.recount_pain_clusters(), never typed in — which is why that function
-- exists at all rather than the collector writing the numbers directly. A
-- count somebody typed is a claim; a count the database computed from rows you
-- can open is a fact.
--
-- WHAT STAYS UNKNOWN, DELIBERATELY
--
-- Market size, affected-audience size, willingness to pay, competitor pricing
-- and revenue potential are NOT set here and cannot be inferred from a pile of
-- GitHub issues. They stay NULL with status 'unknown', and the UI renders them
-- as NOT YET RESEARCHED. Filling them in would be exactly the invention the
-- brief forbids, and a plausible number is more dangerous than a blank one
-- because it gets quoted.
--
-- human_review_required defaults TRUE and nothing here clears it. A cluster is
-- a research lead until a person has read the evidence.
--
-- rollback: (manual, pre-approval only)
--   DROP FUNCTION IF EXISTS vstudio.build_pain_portfolio();
--   DROP FUNCTION IF EXISTS vstudio.recount_pain_clusters();
--   DROP FUNCTION IF EXISTS vstudio.link_pain_signals();
--   DROP INDEX IF EXISTS vstudio.pain_clusters_theme_key;
--   ALTER TABLE vstudio.pain_clusters DROP COLUMN IF EXISTS theme_key;
--
-- VERIFICATION (after apply): vstudio.recount_pain_clusters() returns the
--   number of clusters recounted, and every cluster's signal_count equals the
--   rows actually pointing at it. pgTAP: supabase/tests/37_vstudio_pain.sql.
-- ===========================================================================

-- The stable key that ties a database cluster to a theme defined in
-- packages/venture-studio/src/pain.ts, so a re-run updates the same cluster
-- rather than creating a second copy of it.
alter table vstudio.pain_clusters
  add column if not exists theme_key text;
create unique index if not exists pain_clusters_theme_key
  on vstudio.pain_clusters (theme_key) where theme_key is not null;
comment on column vstudio.pain_clusters.theme_key is
  'Stable key of the theme in packages/venture-studio/src/pain.ts. Clustering is deterministic keyword assignment against that source-controlled list, not a model — so a cluster''s membership rule is inspectable.';

-- ---------------------------------------------------------------------------
-- Link signals to clusters by the theme key the collector assigned
-- ---------------------------------------------------------------------------
create or replace function vstudio.link_pain_signals()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer;
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

  -- matched_phrases carries the theme key the deterministic assigner chose,
  -- prefixed so it cannot be confused with one of the CEO's phrasings.
  update vstudio.pain_signals s
     set cluster_id = c.id
    from vstudio.pain_clusters c
   where c.theme_key is not null
     and ('theme:' || c.theme_key) = any(s.matched_phrases)
     and s.cluster_id is distinct from c.id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;
revoke all on function vstudio.link_pain_signals() from public, anon;
grant execute on function vstudio.link_pain_signals() to authenticated;

-- ---------------------------------------------------------------------------
-- Derive every cluster count from its signals
-- ---------------------------------------------------------------------------
create or replace function vstudio.recount_pain_clusters()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer;
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

  update vstudio.pain_clusters c
     set signal_count      = coalesce(a.n, 0),
         source_count      = coalesce(a.sources, 0),
         first_observed_at = a.first_at,
         last_observed_at  = a.last_at,
         computed_at       = now()
    from (
      select cl.id,
             count(s.id)                          as n,
             count(distinct s.source)             as sources,
             min(s.created_at_source)             as first_at,
             max(s.created_at_source)             as last_at
      from vstudio.pain_clusters cl
      left join vstudio.pain_signals s on s.cluster_id = cl.id
      group by cl.id
    ) a
   where a.id = c.id;

  get diagnostics v_rows = row_count;

  -- Momentum needs two collection runs to compare, exactly as growth needs two
  -- observations. Until then it stays unknown rather than being read off a
  -- single snapshot of issue dates.
  update vstudio.pain_clusters
     set momentum_score = null, momentum_status = 'unknown'
   where momentum_status <> 'unknown' and momentum_score is null;

  return v_rows;
end;
$fn$;
revoke all on function vstudio.recount_pain_clusters() from public, anon;
grant execute on function vstudio.recount_pain_clusters() to authenticated;
comment on function vstudio.recount_pain_clusters() is
  'Recompute every cluster count from the signals pointing at it. Counts are derived, never typed in: a number the database computed from rows you can open is a fact, a number somebody entered is a claim.';

-- ---------------------------------------------------------------------------
-- The pain portfolio — ranks CLUSTERS, not repositories
-- ---------------------------------------------------------------------------
create or replace function vstudio.build_pain_portfolio(p_min_signals integer default 5)
returns uuid
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  v_def vstudio.portfolios%rowtype;
  v_snapshot uuid; v_universe integer; v_eligible integer; v_members integer;
  v_max integer;
  v_version text := '2026-08-20-v1';
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_def from vstudio.portfolios where key = 'pain';

  -- The universe here is the pain evidence, not the repository corpus: this is
  -- the one portfolio that does not rank vstudio.opportunities.
  select count(*) into v_universe from vstudio.pain_signals;
  select count(*) into v_eligible from vstudio.pain_clusters where signal_count >= p_min_signals;
  select coalesce(max(signal_count), 0) into v_max from vstudio.pain_clusters;

  insert into vstudio.portfolio_snapshots
    (portfolio_key, scoring_version, corpus_size, eligible_count, member_count, method, is_current)
  values ('pain', v_version, v_universe, v_eligible, 0,
    'Ranked on evidence weight across ' || v_universe || ' collected public signals. ' ||
    'A theme is presented as a pain point only once at least ' || p_min_signals ||
    ' separate public complaints support it — one complaint is a person having a bad day, ' ||
    'and the premise is recurrence. Themes below the bar are kept and counted, not deleted.',
    false)
  returning id into v_snapshot;

  insert into vstudio.portfolio_members (
    snapshot_id, pain_cluster_id, rank, ranking_basis, ranking_score, qualification
  )
  select v_snapshot, e.id, e.rn, 'pain',
         -- Normalized against the strongest cluster in this run, so the score
         -- is a position within the evidence we actually hold and never
         -- implies an absolute measure of how many people are affected.
         greatest(0, least(100, round(100.0 * e.signal_count / greatest(v_max, 1))::int)),
         jsonb_build_object(
           'basis', 'assembled from ' || e.signal_count || ' public complaints across ' ||
                    e.source_count || ' source type(s)',
           'signal_count', e.signal_count,
           'source_count', e.source_count,
           'min_signals_required', p_min_signals,
           'first_observed', e.first_observed_at,
           'last_observed', e.last_observed_at,
           'not_yet_researched', jsonb_build_array(
             'market_size','affected_audience_size','willingness_to_pay',
             'existing_solution_pricing','competitive_landscape','revenue_potential')
         )
  from (
    select c.*, row_number() over (order by c.signal_count desc, c.theme_key) as rn
    from vstudio.pain_clusters c
    where c.signal_count >= p_min_signals
  ) e
  where e.rn <= v_def.target_size;

  get diagnostics v_members = row_count;
  update vstudio.portfolio_snapshots set member_count = v_members where id = v_snapshot;
  update vstudio.portfolio_snapshots set is_current = false
   where portfolio_key = 'pain' and is_current and id <> v_snapshot;
  update vstudio.portfolio_snapshots set is_current = true where id = v_snapshot;
  return v_snapshot;
end;
$fn$;
revoke all on function vstudio.build_pain_portfolio(integer) from public, anon;
grant execute on function vstudio.build_pain_portfolio(integer) to authenticated;
comment on function vstudio.build_pain_portfolio(integer) is
  'Rank pain clusters by how much public evidence supports them. member_count is whatever the evidence supports — if that is fewer than the target size, the snapshot says so rather than padding the list.';
