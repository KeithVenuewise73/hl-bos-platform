\ir _fixtures.sql.inc

-- Coverage for hlbos_0033_vstudio_intelligence_layer.
--
-- The migration's value is its GUARDS, so this file tests the guards rather
-- than the column list. Three of them are functional tests, not catalog
-- assertions: the constraints are copied into temp tables (which do not carry
-- the FORCED row-level security of the originals) and then attacked with the
-- exact rows they exist to refuse. A CHECK that has never rejected anything is
-- indistinguishable from a comment.
begin;
select plan(34);
select tests.seed();

-- --- The seven tables exist -------------------------------------------------
select has_table('vstudio', 'opportunity_scores',  'scores table exists');
select has_table('vstudio', 'metric_observations', 'observation time series exists');
select has_table('vstudio', 'portfolios',          'portfolio definitions exist');
select has_table('vstudio', 'portfolio_snapshots', 'portfolio snapshots exist');
select has_table('vstudio', 'portfolio_members',   'portfolio members exist');
select has_table('vstudio', 'pain_clusters',       'pain clusters exist');
select has_table('vstudio', 'pain_signals',        'pain signals exist');

-- --- Invariant 1: the two scores are never collapsed ------------------------
-- The CEO asked explicitly for popularity and HLG suitability to stay apart.
-- The strongest way to keep them apart is for no combined column to exist to
-- be tempted by, so this asserts an ABSENCE.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'vstudio'
      and table_name in ('opportunity_scores','portfolio_members')
      and column_name in ('overall_score','combined_score','total_score',
                          'composite_score','score','final_score')),
  0,
  'no combined score column exists — popularity and suitability cannot be collapsed'
);
select has_column('vstudio', 'opportunity_scores', 'popularity_score', 'popularity is its own score');
select has_column('vstudio', 'opportunity_scores', 'suitability_score', 'HLG suitability is its own score');

-- --- Invariant 2: unknown is unknown (functional) ---------------------------
create temp table t_scores (like vstudio.opportunity_scores including all);

select throws_ok(
  $$insert into t_scores (opportunity_id, scoring_version, popularity_score, popularity_status)
    values (pg_catalog.gen_random_uuid(), 'test', 80, 'unknown')$$,
  '23514',
  null,
  'a score labelled unknown while carrying a number is rejected'
);
select throws_ok(
  $$insert into t_scores (opportunity_id, scoring_version, popularity_score, popularity_status)
    values (pg_catalog.gen_random_uuid(), 'test', null, 'measured')$$,
  '23514',
  null,
  'claiming a measurement without a number is rejected'
);
select throws_ok(
  $$insert into t_scores (opportunity_id, scoring_version, suitability_score, suitability_status)
    values (pg_catalog.gen_random_uuid(), 'test', null, 'estimated')$$,
  '23514',
  null,
  'the same rule binds HLG suitability, not just popularity'
);
select throws_ok(
  $$insert into t_scores (opportunity_id, scoring_version, popularity_score, popularity_status)
    values (pg_catalog.gen_random_uuid(), 'test', 101, 'measured')$$,
  '23514',
  null,
  'a score outside 0-100 is rejected'
);
select lives_ok(
  $$insert into t_scores (opportunity_id, scoring_version) values (pg_catalog.gen_random_uuid(), 'test-a')$$,
  'an unscored opportunity is representable: null score, unknown status'
);
select lives_ok(
  $$insert into t_scores (opportunity_id, scoring_version, popularity_score, popularity_status,
                          suitability_score, suitability_status)
    values (pg_catalog.gen_random_uuid(), 'test-b', 72, 'measured', 41, 'estimated')$$,
  'a measured popularity and an estimated suitability coexist on one row'
);
-- Rising must be able to stay unknown while the other two are known — that is
-- exactly the state of a first observation.
select lives_ok(
  $$insert into t_scores (opportunity_id, scoring_version, popularity_score, popularity_status)
    values (pg_catalog.gen_random_uuid(), 'test-c', 60, 'measured')$$,
  'rising stays unknown while popularity is measured — a baseline has no trend'
);

-- --- Invariant 3: every pain claim is traceable (functional) ----------------
create temp table t_signals (like vstudio.pain_signals including all);

select throws_ok(
  $$insert into t_signals (source, source_url, external_id) values ('github_issue', '', 'x1')$$,
  '23514',
  null,
  'pain evidence with an empty source URL is rejected'
);
select throws_ok(
  $$insert into t_signals (source, source_url, external_id) values ('github_issue', '   ', 'x2')$$,
  '23514',
  null,
  'whitespace does not count as a source URL'
);
select lives_ok(
  $$insert into t_signals (source, source_url, external_id)
    values ('github_issue', 'https://github.com/o/r/issues/1', 'x3')$$,
  'pain evidence with a real public URL is accepted'
);
select col_not_null('vstudio', 'pain_signals', 'source_url',
  'a pain signal can never be recorded without a source');

-- --- Invariant 4: growth is measured, not assumed ---------------------------
select has_column('vstudio', 'metric_observations', 'observed_at',
  'observations are timestamped, so two of them define an interval');
select has_column('vstudio', 'metric_observations', 'is_baseline',
  'the first observation is labelled baseline rather than implying a flat trend');
select ok(
  (select count(*) = 1 from pg_indexes
    where schemaname='vstudio' and tablename='metric_observations'
      and indexname='metric_observations_opportunity_idx'),
  'observations are indexed per opportunity by time, so a delta is cheap'
);

-- --- A portfolio member is one subject, never two or none (functional) ------
create temp table t_members (like vstudio.portfolio_members including all);

select throws_ok(
  $$insert into t_members (snapshot_id, rank, ranking_basis, ranking_score)
    values (pg_catalog.gen_random_uuid(), 1, 'popularity', 50)$$,
  '23514',
  null,
  'a ranked member that points at neither an opportunity nor a pain cluster is rejected'
);
select throws_ok(
  $$insert into t_members (snapshot_id, opportunity_id, pain_cluster_id, rank, ranking_basis, ranking_score)
    values (pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(), 1, 'pain', 50)$$,
  '23514',
  null,
  'a ranked member cannot be both a repository and a pain cluster'
);

-- --- Only one snapshot per portfolio may be the current one ----------------
select ok(
  (select indexdef like '%UNIQUE%' and indexdef like '%is_current%'
     from pg_indexes
    where schemaname='vstudio' and tablename='portfolio_snapshots'
      and indexname='portfolio_snapshots_current_key'),
  'exactly one snapshot per portfolio can be current, so the UI cannot show two rankings at once'
);

-- --- The portfolios the CEO named exist as DATA, not as code ---------------
select is(
  (select count(*)::int from vstudio.portfolios
    where key in ('logistics','transformation','sports','outside-core','pain','rising')),
  6,
  'all five Top-100 portfolios plus Rising Opportunities are defined'
);
-- Outside-core must rank on popularity: ranking it on HLG fit would recreate
-- the tunnel vision the portfolio exists to break.
select is(
  (select rank_by from vstudio.portfolios where key='outside-core'),
  'popularity',
  'the outside-core portfolio ranks on demonstrated demand, not on HLG fit'
);
select is(
  (select rank_by from vstudio.portfolios where key='logistics'),
  'suitability',
  'the logistics portfolio ranks on HLG suitability, where HLG domain knowledge counts'
);

-- --- RLS posture matches the corpus it sits above --------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='vstudio' and c.relrowsecurity and c.relforcerowsecurity
      and c.relname in ('opportunity_scores','metric_observations','portfolios',
                        'portfolio_snapshots','portfolio_members','pain_clusters','pain_signals')),
  7,
  'row-level security is FORCED on all seven intelligence tables'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname='vstudio'
      -- Matched by shape, not by exact rendering: pg_policies schema-qualifies
      -- the citext cast differently depending on the search_path the extension
      -- was installed under, and this assertion is about which permission
      -- guards the row, not about how the cast prints.
      and qual like '%has_platform_permission(%vstudio.opportunity.read%'
      and tablename in ('opportunity_scores','metric_observations','portfolios',
                        'portfolio_snapshots','portfolio_members','pain_clusters','pain_signals')),
  7,
  'reading the intelligence layer needs the same permission as reading the corpus'
);
select ok(
  (select count(*) = 0 from information_schema.role_table_grants
    where table_schema='vstudio' and grantee='anon'
      and table_name in ('opportunity_scores','metric_observations','portfolios',
                         'portfolio_snapshots','portfolio_members','pain_clusters','pain_signals')),
  'anonymous callers hold no privilege on any intelligence table'
);

-- --- Running the analysis is a separate privilege from reading it ----------
select ok(
  (select count(*) = 1 from identity.permissions where key = 'vstudio.intelligence.manage'),
  'recomputing scores and portfolios is its own permission'
);

select * from finish();
rollback;
