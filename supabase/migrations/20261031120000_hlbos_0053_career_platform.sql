-- ===========================================================================
-- ats — HLG Career Platform records
--
-- Extends the ATS Resume Optimizer schema (migration 0048) with the subscriber
-- journey: search profile, experience-bank interpretations, approved base
-- resumes, employer boards, opportunities, FROZEN submitted applications,
-- interview practice, LinkedIn drafts and metered usage.
--
-- STATUS: written and verified against a local PostgreSQL. NOT APPLIED to any
-- project. Applying it needs explicit approval (CLAUDE.md, standing
-- constraints).
--
-- Shape. One table, `ats.career_records`, discriminated by `kind`, with the
-- record as `data jsonb`. The app reads and writes whole records and the
-- planner diffs by id, exactly as it does for the 0048 tables. The rules that
-- matter are enforced here, not just in the app:
--
--   * RLS enabled and FORCED; every policy compares owner_id to auth.uid().
--   * A `submission` row can never be UPDATED. It is the exact package a
--     person told us they sent to an employer; regenerating documents creates
--     new drafts, never a new version of history.
--   * A `usage_event` row can never be updated, and can only be deleted by
--     `ats.erase_my_career_data()` — otherwise deleting your own usage rows
--     would reset a server-side limit.
--   * `ats.erase_my_career_data()` deletes every row the caller owns across
--     the ats schema (account data deletion). It is SECURITY INVOKER: it runs
--     under the caller's own RLS, so it cannot touch anyone else's rows.
--
-- Also: drops the one-letter-per-analysis unique constraint on
-- ats.cover_letters. Regenerating a cover letter used to REPLACE the previous
-- one; the career platform keeps every draft, so the constraint goes.
--
-- rollback:
--   DROP FUNCTION IF EXISTS ats.erase_my_career_data();
--   DROP TABLE IF EXISTS ats.career_records CASCADE;
--   DROP FUNCTION IF EXISTS ats.career_records_guard();
--   -- Restoring the cover-letter constraint requires at most one letter per
--   -- analysis first; delete older duplicates, then:
--   -- ALTER TABLE ats.cover_letters ADD CONSTRAINT cover_letters_analysis_id_key UNIQUE (analysis_id);
-- ===========================================================================

create table if not exists ats.career_records (
  id          uuid primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in (
                'search_profile','interpretation','base_resume','employer_board',
                'opportunity','submission','practice_session','linkedin_item',
                'usage_event')),
  data        jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- The record's own id must agree with the row id, so a row cannot carry one
  -- record while claiming to be another.
  constraint career_record_id_matches check (data->>'id' = id::text),
  -- A submission must carry its content hash; the app verifies it on read.
  -- coalesce matters: a missing hash makes length() NULL, and a CHECK that
  -- evaluates to NULL PASSES. Found by testing this guard, not by reading it.
  constraint submission_has_hash check (kind <> 'submission' or coalesce(length(data->>'contentHash'), 0) = 64)
);
comment on table ats.career_records is
  'HLG Career Platform records, one per row, discriminated by kind. Submissions and usage events are immutable (see ats.career_records_guard).';

create index if not exists career_records_owner_kind_idx on ats.career_records (owner_id, kind);

create or replace function ats.career_records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.kind in ('submission', 'usage_event') then
      raise exception 'ats.career_records: % rows are immutable', old.kind
        using errcode = 'check_violation';
    end if;
    if new.kind <> old.kind or new.owner_id <> old.owner_id then
      raise exception 'ats.career_records: kind and owner cannot change'
        using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'DELETE' and old.kind = 'usage_event'
     and coalesce(current_setting('ats.erasing_account', true), '') <> 'on' then
    raise exception 'ats.career_records: usage events are removed only by account deletion'
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

drop trigger if exists career_records_guard_update on ats.career_records;
create trigger career_records_guard_update
  before update on ats.career_records
  for each row execute function ats.career_records_guard();

drop trigger if exists career_records_guard_delete on ats.career_records;
create trigger career_records_guard_delete
  before delete on ats.career_records
  for each row execute function ats.career_records_guard();

alter table ats.career_records enable row level security;
alter table ats.career_records force row level security;

drop policy if exists career_records_select_own on ats.career_records;
create policy career_records_select_own on ats.career_records
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists career_records_insert_own on ats.career_records;
create policy career_records_insert_own on ats.career_records
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists career_records_update_own on ats.career_records;
create policy career_records_update_own on ats.career_records
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists career_records_delete_own on ats.career_records;
create policy career_records_delete_own on ats.career_records
  for delete to authenticated using (owner_id = auth.uid());

revoke all on ats.career_records from public, anon;
grant select, insert, update, delete on ats.career_records to authenticated;

-- Cover letters keep every version now.
alter table ats.cover_letters drop constraint if exists cover_letters_analysis_id_key;

-- Account data deletion. Runs under the caller's RLS (security invoker), so
-- "every row I own" is the most it can ever reach.
create or replace function ats.erase_my_career_data()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer := 0;
  c integer;
  t text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('ats.erasing_account', 'on', true);
  delete from ats.career_records where owner_id = uid;
  get diagnostics c = row_count; n := n + c;
  -- Children before parents is unnecessary (FKs cascade), but candidate
  -- profiles last keeps the count honest.
  foreach t in array array[
    'claim_evidence','generated_resume_bullets','generated_resumes',
    'requirement_matches','interview_preps','applications','cover_letters',
    'job_analyses','job_keywords','job_requirements','job_postings',
    'resume_sections','resume_versions','resumes','career_facts',
    'user_settings','candidate_profiles'
  ] loop
    execute format('delete from ats.%I where owner_id = $1', t) using uid;
    get diagnostics c = row_count; n := n + c;
  end loop;
  perform set_config('ats.erasing_account', '', true);
  return n;
end $$;

revoke all on function ats.erase_my_career_data() from public, anon;
grant execute on function ats.erase_my_career_data() to authenticated;
