\ir _fixtures.sql.inc

-- Coverage for hlbos_0036_vstudio_rising.
--
-- The single most important assertion in this file is that a rising score is
-- NOT produced from one observation. Everything else supports it.
begin;
select plan(13);
select tests.seed();
select tests.seed_opportunities();

select has_table('vstudio', 'observation_runs', 'the observation ledger exists');
select has_column('vstudio', 'metric_observations', 'run_id', 'an observation knows which run produced it');
select has_function('vstudio', 'seed_metric_baseline', 'the baseline can be established');
select has_function('vstudio', 'score_rising', 'growth can be scored');
select has_function('vstudio', 'build_rising_portfolio', 'the rising portfolio can be built');

-- --- A baseline is not a trend ----------------------------------------------
select lives_ok(
  $$select vstudio.score_level1(category) from vstudio.score_level1_categories()$$,
  'the corpus scores'
);
select ok(
  (select vstudio.seed_metric_baseline()) >= 0,
  'the discovery capture becomes observation number one'
);
select ok(
  (select bool_and(is_baseline) from vstudio.metric_observations),
  'every seeded observation is flagged as a baseline'
);
select is(
  (select vstudio.score_rising()),
  0,
  'with only a baseline, NOTHING is scored as rising — a photograph is not a trend'
);
select is(
  (select count(*)::int from vstudio.opportunity_scores where rising_status <> 'unknown'),
  0,
  'and every rising status stays unknown rather than defaulting to flat'
);

-- --- The ledger makes a missing row mean something --------------------------
select ok(
  (select bool_and(length(btrim(scope)) > 0) from vstudio.observation_runs),
  'a run always records what it covered, so partial coverage cannot pass as full'
);
select ok(
  (select bool_and(recorded_count <= observed_count) from vstudio.observation_runs),
  'a run cannot claim to have recorded more than it observed'
);

-- --- The gate refuses --------------------------------------------------------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$select vstudio.score_rising()$$,
  '42501', null,
  'computing growth needs vstudio.intelligence.manage'
);
select tests.logout();

select * from finish();
rollback;
