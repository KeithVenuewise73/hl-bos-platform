-- hlbos_0042: give the existing GitHub pain evidence its provenance back
--
-- 439 signals were collected before the schema could describe where they came
-- from or whose problem they represent. Migration 0041 added those columns.
-- This one fills in ONLY what can be derived from the rows themselves.
--
-- WHAT IS DERIVED, AND FROM WHAT
--   source_type         'issue'  -- every row came from the GitHub issue search
--   source_community    owner/repo, parsed out of source_url
--   population_type     'developer_technical'
--   discovery_query     the matched phrasing already stored on the row
--   content_fingerprint md5(lower(title) || excerpt)
--   discovery_run_id    the historical run created below
--
-- On population_type: this is a claim about the EVIDENCE, not about the people.
-- Every one of these signals is a GitHub issue, and the top contributing
-- repositories are anthropics/claude-code, openai/codex, vllm, golang/go and
-- microsoft/vscode. Labelling that population `developer_technical` is reading
-- the source, not guessing at the author. It is also the whole reason this
-- column now exists: the bias has to be visible to be corrected.
--
-- WHAT IS NOT INVENTED
--   normalized_problem stays NULL. Restating 439 complaints in a neutral voice
--   is inference work, it has not been done, and a NULL that means "not yet"
--   is worth more than 439 sentences nobody wrote.
--   language stays NULL. It was never captured and cannot be recovered here.
--
-- THE 124 LINKS
-- 124 of the 439 signals sit in repositories that are already in the 62,250
-- Discovery Universe (101 distinct repositories). That relationship is a FACT
-- -- the complaint was filed there -- and it is recorded with
-- relation = 'evidence_source'.
--
-- It is emphatically NOT a claim that those repositories solve anything. A
-- repository generating complaints is often the least likely candidate to fix
-- the problem being complained about. `candidate_solution` is a separate
-- relation, written by a separate assessment, and this migration writes none.
--
-- rollback:
--   delete from vstudio.market_need_solutions where relation = 'evidence_source'
--     and rationale = 'hlbos_0042 backfill: complaint filed in this repository';
--   update vstudio.pain_signals set discovery_run_id = null, source_type = null,
--     source_community = null, population_type = 'unknown', discovery_query = null,
--     content_fingerprint = null
--    where source = 'github_issue';
--   delete from vstudio.pain_discovery_runs where engine_version = '2026-08-20-v1'
--     and scope like 'Historical reconstruction%';
--   delete from vstudio.pain_sources;
--   No signal, cluster or corpus row is created or destroyed by either
--   direction: this migration only ever fills columns that were NULL.

-- ---------------------------------------------------------------------------
-- 1. The historical run -- real measured numbers, not reconstructed estimates
-- ---------------------------------------------------------------------------
-- These five figures are the collector's own tallies, recorded at the time in
-- the method text of every pain cluster. They are reproduced here as columns
-- so the funnel is queryable rather than buried in prose.
insert into vstudio.pain_discovery_runs
  (source, started_at, finished_at, returned_count, verified_count,
   matched_count, stored_count, scope, method, engine_version)
select
  'github_issue',
  coalesce(min(s.collected_at), now()),
  coalesce(max(s.collected_at), now()),
  17350, 3085, 473, 439,
  'Historical reconstruction of the first pain collection. 59 phrasings searched '
  || 'against the GitHub issue API with type:issue created:>2024-01-01 and no repository '
  || 'filter, so the search covered public GitHub rather than the Discovery Universe.',
  '17350 results returned; 13258 rejected because the issue did not actually contain the '
  || 'phrasing (the GitHub search API does not honour quoted phrases, so every result was '
  || 're-checked against the full issue body); 3085 verified; 473 matched a theme; 439 '
  || 'stored after a cap of 3 signals per repository per theme, so one busy backlog could '
  || 'not become a pain point on its own.',
  '2026-08-20-v1'
from vstudio.pain_signals s
where s.source = 'github_issue'
  and not exists (select 1 from vstudio.pain_discovery_runs r
                   where r.source = 'github_issue' and r.stored_count = 439);

-- ---------------------------------------------------------------------------
-- 2. Backfill the derivable columns
-- ---------------------------------------------------------------------------
update vstudio.pain_signals s
   set discovery_run_id = r.id,
       source_type      = 'issue',
       population_type  = 'developer_technical',
       source_community = nullif(
         split_part(regexp_replace(s.source_url, '^https?://github\.com/', ''), '/', 1) || '/' ||
         split_part(regexp_replace(s.source_url, '^https?://github\.com/', ''), '/', 2), '/'),
       -- The phrasings that found it, minus the theme marker the ingest rode
       -- along on matched_phrases. That marker is routing metadata, not a query.
       discovery_query  = nullif(array_to_string(
         array(select p from unnest(s.matched_phrases) p where p not like 'theme:%'), ' | '), ''),
       content_fingerprint = md5(lower(coalesce(s.title,'')) || '|' || lower(coalesce(s.body_excerpt,'')))
  from vstudio.pain_discovery_runs r
 where s.source = 'github_issue'
   and r.source = 'github_issue'
   and r.stored_count = 439
   and s.discovery_run_id is null;

-- ---------------------------------------------------------------------------
-- 3. The evidence-source relationship -- a fact, and only a fact
-- ---------------------------------------------------------------------------
-- opportunity_id on the signal itself records "this complaint was filed in a
-- repository we already hold". It is set here for the first time; the ingest
-- never populated it, which is why all 439 read NULL until now.
update vstudio.pain_signals s
   set opportunity_id = o.id
  from vstudio.opportunities o
 where s.opportunity_id is null
   and s.source_community is not null
   and lower(o.repository_url) = 'https://github.com/' || lower(s.source_community);

-- The same fact, expressed as a traversable link so the bridge table can carry
-- both relationship kinds side by side without either being mistaken for the
-- other.
insert into vstudio.market_need_solutions
  (market_need_id, signal_id, opportunity_id, relation, rationale)
select null, s.id, s.opportunity_id, 'evidence_source',
       'hlbos_0042 backfill: complaint filed in this repository'
from vstudio.pain_signals s
where s.opportunity_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. The source registry, seeded with the truth
-- ---------------------------------------------------------------------------
-- Reddit, Hacker News, the app stores and Stack Overflow were each probed from
-- this environment on 2026-08-20. Every one answered 403 to CONNECT at the
-- egress proxy. That is an environment policy, not a Reddit decision, and no
-- API credential would change it -- so the state is `technically_restricted`
-- and the reason says exactly what has to change and who can change it.
insert into vstudio.pain_sources
  (key, label, state, state_reason, population_hint, first_collected_at, last_collected_at, notes)
values
  ('github_issue', 'GitHub Issues', 'connected',
   'Reachable and collected. 439 verified signals stored from 59 phrasings.',
   'developer_technical',
   (select min(collected_at) from vstudio.pain_signals where source='github_issue'),
   (select max(collected_at) from vstudio.pain_signals where source='github_issue'),
   'Source #1. Population is developers writing about developer tooling; the top contributing repositories are AI coding tools, language runtimes and editors. Broad across GitHub -- 369 distinct repositories -- but narrow in who is speaking.'),
  ('github_discussion', 'GitHub Discussions', 'accessible_not_connected',
   'Same API and the same egress permission as GitHub Issues. No collector written yet.',
   'developer_technical', null, null, 'Cheapest next source technically, but adds no population diversity.'),
  ('reddit', 'Reddit', 'technically_restricted',
   'Probed 2026-08-20: www.reddit.com, oauth.reddit.com and old.reddit.com all answered 403 to CONNECT at the egress proxy. This is the environment network policy, not an authentication failure -- credentials would not change it. Requires an egress allowance, then a commercial-terms review before any collection.',
   'consumer', null, null,
   'Highest-value non-developer population identified so far. Access method, rate limits and commercial terms are all UNVERIFIED because the host cannot be reached to check them.'),
  ('app_store_reviews', 'Apple App Store reviews', 'technically_restricted',
   'Probed 2026-08-20: itunes.apple.com answered 403 to CONNECT at the egress proxy.',
   'consumer', null, null,
   'Likely the closest population to the small-business and consumer operators HLG sells to.'),
  ('play_store_reviews', 'Google Play reviews', 'requires_credential',
   'No open public endpoint equivalent to the App Store search API. Needs an access route decision before feasibility can be assessed.',
   'consumer', null, null, ''),
  ('hacker_news', 'Hacker News', 'technically_restricted',
   'Probed 2026-08-20: news.ycombinator.com and hn.algolia.com both answered 403 to CONNECT at the egress proxy. No authentication is required once reachable.',
   'developer_technical', null, null, 'Cheap once unblocked, but developer-skewed like GitHub.'),
  ('stack_exchange', 'Stack Overflow / Stack Exchange', 'technically_restricted',
   'Probed 2026-08-20: stackoverflow.com answered 403 to CONNECT at the egress proxy.',
   'developer_technical', null, null, ''),
  ('saas_reviews', 'SaaS review sites (G2, Capterra)', 'tos_review_required',
   'No open API. Terms of service generally prohibit automated collection. Needs a legal read before any technical work.',
   'small_business', null, null, 'Would be strong small-business evidence if a licensed route exists.'),
  ('support_forums', 'Public forums and support communities', 'not_currently_feasible',
   'No single API. Each community needs its own connector and its own terms review.',
   'other', null, null, ''),
  ('search_demand', 'Search-demand signals', 'requires_credential',
   'Paid data source. No credential held. No search-volume figure appears anywhere in HLVS.',
   'unknown', null, null, '')
on conflict (key) do update set
  state = excluded.state, state_reason = excluded.state_reason,
  population_hint = excluded.population_hint, notes = excluded.notes,
  first_collected_at = excluded.first_collected_at,
  last_collected_at = excluded.last_collected_at,
  checked_at = now();
