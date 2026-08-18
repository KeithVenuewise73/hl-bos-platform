-- ===========================================================================
-- hlbos_0032_vstudio_discovery_metadata — discovery corpus fields for HLVS
--
-- PURELY ADDITIVE. Adds the GitHub discovery metadata that
-- `vstudio.opportunities` had no home for, so a wide-net discovery corpus can
-- be persisted and then browsed server-side: filtered, text-searched, sorted
-- and paginated without shipping the whole table to the browser.
--
-- Nothing existing is dropped, renamed, retyped or rewritten. Every column is
-- nullable (or defaulted), so the 36 opportunities already in the table keep
-- their exact values and simply carry NULL in the new columns. No data is
-- seeded here — records arrive only from a real discovery run.
--
-- Why native types rather than tags[]: the CEO must sort by stars, open issues
-- and push recency. A text[] cannot be ordered numerically, so those must be
-- integer/timestamptz columns with real indexes.
--
-- Deduplication: `repository_url` carries the canonical repository URL and is
-- guarded by a UNIQUE index (partial — pre-existing rows hold NULL and are
-- unaffected, and NULLs never collide). Re-running discovery therefore cannot
-- create a duplicate opportunity for a repository already captured.
--
-- Scoring: `confidence` defaults to 'unscored'. Discovery persists findings
-- unranked; nothing is filtered or scored out before CEO review.
--
-- rollback: (manual, pre-approval only)
--   DROP INDEX IF EXISTS vstudio.opportunities_repository_url_key;
--   DROP INDEX IF EXISTS vstudio.opportunities_category_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_search_pattern_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_source_type_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_archived_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_license_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_language_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_stars_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_open_issues_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_pushed_at_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_discovered_at_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_created_at_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_topics_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_title_trgm_idx;
--   DROP INDEX IF EXISTS vstudio.opportunities_summary_trgm_idx;
--   ALTER TABLE vstudio.opportunities
--     DROP COLUMN IF EXISTS category,
--     DROP COLUMN IF EXISTS search_pattern,
--     DROP COLUMN IF EXISTS source_query,
--     DROP COLUMN IF EXISTS repository_url,
--     DROP COLUMN IF EXISTS stars,
--     DROP COLUMN IF EXISTS forks,
--     DROP COLUMN IF EXISTS open_issues,
--     DROP COLUMN IF EXISTS language,
--     DROP COLUMN IF EXISTS topics,
--     DROP COLUMN IF EXISTS pushed_at,
--     DROP COLUMN IF EXISTS license,
--     DROP COLUMN IF EXISTS archived,
--     DROP COLUMN IF EXISTS discovered_at,
--     DROP COLUMN IF EXISTS confidence;
--
-- VERIFICATION (after apply): expect 14 new columns on vstudio.opportunities,
--   15 new indexes, and the pre-existing row count unchanged (36 at authoring
--   time). pgTAP: supabase/tests/32_vstudio_discovery_metadata.sql.
-- ===========================================================================

-- --- Columns ---------------------------------------------------------------
-- `source_type` already exists (text, default 'manual') and is reused as-is
-- for the source filter; discovery writes 'github' into it.

alter table vstudio.opportunities
  add column if not exists category       text,
  add column if not exists search_pattern text,
  add column if not exists source_query   text,
  add column if not exists repository_url text,
  add column if not exists stars          integer,
  add column if not exists forks          integer,
  add column if not exists open_issues    integer,
  add column if not exists language       text,
  add column if not exists topics         text[]      not null default '{}'::text[],
  add column if not exists pushed_at      timestamptz,
  add column if not exists license        text,
  add column if not exists archived       boolean     not null default false,
  add column if not exists discovered_at  timestamptz,
  add column if not exists confidence     text        not null default 'unscored';

comment on column vstudio.opportunities.category is
  'Discovery category / source area (e.g. "developer-tools"). NULL for manually captured opportunities.';
comment on column vstudio.opportunities.search_pattern is
  'Discovery search pattern: POPULAR, UNDERDEVELOPED, ABANDONED, PAIN SIGNALS, SELF-HOSTED, ALTERNATIVES.';
comment on column vstudio.opportunities.source_query is
  'The exact query string sent to the source API, kept verbatim so a run is reproducible and auditable.';
comment on column vstudio.opportunities.repository_url is
  'Canonical repository URL. UNIQUE — the deduplication key for re-runnable discovery.';
comment on column vstudio.opportunities.confidence is
  'Scoring state. Defaults to ''unscored'': discovery never ranks or filters a finding before CEO review.';

-- --- Deduplication ---------------------------------------------------------
-- Partial + case-insensitive: GitHub URLs differ only by case of owner/repo.
-- Pre-existing rows hold NULL here and are untouched by this constraint.
create unique index if not exists opportunities_repository_url_key
  on vstudio.opportunities (lower(repository_url))
  where repository_url is not null;

-- --- Filter indexes --------------------------------------------------------
create index if not exists opportunities_category_idx
  on vstudio.opportunities (category) where category is not null;
create index if not exists opportunities_search_pattern_idx
  on vstudio.opportunities (search_pattern) where search_pattern is not null;
create index if not exists opportunities_source_type_idx
  on vstudio.opportunities (source_type);
create index if not exists opportunities_archived_idx
  on vstudio.opportunities (archived);
create index if not exists opportunities_license_idx
  on vstudio.opportunities (license) where license is not null;
create index if not exists opportunities_language_idx
  on vstudio.opportunities (language) where language is not null;
create index if not exists opportunities_topics_idx
  on vstudio.opportunities using gin (topics);

-- --- Sort / pagination indexes ---------------------------------------------
-- DESC NULLS LAST matches how the catalog orders; ascending scans read these
-- backwards, so one index serves both directions of each sort.
create index if not exists opportunities_stars_idx
  on vstudio.opportunities (stars desc nulls last);
create index if not exists opportunities_open_issues_idx
  on vstudio.opportunities (open_issues desc nulls last);
create index if not exists opportunities_pushed_at_idx
  on vstudio.opportunities (pushed_at desc nulls last);
create index if not exists opportunities_discovered_at_idx
  on vstudio.opportunities (discovered_at desc nulls last);
create index if not exists opportunities_created_at_idx
  on vstudio.opportunities (created_at desc);

-- --- Text search -----------------------------------------------------------
-- Trigram indexes so an unanchored ILIKE '%term%' across name and description
-- stays indexed at corpus scale. pg_trgm is already installed (extensions).
create index if not exists opportunities_title_trgm_idx
  on vstudio.opportunities using gin (title extensions.gin_trgm_ops);
create index if not exists opportunities_summary_trgm_idx
  on vstudio.opportunities using gin (summary extensions.gin_trgm_ops);
