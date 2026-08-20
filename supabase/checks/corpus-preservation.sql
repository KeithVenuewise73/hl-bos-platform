-- ===========================================================================
-- HLVS corpus-preservation check
--
-- The Phase 2 intelligence layer sits ABOVE the discovery corpus. It ranks,
-- scores and groups — it never reduces, filters, deletes or overwrites what
-- discovery found. This query is how that claim is proved rather than
-- asserted: it re-measures the live corpus and compares every invariant
-- against the values recorded in .hlbos/corpus-baseline.json.
--
-- Run it before and after any Phase 2 work. Every row must read pass = true.
-- A single false means the corpus moved and the work must stop.
--
-- If the corpus legitimately grows (a NEW discovery run adds rows), the
-- growth invariants below are the ones that change — and they change by
-- being re-baselined deliberately, in a commit, never silently.
-- ===========================================================================
with live as (
  select
    count(*)                                                                  as total_rows,
    count(*) filter (where source_type = 'github')                            as github_rows,
    count(*) filter (where source_type is distinct from 'github')             as pre_existing_rows,
    count(distinct lower(repository_url))                                     as distinct_urls,
    count(*) filter (where repository_url is null)                            as null_urls,
    count(distinct category)                                                  as categories,
    count(distinct search_pattern)                                            as patterns,
    count(distinct source_query)                                              as source_queries,
    count(*) filter (where archived)                                          as archived_rows,
    md5(string_agg(id::text || '|' || coalesce(lower(repository_url),'~') || '|' || status::text, ',' order by id)) as fp_full,
    md5(string_agg(lower(repository_url), ',' order by lower(repository_url))
        filter (where repository_url is not null))                            as fp_urls
  from vstudio.opportunities
),
original as (
  select md5(string_agg(id::text || '|' || title || '|' || status::text || '|' || updated_at::text, ',' order by id)) as fp_36
  from vstudio.opportunities
  where source_type is distinct from 'github'
),
checks(ord, invariant, expected, actual) as (
  select  1, 'total opportunities',              '62250',                            (select total_rows::text        from live)
  union all select  2, 'github-discovered rows', '62214',                            (select github_rows::text       from live)
  union all select  3, 'pre-existing rows',      '36',                               (select pre_existing_rows::text from live)
  union all select  4, 'distinct canonical URLs','62214',                            (select distinct_urls::text     from live)
  union all select  5, 'rows without a URL',     '36',                               (select null_urls::text         from live)
  union all select  6, 'categories',             '111',                              (select categories::text        from live)
  union all select  7, 'search patterns',        '6',                                (select patterns::text          from live)
  union all select  8, 'source queries stored',  '299',                              (select source_queries::text    from live)
  union all select  9, 'archived rows',          '2093',                             (select archived_rows::text     from live)
  union all select 10, 'pre-existing 36 fingerprint', '3679f569f706e8db94d314e7de19bb05', (select fp_36::text        from original)
  union all select 11, 'full corpus fingerprint',     'd62d026354fd2c42a187cd1e35b0f803', (select fp_full::text      from live)
  union all select 12, 'canonical URL set fingerprint','5ee46c1cf5c7893c7eaba5ccb67c0a48',(select fp_urls::text      from live)
  -- No duplicate repository may exist: the unique index makes this structural,
  -- and this asserts the index is still doing its job.
  union all select 13, 'duplicate canonical URLs', '0',
    (select (count(*) - count(distinct lower(repository_url)))::text
       from vstudio.opportunities where repository_url is not null)
  -- Provenance must survive: a row that lost its category, pattern or query
  -- can no longer be traced back to how it was found.
  union all select 14, 'github rows missing provenance', '0',
    (select count(*)::text from vstudio.opportunities
      where source_type = 'github'
        and (category is null or search_pattern is null or source_query is null or repository_url is null))
)
select ord, invariant, expected, actual, (expected = actual) as pass
from checks order by ord;
