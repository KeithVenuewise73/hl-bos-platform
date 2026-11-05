-- ===========================================================================
-- PROPOSED FIX FOR PR #114 — NOT APPLIED. Implemented and tested in draft PR #116
-- (branch claude/pr114-mock-delivery-guard -> feat/salonos-v1). Belongs in #114's 0056 (or a
-- follow-up), not in #115; kept here so #115's review can see it was raised.
--
-- Problem (demonstrated on an isolated database, see
-- packages/growth-intelligence/src/pr114-mock.db.test.ts): comms.dev_dispatch_mock
-- marks EVERY 'queued' message 'sent' and rewrites provider_key to 'mock' —
-- including messages for a REAL provider — so a real message can be recorded
-- as delivered when nothing was sent, and its real provider is erased. The only
-- gate is a session setting any database owner can set.
--
-- Fix: only messages whose provider IS a mock provider; provider never
-- rewritten; queued or approved only (never pending/suppressed); recorded with
-- the same events as comms.record_delivery; and, when the Revenue Center is
-- installed, also refused unless revenue.release_settings allows mock delivery.
-- ===========================================================================
create or replace function comms.dev_dispatch_mock(p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0; v_id uuid; v_tenant uuid; v_allowed boolean := true;
begin
  if coalesce(current_setting('hlbos.allow_mock_transport', true), 'off') <> 'on' then
    raise exception 'mock transport is disabled (set hlbos.allow_mock_transport = on in a development session)'
      using errcode = 'insufficient_privilege';
  end if;
  if to_regprocedure('revenue.setting(text)') is not null then
    execute 'select coalesce(revenue.setting($1), false)' into v_allowed using 'allow_mock_delivery';
    if not v_allowed then
      raise exception 'mock delivery is disabled in this environment' using errcode = 'insufficient_privilege';
    end if;
  end if;
  for v_id, v_tenant in
    select m.id, m.tenant_id from comms.messages m join comms.providers p on p.key = m.provider_key
     where m.status in ('queued','approved') and p.kind = 'mock'
     order by m.created_at limit p_limit for update of m skip locked
  loop
    update comms.messages set status = 'sent', provider_message_ref = 'mock-' || v_id::text, sent_at = now() where id = v_id;
    perform events.emit('communication.sent', v_tenant, jsonb_build_object('message', v_id, 'mock', true));
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function comms.dev_dispatch_mock(integer) from public, anon, authenticated;
