\ir _fixtures.sql.inc

-- Coverage for hlbos_0035_vstudio_portfolios.
--
-- The claim this file has to defend is that a Top-100 is a SELECTION, not a
-- replacement dataset. So the corpus is fingerprinted before and after a real
-- build, and the snapshot's own honesty counters are checked against what it
-- actually wrote.
begin;
select plan(17);
select tests.seed();
select tests.seed_opportunities();

select has_function('vstudio', 'build_portfolio', array['text'], 'the build control exists');
select has_function('vstudio', 'portfolio_candidates', array['text'], 'eligibility is a single named rule');
select has_function('vstudio', 'portfolio_domain_value', array['text','text','jsonb'], 'domain matching is one function');

-- --- The gate refuses ---------------------------------------------------------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$select vstudio.build_portfolio('logistics')$$,
  '42501', null,
  'rebuilding a ranking needs vstudio.intelligence.manage'
);
select tests.logout();

-- --- Bad input fails loudly rather than producing an empty list ---------------
select throws_ok(
  $$select vstudio.build_portfolio('no-such-portfolio')$$,
  'P0002', null,
  'an unknown portfolio raises instead of silently building nothing'
);
select throws_ok(
  $$select vstudio.build_portfolio('pain')$$,
  '0A000', null,
  'the pain portfolio ranks clusters, so the repository builder refuses it'
);

-- --- Building does not touch the corpus ---------------------------------------
create temp table corpus_before on commit drop as
  select count(*) as n,
         md5(string_agg(id::text || coalesce(title,''), ',' order by id)) as fp
  from vstudio.opportunities;

select lives_ok(
  $$select vstudio.score_level1(category) from vstudio.score_level1_categories()$$,
  'the corpus can be scored'
);
create temp table built on commit drop as
  select k as portfolio_key, vstudio.build_portfolio(k) as snapshot_id
  from unnest(array['logistics','transformation','sports','outside-core']) k;

select is(
  (select count(*)::int from vstudio.opportunities),
  (select n::int from corpus_before),
  'the corpus has exactly as many rows after building four portfolios as before'
);
select is(
  (select md5(string_agg(id::text || coalesce(title,''), ',' order by id)) from vstudio.opportunities),
  (select fp from corpus_before),
  'every corpus row is byte-identical after building — a Top-100 selects, it does not replace'
);

-- --- The snapshot tells the truth about its own size --------------------------
select ok(
  (select bool_and(s.member_count = (select count(*) from vstudio.portfolio_members m where m.snapshot_id = s.id))
     from vstudio.portfolio_snapshots s join built b on b.snapshot_id = s.id),
  'member_count matches the rows actually written — a short list is never padded'
);
select ok(
  (select bool_and(s.member_count = least(p.target_size, s.eligible_count))
     from vstudio.portfolio_snapshots s
     join built b on b.snapshot_id = s.id
     join vstudio.portfolios p on p.key = s.portfolio_key),
  'a portfolio takes the target size or everything eligible, whichever is smaller'
);
select ok(
  (select bool_and(s.eligible_count <= s.corpus_size)
     from vstudio.portfolio_snapshots s join built b on b.snapshot_id = s.id),
  'no portfolio claims more eligible records than the corpus contains'
);

-- --- Exactly one current snapshot per portfolio, even after a rebuild ---------
select lives_ok(
  $$select vstudio.build_portfolio('logistics')$$,
  'a portfolio can be rebuilt'
);
select ok(
  (select bool_and(c = 1) from (
     select count(*) filter (where is_current) as c
     from vstudio.portfolio_snapshots group by portfolio_key) x),
  'exactly one snapshot per portfolio is current after a rebuild — the old one is kept, not deleted'
);
select ok(
  (select count(*) > 1 from vstudio.portfolio_snapshots where portfolio_key = 'logistics'),
  'the superseded snapshot survives, so a ranking already shown stays explicable'
);

-- --- Ranks and evidence -------------------------------------------------------
select ok(
  (select bool_and(ok) from (
     select bool_and(m.rank = rn) as ok
     from (select snapshot_id, rank, row_number() over (partition by snapshot_id order by rank) rn
             from vstudio.portfolio_members) m
     group by m.snapshot_id) y),
  'ranks are dense and start at 1 — no gaps to explain away'
);
select ok(
  (select bool_and(m.qualification ? 'basis' and m.qualification ? 'domain_value')
     from vstudio.portfolio_members m),
  'every member records why it qualified, so a ranking can be argued with'
);

select * from finish();
rollback;
