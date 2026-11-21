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

create unique index if not exists opportunities_repository_url_key
  on vstudio.opportunities (lower(repository_url))
  where repository_url is not null;

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

create index if not exists opportunities_title_trgm_idx
  on vstudio.opportunities using gin (title extensions.gin_trgm_ops);
create index if not exists opportunities_summary_trgm_idx
  on vstudio.opportunities using gin (summary extensions.gin_trgm_ops);