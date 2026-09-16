-- ===========================================================================
-- ats — ATS Resume Optimizer
--
-- The persistence schema for the ATS Resume Optimizer (apps/ats-resume-optimizer,
-- engine in packages/ats-resume). Purely additive: a new schema, no existing
-- object is touched.
--
-- NOT YET APPLIED ANYWHERE. It is committed so the data model is reviewable and
-- versioned, and because the app is designed against it. The app currently runs
-- on a local JSON store and its Settings page says exactly that — it does not
-- claim a database it does not have.
--
-- WHOSE DATA THIS IS. A resume is the most personal document most people own:
-- employment history, salary-adjacent scope, education, certifications, and a
-- record of every job they applied for and were rejected from. So:
--
--   * Every table is owned by exactly one auth user, via `owner_id`.
--   * RLS is ENABLED and FORCED on every table, including for the table owner.
--   * Policies are written per-command and always compare to auth.uid().
--   * There are no service-role conveniences, no "platform admin can read
--     everything" escape hatch, and no cross-user visibility of any kind.
--     Nobody operating this platform has a legitimate reason to read a user's
--     rejection history.
--
-- WHY PROVENANCE IS IN THE SCHEMA, NOT JUST THE APP. `career_facts.source`,
-- `generated_resume_bullets.validation` and the `claim_evidence` join table are
-- what make "optimize aggressively, fabricate nothing" auditable after the
-- fact. A CHECK constraint enforces the rule that matters most: a bullet whose
-- validation is `unsupported` may never be marked as included in an export.
-- The application enforces that too, in buildExportDocument(); a claim that
-- reaches an employer is worth two independent controls.
--
-- rollback:
--   DROP SCHEMA IF EXISTS ats CASCADE;
--   (Additive migration: it creates a new schema and touches no existing
--    table, so dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists ats;
comment on schema ats is
  'ATS Resume Optimizer: one user''s career database, analyses and generated documents. Every table is owned by a single auth user and forced RLS.';

revoke all on schema ats from public, anon;
grant usage on schema ats to authenticated;
alter default privileges in schema ats revoke all on tables from public, anon;
alter default privileges in schema ats revoke all on functions from public, anon;

-- --- Types ------------------------------------------------------------------

do $$ begin create type ats.source_status as enum
  ('resume','user_confirmed','generated_wording');
  exception when duplicate_object then null; end $$;

do $$ begin create type ats.validation_status as enum
  ('verified','user_confirmed','needs_confirmation','unsupported');
  exception when duplicate_object then null; end $$;

do $$ begin create type ats.requirement_importance as enum
  ('critical','important','preferred','informational');
  exception when duplicate_object then null; end $$;

do $$ begin create type ats.match_status as enum
  ('strong_match','partial_match','terminology_match','not_evidenced');
  exception when duplicate_object then null; end $$;

do $$ begin create type ats.keyword_priority as enum ('high','medium','low');
  exception when duplicate_object then null; end $$;

do $$ begin create type ats.application_status as enum
  ('researching','resume_created','applied','recruiter_screen','interviewing',
   'final_interview','offer','rejected','withdrawn','closed');
  exception when duplicate_object then null; end $$;

do $$ begin create type ats.resume_format as enum ('paste','docx','pdf');
  exception when duplicate_object then null; end $$;

-- --- Candidate profile ------------------------------------------------------

create table if not exists ats.candidate_profiles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  full_name   text not null default '',
  headline    text not null default '',
  summary     text not null default '',
  contact     jsonb not null default '{}'::jsonb,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table ats.candidate_profiles is
  'One structured career identity per user. A user may hold more than one (e.g. a sample profile alongside their own).';

-- Every atomic, checkable statement about the candidate. This table IS the
-- evidence corpus: nothing the product generates may claim anything that is
-- not derivable from a row here.
create table if not exists ats.career_facts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  profile_id   uuid not null references ats.candidate_profiles(id) on delete cascade,
  category     text not null,
  fact_text    text not null check (length(btrim(fact_text)) > 0),
  source       ats.source_status not null,
  context      text,
  -- Quantities asserted by fact_text, extracted once at write time so the
  -- claim validator never has to re-parse prose to check a number.
  numbers      text[] not null default '{}',
  -- Populated only for generated_wording: the facts this wording came from.
  derived_from uuid[] not null default '{}',
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Generated wording is a rephrasing of other facts. It may never be the
  -- origin of a claim, so it must name what it was derived from.
  constraint generated_wording_must_cite_sources
    check (source <> 'generated_wording' or cardinality(derived_from) > 0)
);
create index if not exists career_facts_profile_idx on ats.career_facts (profile_id);

-- --- Master resume ----------------------------------------------------------

create table if not exists ats.resumes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid not null references ats.candidate_profiles(id) on delete cascade,
  label       text not null default '',
  format      ats.resume_format not null default 'paste',
  -- The original, byte for byte as extracted or pasted. Never rewritten.
  raw_text    text not null,
  is_default  boolean not null default false,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists resumes_profile_idx on ats.resumes (profile_id);

-- A version is an immutable snapshot of the structured reading of a resume.
-- Keeping both means a parser improvement can never silently change what a
-- past analysis was based on.
create table if not exists ats.resume_versions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  resume_id   uuid not null references ats.resumes(id) on delete cascade,
  version_no  integer not null check (version_no > 0),
  parsed      jsonb not null,
  created_at  timestamptz not null default now(),
  unique (resume_id, version_no)
);

create table if not exists ats.resume_sections (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  resume_version_id uuid not null references ats.resume_versions(id) on delete cascade,
  kind            text not null,
  position        integer not null,
  content         jsonb not null,
  unique (resume_version_id, kind, position)
);

-- --- Job posting ------------------------------------------------------------

create table if not exists ats.job_postings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid not null references ats.candidate_profiles(id) on delete cascade,
  company     text not null default '',
  title       text not null default '',
  location    text,
  url         text,
  raw_text    text not null,
  facets      jsonb not null default '{}'::jsonb,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists job_postings_profile_idx on ats.job_postings (profile_id);

create table if not exists ats.job_requirements (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  job_posting_id  uuid not null references ats.job_postings(id) on delete cascade,
  requirement_text text not null,
  kind            text not null,
  importance      ats.requirement_importance not null,
  source_section  text not null default '',
  terms           text[] not null default '{}',
  years_required  integer check (years_required is null or years_required >= 0),
  created_at      timestamptz not null default now()
);
create index if not exists job_requirements_posting_idx on ats.job_requirements (job_posting_id);

create table if not exists ats.job_keywords (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  job_posting_id  uuid not null references ats.job_postings(id) on delete cascade,
  term            text not null,
  priority        ats.keyword_priority not null,
  occurrences     integer not null default 1,
  in_requirement  boolean not null default false,
  unique (job_posting_id, term)
);

-- --- Analysis ---------------------------------------------------------------

create table if not exists ats.job_analyses (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  profile_id        uuid not null references ats.candidate_profiles(id) on delete cascade,
  resume_id         uuid not null references ats.resumes(id) on delete cascade,
  job_posting_id    uuid not null references ats.job_postings(id) on delete cascade,
  -- Scores are stored as computed, with their weights, so a later change to
  -- the scoring model cannot retroactively rewrite what a user was told.
  score_before      jsonb not null,
  score_projected   jsonb not null,
  keyword_analysis  jsonb not null default '{}'::jsonb,
  terminology       jsonb not null default '[]'::jsonb,
  format_findings   jsonb not null default '[]'::jsonb,
  recommendations   jsonb not null default '[]'::jsonb,
  -- Which engine produced this: the built-in rules engine, or a named model.
  engine            text not null default 'rules-engine',
  is_sample         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists job_analyses_profile_idx on ats.job_analyses (profile_id, created_at desc);

-- One row of the evidence matrix.
create table if not exists ats.requirement_matches (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  analysis_id         uuid not null references ats.job_analyses(id) on delete cascade,
  requirement_id      uuid not null references ats.job_requirements(id) on delete cascade,
  evidence_text       text not null default '',
  evidence_source     text not null default '',
  evidence_fact_ids   uuid[] not null default '{}',
  status              ats.match_status not null,
  recommended_action  text not null default '',
  suggested_placement text[] not null default '{}',
  coverage            numeric(4,3) not null default 0 check (coverage >= 0 and coverage <= 1),
  -- A row with no evidence must say so rather than quoting something vaguely
  -- related: not_evidenced and a quoted evidence string are contradictory.
  constraint not_evidenced_has_no_evidence
    check (status <> 'not_evidenced' or length(btrim(evidence_text)) = 0)
);
create index if not exists requirement_matches_analysis_idx on ats.requirement_matches (analysis_id);

-- --- Generated documents ----------------------------------------------------

create table if not exists ats.generated_resumes (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  profile_id      uuid not null references ats.candidate_profiles(id) on delete cascade,
  analysis_id     uuid not null references ats.job_analyses(id) on delete cascade,
  resume_id       uuid not null references ats.resumes(id) on delete cascade,
  job_posting_id  uuid not null references ats.job_postings(id) on delete cascade,
  version_no      integer not null check (version_no > 0),
  company         text not null default '',
  job_title       text not null default '',
  full_name       text not null default '',
  contact         jsonb not null default '{}'::jsonb,
  competencies    text[] not null default '{}',
  education       jsonb not null default '[]'::jsonb,
  certifications  text[] not null default '{}',
  additional      text[] not null default '{}',
  section_order   text[] not null default '{}',
  engine          text not null default 'rules-engine',
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (analysis_id, version_no)
);

-- Every generated sentence, with the verdict that decides whether it may be
-- written into a file.
create table if not exists ats.generated_resume_bullets (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  generated_resume_id uuid not null references ats.generated_resumes(id) on delete cascade,
  section             text not null,
  group_key           text,
  position            integer not null default 0,
  bullet_text         text not null,
  original_text       text,
  rationale           text not null default '',
  validation          ats.validation_status not null,
  validation_notes    text[] not null default '{}',
  requirement_ids     uuid[] not null default '{}',
  -- Set by the export path. The CHECK is the database's half of the product's
  -- central promise: an unsupported claim can never be recorded as exported.
  included_in_export  boolean not null default false,
  created_at          timestamptz not null default now(),
  constraint unsupported_claims_are_never_exported
    check (not (included_in_export and validation = 'unsupported')),
  constraint unconfirmed_claims_are_never_exported
    check (not (included_in_export and validation = 'needs_confirmation'))
);
create index if not exists generated_bullets_resume_idx
  on ats.generated_resume_bullets (generated_resume_id, section, position);

-- The join that makes a claim auditable: this sentence, that fact.
create table if not exists ats.claim_evidence (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  bullet_id   uuid not null references ats.generated_resume_bullets(id) on delete cascade,
  fact_id     uuid not null references ats.career_facts(id) on delete cascade,
  confidence  numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  created_at  timestamptz not null default now(),
  unique (bullet_id, fact_id)
);

-- --- Applications, cover letters, interview prep ----------------------------

create table if not exists ats.applications (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  profile_id          uuid not null references ats.candidate_profiles(id) on delete cascade,
  company             text not null default '',
  role                text not null default '',
  job_url             text,
  job_posting_id      uuid references ats.job_postings(id) on delete set null,
  analysis_id         uuid references ats.job_analyses(id) on delete set null,
  generated_resume_id uuid references ats.generated_resumes(id) on delete set null,
  cover_letter_id     uuid,
  date_analyzed       date,
  date_applied        date,
  status              ats.application_status not null default 'researching',
  recruiter_name      text,
  recruiter_contact   text,
  interview_dates     date[] not null default '{}',
  notes               text not null default '',
  is_sample           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists applications_profile_idx on ats.applications (profile_id, updated_at desc);

create table if not exists ats.cover_letters (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid not null references ats.candidate_profiles(id) on delete cascade,
  analysis_id uuid not null references ats.job_analyses(id) on delete cascade,
  company     text not null default '',
  job_title   text not null default '',
  greeting    text not null default '',
  -- Paragraphs carry the same validation verdicts as resume lines.
  paragraphs  jsonb not null default '[]'::jsonb,
  closing     text not null default '',
  engine      text not null default 'rules-engine',
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (analysis_id)
);

alter table ats.applications
  add constraint applications_cover_letter_fk
  foreign key (cover_letter_id) references ats.cover_letters(id) on delete set null;

create table if not exists ats.interview_preps (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  profile_id    uuid not null references ats.candidate_profiles(id) on delete cascade,
  analysis_id   uuid not null references ats.job_analyses(id) on delete cascade,
  questions     jsonb not null default '[]'::jsonb,
  -- Partial matches and gaps: the questions that decide interviews.
  explain_these jsonb not null default '[]'::jsonb,
  engine        text not null default 'rules-engine',
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (analysis_id)
);

create table if not exists ats.user_settings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  setting_key text not null,
  value       text not null default '',
  updated_at  timestamptz not null default now(),
  unique (owner_id, setting_key)
);

-- --- Row level security -----------------------------------------------------
--
-- Enabled AND forced on every table. Forced matters: without it the table
-- owner role bypasses its own policies, which is exactly the hole that makes
-- "we have RLS" a false statement in so many projects.
--
-- One policy per command, all four commands, all comparing owner_id to
-- auth.uid(). WITH CHECK on insert and update is what stops a user writing a
-- row owned by somebody else.

do $$
declare
  t text;
begin
  foreach t in array array[
    'candidate_profiles','career_facts','resumes','resume_versions','resume_sections',
    'job_postings','job_requirements','job_keywords','job_analyses','requirement_matches',
    'generated_resumes','generated_resume_bullets','claim_evidence','applications',
    'cover_letters','interview_preps','user_settings'
  ]
  loop
    execute format('alter table ats.%I enable row level security', t);
    execute format('alter table ats.%I force row level security', t);

    execute format(
      'create policy %I on ats.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on ats.%I for insert to authenticated with check (owner_id = auth.uid())',
      t || '_insert_own', t);
    execute format(
      'create policy %I on ats.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update_own', t);
    execute format(
      'create policy %I on ats.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete_own', t);

    execute format(
      'grant select, insert, update, delete on ats.%I to authenticated', t);
  end loop;
end $$;

-- --- updated_at -------------------------------------------------------------

create or replace function ats.touch_updated_at()
returns trigger
language plpgsql
-- search_path is pinned. Migration 0047 exists because a function in another
-- schema shipped without it; that lesson is applied here rather than relearned.
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'candidate_profiles','career_facts','resumes','job_postings','job_analyses',
    'generated_resumes','applications','cover_letters','interview_preps','user_settings'
  ]
  loop
    execute format(
      'create trigger %I before update on ats.%I for each row execute function ats.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;
