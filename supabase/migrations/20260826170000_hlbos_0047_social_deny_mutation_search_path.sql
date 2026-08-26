-- ===========================================================================
-- 0047 — forward-repair: pin search_path on social.deny_attempt_mutation()
--
-- WHY THIS EXISTS. 0046 was applied to the canonical project, and the advisor
-- check immediately afterwards raised one WARN that the local suite had not:
--
--   function_search_path_mutable — `social.deny_attempt_mutation` has a role
--   mutable search_path
--
-- It was the single function in 0046 written without `set search_path = ''`.
-- Every other function in the schema has it. A trigger function with a
-- mutable search_path is a privilege-escalation surface: it runs on a table
-- whose writes are otherwise tightly held, and resolution of any unqualified
-- name inside it depends on the caller's search_path.
--
-- This body references no schema object at all -- it only reads tg_op and
-- raises -- so pinning search_path to '' changes no behaviour. It is a
-- one-line correction, not a redesign.
--
-- FORWARD-REPAIR, NOT AN EDIT. 0046 is already applied and its checksum is
-- locked by .hlbos/migration-lineage.json. Editing it would make the repo file
-- disagree with what production actually ran, which is precisely the drift
-- this platform has spent two phases reconciling. So the fix ships forward.
--
-- The guard against a recurrence is a test, not a habit:
-- supabase/tests/46_social_publishing.sql now asserts that EVERY function in
-- the social schema pins its search_path. That assertion fails on the next
-- function anyone adds without it.
--
-- rollback:
--   -- Restoring the mutable search_path would REINTRODUCE the advisor
--   -- finding, so this is recorded for completeness, not recommended:
--   CREATE OR REPLACE FUNCTION social.deny_attempt_mutation()
--   RETURNS trigger LANGUAGE plpgsql AS $body$
--   BEGIN
--     RAISE EXCEPTION 'social.publish_attempts is append-only (attempted %)', tg_op
--       USING ERRCODE = 'insufficient_privilege';
--   END; $body$;
-- ===========================================================================

create or replace function social.deny_attempt_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'social.publish_attempts is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end; $$;

comment on function social.deny_attempt_mutation() is
  'Append-only guard for social.publish_attempts. search_path is pinned (0047): the body resolves no unqualified names, and a trigger on an evidence table must not inherit the caller''s search_path.';
