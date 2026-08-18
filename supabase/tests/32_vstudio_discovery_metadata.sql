\ir _fixtures.sql.inc

-- Coverage for hlbos_0032_vstudio_discovery_metadata.
--
-- Proves the migration is ADDITIVE and that the corpus is browsable at scale:
-- the pre-existing columns survive untouched, the new fields carry types that
-- can actually be sorted numerically and by date, and the database itself —
-- not the importer — refuses to capture the same repository twice.
--
-- These are catalog assertions on purpose. RLS is FORCED on
-- vstudio.opportunities, so probing shape by inserting rows would test the
-- policy rather than the migration.
begin;
select plan(14);
select tests.seed();

-- --- Additive: the original columns are still there --------------------------
select has_column('vstudio', 'opportunities', 'title', 'title survives');
select has_column('vstudio', 'opportunities', 'status', 'status survives');
select has_column('vstudio', 'opportunities', 'tags', 'tags survives');

-- --- The discovery fields exist ----------------------------------------------
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'vstudio'
      and table_name = 'opportunities'
      and column_name in ('category','search_pattern','source_query','repository_url',
                          'stars','forks','open_issues','language','topics',
                          'pushed_at','license','archived','discovered_at','confidence')),
  14,
  'all 14 discovery columns are present'
);

-- --- Sortable types, not text -------------------------------------------------
-- The CEO sorts by stars and by push recency. Were these text, ordering would
-- be lexicographic ("9" > "10"), so the types ARE the requirement.
select is(
  (select data_type from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='stars'),
  'integer', 'stars is integer, so it sorts numerically');
select is(
  (select data_type from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='open_issues'),
  'integer', 'open_issues is integer, so it sorts numerically');
select is(
  (select data_type from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='forks'),
  'integer', 'forks is integer');
select is(
  (select data_type from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='pushed_at'),
  'timestamp with time zone', 'pushed_at is a timestamp, so recency sorts chronologically');
select is(
  (select data_type from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='archived'),
  'boolean', 'archived is boolean, so the active/archived filter is exact');
select is(
  (select data_type from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='topics'),
  'ARRAY', 'topics is an array, so a topic filter can use a GIN index');

-- --- Honest defaults ----------------------------------------------------------
select ok(
  (select column_default like '%unscored%'
     from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='confidence'),
  'a finding is unscored until the CEO has seen it'
);
select ok(
  (select column_default like 'false%'
     from information_schema.columns
    where table_schema='vstudio' and table_name='opportunities' and column_name='archived'),
  'archived defaults false, so nothing is hidden by default'
);

-- --- Deduplication is enforced by the database, not by the importer ------------
select ok(
  (select count(*) = 1 from pg_indexes
    where schemaname='vstudio' and tablename='opportunities'
      and indexname='opportunities_repository_url_key'),
  'canonical repository URL is uniquely indexed'
);
select ok(
  (select indexdef like '%UNIQUE%' and indexdef like '%lower(repository_url)%'
     from pg_indexes
    where schemaname='vstudio' and tablename='opportunities'
      and indexname='opportunities_repository_url_key'),
  'the dedupe key is UNIQUE and case-insensitive, so re-running discovery cannot duplicate a repo'
);

-- --- The sort/filter indexes the catalog depends on ---------------------------
select is(
  (select count(*)::int from pg_indexes
    where schemaname='vstudio' and tablename='opportunities'
      and indexname in ('opportunities_category_idx','opportunities_search_pattern_idx',
                        'opportunities_source_type_idx','opportunities_archived_idx',
                        'opportunities_license_idx','opportunities_language_idx',
                        'opportunities_topics_idx','opportunities_stars_idx',
                        'opportunities_open_issues_idx','opportunities_pushed_at_idx',
                        'opportunities_discovered_at_idx','opportunities_created_at_idx',
                        'opportunities_title_trgm_idx','opportunities_summary_trgm_idx')),
  14,
  'every filter and sort the catalog offers is backed by an index'
);

select * from finish();
rollback;
