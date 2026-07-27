-- ===========================================================================
-- v0_communications — reusable HL-BOS communications module (comms)
--
-- One outbound-message platform for every vertical (VisibilityAI, SalonAI,
-- HomeHuddle, TransportationAI, HSCS, …): email + SMS today, more channels via
-- provider adapters later. Reuses the spine (identity/permissions/audit),
-- events (outbox), and workflows (human approval). No second bus, no second
-- approval engine, no second tenant model.
--
-- Schema name `comms` (module core.communications) — short identifiers, like
-- the existing `ai` schema. See 06-checkpoint3-reuse-analysis.md.
--
-- Anti-fabrication (Principle 10): delivery status is recorded ONLY by the
-- trusted provider path (platform admin / worker), never by a tenant — a tenant
-- cannot claim a message was delivered. Consent/opt-out/STOP suppression are
-- modeled from the start; no marketing without valid consent.
--
-- Provider credentials are Vault references only (CHECK-enforced). No secrets.
--
-- rollback:
--   DROP SCHEMA IF EXISTS comms CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'comms.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'comms.%';
-- ===========================================================================

create schema if not exists comms;
comment on schema comms is 'HL-BOS: reusable communications (email/SMS/…) platform. NOT exposed via PostgREST.';
revoke all on schema comms from public, anon, authenticated;
grant usage on schema comms to authenticated;
alter default privileges in schema comms revoke all on tables from public;
alter default privileges in schema comms revoke all on functions from public;

do $$ begin create type comms.channel as enum ('email','sms'); exception when duplicate_object then null; end $$;
do $$ begin create type comms.provider_kind as enum ('mock','twilio','email'); exception when duplicate_object then null; end $$;
do $$ begin create type comms.message_class as enum ('transactional','marketing'); exception when duplicate_object then null; end $$;
do $$ begin create type comms.message_status as enum ('pending','queued','approved','sent','delivered','failed','suppressed'); exception when duplicate_object then null; end $$;
do $$ begin create type comms.consent_status as enum ('granted','revoked'); exception when duplicate_object then null; end $$;
do $$ begin create type comms.suppression_reason as enum ('opt_out','bounce','complaint','manual'); exception when duplicate_object then null; end $$;

-- --- Providers (Vault refs only; mirrors ai/billing.providers) ---------------
create table if not exists comms.providers (
  key            extensions.citext primary key,
  kind           comms.provider_kind not null,
  channel        comms.channel not null,
  is_active      boolean not null default false,
  credential_ref extensions.citext,
  config         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint comms_providers_credential_is_vault_ref
    check (credential_ref is null or credential_ref ~ '^vault:[a-z0-9_./-]{1,120}$')
);
comment on table comms.providers is 'Email/SMS providers. Credentials are Vault references only; twilio/email seeded INACTIVE until a key is granted at deploy.';

-- --- Templates + versions (mirrors ai.prompts/prompt_versions) --------------
create table if not exists comms.templates (
  key        extensions.citext primary key,
  name       text not null,
  channel    comms.channel not null,
  module     extensions.citext not null,
  created_at timestamptz not null default now(),
  constraint comms_templates_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
create table if not exists comms.template_versions (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  template_key extensions.citext not null references comms.templates(key) on delete cascade,
  version      integer not null,
  subject      text,                                   -- null for SMS
  body         text not null,
  variables    text[] not null default '{}',           -- declared variables
  created_at   timestamptz not null default now(),
  constraint comms_template_versions_unique unique (template_key, version)
);

-- --- Per-tenant sender identity ---------------------------------------------
create table if not exists comms.sender_identities (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  channel      comms.channel not null,
  identity     text not null,                           -- from-address or from-number
  display_name text,
  verified     boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint comms_sender_unique unique (tenant_id, channel, identity)
);

-- --- Consent + suppression (compliance from day one) ------------------------
create table if not exists comms.consent (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  channel    comms.channel not null,
  contact    extensions.citext not null,                -- email or phone
  status     comms.consent_status not null,
  source     text,                                      -- where consent came from
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comms_consent_unique unique (tenant_id, channel, contact)
);
create table if not exists comms.suppression (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  channel    comms.channel not null,
  contact    extensions.citext not null,
  reason     comms.suppression_reason not null,
  created_at timestamptz not null default now(),
  constraint comms_suppression_unique unique (tenant_id, channel, contact)
);

-- --- Messages (the outbound ledger) -----------------------------------------
create table if not exists comms.messages (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  source_module        extensions.citext not null,
  channel              comms.channel not null,
  template_key         extensions.citext,
  template_version     integer,
  to_contact           extensions.citext not null,
  from_identity        text,
  message_class        comms.message_class not null default 'transactional',
  status               comms.message_status not null default 'pending',
  subject              text,
  body                 text,
  provider_key         extensions.citext,
  provider_message_ref extensions.citext,               -- external id, never a secret
  failure_reason       text,
  attempts             integer not null default 0,
  idempotency_key      extensions.citext,
  approval_instance_id uuid references workflows.instances(id) on delete set null,
  requested_by         uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  sent_at              timestamptz,
  delivered_at         timestamptz,
  constraint comms_messages_idempotent unique (tenant_id, idempotency_key)
);
create index if not exists comms_messages_tenant_idx on comms.messages (tenant_id, status);

create trigger consent_set_updated_at before update on comms.consent
  for each row execute function platform.set_updated_at();
create trigger messages_set_updated_at before update on comms.messages
  for each row execute function platform.set_updated_at();
create trigger consent_audit    after insert or update or delete on comms.consent    for each row execute function audit.emit();
create trigger suppression_audit after insert or update or delete on comms.suppression for each row execute function audit.emit();
create trigger messages_audit   after insert or update or delete on comms.messages   for each row execute function audit.emit();

-- --- RLS --------------------------------------------------------------------
alter table comms.providers          enable row level security; alter table comms.providers          force row level security;
alter table comms.templates          enable row level security; alter table comms.templates          force row level security;
alter table comms.template_versions  enable row level security; alter table comms.template_versions  force row level security;
alter table comms.sender_identities  enable row level security; alter table comms.sender_identities  force row level security;
alter table comms.consent            enable row level security; alter table comms.consent            force row level security;
alter table comms.suppression        enable row level security; alter table comms.suppression        force row level security;
alter table comms.messages           enable row level security; alter table comms.messages           force row level security;

-- providers carry credential refs -> platform-only read
drop policy if exists providers_select on comms.providers;
create policy providers_select on comms.providers for select to authenticated
  using (identity.has_platform_permission('comms.provider.manage'));
-- templates are a catalog -> any authenticated context may read
drop policy if exists templates_select on comms.templates;
create policy templates_select on comms.templates for select to authenticated using (true);
drop policy if exists template_versions_select on comms.template_versions;
create policy template_versions_select on comms.template_versions for select to authenticated using (true);
-- sender identities: members of the tenant
drop policy if exists sender_identities_select on comms.sender_identities;
create policy sender_identities_select on comms.sender_identities for select to authenticated
  using (identity.is_member(tenant_id));
-- consent/suppression/messages carry contact PII -> read requires comms.message.read
drop policy if exists consent_select on comms.consent;
create policy consent_select on comms.consent for select to authenticated
  using (identity.has_permission(tenant_id, 'comms.message.read'));
drop policy if exists suppression_select on comms.suppression;
create policy suppression_select on comms.suppression for select to authenticated
  using (identity.has_permission(tenant_id, 'comms.message.read'));
drop policy if exists messages_select on comms.messages;
create policy messages_select on comms.messages for select to authenticated
  using (identity.has_permission(tenant_id, 'comms.message.read') or identity.is_platform_admin());

grant select on comms.providers, comms.templates, comms.template_versions,
                comms.sender_identities, comms.consent, comms.suppression, comms.messages to authenticated;

-- --- Template rendering (missing variable => failure, never a blank send) ---
create or replace function comms.render_template(p_template extensions.citext, p_version integer, p_vars jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_subject text; v_body text; m text[]; k text; val text;
begin
  select subject, body into v_subject, v_body from comms.template_versions
    where template_key = p_template and version = p_version;
  if not found then raise exception 'template % v% not found', p_template, p_version using errcode = 'no_data_found'; end if;
  -- every {{placeholder}} must be supplied
  for m in select regexp_matches(coalesce(v_subject,'') || ' ' || coalesce(v_body,''), '\{\{([a-z0-9_]+)\}\}', 'g') loop
    if not (coalesce(p_vars,'{}'::jsonb) ? m[1]) then
      raise exception 'missing template variable: %', m[1] using errcode = 'check_violation';
    end if;
  end loop;
  for k, val in select key, value from jsonb_each_text(coalesce(p_vars,'{}'::jsonb)) loop
    v_subject := replace(coalesce(v_subject,''), '{{' || k || '}}', val);
    v_body    := replace(v_body, '{{' || k || '}}', val);
  end loop;
  return jsonb_build_object('subject', v_subject, 'body', v_body);
end; $$;
revoke all on function comms.render_template(extensions.citext, integer, jsonb) from public, anon;
grant execute on function comms.render_template(extensions.citext, integer, jsonb) to authenticated;

-- --- Consent + suppression management ---------------------------------------
create or replace function comms.set_consent(p_tenant uuid, p_channel comms.channel, p_contact extensions.citext, p_status comms.consent_status, p_source text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'comms.consent.manage') then
    raise exception 'insufficient privilege to manage consent' using errcode = 'insufficient_privilege';
  end if;
  insert into comms.consent (tenant_id, channel, contact, status, source, granted_at, revoked_at)
  values (p_tenant, p_channel, p_contact, p_status, p_source,
          case when p_status='granted' then now() end,
          case when p_status='revoked' then now() end)
  on conflict (tenant_id, channel, contact) do update
    set status = excluded.status, source = excluded.source,
        granted_at = case when excluded.status='granted' then now() else comms.consent.granted_at end,
        revoked_at = case when excluded.status='revoked' then now() else comms.consent.revoked_at end;
end; $$;
revoke all on function comms.set_consent(uuid, comms.channel, extensions.citext, comms.consent_status, text) from public, anon;
grant execute on function comms.set_consent(uuid, comms.channel, extensions.citext, comms.consent_status, text) to authenticated;

create or replace function comms.suppress(p_tenant uuid, p_channel comms.channel, p_contact extensions.citext, p_reason comms.suppression_reason default 'opt_out')
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'comms.consent.manage') then
    raise exception 'insufficient privilege to suppress a contact' using errcode = 'insufficient_privilege';
  end if;
  insert into comms.suppression (tenant_id, channel, contact, reason)
  values (p_tenant, p_channel, p_contact, p_reason)
  on conflict (tenant_id, channel, contact) do update set reason = excluded.reason;
  perform events.emit('communication.suppressed', p_tenant,
    jsonb_build_object('channel', p_channel, 'reason', p_reason));
end; $$;
revoke all on function comms.suppress(uuid, comms.channel, extensions.citext, comms.suppression_reason) from public, anon;
grant execute on function comms.suppress(uuid, comms.channel, extensions.citext, comms.suppression_reason) to authenticated;

create or replace function comms.has_consent(p_tenant uuid, p_channel comms.channel, p_contact extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from comms.consent c
                 where c.tenant_id=p_tenant and c.channel=p_channel and c.contact=p_contact and c.status='granted')
     and not exists (select 1 from comms.suppression s
                 where s.tenant_id=p_tenant and s.channel=p_channel and s.contact=p_contact);
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
  if exists (select 1 from comms.suppression s where s.tenant_id=p_tenant and s.channel=p_channel and s.contact=p_to) then
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

-- --- Approve a gated message (after the human decision) ---------------------
create or replace function comms.approve_message(p_message uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id, approval_instance_id into v_tenant, v_instance from comms.messages where id = p_message;
  if not found then raise exception 'message % not found', p_message using errcode = 'no_data_found'; end if;
  if not identity.is_member(v_tenant) then
    raise exception 'not a member of tenant' using errcode = 'insufficient_privilege';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'message is not approved by a human reviewer' using errcode = 'insufficient_privilege';
  end if;
  update comms.messages set status = 'approved' where id = p_message and status = 'pending';
  perform events.emit('communication.approved', v_tenant, jsonb_build_object('message', p_message));
end; $$;
revoke all on function comms.approve_message(uuid) from public, anon;
grant execute on function comms.approve_message(uuid) to authenticated;

-- --- Record delivery (trusted provider path ONLY; anti-fabrication) ---------
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

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('comms.message.read',    'Read a tenant''s messages, consent, and suppression.', 'tenant'),
  ('comms.message.create',    'Request outbound communications for a tenant.', 'tenant'),
  ('comms.consent.manage',  'Manage consent and suppression for a tenant.', 'tenant'),
  ('comms.template.manage', 'Manage the shared template catalog (platform).', 'platform'),
  ('comms.provider.manage', 'Manage communication providers and credentials (platform).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','comms.message.read'),('tenant_owner','comms.message.create'),('tenant_owner','comms.consent.manage'),
  ('tenant_admin','comms.message.read'),('tenant_admin','comms.message.create'),('tenant_admin','comms.consent.manage'),
  ('manager','comms.message.read'),('manager','comms.message.create'),
  ('staff','comms.message.read'),
  ('viewer','comms.message.read'),
  ('service_account','comms.message.create'),
  ('platform_owner','comms.template.manage'),('platform_owner','comms.provider.manage'),
  ('platform_admin','comms.template.manage'),('platform_admin','comms.provider.manage')
on conflict do nothing;

-- --- Provider seeds: mock active; twilio + email INACTIVE (no secret stored) -
insert into comms.providers (key, kind, channel, is_active, credential_ref) values
  ('mock_email', 'mock',   'email', true,  null),
  ('mock_sms',   'mock',   'sms',   true,  null),
  ('twilio',     'twilio', 'sms',   false, 'vault:twilio_auth_token'),
  ('email',      'email',  'email', false, 'vault:email_api_key')
on conflict (key) do nothing;

-- --- Template seeds (exercise the reusable launch use cases) -----------------
insert into comms.templates (key, name, channel, module) values
  ('proposal_delivery',    'VisibilityAI proposal delivery', 'email', 'visibility'),
  ('appointment_reminder', 'Appointment reminder',           'sms',   'salonai')
on conflict (key) do nothing;
insert into comms.template_versions (template_key, version, subject, body, variables) values
  ('proposal_delivery', 1, 'Your growth proposal, {{business}}',
     'Hi {{contact}}, your VisibilityAI proposal is ready: {{link}}', array['business','contact','link']),
  ('appointment_reminder', 1, null,
     'Reminder: {{service}} on {{date}}. Reply STOP to opt out.', array['service','date'])
on conflict (template_key, version) do nothing;
