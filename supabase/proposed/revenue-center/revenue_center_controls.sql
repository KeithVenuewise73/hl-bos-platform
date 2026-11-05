-- ===========================================================================
-- PROPOSED MIGRATION — NOT IN supabase/migrations, NOT APPLIED ANYWHERE.
--
-- HLG Revenue Center controls. Applied only to the isolated test database by
-- scripts/local-test/revenue-center-db.sh, after every migration on main.
-- Its ordinal is assigned when PR #113 (production recovery) and PR #114
-- (claims 0055-0059) are settled; the recommendation is 0060. Applying it to
-- any hosted project needs the owner's explicit approval.
--
-- Closes four gaps found by testing PR #115:
--   1. Commercial approvals were not owner-only: 'manager' holds
--      workflows.approval.manage and could approve its own outreach.
--   2. Send to Review was several calls; a failure part-way left a blocking draft.
--   3. Assessments had nowhere to keep assumptions, estimates, not-checked
--      items, customer-provided facts and evidence sources apart.
--   4. comms.record_delivery could mark a never-approved message as sent.
--   5. Suppression could be bypassed by changing an address's capitals: under
--      search_path = '' citext's case-insensitive '=' is not resolved, so
--      'STOP@x' <> 'stop@x' (verified). Contacts are now stored in lower case.
-- And adds the prospect profile the Revenue Center needs (industry, campaign,
-- dedupe key, source, synthetic flag, qualification/rejection status).
--
-- Reuses: identity permissions/roles, visibility.*, workflows.*, comms.*,
-- audit.emit / audit.log_security_event, events.emit. No existing table is
-- altered; three existing functions are replaced (workflows.decide,
-- comms.record_delivery — both strictly narrowed — and none widened).
--
-- rollback:
--   DROP SCHEMA IF EXISTS revenue CASCADE;
--   DROP TRIGGER IF EXISTS content_change_voids_approval ON visibility.content_assets;
--   DROP TRIGGER IF EXISTS message_change_voids_approval ON comms.messages;
--   then re-run the original definitions of workflows.decide (0013) and
--   comms.record_delivery (0019).
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'revenue.%';
--   DELETE FROM identity.permissions WHERE key LIKE 'revenue.%';
-- ===========================================================================

create schema if not exists revenue;
comment on schema revenue is 'HLG Revenue Center: prospect profiles, atomic reviews, evidence, commercial approvals. Writes only through definer functions.';
revoke all on schema revenue from public, anon;
grant usage on schema revenue to authenticated;
alter default privileges in schema revenue revoke all on tables from public;
alter default privileges in schema revenue revoke all on functions from public;

do $$ begin create type revenue.discovery_source as enum ('mock','import','google_places','inbound_inquiry','referral'); exception when duplicate_object then null; end $$;
do $$ begin create type revenue.prospect_status as enum ('active','qualified','rejected','disqualified'); exception when duplicate_object then null; end $$;
do $$ begin create type revenue.evidence_kind as enum
  ('observed','verified','customer_provided','needs_verification','not_checked','assumption','estimate'); exception when duplicate_object then null; end $$;

-- --- Permissions (existing authorization infrastructure) -------------------
insert into identity.permissions (key, description, scope) values
  ('revenue.commercial_approval.manage', 'Give final approval to a proposal or outreach message.', 'tenant'),
  ('revenue.approver.assign', 'Designate who may give commercial approval (platform).', 'platform')
on conflict (key) do nothing;
-- tenant_owner only. Deliberately NOT tenant_admin, manager, staff or service_account.
insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','revenue.commercial_approval.manage'),
  ('platform_owner','revenue.approver.assign')
on conflict do nothing;

-- --- Designated approvers: role AND designation are both required -----------
create table if not exists revenue.commercial_approvers (
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  designated_by uuid references auth.users(id) on delete set null,
  designated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- --- Prospect profile (one per visibility.prospects row) -------------------
create table if not exists revenue.prospect_profiles (
  prospect_id      uuid primary key references visibility.prospects(id) on delete cascade,
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  industry_key     extensions.citext not null,
  campaign_key     extensions.citext,
  dedupe_key       extensions.citext not null,
  discovery_source revenue.discovery_source not null,
  is_synthetic     boolean not null,                 -- required: nobody can forget it
  status           revenue.prospect_status not null default 'active',
  status_reason    text,
  status_changed_at timestamptz,
  scan_snapshot    jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  -- a rejected or disqualified record keeps its dedupe key, so the same
  -- business is never re-added by a backfill
  constraint prospect_profiles_dedupe unique (tenant_id, dedupe_key),
  constraint prospect_profiles_reason check (status in ('active','qualified') or coalesce(trim(status_reason),'') <> '')
);
create index if not exists prospect_profiles_industry_idx on revenue.prospect_profiles (tenant_id, industry_key, status);

-- --- Review requests: idempotency for Send to Review -----------------------
create table if not exists revenue.review_requests (
  prospect_id    uuid not null references visibility.prospects(id) on delete cascade,
  request_key    extensions.citext not null,
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  assessment_id  uuid not null references visibility.assessments(id) on delete cascade,
  payload_sha256 text not null,
  requested_by   uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (prospect_id, request_key)
);

-- --- Evidence: every statement in its own kind, never mixed ----------------
create table if not exists revenue.assessment_evidence (
  id            bigint generated always as identity primary key,
  assessment_id uuid not null references visibility.assessments(id) on delete cascade,
  prospect_id   uuid not null references visibility.prospects(id) on delete cascade,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  evidence_key  extensions.citext not null,
  kind          revenue.evidence_kind not null,
  label         text not null,
  statement     text not null,
  source        text,
  source_ref    text,
  observed_at   timestamptz,
  confidence    text,
  how_to_verify text,
  rationale     text,
  offer_key     extensions.citext,
  basis         extensions.citext[] not null default '{}',
  recommendation_id bigint references visibility.recommendations(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint evidence_unique unique (assessment_id, evidence_key),
  constraint evidence_confidence check (confidence is null or confidence in ('high','medium','low')),
  -- facts must say where and when they came from
  constraint evidence_fact_sourced check (kind not in ('observed','verified','customer_provided')
    or (source is not null and observed_at is not null)),
  constraint evidence_customer_source check (kind <> 'customer_provided' or source = 'customer_provided'),
  -- an assumption is never stated with confidence, and always says how to check it
  constraint evidence_assumption_shape check (kind <> 'assumption'
    or (confidence is null and coalesce(trim(how_to_verify),'') <> '')),
  -- an estimate explains itself and cites what it rests on
  constraint evidence_estimate_shape check (kind <> 'estimate'
    or (coalesce(trim(rationale),'') <> '' and cardinality(basis) > 0))
);
create index if not exists evidence_assessment_idx on revenue.assessment_evidence (assessment_id, kind);

-- --- Approval bindings: the exact version that was approved ----------------
create table if not exists revenue.approval_bindings (
  instance_id    uuid primary key references workflows.instances(id) on delete cascade,
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  subject_type   text not null,
  subject_id     text not null,
  content_sha256 text not null,
  approved_by    uuid not null references auth.users(id) on delete set null,
  approved_at    timestamptz not null default now()
);

-- --- Audit + RLS -------------------------------------------------------------
create trigger prospect_profiles_audit after insert or update or delete on revenue.prospect_profiles for each row execute function audit.emit();
create trigger review_requests_audit after insert or update or delete on revenue.review_requests for each row execute function audit.emit();
create trigger approval_bindings_audit after insert or update or delete on revenue.approval_bindings for each row execute function audit.emit();
create trigger commercial_approvers_audit after insert or update or delete on revenue.commercial_approvers for each row execute function audit.emit();

alter table revenue.commercial_approvers enable row level security; alter table revenue.commercial_approvers force row level security;
alter table revenue.prospect_profiles   enable row level security; alter table revenue.prospect_profiles   force row level security;
alter table revenue.review_requests     enable row level security; alter table revenue.review_requests     force row level security;
alter table revenue.assessment_evidence enable row level security; alter table revenue.assessment_evidence force row level security;
alter table revenue.approval_bindings   enable row level security; alter table revenue.approval_bindings   force row level security;

create policy commercial_approvers_select on revenue.commercial_approvers for select to authenticated using (identity.is_member(tenant_id));
create policy prospect_profiles_select on revenue.prospect_profiles for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
create policy review_requests_select on revenue.review_requests for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.assessment.read'));
create policy assessment_evidence_select on revenue.assessment_evidence for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.assessment.read'));
create policy approval_bindings_select on revenue.approval_bindings for select to authenticated using (identity.is_member(tenant_id));
grant select on revenue.commercial_approvers, revenue.prospect_profiles, revenue.review_requests,
  revenue.assessment_evidence, revenue.approval_bindings to authenticated;

-- ===========================================================================
-- Content hashes — the "exact version". Same formula in TypeScript.
-- ===========================================================================
create or replace function revenue.content_sha256(p_title text, p_body text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_title,'') || chr(10) || coalesce(p_body,''), 'sha256'), 'hex');
$$;
create or replace function revenue.message_sha256(p_to text, p_subject text, p_body text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_to,'') || chr(10) || coalesce(p_subject,'') || chr(10) || coalesce(p_body,''), 'sha256'), 'hex');
$$;
grant execute on function revenue.content_sha256(text, text), revenue.message_sha256(text, text, text) to authenticated;

-- Is this workflow instance a COMMERCIAL approval (proposal or marketing outreach)?
create or replace function revenue.is_commercial(p_instance uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workflows.instances i
    left join visibility.content_assets c on i.subject_type = 'visibility.content' and c.id::text = i.subject_id
    left join comms.messages m on i.subject_type = 'comms.message' and m.id::text = i.subject_id
    where i.id = p_instance
      and ((i.kind = 'visibility.content.publish' and c.kind = 'proposal')
        or (i.kind = 'comms.message.create' and m.message_class = 'marketing')));
$$;

-- ===========================================================================
-- 1. Owner-only commercial approval, bound to the exact version
-- ===========================================================================

-- workflows.decide is NARROWED: it refuses commercial approvals, which must go
-- through revenue.approve_commercial. Every other approval behaves as before.
create or replace function workflows.decide(p_task uuid, p_decision workflows.decision, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select t.tenant_id, t.instance_id into v_tenant, v_instance from workflows.tasks t where t.id = p_task;
  if not found then raise exception 'task % not found', p_task using errcode = 'no_data_found'; end if;
  if revenue.is_commercial(v_instance) then
    raise exception 'commercial approvals require the designated owner (revenue.approve_commercial)' using errcode = 'insufficient_privilege';
  end if;
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

create or replace function revenue.designate_approver(p_tenant uuid, p_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from identity.platform_admins pa join identity.role_permissions rp on rp.role_key = pa.role_key
                 where pa.user_id = auth.uid() and rp.permission_key = 'revenue.approver.assign') then
    raise exception 'only the platform owner designates commercial approvers' using errcode = 'insufficient_privilege';
  end if;
  insert into revenue.commercial_approvers (tenant_id, user_id, designated_by) values (p_tenant, p_user, auth.uid())
  on conflict do nothing;
end; $$;
revoke all on function revenue.designate_approver(uuid, uuid) from public, anon;
grant execute on function revenue.designate_approver(uuid, uuid) to authenticated;

-- The owner approves (or rejects) EXACTLY the version whose hash they were shown.
create or replace function revenue.approve_commercial(
  p_instance uuid, p_decision workflows.decision, p_content_sha256 text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_i workflows.instances; v_task uuid; v_hash text;
begin
  select * into v_i from workflows.instances where id = p_instance;
  if not found then raise exception 'approval % not found', p_instance using errcode = 'no_data_found'; end if;
  if not revenue.is_commercial(p_instance) then
    raise exception 'not a commercial approval' using errcode = 'invalid_parameter_value';
  end if;
  if not identity.has_permission(v_i.tenant_id, 'revenue.commercial_approval.manage')
     or not exists (select 1 from revenue.commercial_approvers a where a.tenant_id = v_i.tenant_id and a.user_id = auth.uid()) then
    raise exception 'only the designated owner may give commercial approval' using errcode = 'insufficient_privilege';
  end if;
  if v_i.status <> 'open' then
    raise exception 'this approval is no longer open (status %)', v_i.status using errcode = 'unique_violation';
  end if;
  if v_i.subject_type = 'visibility.content' then
    select revenue.content_sha256(title, body) into v_hash from visibility.content_assets
      where id::text = v_i.subject_id and approval_instance_id = p_instance;
  else
    select revenue.message_sha256(to_contact::text, subject, body) into v_hash from comms.messages
      where id::text = v_i.subject_id and approval_instance_id = p_instance;
  end if;
  if v_hash is null then
    raise exception 'the item is no longer attached to this approval' using errcode = 'no_data_found';
  end if;
  if v_hash <> p_content_sha256 then
    raise exception 'the content changed since you viewed it; review the current version' using errcode = 'invalid_parameter_value';
  end if;
  select id into v_task from workflows.tasks where instance_id = p_instance and status = 'pending' order by step limit 1;
  update workflows.tasks set status = p_decision::text::workflows.task_status where id = v_task;
  insert into workflows.approvals (task_id, tenant_id, decision, actor_id, reason)
  values (v_task, v_i.tenant_id, p_decision, auth.uid(), p_reason);
  update workflows.instances set status = p_decision::text::workflows.instance_status where id = p_instance;
  if p_decision = 'approved' then
    insert into revenue.approval_bindings (instance_id, tenant_id, subject_type, subject_id, content_sha256, approved_by)
    values (p_instance, v_i.tenant_id, v_i.subject_type, v_i.subject_id, v_hash, auth.uid());
  end if;
  perform events.emit('revenue.commercial.decided', v_i.tenant_id,
    jsonb_build_object('instance', p_instance, 'decision', p_decision, 'sha256', v_hash));
  perform audit.log_security_event('revenue.approve_commercial','allowed','info', v_i.tenant_id,
    'workflows.instances', p_instance::text, jsonb_build_object('decision', p_decision, 'sha256', v_hash));
end; $$;
revoke all on function revenue.approve_commercial(uuid, workflows.decision, text, text) from public, anon;
grant execute on function revenue.approve_commercial(uuid, workflows.decision, text, text) to authenticated;

-- A material change to approved or pending content voids the approval.
create or replace function revenue.void_approval_on_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.approval_instance_id is not null then
    update workflows.instances set status = 'canceled' where id = new.approval_instance_id and status in ('open','approved');
    perform audit.log_security_event('revenue.approval.voided','allowed','warning', new.tenant_id,
      tg_table_schema || '.' || tg_table_name, new.id::text, jsonb_build_object('instance', new.approval_instance_id));
    new.approval_instance_id := null;
    if tg_table_name = 'content_assets' then
      new.status := 'draft';
    elsif new.status in ('pending','approved','queued') then
      new.status := 'pending';
    end if;
  end if;
  return new;
end; $$;
create trigger content_change_voids_approval before update of title, body on visibility.content_assets
  for each row when (old.title is distinct from new.title or old.body is distinct from new.body)
  execute function revenue.void_approval_on_change();
create trigger message_change_voids_approval before update of to_contact, subject, body on comms.messages
  for each row when (old.to_contact is distinct from new.to_contact or old.subject is distinct from new.subject or old.body is distinct from new.body)
  execute function revenue.void_approval_on_change();

-- Delivery may only follow approval (or a transactional queue). NARROWED.
create or replace function comms.record_delivery(
  p_message uuid, p_status comms.message_status, p_provider_ref extensions.citext default null, p_failure text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status comms.message_status;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the trusted provider worker may record delivery status' using errcode = 'insufficient_privilege';
  end if;
  select tenant_id, status into v_tenant, v_status from comms.messages where id = p_message;
  if not found then raise exception 'message % not found', p_message using errcode = 'no_data_found'; end if;
  if p_status in ('sent','delivered') and v_status not in ('approved','queued','sent') then
    raise exception 'a % message cannot be recorded as %', v_status, p_status using errcode = 'insufficient_privilege';
  end if;
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

-- ===========================================================================
-- Contacts are compared exactly under search_path = '', so store them in one
-- case. Phone numbers are unaffected. Production holds no comms rows today.
-- ===========================================================================
create or replace function revenue.lowercase_contact()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'messages' then
    new.to_contact := lower(new.to_contact::text);
  else
    new.contact := lower(new.contact::text);
  end if;
  return new;
end; $$;
create trigger consent_lowercase_contact before insert or update of contact on comms.consent
  for each row execute function revenue.lowercase_contact();
create trigger suppression_lowercase_contact before insert or update of contact on comms.suppression
  for each row execute function revenue.lowercase_contact();
create trigger messages_lowercase_contact before insert or update of to_contact on comms.messages
  for each row execute function revenue.lowercase_contact();
update comms.consent set contact = lower(contact::text) where contact::text <> lower(contact::text);
update comms.suppression set contact = lower(contact::text) where contact::text <> lower(contact::text);

-- comms.has_consent and comms.request_message (0019), REPLACED with the only
-- change being case-insensitive contact comparison (lower() on both sides).
create or replace function comms.has_consent(p_tenant uuid, p_channel comms.channel, p_contact extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from comms.consent c
                 where c.tenant_id=p_tenant and c.channel=p_channel and lower(c.contact::text)=lower(p_contact::text) and c.status='granted')
     and not exists (select 1 from comms.suppression s
                 where s.tenant_id=p_tenant and s.channel=p_channel and lower(s.contact::text)=lower(p_contact::text));
$$;
revoke all on function comms.has_consent(uuid, comms.channel, extensions.citext) from public, anon;
grant execute on function comms.has_consent(uuid, comms.channel, extensions.citext) to authenticated;

-- --- Request a message (permission + consent + suppression + render + idempotency)
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
  -- idempotency: same key returns the same message, never a duplicate send
  if p_idempotency is not null then
    select id into v_existing from comms.messages where tenant_id=p_tenant and idempotency_key=p_idempotency;
    if found then return v_existing; end if;
  end if;
  -- suppression always wins (STOP / bounce / complaint)
  if exists (select 1 from comms.suppression s where s.tenant_id=p_tenant and s.channel=p_channel and lower(s.contact::text)=lower(p_to::text)) then
    insert into comms.messages (tenant_id, source_module, channel, template_key, template_version,
      to_contact, message_class, status, idempotency_key, requested_by)
    values (p_tenant, p_module, p_channel, p_template, p_version, p_to, p_class, 'suppressed', p_idempotency, auth.uid())
    returning id into v_id;
    perform events.emit('communication.suppressed', p_tenant, jsonb_build_object('message', v_id, 'to', p_to));
    return v_id;
  end if;
  -- marketing requires valid consent; transactional does not
  if p_class = 'marketing' and not comms.has_consent(p_tenant, p_channel, p_to) then
    raise exception 'marketing communication requires prior consent' using errcode = 'insufficient_privilege';
  end if;
  -- render (raises on a missing variable)
  v_rendered := comms.render_template(p_template, p_version, p_vars);
  -- pick an active provider for the channel unless one is named
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


-- ===========================================================================
-- 2. Prospect registration, status and rejection
-- ===========================================================================
create or replace function revenue.register_prospect(
  p_tenant uuid, p_business text, p_industry extensions.citext, p_dedupe extensions.citext,
  p_source revenue.discovery_source, p_is_synthetic boolean, p_campaign extensions.citext default null,
  p_email extensions.citext default null, p_phone text default null, p_city text default null,
  p_website text default null, p_snapshot jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_existing uuid; v_id uuid;
begin
  if p_is_synthetic is null then raise exception 'is_synthetic must be stated' using errcode = 'not_null_violation'; end if;
  select prospect_id into v_existing from revenue.prospect_profiles
   where tenant_id = p_tenant and lower(dedupe_key::text) = lower(p_dedupe::text);
  if found then
    if not identity.has_permission(p_tenant, 'visibility.prospect.read') then
      raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
    end if;
    return jsonb_build_object('prospect_id', v_existing, 'duplicate', true);
  end if;
  v_id := visibility.create_prospect(p_tenant, p_business, null, p_email, p_phone, p_industry, p_city, p_website);
  insert into revenue.prospect_profiles (prospect_id, tenant_id, industry_key, campaign_key, dedupe_key,
    discovery_source, is_synthetic, scan_snapshot)
  values (v_id, p_tenant, p_industry, p_campaign, lower(p_dedupe::text), p_source, p_is_synthetic, coalesce(p_snapshot,'{}'::jsonb));
  return jsonb_build_object('prospect_id', v_id, 'duplicate', false);
end; $$;
revoke all on function revenue.register_prospect(uuid, text, extensions.citext, extensions.citext, revenue.discovery_source, boolean, extensions.citext, extensions.citext, text, text, text, jsonb) from public, anon;
grant execute on function revenue.register_prospect(uuid, text, extensions.citext, extensions.citext, revenue.discovery_source, boolean, extensions.citext, extensions.citext, text, text, text, jsonb) to authenticated;

create or replace function revenue.set_prospect_status(p_prospect uuid, p_status revenue.prospect_status, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from revenue.prospect_profiles where prospect_id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update revenue.prospect_profiles set status = p_status, status_reason = p_reason, status_changed_at = now()
   where prospect_id = p_prospect;
  if p_status in ('rejected','disqualified') then
    perform visibility.set_prospect_stage(p_prospect, 'lost');
  end if;
end; $$;
revoke all on function revenue.set_prospect_status(uuid, revenue.prospect_status, text) from public, anon;
grant execute on function revenue.set_prospect_status(uuid, revenue.prospect_status, text) to authenticated;

-- ===========================================================================
-- 3. Send to Review — ONE transaction, idempotent
-- ===========================================================================
-- p_payload:
--   { "scores":   [{"category":"calls_to_action","score":1,"note":"..."}],
--     "evidence": [{"key","kind","label","statement","source","source_ref","observed_at",
--                   "confidence","how_to_verify","rationale","offer_key","basis":[...]}],
--     "recommendations": [{"kind","title","detail","service","priority","evidence_key"}] }
-- Any failure raises, and PostgreSQL rolls back everything this call wrote.
create or replace function revenue.send_to_review(p_prospect uuid, p_request_key extensions.citext, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid; v_status revenue.prospect_status; v_hash text; v_prev revenue.review_requests;
  v_assessment uuid; v_growth integer; r jsonb; v_rec bigint; v_kind revenue.evidence_kind;
begin
  select tenant_id, status into v_tenant, v_status from revenue.prospect_profiles where prospect_id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.assessment.manage') then
    raise exception 'insufficient privilege to run an assessment' using errcode = 'insufficient_privilege';
  end if;
  if v_status in ('rejected','disqualified') then
    raise exception 'a % prospect cannot be reviewed', v_status using errcode = 'invalid_parameter_value';
  end if;
  v_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');

  -- serialise concurrent clicks on the same prospect
  perform 1 from visibility.prospects where id = p_prospect for update;

  select * into v_prev from revenue.review_requests where prospect_id = p_prospect and request_key = p_request_key;
  if found then
    if v_prev.payload_sha256 <> v_hash then
      raise exception 'this review request was already made with different evidence' using errcode = 'unique_violation';
    end if;
    return jsonb_build_object('assessment_id', v_prev.assessment_id, 'replayed', true,
      'growth_score', (select growth_score from visibility.assessments where id = v_prev.assessment_id));
  end if;
  if jsonb_array_length(coalesce(p_payload->'scores','[]'::jsonb)) = 0 then
    raise exception 'nothing was checked, so there is nothing to review' using errcode = 'no_data_found';
  end if;

  v_assessment := visibility.start_assessment(p_prospect, null);
  for r in select * from jsonb_array_elements(p_payload->'scores') loop
    perform visibility.score_category(v_assessment, (r->>'category')::extensions.citext, (r->>'score')::integer, r->>'note');
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_payload->'evidence','[]'::jsonb)) loop
    v_kind := (r->>'kind')::revenue.evidence_kind;
    insert into revenue.assessment_evidence (assessment_id, prospect_id, tenant_id, evidence_key, kind, label, statement,
      source, source_ref, observed_at, confidence, how_to_verify, rationale, offer_key, basis)
    values (v_assessment, p_prospect, v_tenant, r->>'key', v_kind, r->>'label', r->>'statement',
      r->>'source', r->>'source_ref', (r->>'observed_at')::timestamptz, r->>'confidence', r->>'how_to_verify',
      r->>'rationale', r->>'offer_key',
      coalesce((select array_agg(x)::extensions.citext[] from jsonb_array_elements_text(r->'basis') x), '{}'));
  end loop;

  -- an estimate may rest only on facts, never on assumptions or other estimates
  if exists (
    select 1 from revenue.assessment_evidence e, unnest(e.basis) b
    where e.assessment_id = v_assessment and e.kind = 'estimate'
      and not exists (select 1 from revenue.assessment_evidence f
        where f.assessment_id = v_assessment and f.evidence_key = b
          and f.kind in ('observed','verified','customer_provided'))) then
    raise exception 'an estimate cites something that is not an observed, verified or customer-provided fact'
      using errcode = 'check_violation';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_payload->'recommendations','[]'::jsonb)) loop
    if r->>'evidence_key' is null or not exists (select 1 from revenue.assessment_evidence
        where assessment_id = v_assessment and evidence_key = (r->>'evidence_key')::extensions.citext
          and kind in ('observed','verified','customer_provided','estimate')) then
      raise exception 'recommendation "%" has no supporting evidence', r->>'title' using errcode = 'check_violation';
    end if;
    v_rec := visibility.add_recommendation(v_assessment, (r->>'kind')::visibility.recommendation_kind, r->>'title',
      coalesce(r->>'detail',''), null, r->>'service', null, coalesce((r->>'priority')::integer, 3));
    update revenue.assessment_evidence set recommendation_id = v_rec
     where assessment_id = v_assessment and evidence_key = (r->>'evidence_key')::extensions.citext;
  end loop;

  v_growth := visibility.complete_assessment(v_assessment);
  insert into revenue.review_requests (prospect_id, request_key, tenant_id, assessment_id, payload_sha256, requested_by)
  values (p_prospect, p_request_key, v_tenant, v_assessment, v_hash, auth.uid());
  return jsonb_build_object('assessment_id', v_assessment, 'replayed', false, 'growth_score', v_growth);
end; $$;
revoke all on function revenue.send_to_review(uuid, extensions.citext, jsonb) from public, anon;
grant execute on function revenue.send_to_review(uuid, extensions.citext, jsonb) to authenticated;

-- ===========================================================================
-- 4. Outreach — the server-side path into comms
-- ===========================================================================
-- Queues outreach for an approved proposal. comms.request_message still
-- enforces permission, suppression, consent and idempotency, and holds the
-- message for its own owner approval. Nothing is sent here.
create or replace function revenue.queue_outreach(p_content uuid, p_to extensions.citext, p_vars jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_c visibility.content_assets; v_bound text; v_msg uuid; v_instance uuid;
begin
  select * into v_c from visibility.content_assets where id = p_content;
  if not found or v_c.kind <> 'proposal' then raise exception 'proposal % not found', p_content using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_c.tenant_id, 'comms.message.create') then
    raise exception 'insufficient privilege to request outreach' using errcode = 'insufficient_privilege';
  end if;
  select b.content_sha256 into v_bound from revenue.approval_bindings b
   where b.instance_id = v_c.approval_instance_id and workflows.is_approved(b.instance_id);
  if v_bound is null then
    raise exception 'the proposal has not been approved by the designated owner' using errcode = 'insufficient_privilege';
  end if;
  if v_bound <> revenue.content_sha256(v_c.title, v_c.body) then
    raise exception 'the proposal changed after approval' using errcode = 'insufficient_privilege';
  end if;
  v_msg := comms.request_message(v_c.tenant_id, 'revenue_center', 'email', 'proposal_delivery', 1,
    lower(p_to::text)::extensions.citext, 'marketing', p_vars,
    ('proposal:' || p_content::text || ':' || lower(p_to::text))::extensions.citext, null, true, null);
  select approval_instance_id into v_instance from comms.messages where id = v_msg;
  return jsonb_build_object('message_id', v_msg, 'approval_instance_id', v_instance);
end; $$;
revoke all on function revenue.queue_outreach(uuid, extensions.citext, jsonb) from public, anon;
grant execute on function revenue.queue_outreach(uuid, extensions.citext, jsonb) to authenticated;

-- Mock delivery for development: platform admin only, mock providers only,
-- approved messages only. Real providers stay inactive (comms.providers).
create or replace function revenue.mock_deliver(p_message uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_provider extensions.citext; v_kind comms.provider_kind;
begin
  select m.provider_key, p.kind into v_provider, v_kind from comms.messages m
    left join comms.providers p on p.key = m.provider_key where m.id = p_message;
  if not found then raise exception 'message % not found', p_message using errcode = 'no_data_found'; end if;
  if v_kind is distinct from 'mock' then
    raise exception 'mock delivery refused for provider %', coalesce(v_provider::text,'none') using errcode = 'insufficient_privilege';
  end if;
  perform comms.record_delivery(p_message, 'delivered', ('mock-' || p_message::text)::extensions.citext, null);
end; $$;
revoke all on function revenue.mock_deliver(uuid) from public, anon;
grant execute on function revenue.mock_deliver(uuid) to authenticated;
