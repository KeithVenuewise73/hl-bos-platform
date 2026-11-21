-- 0047 — forward-repair: pin search_path on social.deny_attempt_mutation().
-- 0046 shipped this one function without `set search_path = ''`; the advisor
-- raised function_search_path_mutable. The body references no schema object,
-- so pinning changes no behaviour. Forward-repair, because 0046 is applied and
-- checksum-locked.
--
-- rollback: restore the unpinned body (NOT recommended -- reintroduces the
-- advisor finding).

create or replace function social.deny_attempt_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'social.publish_attempts is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end; $$;

comment on function social.deny_attempt_mutation() is
  'Append-only guard for social.publish_attempts. search_path is pinned (0047): the body resolves no unqualified names, and a trigger on an evidence table must not inherit the caller''s search_path.';