-- ===========================================================================
-- hlbos_0049 — BarberOS: capability catalog and per-tenant toggles
--
-- PROVENANCE — read this before assuming anything about ordering.
--
-- This migration does NOT introduce new design. BarberOS was built directly
-- against canonical production (mvvtngiopdrgiedjmhfb) between 2026-09-09 and
-- 2026-09-13 and was never committed to this repository. Production carries it
-- as eleven migrations that no file here contained:
--
--   hlbos_0048_barberos_capability_catalog   hlbos_0053_barberos_public_site_read
--   hlbos_0049_transform_audit               hlbos_0054_discovery_call
--   hlbos_0050_citext_guard_semantics        hlbos_0055_proposal
--   hlbos_0051_unknown_is_not_complete       hlbos_0056_barberos_shop_api
--   hlbos_0052_barberos_owned_website        hlbos_0057_barberos_product_map
--                                            hlbos_0058_barberos_client_crm
--
-- This file and 0050-0052 reconstruct the `barberos` schema's END STATE, read
-- out of the live catalog. They are deliberately NOT a replay of that history:
-- the live database records what exists, not which migration created which
-- object, and inventing a plausible split would be fabricated history. Four
-- honest migrations beat eleven invented ones.
--
-- Two consequences, stated rather than hidden:
--   * the repo ordinal (0049) is not production's recorded name
--     (hlbos_0048_barberos_capability_catalog). Production already used 0048
--     for the ATS optimizer too, so that number identifies two migrations and
--     could not be reused here. The mapping is recorded in
--     .hlbos/canonical.json under knownMigrationDrift.
--   * this is ALREADY APPLIED in production under those other names. It must
--     NOT be applied there again. Its job is to make the repository true, to
--     let CI prove the schema applies from empty, and to give the pgTAP suite
--     something to test. See docs/products/barberos/02-production-drift-map.md.
--
-- WHAT THIS MIGRATION IS
--
-- BarberOS ships one capability at a time, and the catalog is the honest record
-- of which ones actually exist. A capability is `available` only when it has
-- shipped; `planned` and `deferred` cannot be switched on at all, and
-- enable_capability() refuses them rather than recording a toggle that controls
-- nothing. Each unshipped capability names what it is blocked on and who owns
-- the blocker (ceo = an access or spend decision; engineering = our own work).
--
-- The review engine deserves its own note. Its locked_config_keys list
-- (min_rating, gate_by_sentiment, suppress_below, ask_only_if_happy,
-- predicted_sentiment_threshold) is enforced by a trigger, not by a UI choice:
-- asking only satisfied customers for a public review is review-gating, which
-- violates Google's review policies and is review suppression under FTC
-- guidance. The schema makes it impossible rather than merely discouraged.
--
-- rollback:
--   DROP SCHEMA IF EXISTS barberos CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'barberos.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'barberos.%';
-- ===========================================================================

create schema if not exists barberos;
comment on schema barberos is 'HL-BOS: BarberOS vertical — capability catalog and per-tenant toggles. NOT exposed via PostgREST.';
revoke all on schema barberos from public, anon;
grant usage on schema barberos to authenticated;
alter default privileges in schema barberos revoke all on tables from public;
alter default privileges in schema barberos revoke all on functions from public;

do $$ begin create type barberos.capability_status as enum ('available','planned','deferred');
exception when duplicate_object then null; end $$;
do $$ begin create type barberos.blocker_owner as enum ('ceo','engineering');
exception when duplicate_object then null; end $$;
do $$ begin create type barberos.enablement_source as enum ('individual','bundle','audit_recommendation');
exception when duplicate_object then null; end $$;

-- --- the catalog -----------------------------------------------------------
create table if not exists barberos.capabilities (
  key                extensions.citext primary key,
  name               text not null,
  category           extensions.citext not null,
  description        text not null default '',
  status             barberos.capability_status not null default 'planned',
  is_default         boolean not null default false,
  locked_config_keys text[] not null default '{}'::text[],
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  blocked_on         text,
  blocker_owner      barberos.blocker_owner,
  constraint capabilities_key_format check (key::text ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint capabilities_version_pos check (version > 0),
  -- an available capability is by definition unblocked
  constraint capabilities_available_is_unblocked
    check (status <> 'available' or blocked_on is null),
  -- a blocker that names no owner is a blocker nobody is going to clear
  constraint capabilities_blocker_has_owner
    check ((blocked_on is null) = (blocker_owner is null)),
  constraint capabilities_default_must_be_available
    check (not is_default or status = 'available')
);

create table if not exists barberos.bundles (
  key           extensions.citext primary key,
  name          text not null,
  description   text not null default '',
  display_order integer not null default 0,
  constraint bundles_key_format check (key::text ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists barberos.bundle_capabilities (
  bundle_key     extensions.citext not null references barberos.bundles(key) on delete cascade,
  capability_key extensions.citext not null references barberos.capabilities(key) on delete restrict,
  primary key (bundle_key, capability_key)
);

create table if not exists barberos.capability_requires (
  capability_key extensions.citext not null references barberos.capabilities(key) on delete cascade,
  requires_key   extensions.citext not null references barberos.capabilities(key) on delete restrict,
  reason         text not null default '',
  primary key (capability_key, requires_key),
  constraint capability_requires_not_self
    check (lower(capability_key::text) <> lower(requires_key::text))
);

create table if not exists barberos.tenant_capabilities (
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  capability_key extensions.citext not null references barberos.capabilities(key) on delete restrict,
  enabled_at     timestamptz not null default now(),
  enabled_by     uuid references auth.users(id) on delete set null,
  enabled_via    barberos.enablement_source not null default 'individual',
  bundle_key     extensions.citext references barberos.bundles(key) on delete set null,
  source_ref     text,
  config         jsonb not null default '{}'::jsonb,
  primary key (tenant_id, capability_key),
  constraint tenant_capabilities_bundle_consistency
    check ((enabled_via = 'bundle') = (bundle_key is not null))
);
create index if not exists tenant_capabilities_capability_idx
  on barberos.tenant_capabilities (capability_key);

-- --- guards ----------------------------------------------------------------
create or replace function barberos.is_enabled(p_tenant uuid, p_capability extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from barberos.tenant_capabilities tc
     where tc.tenant_id = p_tenant and tc.capability_key = p_capability);
$function$;

-- Attached to every capability-owned table. A write to a table whose capability
-- is off is refused, so a disabled capability is genuinely off rather than
-- merely hidden in the UI.
create or replace function barberos.require_capability()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_key text := tg_argv[0];
begin
  v_tenant := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  if not barberos.is_enabled(v_tenant, v_key::extensions.citext) then
    raise exception
      'the % capability is not enabled for this shop, so % cannot be written',
      v_key, tg_table_name
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $function$;

create or replace function barberos.enforce_locked_config()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_locked text[]; v_key text;
begin
  select c.locked_config_keys into v_locked
    from barberos.capabilities c where c.key = new.capability_key;
  if v_locked is null then return new; end if;
  foreach v_key in array v_locked loop
    if new.config ? v_key then
      raise exception
        'capability % forbids the config key %: it is locked by platform policy, not by tenant preference',
        new.capability_key, v_key
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end; $function$;

create or replace function barberos.enforce_prerequisites()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_missing text;
begin
  select string_agg(r.requires_key::text, ', ') into v_missing
    from barberos.capability_requires r
   where r.capability_key = new.capability_key
     and not exists (
       select 1 from barberos.tenant_capabilities tc
        where tc.tenant_id = new.tenant_id and tc.capability_key = r.requires_key);
  if v_missing is not null then
    raise exception 'capability % requires % to be enabled first',
      new.capability_key, v_missing using errcode = 'foreign_key_violation';
  end if;
  return new;
end; $function$;

create or replace function barberos.enforce_no_orphan_dependents()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_dependents text;
begin
  select string_agg(tc.capability_key::text, ', ') into v_dependents
    from barberos.capability_requires r
    join barberos.tenant_capabilities tc
      on tc.tenant_id = old.tenant_id and tc.capability_key = r.capability_key
   where r.requires_key = old.capability_key;
  if v_dependents is not null then
    raise exception 'cannot disable %: % still depend(s) on it',
      old.capability_key, v_dependents using errcode = 'foreign_key_violation';
  end if;
  return old;
end; $function$;

drop trigger if exists tenant_capabilities_locked_config on barberos.tenant_capabilities;
create trigger tenant_capabilities_locked_config before insert or update
  on barberos.tenant_capabilities for each row execute function barberos.enforce_locked_config();
drop trigger if exists tenant_capabilities_prerequisites on barberos.tenant_capabilities;
create trigger tenant_capabilities_prerequisites before insert
  on barberos.tenant_capabilities for each row execute function barberos.enforce_prerequisites();
drop trigger if exists tenant_capabilities_no_orphan_dependents on barberos.tenant_capabilities;
create trigger tenant_capabilities_no_orphan_dependents before delete
  on barberos.tenant_capabilities for each row execute function barberos.enforce_no_orphan_dependents();
drop trigger if exists tenant_capabilities_audit on barberos.tenant_capabilities;
create trigger tenant_capabilities_audit after insert or update or delete
  on barberos.tenant_capabilities for each row execute function audit.emit();

-- --- RLS -------------------------------------------------------------------
alter table barberos.capabilities         enable row level security; alter table barberos.capabilities         force row level security;
alter table barberos.bundles              enable row level security; alter table barberos.bundles              force row level security;
alter table barberos.bundle_capabilities  enable row level security; alter table barberos.bundle_capabilities  force row level security;
alter table barberos.capability_requires  enable row level security; alter table barberos.capability_requires  force row level security;
alter table barberos.tenant_capabilities  enable row level security; alter table barberos.tenant_capabilities  force row level security;

-- The catalog itself is platform vocabulary, not tenant data: any signed-in
-- user may read it. The per-tenant toggles are not.
drop policy if exists capabilities_select on barberos.capabilities;
create policy capabilities_select on barberos.capabilities for select to authenticated using (true);
drop policy if exists bundles_select on barberos.bundles;
create policy bundles_select on barberos.bundles for select to authenticated using (true);
drop policy if exists bundle_capabilities_select on barberos.bundle_capabilities;
create policy bundle_capabilities_select on barberos.bundle_capabilities for select to authenticated using (true);
drop policy if exists capability_requires_select on barberos.capability_requires;
create policy capability_requires_select on barberos.capability_requires for select to authenticated using (true);
drop policy if exists tenant_capabilities_select on barberos.tenant_capabilities;
create policy tenant_capabilities_select on barberos.tenant_capabilities for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.shop.read') or identity.is_platform_admin());

-- SELECT only. Every write goes through the permission-checked RPCs below.
grant select on barberos.capabilities, barberos.bundles, barberos.bundle_capabilities,
                barberos.capability_requires, barberos.tenant_capabilities to authenticated;

-- --- enable / disable ------------------------------------------------------
create or replace function barberos.enable_capability(
  p_tenant uuid, p_capability extensions.citext,
  p_via barberos.enablement_source default 'individual',
  p_bundle extensions.citext default null, p_config jsonb default '{}'::jsonb,
  p_source_ref text default null)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_status barberos.capability_status; v_name text;
begin
  if not identity.has_permission(p_tenant, 'barberos.capability.manage') then
    raise exception 'insufficient privilege to change a shop''s capabilities'
      using errcode = 'insufficient_privilege';
  end if;

  select c.status, c.name into v_status, v_name
    from barberos.capabilities c where c.key = p_capability;
  if not found then
    raise exception 'unknown BarberOS capability %', p_capability
      using errcode = 'no_data_found';
  end if;
  -- The whole reason 'deferred' exists. Payments is not "not recommended
  -- yet" -- it cannot be switched on at all until a migration promotes it.
  if v_status <> 'available' then
    raise exception 'capability % is % and cannot be enabled; it has not shipped',
      p_capability, v_status using errcode = 'check_violation';
  end if;
  if not exists (select 1 from barberos.shops s where s.tenant_id = p_tenant) then
    raise exception 'tenant % is not a BarberOS shop; create the shop first', p_tenant
      using errcode = 'no_data_found';
  end if;

  insert into barberos.tenant_capabilities
    (tenant_id, capability_key, enabled_by, enabled_via, bundle_key, config, source_ref)
  values (p_tenant, p_capability, auth.uid(), p_via, p_bundle,
          coalesce(p_config, '{}'::jsonb), p_source_ref)
  on conflict (tenant_id, capability_key) do nothing;

  if not found then return false; end if;   -- already on; not an error, not a lie

  perform events.emit('barberos.capability.enabled', p_tenant,
    jsonb_build_object('capability', p_capability, 'via', p_via,
                       'bundle', p_bundle, 'source_ref', p_source_ref));
  return true;
end; $function$;

create or replace function barberos.disable_capability(p_tenant uuid, p_capability extensions.citext)
returns boolean language plpgsql security definer set search_path = '' as $function$
begin
  if not identity.has_permission(p_tenant, 'barberos.capability.manage') then
    raise exception 'insufficient privilege to change a shop''s capabilities'
      using errcode = 'insufficient_privilege';
  end if;
  delete from barberos.tenant_capabilities tc
   where tc.tenant_id = p_tenant and tc.capability_key = p_capability;
  if not found then return false; end if;
  perform events.emit('barberos.capability.disabled', p_tenant,
    jsonb_build_object('capability', p_capability));
  return true;
end; $function$;

create or replace function barberos.apply_bundle(p_tenant uuid, p_bundle extensions.citext)
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_count integer := 0; r record;
begin
  if not exists (select 1 from barberos.bundles b where b.key = p_bundle) then
    raise exception 'unknown BarberOS bundle %', p_bundle using errcode = 'no_data_found';
  end if;
  -- Prerequisites first: a capability with fewer dependencies is enabled
  -- earlier, so the prerequisite trigger never fires on a bundle that is
  -- internally consistent.
  for r in
    select bc.capability_key,
           (select count(*) from barberos.capability_requires cr
             where cr.capability_key = bc.capability_key) as depth
      from barberos.bundle_capabilities bc
     where bc.bundle_key = p_bundle
     order by depth asc, bc.capability_key asc
  loop
    if barberos.enable_capability(p_tenant, r.capability_key, 'bundle', p_bundle) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end; $function$;

revoke all on function barberos.is_enabled(uuid, extensions.citext) from public, anon;
revoke all on function barberos.enable_capability(uuid, extensions.citext, barberos.enablement_source, extensions.citext, jsonb, text) from public, anon;
revoke all on function barberos.disable_capability(uuid, extensions.citext) from public, anon;
revoke all on function barberos.apply_bundle(uuid, extensions.citext) from public, anon;
grant execute on function barberos.is_enabled(uuid, extensions.citext) to authenticated;
grant execute on function barberos.enable_capability(uuid, extensions.citext, barberos.enablement_source, extensions.citext, jsonb, text) to authenticated;
grant execute on function barberos.disable_capability(uuid, extensions.citext) to authenticated;
grant execute on function barberos.apply_bundle(uuid, extensions.citext) to authenticated;

-- --- permissions -----------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('barberos.shop.read',          'Read a barbershop''s BarberOS configuration and enabled capabilities.', 'tenant'),
  ('barberos.shop.manage',        'Create and configure the barbershop record.', 'tenant'),
  ('barberos.capability.manage',  'Turn BarberOS capabilities on and off for the shop.', 'tenant'),
  ('barberos.site.update',        'Edit the content of the shop''s public page.', 'tenant'),
  ('barberos.publication.manage', 'Publish or unpublish the shop''s public page.', 'tenant'),
  ('barberos.client.read',        'Read the shop''s clients, their visits and their preferences.', 'tenant'),
  ('barberos.client.manage',      'Add clients and record what was done at a visit.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','barberos.shop.read'),('tenant_owner','barberos.shop.manage'),
  ('tenant_owner','barberos.capability.manage'),('tenant_owner','barberos.site.update'),
  ('tenant_owner','barberos.publication.manage'),('tenant_owner','barberos.client.read'),
  ('tenant_owner','barberos.client.manage'),
  ('tenant_admin','barberos.shop.read'),('tenant_admin','barberos.shop.manage'),
  ('tenant_admin','barberos.capability.manage'),('tenant_admin','barberos.site.update'),
  ('tenant_admin','barberos.publication.manage'),('tenant_admin','barberos.client.read'),
  ('tenant_admin','barberos.client.manage'),
  ('manager','barberos.shop.read'),('manager','barberos.site.update'),
  ('manager','barberos.client.read'),('manager','barberos.client.manage'),
  ('staff','barberos.shop.read'),('staff','barberos.client.read'),('staff','barberos.client.manage'),
  ('viewer','barberos.shop.read'),('viewer','barberos.client.read')
on conflict do nothing;

-- --- the catalog contents --------------------------------------------------
-- Two are `available` because two have shipped. The rest name their blocker and
-- its owner, and cannot be enabled until a migration promotes them.
insert into barberos.capabilities (key, name, category, description, status, locked_config_keys, version, blocked_on, blocker_owner) values
  ('client_crm','Client CRM','core','Every client, every visit, and the cut itself -- guard numbers, fade, finish, beard and the tools used -- so a regular''s preferences survive eighteen months and a change of barber. Reports each client''s own rhythm and who is overdue against it.','available','{}',3,null,null),
  ('owned_website','Owned Website / Landing Page','presence','A page the shop owns: hours, services, prices, address, tap-to-call and a booking link. Replaces a booking-platform-hosted page.','available','{}',2,null,null),
  ('booking','Booking & Scheduling','core','Appointment booking with staff and chair assignment.','planned','{}',2,'Engineering only.','engineering'),
  ('walkin_queue','Walk-in Queue & Virtual Wait','core','Digital line, estimated wait, and a "you''re next" SMS. The BarberOS differentiator.','planned','{}',2,'Engineering only.','engineering'),
  ('staff_management','Multi-chair / Staff Management','core','Multiple barbers per shop with individual schedules and queues.','planned','{}',2,'Engineering only.','engineering'),
  ('review_engine','Reputation Engine','growth','Asks EVERY customer for a public review -- timing is the only variable -- and gives a customer who reports a problem privately a service-recovery workflow. It does not and will not gate: asking only the happy ones is against Google''s review policies and is review suppression under FTC guidance, and the config keys that would switch it on are locked at the schema.','planned','{min_rating,gate_by_sentiment,suppress_below,ask_only_if_happy,predicted_sentiment_threshold}',2,'A way to send the request (SMS or email) and the shop''s Google review link.','ceo'),
  ('missed_call_capture','Missed-Call Capture','growth','Text-back on a missed call, with AI-answered routine questions.','planned','{}',2,'A phone number and a telephony provider account, so a missed call can be texted back.','ceo'),
  ('retention_engine','Retention Engine','growth','Notices a regular is overdue against their own rhythm and asks them back. Built on the visit history, so it measures the client rather than a fixed interval.','planned','{}',1,'A way to send a message -- the same SMS/email provider the marketing engine needs.','ceo'),
  ('marketing_engine','Marketing Engine','growth','SMS and email to the shop''s own clients: offers, promotions, birthdays and win-backs, sent from the CRM rather than a separate list.','planned','{}',1,'An SMS provider account with a number, and an email sending domain. Both are billable and both are the shop''s or the agency''s to open.','ceo'),
  ('social_engine','Social Engine','growth','Instagram, TikTok and Facebook content generated from what the shop already produces -- cuts, reviews, promotions and staff. The platform''s publishing layer already exists; this is the barbershop''s use of it.','planned','{}',1,'The Meta app with Instagram and Facebook Login, a TikTok app, and each account connected -- the six-step access list already recorded as a blocker on this platform.','ceo'),
  ('lead_funnel','Lead Funnel','growth','Turns a visitor into a booked appointment: the path from the page to a held slot, and the measurement of where people fall out of it.','planned','{}',1,'Booking, which it converts into. Engineering only.','engineering'),
  ('local_seo','Local SEO Engine','presence','Ranking for "barber near me", the town name and each service, and in Google Maps. Structured data, service and area pages, and the technical work on the shop''s own site.','planned','{}',1,'A Google Search Console property for the shop''s domain, and a Places/Maps API key on the agency account.','ceo'),
  ('google_business','Google Business Engine','presence','The shop''s Google Business Profile as an operated asset: posts, photos, Q&A, categories and services, plus monitoring of where it ranks over time.','planned','{}',1,'Google Business Profile API access (an approved project) and the shop granting manager rights on their listing.','ceo'),
  ('reporting_dashboard','Revenue Intelligence','insight','Revenue per customer and per chair, utilisation, cancellations, repeat rate and service mix. Read-only, and only ever over figures the platform actually holds.','planned','{}',2,'The modules that produce the numbers. Engineering only, and honest only once they exist.','engineering'),
  ('ai_advisor','AI Business Advisor','insight','Tells the owner what to do next, from their own numbers. Deliberately last: an advisor with no revenue, booking or retention data to read would be an opinion generator.','planned','{}',1,'The modules it reads from. Engineering only, and not before them.','engineering'),
  ('payments','Payments','commerce','Deferred. PCI and compliance weight is real and is not taken on until the core modules are proven.','deferred','{}',1,null,null)
on conflict (key) do nothing;

insert into barberos.bundles (key, name, description, display_order) values
  ('starter','Starter','The smallest set that changes a shop''s day: client records, booking and the review engine.',1),
  ('growth','Growth','Starter plus the walk-in queue, missed-call capture and an owned web presence.',2),
  ('full','Full','Every shipped capability, including multi-chair staff management and reporting.',3)
on conflict (key) do nothing;

insert into barberos.bundle_capabilities (bundle_key, capability_key) values
  ('starter','client_crm'),('starter','booking'),('starter','review_engine'),
  ('growth','client_crm'),('growth','booking'),('growth','review_engine'),
  ('growth','walkin_queue'),('growth','missed_call_capture'),('growth','owned_website'),
  ('full','client_crm'),('full','booking'),('full','review_engine'),
  ('full','walkin_queue'),('full','missed_call_capture'),('full','owned_website'),
  ('full','staff_management'),('full','reporting_dashboard')
on conflict do nothing;

-- Dependencies, each with the reason it exists. They are enforced on enable.
insert into barberos.capability_requires (capability_key, requires_key, reason) values
  ('booking','client_crm','An appointment belongs to a client record.'),
  ('walkin_queue','client_crm','A place in line belongs to a person, not a name on a screen.'),
  ('review_engine','client_crm','A review request is sent to a known client after a known visit.'),
  ('retention_engine','client_crm','Overdue is measured against a client''s own visit history.'),
  ('marketing_engine','client_crm','A campaign is sent to the shop''s clients, not to a bought list.'),
  ('staff_management','booking','Per-barber schedules only mean something once there are appointments to schedule.'),
  ('lead_funnel','booking','A funnel with nothing to book into is a page with a button.'),
  ('reporting_dashboard','booking','There is nothing honest to report before there are bookings to report on.'),
  ('ai_advisor','reporting_dashboard','Advice with no numbers behind it is an opinion.'),
  ('local_seo','owned_website','You cannot do the technical work on a page the shop does not own.')
on conflict do nothing;
