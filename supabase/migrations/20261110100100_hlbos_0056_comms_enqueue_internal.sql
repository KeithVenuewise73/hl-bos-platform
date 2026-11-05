-- ===========================================================================
-- hlbos_0056_comms_enqueue_internal — queue a transactional message from inside
-- another module's RPC (e.g. salon cancel -> notify customer), without granting
-- every module user the comms.message.create permission.
--
-- Same rules as comms.request_message: suppression wins, idempotent, template
-- rendered server-side. INTERNAL: not granted to API roles. Never contacts a provider.
-- Also adds a DEV-ONLY mock dispatcher that is inert unless explicitly enabled and can
-- only ever complete messages addressed to a mock provider.
--
-- rollback:
--   DROP FUNCTION IF EXISTS comms.dev_dispatch_mock(integer);
--   DROP FUNCTION IF EXISTS comms.enqueue_internal(uuid, extensions.citext, comms.channel, extensions.citext, integer, extensions.citext, jsonb, extensions.citext);
-- ===========================================================================
create or replace function comms.enqueue_internal(
  p_tenant uuid, p_module extensions.citext, p_channel comms.channel,
  p_template extensions.citext, p_version integer, p_to extensions.citext,
  p_vars jsonb default '{}'::jsonb, p_idempotency extensions.citext default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_rendered jsonb; v_provider extensions.citext;
begin
  if p_idempotency is not null then
    select id into v_id from comms.messages where tenant_id = p_tenant and idempotency_key = p_idempotency;
    if found then return v_id; end if;
  end if;
  -- explicit lower(): the citext '=' operator is not resolved under search_path='' (falls back to case-sensitive text)
  if exists (select 1 from comms.suppression s where s.tenant_id = p_tenant and s.channel = p_channel and lower(s.contact::text) = lower(p_to::text)) then
    insert into comms.messages (tenant_id, source_module, channel, template_key, template_version, to_contact,
      message_class, status, idempotency_key, requested_by)
    values (p_tenant, p_module, p_channel, p_template, p_version, p_to, 'transactional', 'suppressed', p_idempotency, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  v_rendered := comms.render_template(p_template, p_version, p_vars);
  v_provider := (select key from comms.providers where channel = p_channel and is_active order by key limit 1);
  insert into comms.messages (tenant_id, source_module, channel, template_key, template_version, to_contact,
    message_class, status, subject, body, provider_key, idempotency_key, requested_by)
  values (p_tenant, p_module, p_channel, p_template, p_version, p_to, 'transactional', 'queued',
    v_rendered->>'subject', v_rendered->>'body', v_provider, p_idempotency, auth.uid())
  returning id into v_id;
  perform events.emit('communication.requested', p_tenant, jsonb_build_object('message', v_id, 'channel', p_channel, 'class', 'transactional'));
  return v_id;
end; $$;
revoke all on function comms.enqueue_internal(uuid, extensions.citext, comms.channel, extensions.citext, integer, extensions.citext, jsonb, extensions.citext) from public, anon, authenticated;

-- DEV/TEST ONLY. Marks queued messages as sent by a MOCK provider so workflows can be
-- exercised end to end. Refuses to run unless the session sets hlbos.allow_mock_transport = 'on'.
-- Not granted to any API role; no network call is ever made.
--
-- It can never record a REAL message as sent. It touches only messages that are
--   * queued (never pending, approved-but-unqueued, suppressed, failed or already sent), and
--   * addressed to a provider whose kind is 'mock'. A message for twilio/email (active or
--     not) or with no provider at all stays queued for the real worker. The provider of a
--     message is never written.
-- And when the Revenue Center's release settings are installed, they must allow mock delivery.
create or replace function comms.dev_dispatch_mock(p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0; v_id uuid; v_tenant uuid; v_provider extensions.citext; v_allowed boolean;
begin
  if coalesce(current_setting('hlbos.allow_mock_transport', true), 'off') <> 'on' then
    raise exception 'mock transport is disabled (set hlbos.allow_mock_transport = on in a development session)'
      using errcode = 'insufficient_privilege';
  end if;
  if to_regprocedure('revenue.setting(text)') is not null then
    execute 'select coalesce(revenue.setting($1), false)' into v_allowed using 'allow_mock_delivery';
    if not v_allowed then
      raise exception 'mock delivery is disabled in this environment (revenue.release_settings)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  for v_id, v_tenant, v_provider in
    select m.id, m.tenant_id, m.provider_key
      from comms.messages m
      join comms.providers p on p.key = m.provider_key
     where m.status = 'queued'
       and p.kind = 'mock'
     order by m.created_at
     limit p_limit
       for update of m skip locked
  loop
    update comms.messages
       set status = 'sent', provider_message_ref = 'mock-' || v_id::text, sent_at = now()
     where id = v_id;
    perform events.emit('communication.sent'::extensions.citext, v_tenant,
      jsonb_build_object('message', v_id, 'provider', v_provider, 'mock', true));
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function comms.dev_dispatch_mock(integer) from public, anon, authenticated;
