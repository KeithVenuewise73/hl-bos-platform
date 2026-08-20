\ir _fixtures.sql.inc

-- Coverage for hlbos_0037_vstudio_pain_clusters.
--
-- The claim under test is that a pain point is traceable: its counts come from
-- rows you can open, and it cannot exist without them.
begin;
select plan(16);
select tests.seed();

select has_column('vstudio', 'pain_clusters', 'theme_key', 'a cluster is tied to a source-controlled theme');
select has_function('vstudio', 'link_pain_signals', 'signals can be attached to clusters');
select has_function('vstudio', 'recount_pain_clusters', 'counts can be derived');
select has_function('vstudio', 'build_pain_portfolio', array['integer'], 'the pain portfolio can be built');

-- --- Evidence cannot be recorded without a source ----------------------------
create temp table t_sig (like vstudio.pain_signals including all) on commit drop;
select throws_ok(
  $$insert into t_sig (source, source_url, external_id) values ('github_issue', '', 'a')$$,
  '23514', null,
  'a pain signal with no source URL is refused'
);
select throws_ok(
  $$insert into t_sig (source, source_url, external_id) values ('github_issue', E'\t \n', 'b')$$,
  '23514', null,
  'whitespace is not a source URL'
);
select lives_ok(
  $$insert into t_sig (source, source_url, external_id)
    values ('github_issue', 'https://github.com/o/r/issues/1', 'c')$$,
  'a signal with a real public URL is accepted'
);

-- --- One theme, one cluster ---------------------------------------------------
insert into vstudio.pain_clusters (theme_key, title, problem_statement)
values ('t-alpha', 'Alpha', 'A'), ('t-beta', 'Beta', 'B');
select throws_ok(
  $$insert into vstudio.pain_clusters (theme_key, title) values ('t-alpha', 'Alpha again')$$,
  '23505', null,
  're-running the collector updates a theme rather than creating a second copy of it'
);

-- --- Counts are DERIVED, never typed in ---------------------------------------
-- Deliberately writes a wrong count first: recount must overwrite it from the
-- signals, which is the whole reason the function exists.
update vstudio.pain_clusters set signal_count = 9999 where theme_key = 't-alpha';
insert into vstudio.pain_signals (source, source_url, external_id, matched_phrases, cluster_id)
select 'github_issue', 'https://github.com/o/r/issues/' || g, 'sig-' || g,
       array['theme:t-alpha'], (select id from vstudio.pain_clusters where theme_key = 't-alpha')
from generate_series(1, 6) g;

select ok((select vstudio.recount_pain_clusters()) > 0, 'clusters can be recounted');
select is(
  (select signal_count from vstudio.pain_clusters where theme_key = 't-alpha'),
  6,
  'a typed-in count is overwritten by the real number of signals'
);
select is(
  (select signal_count from vstudio.pain_clusters where theme_key = 't-beta'),
  0,
  'a cluster with no evidence counts zero rather than inheriting a number'
);

-- --- Recurrence, not anecdote -------------------------------------------------
select ok(
  (select vstudio.build_pain_portfolio(5)) is not null,
  'the pain portfolio builds'
);
select is(
  (select member_count from vstudio.portfolio_snapshots
    where portfolio_key = 'pain' and is_current),
  1,
  'only the cluster with enough evidence is presented — the empty one is kept but not promoted'
);
select is(
  (select count(*)::int from vstudio.pain_clusters),
  2,
  'and the cluster below the bar still EXISTS; falling short of the bar is not deletion'
);

-- --- A pain member is a cluster, never a repository ---------------------------
select ok(
  (select bool_and(m.pain_cluster_id is not null and m.opportunity_id is null)
     from vstudio.portfolio_members m
     join vstudio.portfolio_snapshots s on s.id = m.snapshot_id
    where s.portfolio_key = 'pain'),
  'the pain portfolio ranks clusters, not repositories'
);
select ok(
  (select bool_and(qualification ? 'not_yet_researched')
     from vstudio.portfolio_members m
     join vstudio.portfolio_snapshots s on s.id = m.snapshot_id
    where s.portfolio_key = 'pain'),
  'every pain member carries the list of what has NOT been researched'
);

select * from finish();
rollback;
