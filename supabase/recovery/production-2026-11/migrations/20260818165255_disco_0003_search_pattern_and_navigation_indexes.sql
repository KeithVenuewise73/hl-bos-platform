-- Additive only. No existing column altered, nothing dropped.
-- 1. Capture the search pattern (POPULAR / UNDERDEVELOPED / ABANDONED /
--    PAIN SIGNALS / SELF-HOSTED / ALTERNATIVES). Not previously recorded.
alter table disco.assessments
  add column if not exists search_pattern text;

comment on column disco.assessments.search_pattern is
  'Discovery search pattern label from the HLVS query matrix. Null for records ingested before this column existed.';

-- 2. Indexes required for server-side filtering, sorting and paging at 12k+ rows.
create index if not exists idx_assess_category      on disco.assessments (category);
create index if not exists idx_assess_pattern       on disco.assessments (search_pattern);
create index if not exists idx_assess_language      on disco.assessments (repo_language);
create index if not exists idx_assess_license       on disco.assessments (repo_license);
create index if not exists idx_assess_archived      on disco.assessments (repo_archived);
create index if not exists idx_assess_stars         on disco.assessments (repo_stars desc);
create index if not exists idx_assess_issues        on disco.assessments (repo_open_issues desc);
create index if not exists idx_assess_pushed        on disco.assessments (repo_pushed_at desc);
create index if not exists idx_assess_score_net     on disco.assessments (score_net desc);

create index if not exists idx_opp_tenant_created   on vstudio.opportunities (tenant_id, created_at desc);
create index if not exists idx_opp_source_type      on vstudio.opportunities (source_type);
create index if not exists idx_opp_status           on vstudio.opportunities (status);

-- 3. Trigram index for the search box (name + description substring search).
create extension if not exists pg_trgm with schema extensions;
create index if not exists idx_opp_title_trgm
  on vstudio.opportunities using gin (title extensions.gin_trgm_ops);
create index if not exists idx_opp_summary_trgm
  on vstudio.opportunities using gin (summary extensions.gin_trgm_ops);