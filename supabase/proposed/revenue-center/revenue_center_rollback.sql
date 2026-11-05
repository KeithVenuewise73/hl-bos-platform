-- ===========================================================================
-- ROLLBACK for supabase/proposed/revenue-center/revenue_center_controls.sql
--
-- Restores the four replaced platform functions EXACTLY as defined in
-- migrations 0013 (workflows.decide) and 0019 (comms.has_consent,
-- comms.request_message, comms.record_delivery), removes the triggers added to
-- existing tables, the template and permissions added, and the revenue schema.
--
-- Data written by the Revenue Center is in the revenue schema and is DELETED
-- by this script. Export it first if it matters (see the release procedure).
-- Contacts lower-cased in comms.consent / comms.suppression stay lower-cased
-- (harmless: comparisons are exact either way after rollback).
--
-- Proven on a disposable production-equivalent copy: schema fingerprint after
-- apply + rollback equals the fingerprint before apply (see the release report).
-- ===========================================================================
begin;
drop trigger if exists content_change_voids_approval on visibility.content_assets;
drop trigger if exists message_change_voids_approval on comms.messages;
drop trigger if exists consent_lowercase_contact on comms.consent;
drop trigger if exists suppression_lowercase_contact on comms.suppression;
drop trigger if exists messages_lowercase_contact on comms.messages;

-- workflows.decide, from 0013
create or replace function workflows.decide(p_task uuid, p_decision workflows.decision, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select t.tenant_id, t.instance_id into v_tenant, v_instance from workflows.tasks t where t.id = p_task;
  if not found then raise exception 'task % not found', p_task using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'workflows.approval.manage') then
    perform audit.log_security_event('workflows.decide','denied','warning', v_tenant,'workflows.tasks',p_task::text,null);
    raise exception 'insufficient privilege to decide this approval' using errcode = 'insufficient_privilege';
  end if;
  update workflows.tasks set status = p_decision::text::workflows.task_status where id = p_task and status = 'pending';
  if not found then raise exception 'task already decided' using errcode = 'unique_violation'; end if;
  insert into workflows.approvals (task_id, tenant_id, decision, actor_id, reason)
  values (p_task, v_tenant, p_decision, auth.uid(), p_reason);
  update workflows.instances set status = p_decision::text::workflows.instance_status where id = v_instance;
  perform events.emit('workflows.approval.managed', v_tenant, jsonb_build_object('instance', v_instance, 'decision', p_decision));
  perform audit.log_security_event('workflows.decide','allowed','info', v_tenant,'workflows.instances',v_instance::text,
    jsonb_build_object('decision', p_decision));
end; $$;
revoke all on function workflows.decide(uuid, workflows.decision, text) from public, anon;
grant execute on function workflows.decide(uuid, workflows.decision, text) to authenticated;

-- comms.has_consent, comms.request_message and comms.record_delivery, exactly as
-- production stored them (recovered archive, PR #113, 0019)
create or replace function comms.has_consent(p_tenant uuid, p_channel comms.channel, p_contact extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from comms.consent c
                 where c.tenant_id=p_tenant and c.channel=p_channel and c.contact=p_contact and c.status='granted')
     and not exists (select 1 from comms.suppression s
                 where s.tenant_id=p_tenant and s.channel=p_channel and s.contact=p_contact);
$$;
revoke all on function comms.has_consent(uuid, comms.channel, extensions.citext) from public, anon;
grant execute on function comms.has_consent(uuid, comms.channel, extensions.citext) to authenticated;
create or replace function comms.request_message(
  p_tenant uuid, p_module extensions.citext, p_channel comms.channel,
  p_template extensions.citext, p_version integer, p_to extensions.citext,
  p_class comms.message_class default 'transactional', p_vars jsonb default '{}'::jsonb,
  p_idempotency extensions.citext default null, p_from_identity text default null,
  p_require_approval boolean default false, p_provider extensions.citext default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_rendered jsonb; v_provider extensions.citext; v_instance uuid; v_existing uuid;
begin
  if not identity.has_permission(p_tenant, 'comms.message.create') then
    raise exception 'insufficient privilege to send communications' using errcode = 'insufficient_privilege';
  end if;
  if p_idempotency is not null then
    select id into v_existing from comms.messages where tenant_id=p_tenant and idempotency_key=p_idempotency;
    if found then return v_existing; end if;
  end if;
  if exists (select 1 from comms.suppression s where s.tenant_id=p_tenant and s.channel=p_channel and s.contact=p_to) then
    insert into comms.messages (tenant_id, source_module, channel, template_key, template_version,
      to_contact, message_class, status, idempotency_key, requested_by)
    values (p_tenant, p_module, p_channel, p_template, p_version, p_to, p_class, 'suppressed', p_idempotency, auth.uid())
    returning id into v_id;
    perform events.emit('communication.suppressed', p_tenant, jsonb_build_object('message', v_id, 'to', p_to));
    return v_id;
  end if;
  if p_class = 'marketing' and not comms.has_consent(p_tenant, p_channel, p_to) then
    raise exception 'marketing communication requires prior consent' using errcode = 'insufficient_privilege';
  end if;
  v_rendered := comms.render_template(p_template, p_version, p_vars);
  v_provider := coalesce(p_provider,
    (select key from comms.providers where channel=p_channel and is_active order by key limit 1));
  insert into comms.messages (tenant_id, source_module, channel, template_key, template_version,
    to_contact, from_identity, message_class, status, subject, body, provider_key, idempotency_key, requested_by)
  values (p_tenant, p_module, p_channel, p_template, p_version, p_to, p_from_identity, p_class,
    (case when p_require_approval then 'pending' else 'queued' end)::comms.message_status,
    v_rendered->>'subject', v_rendered->>'body', v_provider, p_idempotency, auth.uid())
  returning id into v_id;
  perform events.emit('communication.requested', p_tenant,
    jsonb_build_object('message', v_id, 'channel', p_channel, 'class', p_class));
  if p_require_approval then
    v_instance := workflows.request_approval(p_tenant, 'comms.message.create', 'comms.message', v_id::text, 'tenant_admin');
    update comms.messages set approval_instance_id = v_instance where id = v_id;
  end if;
  return v_id;
end; $$;
revoke all on function comms.request_message(uuid, extensions.citext, comms.channel, extensions.citext, integer, extensions.citext, comms.message_class, jsonb, extensions.citext, text, boolean, extensions.citext) from public, anon;
grant execute on function comms.request_message(uuid, extensions.citext, comms.channel, extensions.citext, integer, extensions.citext, comms.message_class, jsonb, extensions.citext, text, boolean, extensions.citext) to authenticated;
create or replace function comms.record_delivery(
  p_message uuid, p_status comms.message_status, p_provider_ref extensions.citext default null, p_failure text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the trusted provider worker may record delivery status' using errcode = 'insufficient_privilege';
  end if;
  select tenant_id into v_tenant from comms.messages where id = p_message;
  if not found then raise exception 'message % not found', p_message using errcode = 'no_data_found'; end if;
  update comms.messages
     set status = p_status,
         provider_message_ref = coalesce(p_provider_ref, provider_message_ref),
         failure_reason = p_failure,
         attempts = attempts + case when p_status = 'failed' then 1 else 0 end,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end
   where id = p_message;
  perform events.emit(('communication.' || p_status::text)::extensions.citext, v_tenant,
    jsonb_build_object('message', p_message, 'reason', p_failure));
end; $$;
revoke all on function comms.record_delivery(uuid, comms.message_status, extensions.citext, text) from public, anon;
grant execute on function comms.record_delivery(uuid, comms.message_status, extensions.citext, text) to authenticated;

drop schema if exists revenue cascade;
delete from comms.template_versions where template_key = 'inquiry_received';
delete from comms.templates where key = 'inquiry_received';
delete from identity.role_permissions where permission_key like 'revenue.%';
delete from identity.permissions where key like 'revenue.%';
commit;
