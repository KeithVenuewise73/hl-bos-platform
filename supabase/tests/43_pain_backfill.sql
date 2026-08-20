\ir _fixtures.sql.inc

-- Coverage for hlbos_0042.
--
-- The backfill's whole job is to add provenance to evidence collected before
-- the schema could describe it. The thing to defend is that it adds only what
-- is derivable, invents nothing, and never lets "this complaint came from that
-- repository" be mistaken for "that repository solves this".
begin;
select plan(12);
select tests.seed();

-- Two signals: one from a repository the corpus holds, one from a repository
-- it does not. Both must survive; only one is linkable.
insert into vstudio.opportunities
  (tenant_id, title, summary, source_type, category, repository_url)
values (tests.uid('tenant_a'), 'acme/known-tool', 'A tool we already discovered.',
        'github', 'misc', 'https://github.com/acme/known-tool');

insert into vstudio.pain_signals
  (source, source_url, external_id, title, body_excerpt, matched_phrases)
values
  ('github_issue', 'https://github.com/acme/known-tool/issues/7', 'k7',
   'I wish this app would export my data', 'there is no export at all',
   array['I wish this app would','theme:migration-lockin']),
  ('github_issue', 'https://github.com/stranger/unknown-tool/issues/3', 'u3',
   'why is there no app for this', 'nothing does it',
   array['why is there no app']);

-- Re-run the backfill exactly as the migration does.
insert into vstudio.pain_discovery_runs
  (source, returned_count, verified_count, matched_count, stored_count, engine_version)
values ('github_issue', 17350, 3085, 473, 439, '2026-08-20-v1');

update vstudio.pain_signals s
   set discovery_run_id = r.id, source_type = 'issue',
       population_type = 'developer_technical',
       source_community = nullif(
         split_part(regexp_replace(s.source_url, '^https?://github\.com/', ''), '/', 1) || '/' ||
         split_part(regexp_replace(s.source_url, '^https?://github\.com/', ''), '/', 2), '/'),
       discovery_query = nullif(array_to_string(
         array(select p from unnest(s.matched_phrases) p where p not like 'theme:%'), ' | '), ''),
       content_fingerprint = md5(lower(coalesce(s.title,'')) || '|' || lower(coalesce(s.body_excerpt,'')))
  from vstudio.pain_discovery_runs r
 where s.source = 'github_issue' and r.stored_count = 439 and s.discovery_run_id is null;

update vstudio.pain_signals s set opportunity_id = o.id
  from vstudio.opportunities o
 where s.opportunity_id is null and s.source_community is not null
   and lower(o.repository_url) = 'https://github.com/' || lower(s.source_community);

insert into vstudio.market_need_solutions (signal_id, opportunity_id, relation, rationale)
select s.id, s.opportunity_id, 'evidence_source', 'test backfill'
from vstudio.pain_signals s where s.opportunity_id is not null
on conflict do nothing;

-- --- Nothing is lost ----------------------------------------------------------
select is((select count(*)::int from vstudio.pain_signals), 2,
  'both signals survive the backfill');
select ok((select bool_and(source_url <> '') from vstudio.pain_signals),
  'every evidence URL is still present and non-empty');

-- --- Only derivable facts are written -----------------------------------------
select is(
  (select source_community from vstudio.pain_signals where external_id = 'k7'),
  'acme/known-tool', 'the community is parsed out of the evidence URL');
select is(
  (select source_type from vstudio.pain_signals where external_id = 'k7'),
  'issue', 'the source type is recorded');
select is(
  (select population_type::text from vstudio.pain_signals where external_id = 'k7'),
  'developer_technical', 'the population is labelled, so the bias is visible');
select is(
  (select discovery_query from vstudio.pain_signals where external_id = 'k7'),
  'I wish this app would',
  'the discovery query keeps the phrasing but drops the theme routing marker');
select ok(
  (select bool_and(content_fingerprint is not null) from vstudio.pain_signals),
  'every signal gets a fingerprint so cross-source dedupe becomes possible');

-- --- Nothing is invented ------------------------------------------------------
select ok(
  (select bool_and(normalized_problem is null) from vstudio.pain_signals),
  'no complaint is restated in a neutral voice that nobody actually wrote');
select ok(
  (select bool_and(language is null) from vstudio.pain_signals),
  'language stays unknown because it was never captured');

-- --- The two relationships stay apart -----------------------------------------
select is(
  (select count(*)::int from vstudio.market_need_solutions where relation = 'evidence_source'),
  1, 'only the signal from a known repository produces an evidence link');
select is(
  (select count(*)::int from vstudio.market_need_solutions where relation = 'candidate_solution'),
  0,
  'the backfill proposes no solutions -- a repository that generates complaints is not thereby a fix');
select ok(
  (select opportunity_id is null from vstudio.pain_signals where external_id = 'u3'),
  'a signal from a repository outside the corpus is kept and simply left unlinked');

select * from finish();
rollback;
