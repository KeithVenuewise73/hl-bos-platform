\ir _fixtures.sql.inc

-- Coverage for hlbos_0041.
--
-- The claim this file defends is that the demand side became source-neutral
-- WITHOUT disturbing the evidence already collected, and that the schema makes
-- the dishonest states unstorable rather than merely discouraged.
begin;
select plan(20);
select tests.seed();

select has_table('vstudio', 'pain_discovery_runs', 'a collection pass is recorded');
select has_table('vstudio', 'pain_sources', 'the source registry is data, not hardcoded copy');
select has_table('vstudio', 'market_needs', 'market needs have somewhere to live');
select has_table('vstudio', 'market_need_signals', 'a need keeps its evidence trail');
select has_table('vstudio', 'market_need_solutions', 'demand can be joined to supply');

select has_column('vstudio', 'pain_signals', 'population_type', 'whose problem is this');
select has_column('vstudio', 'pain_signals', 'source_community', 'where the conversation happened');
select has_column('vstudio', 'pain_signals', 'content_fingerprint', 'cross-source dedupe is possible');
select has_column('vstudio', 'pain_signals', 'normalized_problem', 'a source-neutral restatement can be stored');

-- --- Market needs start empty, deliberately -----------------------------------
-- One source and one population cannot support the claim "many independent
-- people want this". The table exists for the next source; it is not filled in
-- advance.
select is(
  (select count(*)::int from vstudio.market_needs), 0,
  'no market need is asserted before the evidence can support one');

-- --- The dishonest states are unstorable --------------------------------------
create temp table t_sig (like vstudio.pain_signals including all) on commit drop;
select throws_ok(
  $$insert into t_sig (source, source_url, external_id, normalized_problem, normalized_status)
    values ('x','https://e.test/1','a','a restated problem','unknown')$$,
  '23514', null,
  'an inferred problem statement cannot be stored without saying it is an inference');
select lives_ok(
  $$insert into t_sig (source, source_url, external_id, normalized_problem, normalized_status)
    values ('x','https://e.test/2','b','a restated problem','estimated')$$,
  'the same statement is storable when labelled estimated');

create temp table t_run (like vstudio.pain_discovery_runs including all) on commit drop;
select throws_ok(
  $$insert into t_run (source, returned_count, verified_count, stored_count)
    values ('x', 10, 5, 9)$$,
  '23514', null,
  'a run cannot claim to have stored more evidence than it verified');
select throws_ok(
  $$insert into t_run (source, returned_count, verified_count, stored_count)
    values ('x', 5, 10, 1)$$,
  '23514', null,
  'a run cannot verify more than the source returned');

-- --- The two relationships stay distinct --------------------------------------
create temp table t_sol (like vstudio.market_need_solutions including all) on commit drop;
select throws_ok(
  $$insert into t_sol (opportunity_id, relation) values (gen_random_uuid(), 'solves_it')$$,
  '23514', null,
  'only evidence_source and candidate_solution are storable relations');
-- evidence_source is a fact about a signal, so it must name one.
select lives_ok(
  $$insert into t_sol (opportunity_id, signal_id, relation)
    values (gen_random_uuid(), 1, 'evidence_source')$$,
  'a complaint can be recorded as having come from a repository');
select throws_ok(
  $$insert into t_sol (opportunity_id, market_need_id, relation)
    values (gen_random_uuid(), gen_random_uuid(), 'evidence_source')$$,
  '23514', null,
  'an evidence_source link with no signal names no evidence');
-- candidate_solution is an assessment against a need, so it must name one.
select throws_ok(
  $$insert into t_sol (opportunity_id, signal_id, relation)
    values (gen_random_uuid(), null, 'candidate_solution')$$,
  '23514', null,
  'a proposed solution with no need attached is an opinion about nothing');
select throws_ok(
  $$insert into t_sol (opportunity_id, relation, addresses_score, addresses_status)
    values (gen_random_uuid(), 'candidate_solution', 80, 'unknown')$$,
  '23514', null,
  'a fit score cannot be stored while claiming it was never assessed');

-- --- Reading is gated exactly like the rest of the intelligence layer ---------
select is(
  (select count(*)::int from pg_policies
    where schemaname='vstudio'
      and qual like '%has_platform_permission(%vstudio.opportunity.read%'
      and tablename in ('pain_discovery_runs','pain_sources','market_needs',
                        'market_need_signals','market_need_solutions')),
  5,
  'every new demand-side table needs the same read permission as the corpus');

select * from finish();
rollback;
