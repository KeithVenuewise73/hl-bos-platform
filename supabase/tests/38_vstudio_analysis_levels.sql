\ir _fixtures.sql.inc

-- Coverage for hlbos_0038_vstudio_analysis_levels.
--
-- The Executive Overview reports these counts to the CEO, so the test that
-- matters is that level 2 equals the number of records actually in a current
-- portfolio — not a number that merely looks plausible.
begin;
select plan(8);
select tests.seed();

select has_function('vstudio', 'set_analysis_levels', 'analysis levels can be set from real membership');

select lives_ok(
  $$select vstudio.score_level1(category) from vstudio.score_level1_categories()$$,
  'the corpus scores at level 1'
);
select ok(
  (select bool_and(analysis_level = 1) from vstudio.opportunity_scores),
  'triage alone leaves everything at level 1'
);

create temp table built on commit drop as
  select k, vstudio.build_portfolio(k) as snapshot_id
  from unnest(array['logistics','transformation','sports','outside-core']) k;

select ok((select vstudio.set_analysis_levels()) >= 0, 'levels can be recomputed');

select is(
  (select count(*)::int from vstudio.opportunity_scores where analysis_level = 2),
  (select count(distinct m.opportunity_id)::int
     from vstudio.portfolio_members m
     join vstudio.portfolio_snapshots s on s.id = m.snapshot_id and s.is_current
    where m.opportunity_id is not null),
  'level 2 equals the records actually in a current portfolio'
);
select is(
  (select count(*)::int from vstudio.opportunity_scores where analysis_level in (1, 2)),
  (select count(*)::int from vstudio.opportunity_scores),
  'every scored record sits at level 1 or 2 — none is left unaccounted for'
);

-- --- Human work is never undone by a rebuild --------------------------------
update vstudio.opportunity_scores set analysis_level = 4
 where id = (select id from vstudio.opportunity_scores limit 1);
select ok((select vstudio.set_analysis_levels()) >= 0, 'levels recompute again');
select is(
  (select count(*)::int from vstudio.opportunity_scores where analysis_level = 4),
  1,
  'a record marked as executive diligence keeps that level through a rebuild'
);

select * from finish();
rollback;
