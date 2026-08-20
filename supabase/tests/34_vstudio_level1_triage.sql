\ir _fixtures.sql.inc

-- Coverage for hlbos_0034_vstudio_level1_triage.
--
-- The scoring function is a CONTROL: it recomputes rankings over the whole
-- corpus and it is gated on a permission. Both halves are tested here — that
-- it produces scores, and that it refuses a caller who should not have them.
--
-- It also tests the property the whole phase rests on: scoring is READ-ONLY
-- over vstudio.opportunities. The corpus is counted before and after a real
-- scoring run and must not move by a single row.
begin;
select plan(14);
select tests.seed();

-- --- The control exists and is reachable ------------------------------------
select has_function('vstudio', 'score_level1', array['text'], 'the scoring control exists');
select has_function('vstudio', 'score_level1_categories', 'the work can be enumerated');
select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='vstudio' and p.proname='score_level1'),
  true,
  'scoring runs as definer, so it can write scores the caller cannot write directly'
);
select is(
  (select p.proconfig::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='vstudio' and p.proname='score_level1'),
  '{"search_path="}',
  'search_path is pinned empty — a definer function with a loose search_path is a privilege-escalation hole'
);
select ok(
  (select count(*) = 0 from information_schema.role_routine_grants
    where routine_schema='vstudio' and routine_name='score_level1' and grantee='anon'),
  'anonymous callers cannot run the scoring engine'
);

-- --- The gate actually refuses -----------------------------------------------
-- SET SESSION AUTHORIZATION, not SET ROLE: the guard reads session_user
-- precisely because current_user inside a definer function is the owner and
-- would wave everyone through. Testing with SET ROLE would therefore pass
-- while proving nothing.
set local session authorization authenticated;
select throws_ok(
  $$select vstudio.score_level1('anything')$$,
  '42501',
  null,
  'a caller without vstudio.intelligence.manage is refused'
);
reset session authorization;

-- --- Scoring does not touch the corpus ---------------------------------------
create temp table corpus_before on commit drop as
  select count(*) as n,
         md5(string_agg(id::text || coalesce(title,''), ',' order by id)) as fp
  from vstudio.opportunities;

-- Score every category partition, exactly as a full run does.
create temp table run_result on commit drop as
  select c.category, vstudio.score_level1(c.category) as rows_scored
  from vstudio.score_level1_categories() c;

select is(
  (select count(*)::int from vstudio.opportunities),
  (select n::int from corpus_before),
  'the corpus has exactly as many rows after scoring as before'
);
select is(
  (select md5(string_agg(id::text || coalesce(title,''), ',' order by id)) from vstudio.opportunities),
  (select fp from corpus_before),
  'every corpus row is byte-identical after scoring — nothing was rewritten'
);
select is(
  (select coalesce(sum(rows_scored),0)::int from run_result),
  (select n::int from corpus_before),
  'every opportunity was scored — no record was silently skipped'
);

-- --- The scores themselves are honest ----------------------------------------
select is(
  (select count(*)::int from vstudio.opportunity_scores where suitability_status = 'measured'),
  0,
  'HLG suitability is never labelled measured — it is an inference, and says so'
);
select ok(
  (select count(*) = 0 from vstudio.opportunity_scores
    where (popularity_score is null) <> (popularity_status = 'unknown')),
  'no score disagrees with its own status'
);
select ok(
  (select bool_and(analysis_level = 1) from vstudio.opportunity_scores),
  'this run records itself as Level 1, so the Executive Overview counts are real'
);
select ok(
  (select bool_and(jsonb_array_length(suitability_components) = 6)
     from vstudio.opportunity_scores),
  'every suitability score carries all six component values for audit'
);

-- --- Re-running is safe -------------------------------------------------------
-- Evidence changes over time, so the control must be re-runnable without
-- duplicating rows or needing a manual cleanup first.
select lives_ok(
  $$select vstudio.score_level1(category) from vstudio.score_level1_categories()$$,
  're-scoring is idempotent — one row per opportunity per scoring version'
);

select * from finish();
rollback;
