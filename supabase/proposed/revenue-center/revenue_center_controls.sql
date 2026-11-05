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
-- Phase 6: register through the industry catalog and the tenant's business
-- line, with every identity key (place, domain, phone, email, name+city)
-- checked, so the same business under another spelling is not re-added.
create or replace function revenue.register_prospect(
  p_tenant uuid, p_business text, p_industry extensions.citext, p_dedupe extensions.citext,
  p_source revenue.discovery_source, p_is_synthetic boolean, p_campaign extensions.citext default null,
  p_email extensions.citext default null, p_phone text default null, p_city text default null,
  p_website text default null, p_snapshot jsonb default '{}'::jsonb,
  p_identity_keys text[] default '{}', p_run uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_existing uuid; v_matched text; v_id uuid; v_keys text[];
begin
  if p_is_synthetic is null then raise exception 'is_synthetic must be stated' using errcode = 'not_null_violation'; end if;
  perform revenue.assert_industry_fits(p_tenant, p_industry);
  if p_campaign is not null and not exists (select 1 from revenue.campaigns c
      where c.tenant_id = p_tenant and lower(c.key::text) = lower(p_campaign::text)
        and lower(c.industry_key::text) = lower(p_industry::text) and c.status = 'approved') then
    raise exception 'campaign % is not an approved % campaign of this business', p_campaign, p_industry
      using errcode = 'invalid_parameter_value';
  end if;
  v_keys := array(select distinct lower(k) from unnest(array_append(coalesce(p_identity_keys,'{}'), p_dedupe::text)) k
                   where k is not null and btrim(k) <> '');
  select ik.prospect_id, ik.key into v_existing, v_matched from revenue.identity_keys ik
   where ik.tenant_id = p_tenant and ik.key = any(v_keys) limit 1;
  if found then
    if not identity.has_permission(p_tenant, 'visibility.prospect.read') then
      raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
    end if;
    return jsonb_build_object('prospect_id', v_existing, 'duplicate', true, 'matched_key', v_matched);
  end if;
  v_id := visibility.create_prospect(p_tenant, p_business, null, p_email, p_phone, p_industry, p_city, p_website);
  insert into revenue.prospect_profiles (prospect_id, tenant_id, industry_key, campaign_key, dedupe_key,
    discovery_source, is_synthetic, scan_snapshot, discovery_run_id)
  values (v_id, p_tenant, lower(p_industry::text), p_campaign, lower(p_dedupe::text), p_source, p_is_synthetic,
    coalesce(p_snapshot,'{}'::jsonb), p_run);
  insert into revenue.identity_keys (tenant_id, key, prospect_id) select p_tenant, k, v_id from unnest(v_keys) k;
  return jsonb_build_object('prospect_id', v_id, 'duplicate', false);
end; $$;
revoke all on function revenue.register_prospect(uuid, text, extensions.citext, extensions.citext, revenue.discovery_source, boolean, extensions.citext, extensions.citext, text, text, text, jsonb, text[], uuid) from public, anon;
grant execute on function revenue.register_prospect(uuid, text, extensions.citext, extensions.citext, revenue.discovery_source, boolean, extensions.citext, extensions.citext, text, text, text, jsonb, text[], uuid) to authenticated;

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
  return jsonb_build_object('message_id', v_msg, 'approval_instance_id', v_instance,
    'status', (select status from comms.messages where id = v_msg));
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

-- ===========================================================================
-- PHASE 6
-- ===========================================================================

-- --- Business lines: which tenant is HLD and which is HSCS ------------------
create table if not exists revenue.business_lines (
  tenant_id      uuid primary key references platform.tenants(id) on delete cascade,
  line           text not null unique check (line in ('hld','hscs')),
  notify_contact extensions.citext,          -- where new-inquiry notifications go; null = none
  set_by         uuid references auth.users(id) on delete set null,
  set_at         timestamptz not null default now()
);
alter table revenue.business_lines enable row level security; alter table revenue.business_lines force row level security;
create policy business_lines_select on revenue.business_lines for select to authenticated using (identity.is_member(tenant_id));
grant select on revenue.business_lines to authenticated;
create trigger business_lines_audit after insert or update or delete on revenue.business_lines for each row execute function audit.emit();

create or replace function revenue.set_business_line(p_tenant uuid, p_line text, p_notify extensions.citext default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from identity.platform_admins pa join identity.role_permissions rp on rp.role_key = pa.role_key
                 where pa.user_id = auth.uid() and rp.permission_key = 'revenue.approver.assign') then
    raise exception 'only the platform owner assigns business lines' using errcode = 'insufficient_privilege';
  end if;
  insert into revenue.business_lines (tenant_id, line, notify_contact, set_by) values (p_tenant, p_line, lower(p_notify::text), auth.uid())
  on conflict (tenant_id) do update set line = excluded.line, notify_contact = excluded.notify_contact, set_by = excluded.set_by, set_at = now();
end; $$;
revoke all on function revenue.set_business_line(uuid, text, extensions.citext) from public, anon;
grant execute on function revenue.set_business_line(uuid, text, extensions.citext) to authenticated;

-- --- The eight industries (plus one "not one of the eight" bucket per line) --
create table if not exists revenue.industries (
  key            extensions.citext primary key,
  label          text not null,
  line           text not null check (line in ('hld','hscs')),
  default_target integer not null check (default_target >= 0),
  search_terms   text not null,
  place_types    text[] not null default '{}',
  constraint industries_key_format check (key::text ~ '^[a-z][a-z0-9_]{2,63}$')
);
alter table revenue.industries enable row level security; alter table revenue.industries force row level security;
create policy industries_select on revenue.industries for select to authenticated using (true);
grant select on revenue.industries to authenticated;
insert into revenue.industries (key, label, line, default_target, search_terms, place_types) values
  ('dental',                'Dental practices',              'hld',  50, 'dentist dental practice',            array['dentist','dental_clinic']),
  ('barbershop',            'Barbershops',                   'hld',  50, 'barber shop',                        array['barber_shop']),
  ('salon',                 'Salons',                        'hld',  50, 'hair salon',                         array['hair_salon','beauty_salon','nail_salon']),
  ('landscaping',           'Landscaping companies',         'hld',  50, 'landscaping company lawn care',      array['landscaper']),
  ('pet_grooming',          'Pet groomers',                  'hld',  50, 'pet grooming dog groomer',           array['pet_care','pet_store']),
  ('moving',                'Moving companies',              'hscs', 50, 'moving company movers',              array['moving_company']),
  ('transportation',        'Transportation providers',      'hscs', 50, 'trucking company freight carrier',   array['trucking_company']),
  ('third_party_logistics', 'Third-party logistics (3PLs)',  'hscs', 50, '3PL third party logistics warehouse', array['warehouse','logistics_service']),
  ('general_hld',           'HLD — not one of the eight',    'hld',   0, '',                                   '{}'),
  ('general_hscs',          'HSCS — not one of the eight',   'hscs',  0, '',                                   '{}')
on conflict (key) do nothing;

create or replace function revenue.tenant_line(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select line from revenue.business_lines where tenant_id = p_tenant;
$$;
create or replace function revenue.assert_industry_fits(p_tenant uuid, p_industry extensions.citext)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_line text; v_ind text;
begin
  v_line := revenue.tenant_line(p_tenant);
  if v_line is null then raise exception 'tenant % is not an HLG business line', p_tenant using errcode = 'invalid_parameter_value'; end if;
  select line into v_ind from revenue.industries where lower(key::text) = lower(p_industry::text);
  if v_ind is null then raise exception 'unknown industry %', p_industry using errcode = 'invalid_parameter_value'; end if;
  if v_ind <> v_line then
    raise exception 'industry % belongs to %, not to this business (%)', p_industry, upper(v_ind), upper(v_line)
      using errcode = 'invalid_parameter_value';
  end if;
end; $$;

alter table revenue.prospect_profiles add constraint prospect_profiles_industry_fk
  foreign key (industry_key) references revenue.industries(key) not valid;

-- --- Identity keys: one business, many spellings ---------------------------
create table if not exists revenue.identity_keys (
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  key         text not null,               -- 'place:…' 'domain:…' 'phone:…' 'email:…' 'name:<normalised>|<city>'
  prospect_id uuid not null references visibility.prospects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, key),
  constraint identity_keys_lower check (key = lower(key))
);
alter table revenue.identity_keys enable row level security; alter table revenue.identity_keys force row level security;
create policy identity_keys_select on revenue.identity_keys for select to authenticated using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
grant select on revenue.identity_keys to authenticated;
insert into revenue.identity_keys (tenant_id, key, prospect_id)
  select tenant_id, lower(dedupe_key::text), prospect_id from revenue.prospect_profiles on conflict do nothing;

-- --- Campaigns, with configurable geography ---------------------------------
create table if not exists revenue.campaigns (
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  key          extensions.citext not null,
  industry_key extensions.citext not null references revenue.industries(key),
  name         text not null,
  market_label text not null,               -- e.g. 'Buffalo, NY' — any market, not hard-coded
  market_zip   text,
  market_lat   numeric(9,6),
  market_lon   numeric(9,6),
  radius_miles numeric(6,2) not null check (radius_miles > 0 and radius_miles <= 100),
  target_active integer not null default 50 check (target_active between 0 and 1000),
  search_terms text,                         -- overrides the industry's default terms
  status       text not null default 'draft' check (status in ('draft','approved','paused','ended')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  approved_by  uuid references auth.users(id) on delete set null,
  approved_at  timestamptz,
  primary key (tenant_id, key),
  constraint campaigns_key_format check (key::text ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint campaigns_latlon check ((market_lat is null) = (market_lon is null))
);
alter table revenue.campaigns enable row level security; alter table revenue.campaigns force row level security;
create policy campaigns_select on revenue.campaigns for select to authenticated using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
grant select on revenue.campaigns to authenticated;
create trigger campaigns_audit after insert or update or delete on revenue.campaigns for each row execute function audit.emit();

create or replace function revenue.upsert_campaign(
  p_tenant uuid, p_key extensions.citext, p_industry extensions.citext, p_name text, p_market_label text,
  p_radius_miles numeric, p_target integer default 50, p_zip text default null,
  p_lat numeric default null, p_lon numeric default null, p_search_terms text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  perform revenue.assert_industry_fits(p_tenant, p_industry);
  insert into revenue.campaigns (tenant_id, key, industry_key, name, market_label, market_zip, market_lat, market_lon,
    radius_miles, target_active, search_terms, created_by)
  values (p_tenant, lower(p_key::text), lower(p_industry::text), p_name, p_market_label, p_zip, p_lat, p_lon,
    p_radius_miles, p_target, p_search_terms, auth.uid())
  on conflict (tenant_id, key) do update set name = excluded.name, market_label = excluded.market_label,
    market_zip = excluded.market_zip, market_lat = excluded.market_lat, market_lon = excluded.market_lon,
    radius_miles = excluded.radius_miles, target_active = excluded.target_active, search_terms = excluded.search_terms,
    status = 'draft', approved_by = null, approved_at = null;   -- any change needs re-approval
end; $$;
revoke all on function revenue.upsert_campaign(uuid, extensions.citext, extensions.citext, text, text, numeric, integer, text, numeric, numeric, text) from public, anon;
grant execute on function revenue.upsert_campaign(uuid, extensions.citext, extensions.citext, text, text, numeric, integer, text, numeric, numeric, text) to authenticated;

create or replace function revenue.set_campaign_status(p_tenant uuid, p_key extensions.citext, p_status text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- approving or resuming a campaign is the owner's decision; pausing/ending is anyone who manages prospects
  if p_status = 'approved' then
    if not identity.has_permission(p_tenant, 'revenue.commercial_approval.manage')
       or not exists (select 1 from revenue.commercial_approvers a where a.tenant_id = p_tenant and a.user_id = auth.uid()) then
      raise exception 'only the designated owner approves a campaign' using errcode = 'insufficient_privilege';
    end if;
  elsif not identity.has_permission(p_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update revenue.campaigns set status = p_status,
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    approved_at = case when p_status = 'approved' then now() else approved_at end
   where tenant_id = p_tenant and key = lower(p_key::text);
  if not found then raise exception 'campaign % not found', p_key using errcode = 'no_data_found'; end if;
end; $$;
revoke all on function revenue.set_campaign_status(uuid, extensions.citext, text) from public, anon;
grant execute on function revenue.set_campaign_status(uuid, extensions.citext, text) to authenticated;

-- --- Discovery runs and spending limits -------------------------------------
create table if not exists revenue.discovery_limits (
  tenant_id               uuid primary key references platform.tenants(id) on delete cascade,
  paid_requests_per_month integer not null default 0 check (paid_requests_per_month >= 0),  -- 0 = no paid discovery
  max_candidates_per_run  integer not null default 50 check (max_candidates_per_run between 1 and 500),
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now()
);
create table if not exists revenue.discovery_runs (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  campaign_key  extensions.citext not null,
  industry_key  extensions.citext not null,
  source        revenue.discovery_source not null,
  status        text not null default 'running' check (status in ('running','finished','failed')),
  planned_paid_requests integer not null default 0 check (planned_paid_requests >= 0),
  paid_requests integer not null default 0 check (paid_requests >= 0),
  est_cost_cents integer not null default 0 check (est_cost_cents >= 0),
  candidates    integer not null default 0,
  added         integer not null default 0,
  duplicates    integer not null default 0,
  needs_review  integer not null default 0,
  error         text,
  started_by    uuid references auth.users(id) on delete set null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
alter table revenue.prospect_profiles add column if not exists discovery_run_id uuid references revenue.discovery_runs(id) on delete set null;
alter table revenue.discovery_limits enable row level security; alter table revenue.discovery_limits force row level security;
alter table revenue.discovery_runs   enable row level security; alter table revenue.discovery_runs   force row level security;
create policy discovery_limits_select on revenue.discovery_limits for select to authenticated using (identity.is_member(tenant_id));
create policy discovery_runs_select on revenue.discovery_runs for select to authenticated using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
grant select on revenue.discovery_limits, revenue.discovery_runs to authenticated;
create trigger discovery_limits_audit after insert or update or delete on revenue.discovery_limits for each row execute function audit.emit();
create trigger discovery_runs_audit after insert or update or delete on revenue.discovery_runs for each row execute function audit.emit();

create or replace function revenue.set_discovery_limits(p_tenant uuid, p_paid_per_month integer, p_max_per_run integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- money: the designated owner only
  if not identity.has_permission(p_tenant, 'revenue.commercial_approval.manage')
     or not exists (select 1 from revenue.commercial_approvers a where a.tenant_id = p_tenant and a.user_id = auth.uid()) then
    raise exception 'only the designated owner sets discovery spending' using errcode = 'insufficient_privilege';
  end if;
  insert into revenue.discovery_limits (tenant_id, paid_requests_per_month, max_candidates_per_run, set_by)
  values (p_tenant, p_paid_per_month, p_max_per_run, auth.uid())
  on conflict (tenant_id) do update set paid_requests_per_month = excluded.paid_requests_per_month,
    max_candidates_per_run = excluded.max_candidates_per_run, set_by = excluded.set_by, set_at = now();
end; $$;
revoke all on function revenue.set_discovery_limits(uuid, integer, integer) from public, anon;
grant execute on function revenue.set_discovery_limits(uuid, integer, integer) to authenticated;

-- Opens a run only within the limits. Paid requests are reserved up front, so
-- two runs at once cannot both spend the last of the month's allowance.
create or replace function revenue.begin_discovery_run(
  p_tenant uuid, p_campaign extensions.citext, p_source revenue.discovery_source, p_candidates integer, p_planned_paid_requests integer default 0)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_c revenue.campaigns; v_paid_cap integer; v_max integer; v_used integer; v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from revenue.campaigns where tenant_id = p_tenant and key = lower(p_campaign::text);
  if not found or v_c.status <> 'approved' then
    raise exception 'campaign % is not approved', p_campaign using errcode = 'invalid_parameter_value';
  end if;
  perform 1 from platform.tenants where id = p_tenant for update;   -- serialise spending per tenant
  select coalesce(max(paid_requests_per_month), 0), coalesce(max(max_candidates_per_run), 50)
    into v_paid_cap, v_max from revenue.discovery_limits where tenant_id = p_tenant;
  if p_candidates > v_max then
    raise exception 'at most % candidates per run (asked for %)', v_max, p_candidates using errcode = 'invalid_parameter_value';
  end if;
  if p_planned_paid_requests > 0 then
    select coalesce(sum(greatest(paid_requests, case when status = 'running' then planned_paid_requests else 0 end)), 0)
      into v_used from revenue.discovery_runs
     where tenant_id = p_tenant and started_at >= date_trunc('month', now());
    if v_used + p_planned_paid_requests > v_paid_cap then
      raise exception 'paid discovery limit: % of % requests used this month; this run needs %', v_used, v_paid_cap, p_planned_paid_requests
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  insert into revenue.discovery_runs (tenant_id, campaign_key, industry_key, source, planned_paid_requests, started_by)
  values (p_tenant, v_c.key, v_c.industry_key, p_source, p_planned_paid_requests, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function revenue.begin_discovery_run(uuid, extensions.citext, revenue.discovery_source, integer, integer) from public, anon;
grant execute on function revenue.begin_discovery_run(uuid, extensions.citext, revenue.discovery_source, integer, integer) to authenticated;

create or replace function revenue.finish_discovery_run(
  p_run uuid, p_paid_requests integer, p_est_cost_cents integer, p_candidates integer, p_added integer,
  p_duplicates integer, p_needs_review integer, p_error text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from revenue.discovery_runs where id = p_run and status = 'running';
  if not found then raise exception 'discovery run % is not running', p_run using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update revenue.discovery_runs set status = case when p_error is null then 'finished' else 'failed' end,
    paid_requests = p_paid_requests, est_cost_cents = p_est_cost_cents, candidates = p_candidates, added = p_added,
    duplicates = p_duplicates, needs_review = p_needs_review, error = p_error, finished_at = now()
   where id = p_run;
end; $$;
revoke all on function revenue.finish_discovery_run(uuid, integer, integer, integer, integer, integer, integer, text) from public, anon;
grant execute on function revenue.finish_discovery_run(uuid, integer, integer, integer, integer, integer, integer, text) to authenticated;

-- --- Adopt prospects that already exist (e.g. the 50 production barbershops) -
create or replace function revenue.adopt_prospect(
  p_prospect uuid, p_industry extensions.citext, p_dedupe extensions.citext, p_is_synthetic boolean,
  p_identity_keys text[] default '{}', p_campaign extensions.citext default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_keys text[]; v_clash uuid;
begin
  if p_is_synthetic is null then raise exception 'is_synthetic must be stated' using errcode = 'not_null_violation'; end if;
  select tenant_id into v_tenant from visibility.prospects where id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  perform revenue.assert_industry_fits(v_tenant, p_industry);
  if exists (select 1 from revenue.prospect_profiles where prospect_id = p_prospect) then
    raise exception 'prospect % is already in the Revenue Center', p_prospect using errcode = 'unique_violation';
  end if;
  v_keys := array(select distinct lower(k) from unnest(array_append(coalesce(p_identity_keys,'{}'), p_dedupe::text)) k where btrim(coalesce(k,'')) <> '');
  select prospect_id into v_clash from revenue.identity_keys where tenant_id = v_tenant and key = any(v_keys) limit 1;
  if found then raise exception 'prospect % duplicates %', p_prospect, v_clash using errcode = 'unique_violation'; end if;
  insert into revenue.prospect_profiles (prospect_id, tenant_id, industry_key, campaign_key, dedupe_key, discovery_source, is_synthetic)
  values (p_prospect, v_tenant, lower(p_industry::text), p_campaign, lower(p_dedupe::text), 'import', p_is_synthetic);
  insert into revenue.identity_keys (tenant_id, key, prospect_id) select v_tenant, k, p_prospect from unnest(v_keys) k;
end; $$;
revoke all on function revenue.adopt_prospect(uuid, extensions.citext, extensions.citext, boolean, text[], extensions.citext) from public, anon;
grant execute on function revenue.adopt_prospect(uuid, extensions.citext, extensions.citext, boolean, text[], extensions.citext) to authenticated;

-- --- Proposals: linked to their prospect; unpriced ones cannot be submitted -
create table if not exists revenue.proposal_links (
  content_id  uuid primary key references visibility.content_assets(id) on delete cascade,
  prospect_id uuid not null references visibility.prospects(id) on delete cascade,
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table revenue.proposal_links enable row level security; alter table revenue.proposal_links force row level security;
create policy proposal_links_select on revenue.proposal_links for select to authenticated using (identity.has_permission(tenant_id, 'visibility.content.read'));
grant select on revenue.proposal_links to authenticated;

create or replace function revenue.draft_proposal(p_prospect uuid, p_title text, p_body text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from revenue.prospect_profiles where prospect_id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  v_id := visibility.draft_content(v_tenant, null, 'proposal', p_title, p_body, null);
  insert into revenue.proposal_links (content_id, prospect_id, tenant_id) values (v_id, p_prospect, v_tenant);
  return v_id;
end; $$;
revoke all on function revenue.draft_proposal(uuid, text, text) from public, anon;
grant execute on function revenue.draft_proposal(uuid, text, text) to authenticated;

-- The database checks the proposal itself: every line priced, nothing blocked.
create or replace function revenue.submit_proposal(p_content uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_l revenue.proposal_links; v_body jsonb; v_instance uuid;
begin
  select * into v_l from revenue.proposal_links where content_id = p_content;
  if not found then raise exception 'proposal % not found', p_content using errcode = 'no_data_found'; end if;
  begin
    select body::jsonb into v_body from visibility.content_assets where id = p_content;
  exception when others then
    raise exception 'the proposal is not in the structured format' using errcode = 'invalid_parameter_value';
  end;
  if coalesce(v_body#>>'{proposal,status}','') <> 'ready_for_approval'
     or jsonb_array_length(coalesce(v_body#>'{proposal,lines}','[]'::jsonb)) = 0
     or exists (select 1 from jsonb_array_elements(v_body#>'{proposal,lines}') l
                where jsonb_typeof(l->'oneTimeCents') <> 'number' or jsonb_typeof(l->'monthlyCents') <> 'number') then
    raise exception 'an unpriced or blocked proposal cannot be submitted for approval' using errcode = 'check_violation';
  end if;
  v_instance := visibility.submit_content_for_approval(p_content);
  perform visibility.set_prospect_stage(v_l.prospect_id, 'proposed');
  return v_instance;
end; $$;
revoke all on function revenue.submit_proposal(uuid) from public, anon;
grant execute on function revenue.submit_proposal(uuid) to authenticated;

-- --- Website inquiries --------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('revenue.inquiry.create', 'Submit a website inquiry into the Revenue Center (website intake).', 'tenant')
on conflict (key) do nothing;
insert into identity.role_permissions (role_key, permission_key) values
  ('service_account','revenue.inquiry.create'), ('tenant_owner','revenue.inquiry.create'), ('tenant_admin','revenue.inquiry.create')
on conflict do nothing;
insert into comms.templates (key, name, channel, module) values
  ('inquiry_received', 'New website inquiry (internal notification)', 'email', 'revenue_center')
on conflict (key) do nothing;
insert into comms.template_versions (template_key, version, subject, body, variables) values
  ('inquiry_received', 1, 'New {{line}} inquiry: {{company}}',
   'A new inquiry arrived through the {{line}} website from {{company}}. Open the Revenue Center to review it.',
   array['line','company'])
on conflict (template_key, version) do nothing;

create table if not exists revenue.inquiries (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,  -- the website's business
  idempotency_key  extensions.citext not null,
  received_at      timestamptz not null default now(),
  contact_name     text,
  email            extensions.citext,
  phone            text,
  company          text,
  industry_text    text,
  message          text,
  attribution      jsonb not null default '{}'::jsonb,
  consent_marketing boolean not null,
  consent_text_version text,
  consent_evidence jsonb not null default '{}'::jsonb,
  spam_reasons     text[] not null default '{}',
  status           text not null check (status in ('routed','needs_review','spam','duplicate')),
  routing_reasons  text[] not null default '{}',
  routed_tenant_id uuid references platform.tenants(id) on delete set null,
  prospect_id      uuid references visibility.prospects(id) on delete set null,
  notification_message_id uuid references comms.messages(id) on delete set null,
  is_synthetic     boolean not null,
  resolved_by      uuid references auth.users(id) on delete set null,
  resolved_at      timestamptz,
  constraint inquiries_idempotent unique (tenant_id, idempotency_key),
  constraint inquiries_contact check (email is not null or phone is not null),
  constraint inquiries_message_len check (length(coalesce(message,'')) <= 5000)
);
alter table revenue.inquiries enable row level security; alter table revenue.inquiries force row level security;
create policy inquiries_select on revenue.inquiries for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
grant select on revenue.inquiries to authenticated;
create trigger inquiries_audit after insert or update or delete on revenue.inquiries for each row execute function audit.emit();

-- p_payload: { idempotency_key, contact_name, email, phone, company, industry_text, industry_key, message,
--   attribution{}, consent_marketing, consent_text_version, consent_evidence{}, spam_reasons[],
--   routing{status:'routed'|'needs_review', line, reasons[]}, identity_keys[], is_synthetic }
create or replace function revenue.ingest_inquiry(p_site_tenant uuid, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_line text := revenue.tenant_line(p_site_tenant); v_prev revenue.inquiries; v_id uuid; v_status text;
  v_keys text[]; v_existing uuid; v_prospect uuid; v_ind text; v_notify extensions.citext; v_msg uuid;
  v_reasons text[] := coalesce(array(select jsonb_array_elements_text(p_payload#>'{routing,reasons}')), '{}');
begin
  if not identity.has_permission(p_site_tenant, 'revenue.inquiry.create') then
    raise exception 'insufficient privilege to submit inquiries for this business' using errcode = 'insufficient_privilege';
  end if;
  if v_line is null then raise exception 'tenant is not an HLG business line' using errcode = 'invalid_parameter_value'; end if;
  if p_payload->>'idempotency_key' is null or p_payload->'is_synthetic' is null or p_payload->'consent_marketing' is null then
    raise exception 'idempotency_key, is_synthetic and consent_marketing are required' using errcode = 'not_null_violation';
  end if;
  select * into v_prev from revenue.inquiries where tenant_id = p_site_tenant and idempotency_key = p_payload->>'idempotency_key';
  if found then return jsonb_build_object('inquiry_id', v_prev.id, 'status', v_prev.status, 'prospect_id', v_prev.prospect_id, 'replayed', true); end if;

  v_keys := array(select distinct lower(k) from jsonb_array_elements_text(coalesce(p_payload->'identity_keys','[]'::jsonb)) k where btrim(k) <> '');
  if jsonb_array_length(coalesce(p_payload->'spam_reasons','[]'::jsonb)) > 0 then
    v_status := 'spam';
  else
    select prospect_id into v_existing from revenue.identity_keys where tenant_id = p_site_tenant and key = any(v_keys) limit 1;
    if v_existing is not null then
      v_status := 'duplicate';
    elsif p_payload#>>'{routing,status}' = 'routed' and p_payload#>>'{routing,line}' = v_line then
      v_status := 'routed';
    else
      v_status := 'needs_review';   -- never auto-route to the other business
      if p_payload#>>'{routing,line}' is distinct from v_line and p_payload#>>'{routing,status}' = 'routed' then
        v_reasons := array_append(v_reasons, 'routing pointed at the other business; a person decides');
      end if;
    end if;
  end if;

  insert into revenue.inquiries (tenant_id, idempotency_key, contact_name, email, phone, company, industry_text, message,
    attribution, consent_marketing, consent_text_version, consent_evidence, spam_reasons, status, routing_reasons,
    prospect_id, is_synthetic)
  values (p_site_tenant, p_payload->>'idempotency_key', p_payload->>'contact_name', lower(p_payload->>'email'),
    p_payload->>'phone', p_payload->>'company', p_payload->>'industry_text', p_payload->>'message',
    coalesce(p_payload->'attribution','{}'::jsonb), (p_payload->>'consent_marketing')::boolean,
    p_payload->>'consent_text_version', coalesce(p_payload->'consent_evidence','{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(p_payload->'spam_reasons')), '{}'), v_status, v_reasons,
    v_existing, (p_payload->>'is_synthetic')::boolean)
  returning id into v_id;
  if v_status in ('spam') then return jsonb_build_object('inquiry_id', v_id, 'status', v_status, 'replayed', false); end if;

  if v_status = 'routed' then
    v_ind := coalesce(nullif(p_payload->>'industry_key',''), 'general_' || v_line);
    if not exists (select 1 from revenue.industries where key = v_ind and line = v_line) then v_ind := 'general_' || v_line; end if;
    -- The website's service account may submit inquiries but not manage
    -- prospects, so the record is written here, by this function, directly.
    insert into visibility.prospects (tenant_id, business_name, contact_name, email, phone, industry, created_by)
    values (p_site_tenant, coalesce(nullif(p_payload->>'company',''), p_payload->>'contact_name', 'Website inquiry'),
      p_payload->>'contact_name', lower(p_payload->>'email'), p_payload->>'phone', v_ind, auth.uid())
    returning id into v_prospect;
    insert into revenue.prospect_profiles (prospect_id, tenant_id, industry_key, dedupe_key, discovery_source, is_synthetic)
    values (v_prospect, p_site_tenant, v_ind, coalesce(v_keys[1], 'inquiry:' || v_id::text), 'inbound_inquiry', (p_payload->>'is_synthetic')::boolean);
    insert into revenue.identity_keys (tenant_id, key, prospect_id)
      select p_site_tenant, k, v_prospect from unnest(v_keys) k on conflict do nothing;
    update revenue.inquiries set prospect_id = v_prospect, routed_tenant_id = p_site_tenant where id = v_id;
    perform events.emit('revenue.inquiry.routed', p_site_tenant, jsonb_build_object('inquiry', v_id, 'prospect', v_prospect));
  end if;

  -- Consent is recorded only when the visitor gave it, with its evidence.
  if (p_payload->>'consent_marketing')::boolean and p_payload->>'email' is not null then
    insert into comms.consent (tenant_id, channel, contact, status, source, granted_at)
    values (p_site_tenant, 'email', lower(p_payload->>'email'), 'granted',
            'website form, consent text ' || coalesce(p_payload->>'consent_text_version','unversioned'), now())
    on conflict (tenant_id, channel, contact) do update set status = 'granted', source = excluded.source, granted_at = now();
  end if;

  -- Notify the business (transactional, internal, mock provider in development).
  select notify_contact into v_notify from revenue.business_lines where tenant_id = p_site_tenant;
  if v_notify is not null then
    v_msg := comms.request_message(p_site_tenant, 'revenue_center', 'email', 'inquiry_received', 1, v_notify, 'transactional',
      jsonb_build_object('line', upper(v_line), 'company', coalesce(nullif(p_payload->>'company',''), 'a visitor')),
      ('inquiry:' || v_id::text)::extensions.citext, null, false, null);
    update revenue.inquiries set notification_message_id = v_msg where id = v_id;
  end if;
  return jsonb_build_object('inquiry_id', v_id, 'status', v_status, 'prospect_id', coalesce(v_prospect, v_existing), 'replayed', false);
end; $$;
revoke all on function revenue.ingest_inquiry(uuid, jsonb) from public, anon;
grant execute on function revenue.ingest_inquiry(uuid, jsonb) to authenticated;

-- A person decides an uncertain inquiry: into which business it goes.
create or replace function revenue.resolve_inquiry(p_inquiry uuid, p_line text, p_industry extensions.citext default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_i revenue.inquiries; v_target uuid; v_prospect uuid; v_ind text;
begin
  select * into v_i from revenue.inquiries where id = p_inquiry;
  if not found then raise exception 'inquiry % not found', p_inquiry using errcode = 'no_data_found'; end if;
  if v_i.status <> 'needs_review' then raise exception 'inquiry is %, not awaiting a decision', v_i.status using errcode = 'invalid_parameter_value'; end if;
  select tenant_id into v_target from revenue.business_lines where line = p_line;
  if v_target is null then raise exception 'no tenant is assigned to %', p_line using errcode = 'invalid_parameter_value'; end if;
  if not identity.has_permission(v_i.tenant_id, 'visibility.prospect.read')
     or not identity.has_permission(v_target, 'visibility.prospect.manage') then
    raise exception 'deciding this inquiry needs access to both businesses' using errcode = 'insufficient_privilege';
  end if;
  v_ind := coalesce(lower(p_industry::text), 'general_' || p_line);
  perform revenue.assert_industry_fits(v_target, v_ind::extensions.citext);
  insert into visibility.prospects (tenant_id, business_name, contact_name, email, phone, industry, created_by)
  values (v_target, coalesce(nullif(v_i.company,''), v_i.contact_name, 'Website inquiry'), v_i.contact_name, v_i.email, v_i.phone, v_ind, auth.uid())
  returning id into v_prospect;
  insert into revenue.prospect_profiles (prospect_id, tenant_id, industry_key, dedupe_key, discovery_source, is_synthetic)
  values (v_prospect, v_target, v_ind, coalesce('email:' || v_i.email::text, 'phone:' || v_i.phone, 'inquiry:' || v_i.id::text), 'inbound_inquiry', v_i.is_synthetic);
  insert into revenue.identity_keys (tenant_id, key, prospect_id)
    select v_target, k, v_prospect from unnest(array_remove(array[case when v_i.email is not null then 'email:' || lower(v_i.email::text) end,
      case when v_i.phone is not null then 'phone:' || regexp_replace(v_i.phone, '\D', '', 'g') end], null)) k
  on conflict do nothing;
  update revenue.inquiries set status = 'routed', routed_tenant_id = v_target, prospect_id = v_prospect, resolved_by = auth.uid(), resolved_at = now()
   where id = p_inquiry;
  return v_prospect;
end; $$;
revoke all on function revenue.resolve_inquiry(uuid, text, extensions.citext) from public, anon;
grant execute on function revenue.resolve_inquiry(uuid, text, extensions.citext) to authenticated;

-- --- Cross-business referrals: share a name, not the record ----------------
create table if not exists revenue.referrals (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  from_tenant   uuid not null references platform.tenants(id) on delete cascade,
  to_tenant     uuid not null references platform.tenants(id) on delete cascade,
  from_prospect uuid not null references visibility.prospects(id) on delete cascade,
  shared        jsonb not null,             -- business_name, website_url, city ONLY
  note          text,
  status        text not null default 'pending' check (status in ('pending','accepted','declined')),
  to_prospect   uuid references visibility.prospects(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  constraint referrals_other_business check (from_tenant <> to_tenant),
  constraint referrals_one_open unique (from_prospect, to_tenant)
);
alter table revenue.referrals enable row level security; alter table revenue.referrals force row level security;
create policy referrals_select on revenue.referrals for select to authenticated
  using (identity.has_permission(from_tenant, 'visibility.prospect.read') or identity.has_permission(to_tenant, 'visibility.prospect.read'));
grant select on revenue.referrals to authenticated;
create trigger referrals_audit after insert or update or delete on revenue.referrals for each row execute function audit.emit();

create or replace function revenue.refer_prospect(p_prospect uuid, p_to_line text, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_p visibility.prospects; v_to uuid; v_id uuid;
begin
  select * into v_p from visibility.prospects where id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_p.tenant_id, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  select tenant_id into v_to from revenue.business_lines where line = p_to_line;
  if v_to is null or v_to = v_p.tenant_id then raise exception 'no other business called %', p_to_line using errcode = 'invalid_parameter_value'; end if;
  insert into revenue.referrals (from_tenant, to_tenant, from_prospect, shared, note, created_by)
  values (v_p.tenant_id, v_to, p_prospect,
    jsonb_build_object('business_name', v_p.business_name, 'website_url', v_p.website_url, 'city', v_p.city),
    p_note, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function revenue.refer_prospect(uuid, text, text) from public, anon;
grant execute on function revenue.refer_prospect(uuid, text, text) to authenticated;

create or replace function revenue.decide_referral(p_referral uuid, p_accept boolean, p_industry extensions.citext default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_r revenue.referrals; v_line text; v_ind text; v_keys text[]; v_existing uuid; v_new uuid; v_syn boolean;
begin
  select * into v_r from revenue.referrals where id = p_referral and status = 'pending';
  if not found then raise exception 'referral % is not pending', p_referral using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_r.to_tenant, 'visibility.prospect.manage') then
    raise exception 'only the receiving business decides a referral' using errcode = 'insufficient_privilege';
  end if;
  if not p_accept then
    update revenue.referrals set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = p_referral;
    return null;
  end if;
  v_line := revenue.tenant_line(v_r.to_tenant);
  v_ind := coalesce(lower(p_industry::text), 'general_' || v_line);
  perform revenue.assert_industry_fits(v_r.to_tenant, v_ind::extensions.citext);
  v_keys := array_remove(array[
    case when v_r.shared->>'website_url' is not null then 'domain:' || lower(regexp_replace(regexp_replace(v_r.shared->>'website_url', '^https?://(www\.)?', ''), '/.*$', '')) end,
    'name:' || lower(regexp_replace(v_r.shared->>'business_name', '[^a-zA-Z0-9]+', ' ', 'g')) || '|' || lower(coalesce(v_r.shared->>'city',''))], null);
  select prospect_id into v_existing from revenue.identity_keys where tenant_id = v_r.to_tenant and key = any(v_keys) limit 1;
  if v_existing is null then
    select is_synthetic into v_syn from revenue.prospect_profiles where prospect_id = v_r.from_prospect;
    insert into visibility.prospects (tenant_id, business_name, city, website_url, industry, created_by)
    values (v_r.to_tenant, v_r.shared->>'business_name', v_r.shared->>'city', v_r.shared->>'website_url', v_ind, auth.uid())
    returning id into v_new;
    insert into revenue.prospect_profiles (prospect_id, tenant_id, industry_key, dedupe_key, discovery_source, is_synthetic)
    values (v_new, v_r.to_tenant, v_ind, v_keys[1], 'referral', coalesce(v_syn, false));
    insert into revenue.identity_keys (tenant_id, key, prospect_id) select v_r.to_tenant, k, v_new from unnest(v_keys) k on conflict do nothing;
  end if;
  update revenue.referrals set status = 'accepted', to_prospect = coalesce(v_existing, v_new), decided_by = auth.uid(), decided_at = now()
   where id = p_referral;
  return coalesce(v_existing, v_new);
end; $$;
revoke all on function revenue.decide_referral(uuid, boolean, extensions.citext) from public, anon;
grant execute on function revenue.decide_referral(uuid, boolean, extensions.citext) to authenticated;

-- --- Customer responses -------------------------------------------------------
create table if not exists revenue.responses (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  prospect_id uuid not null references visibility.prospects(id) on delete cascade,
  message_id  uuid references comms.messages(id) on delete set null,
  kind        text not null check (kind in ('interested','meeting_booked','not_interested','unsubscribed','bounced','other')),
  note        text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
alter table revenue.responses enable row level security; alter table revenue.responses force row level security;
create policy responses_select on revenue.responses for select to authenticated using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
grant select on revenue.responses to authenticated;
create trigger responses_audit after insert or update or delete on revenue.responses for each row execute function audit.emit();

create or replace function revenue.record_response(p_prospect uuid, p_kind text, p_note text default null, p_message uuid default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id bigint; v_to extensions.citext;
begin
  select tenant_id into v_tenant from revenue.prospect_profiles where prospect_id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if p_message is not null and not exists (select 1 from comms.messages where id = p_message and tenant_id = v_tenant) then
    raise exception 'message % is not from this business', p_message using errcode = 'invalid_parameter_value';
  end if;
  insert into revenue.responses (tenant_id, prospect_id, message_id, kind, note, recorded_by)
  values (v_tenant, p_prospect, p_message, p_kind, p_note, auth.uid()) returning id into v_id;
  if p_kind in ('interested','meeting_booked') then
    update revenue.prospect_profiles set status = 'qualified', status_changed_at = now() where prospect_id = p_prospect and status = 'active';
  elsif p_kind = 'not_interested' then
    perform revenue.set_prospect_status(p_prospect, 'rejected', coalesce(nullif(p_note,''), 'Not interested'));
  elsif p_kind in ('unsubscribed','bounced') then
    select coalesce(m.to_contact, p.email) into v_to from visibility.prospects p
      left join comms.messages m on m.id = p_message where p.id = p_prospect;
    if v_to is not null then
      insert into comms.suppression (tenant_id, channel, contact, reason)
      values (v_tenant, 'email', lower(v_to::text), case when p_kind = 'bounced' then 'bounce' else 'opt_out' end::comms.suppression_reason)
      on conflict (tenant_id, channel, contact) do nothing;
      update comms.consent set status = 'revoked', revoked_at = now() where tenant_id = v_tenant and channel = 'email' and contact = lower(v_to::text);
    end if;
  end if;
  return v_id;
end; $$;
revoke all on function revenue.record_response(uuid, text, text, uuid) from public, anon;
grant execute on function revenue.record_response(uuid, text, text, uuid) to authenticated;

-- --- Industry summary: counts from stored records, RLS applies (invoker) -----
create or replace view revenue.industry_summary with (security_invoker = true) as
-- One row per prospect first (no join fan-out), then counted per industry.
with p as (
  select pp.*,
    exists (select 1 from visibility.assessments a where a.prospect_id = pp.prospect_id and a.status = 'completed') as is_reviewed,
    exists (select 1 from revenue.proposal_links pl where pl.prospect_id = pp.prospect_id) as has_proposal,
    exists (select 1 from revenue.proposal_links pl join comms.messages m
              on m.source_module = 'revenue_center' and m.idempotency_key::text like 'proposal:' || pl.content_id::text || ':%'
             where pl.prospect_id = pp.prospect_id and m.status in ('approved','sent','delivered')) as has_outreach
  from revenue.prospect_profiles pp
)
select p.tenant_id, p.industry_key,
  count(*) filter (where p.status = 'active')                                   as active,
  count(*) filter (where p.status = 'qualified')                                as qualified,
  count(*) filter (where p.status = 'rejected')                                 as rejected,
  count(*) filter (where p.status = 'disqualified')                             as disqualified,
  count(*) filter (where p.status in ('active','qualified') and not p.is_reviewed) as review_queue,
  count(*) filter (where p.is_reviewed)                                          as reviewed,
  count(*) filter (where p.has_proposal)                                         as with_proposal,
  count(*) filter (where p.has_outreach)                                         as outreach,
  count(*) filter (where p.is_synthetic)                                         as synthetic,
  count(*) filter (where p.discovery_source = 'import')                          as imported,
  count(*) filter (where p.discovery_source = 'google_places')                   as live_discovered,
  count(*) filter (where p.discovery_source in ('inbound_inquiry','referral'))   as inbound,
  max(p.created_at)                                                              as last_added_at,
  (select max(r.finished_at) from revenue.discovery_runs r
    where r.tenant_id = p.tenant_id and r.industry_key = p.industry_key and r.status = 'finished') as last_discovery_at
from p
group by p.tenant_id, p.industry_key;
grant select on revenue.industry_summary to authenticated;

-- --- API surface: so comms and workflows never need exposing -----------------
-- What the owner is asked to approve, with the fingerprint of that version.
create or replace function revenue.approval_detail(p_instance uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_i workflows.instances; v_out jsonb;
begin
  select * into v_i from workflows.instances where id = p_instance;
  if not found or not identity.is_member(v_i.tenant_id) or not revenue.is_commercial(p_instance) then
    raise exception 'approval % not found', p_instance using errcode = 'no_data_found';
  end if;
  if v_i.subject_type = 'visibility.content' then
    select jsonb_build_object('subject','proposal','tenant_id',v_i.tenant_id,'status',v_i.status,'title',c.title,'body',c.body,
             'sha256', revenue.content_sha256(c.title, c.body))
      into v_out from visibility.content_assets c where c.id::text = v_i.subject_id;
  else
    select jsonb_build_object('subject','outreach','tenant_id',v_i.tenant_id,'status',v_i.status,
             'title','To ' || m.to_contact::text || ': ' || coalesce(m.subject,''),'body',coalesce(m.body,''),
             'sha256', revenue.message_sha256(m.to_contact::text, m.subject, m.body))
      into v_out from comms.messages m where m.id::text = v_i.subject_id;
  end if;
  return v_out;
end; $$;
revoke all on function revenue.approval_detail(uuid) from public, anon;
grant execute on function revenue.approval_detail(uuid) to authenticated;

-- After the owner approves a message: mark it approved (queued for the provider).
create or replace function revenue.release_outreach(p_message uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from comms.messages where id = p_message and source_module = 'revenue_center') then
    raise exception 'message % is not Revenue Center outreach', p_message using errcode = 'no_data_found';
  end if;
  perform comms.approve_message(p_message);
end; $$;
revoke all on function revenue.release_outreach(uuid) from public, anon;
grant execute on function revenue.release_outreach(uuid) to authenticated;

create or replace view revenue.open_approvals with (security_invoker = true) as
  select i.id, i.tenant_id, i.kind, i.subject_type, i.subject_id, i.started_at
  from workflows.instances i
  where i.status = 'open' and i.kind in ('visibility.content.publish','comms.message.create');
create or replace view revenue.outreach_messages with (security_invoker = true) as
  select m.id, m.tenant_id, m.status, m.idempotency_key, m.provider_key, m.created_at, m.updated_at, m.sent_at, m.delivered_at
  from comms.messages m where m.source_module = 'revenue_center';
grant select on revenue.open_approvals, revenue.outreach_messages to authenticated;

-- --- Final grant posture ------------------------------------------------------
-- "alter default privileges in schema … revoke … from public" cannot remove
-- PostgreSQL's built-in PUBLIC EXECUTE on new functions (verified: seven
-- helpers stayed executable by anon). Revoke explicitly, then grant only what
-- the API surface needs. Internal helpers are callable from the definer
-- functions above, never directly.
revoke all on all functions in schema revenue from public, anon;
revoke all on function revenue.is_commercial(uuid), revenue.tenant_line(uuid),
  revenue.assert_industry_fits(uuid, extensions.citext), revenue.void_approval_on_change(),
  revenue.lowercase_contact() from authenticated;
grant execute on function revenue.content_sha256(text, text), revenue.message_sha256(text, text, text) to authenticated;
