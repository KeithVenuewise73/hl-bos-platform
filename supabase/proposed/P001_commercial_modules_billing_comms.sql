-- ===========================================================================
-- PROPOSED MIGRATION P001 — commercial module registry, the server-side
-- module gate, provider billing-event ingestion, and communications delivery
-- support. Shared by TransportationOS and SalonOS.
--
-- STATUS: written and tested against an ISOLATED local PostgreSQL only
-- (scripts/local-test/isolated-db.sh). NOT applied anywhere. It lives in
-- supabase/proposed/, not supabase/migrations/, because it cannot take an
-- ordinal yet: production's migration history (111 entries) and this
-- repository's (54) disagree, and ordinals 0048-0058 already mean different
-- things in each. It receives a real ordinal when the lineage is reconciled.
--
-- ADDITIVE ONLY. It creates new tables and functions, adds nullable columns
-- to comms.messages, and inserts catalog rows. It changes no existing
-- function and deletes nothing.
--
-- REUSES, does not duplicate:
--   entitlements.features / plan_features / tenant_entitlements /
--     module_activations   (0010)
--   billing.products / plans / subscriptions / reconcile_entitlements (0015-16)
--   comms.messages / consent / suppression / record_delivery (0019)
--   audit.log_security_event (0004), events.emit (0009)
--
-- rollback:
--   DROP FUNCTION IF EXISTS comms.release_claim(uuid);
--   DROP FUNCTION IF EXISTS comms.apply_inbound_keyword(uuid, comms.channel, extensions.citext, text);
--   DROP FUNCTION IF EXISTS comms.schedule_retry(uuid, text, integer);
--   DROP FUNCTION IF EXISTS comms.claim_outbound(integer, comms.channel);
--   ALTER TABLE comms.messages DROP COLUMN IF EXISTS next_attempt_at,
--     DROP COLUMN IF EXISTS claimed_at;
--   DROP FUNCTION IF EXISTS billing.apply_provider_event(extensions.citext, text, text, uuid, extensions.citext, timestamptz, extensions.citext);
--   DROP TABLE IF EXISTS billing.provider_events;
--   DROP FUNCTION IF EXISTS entitlements.my_modules(uuid);
--   DROP FUNCTION IF EXISTS entitlements.require_module(uuid, extensions.citext);
--   DROP FUNCTION IF EXISTS entitlements.module_licensed(uuid, extensions.citext);
--   DROP FUNCTION IF EXISTS entitlements.module_held(uuid, extensions.citext);
--   DELETE FROM entitlements.plan_features WHERE plan_key LIKE 'tms\_%' OR plan_key LIKE 'salon\_%';
--   DELETE FROM billing.plans WHERE product_key IN ('transportation_os','salon_os');
--   DELETE FROM billing.products WHERE key IN ('transportation_os','salon_os');
--   DELETE FROM entitlements.features WHERE key LIKE 'tms.%' OR key LIKE 'salon.%';
--   DROP TABLE IF EXISTS entitlements.modules;
-- ===========================================================================

-- --- 1. Module registry ----------------------------------------------------
create table if not exists entitlements.modules (
  key                extensions.citext primary key,
  product            extensions.citext not null,
  number             integer not null,
  name               text not null,
  release            integer not null,
  feature_key        extensions.citext not null unique references entitlements.features(key) deferrable initially deferred,
  base_capabilities  text[] not null default '{}',
  -- Commercial dependency: at least one of these must ALSO be licensed.
  requires_any       extensions.citext[] not null default '{}',
  -- Product roles that may use the module. Enforced by each product's RPCs;
  -- recorded here so the UI and the API read one source.
  allowed_roles      text[] not null default '{}',
  -- The standalone billing plan that sells this module, if any.
  pricing_plan       extensions.citext,
  feature_limits     jsonb not null default '{}'::jsonb,
  -- false = not built. A module that is not built must not be sold.
  built              boolean not null default false,
  description        text not null default '',
  constraint modules_key_format check (key ~ '^(tms|salon)_[a-z_]+$'),
  constraint modules_product check (product in ('transportation','salon'))
);
comment on table entitlements.modules is
  'Commercial module registry for TransportationOS and SalonOS. One row per sellable module.';
alter table entitlements.modules enable row level security;
alter table entitlements.modules force row level security;
drop policy if exists modules_select on entitlements.modules;
create policy modules_select on entitlements.modules for select to authenticated using (true);
grant select on entitlements.modules to authenticated;

-- Features first (modules.feature_key references them), one per module.
insert into entitlements.features (key, name, module, description) values
  ('tms.fleet',        'Fleet Management',        'tms_fleet',        'T1'),
  ('tms.drivers',      'Driver Management',       'tms_drivers',      'T2'),
  ('tms.dvir',         'Digital DVIR',            'tms_dvir',         'T3'),
  ('tms.dispatch',     'Dispatch Manager',        'tms_dispatch',     'T4'),
  ('tms.routes',       'Route Manager',           'tms_routes',       'T5'),
  ('tms.driver_app',   'Driver Mobile App',       'tms_driver_app',   'T6'),
  ('tms.kpi',          'Driver KPI Scorecards',   'tms_kpi',          'T7'),
  ('tms.profitability','Truck Profitability',     'tms_profitability','T8'),
  ('tms.maintenance',  'Maintenance Management',  'tms_maintenance',  'T9'),
  ('tms.executive',    'Executive Dashboard',     'tms_executive',    'T10'),
  ('tms.portal',       'Customer Portal',         'tms_portal',       'T11'),
  ('tms.automation',   'Notifications and Automation','tms_automation','T12'),
  ('salon.website',    'Salon Website',           'salon_website',    'S1'),
  ('salon.crm',        'Customer CRM',            'salon_crm',        'S2'),
  ('salon.booking',    'Appointment Booking',     'salon_booking',    'S3'),
  ('salon.staff',      'Staff and Chair Management','salon_staff',    'S4'),
  ('salon.notifications','Customer Notifications','salon_notifications','S5'),
  ('salon.reputation', 'Reputation Management',   'salon_reputation', 'S6'),
  ('salon.payments',   'Billing and Payments',    'salon_payments',   'S7'),
  ('salon.analytics',  'Business Analytics',      'salon_analytics',  'S8'),
  ('salon.campaigns',  'Customer Campaigns',      'salon_campaigns',  'S9'),
  ('salon.dashboard',  'Business Dashboard',      'salon_dashboard',  'S10')
on conflict (key) do nothing;

insert into entitlements.modules
  (key, product, number, name, release, feature_key, base_capabilities, requires_any, allowed_roles, pricing_plan, built, description)
values
  ('tms_fleet','transportation',1,'Fleet Management',1,'tms.fleet','{tenant_identity,vehicle_registry,unit_assignments,audit}','{}','{owner,manager,maintenance}','tms_fleet',true,'Vehicles, availability, assignments, maintenance status, fleet status board.'),
  ('tms_drivers','transportation',2,'Driver Management',1,'tms.drivers','{tenant_identity,driver_registry,unit_assignments,documents,audit}','{}','{owner,manager}',null,true,'Driver profiles, credentials and expiry, assignments, activity.'),
  ('tms_dvir','transportation',3,'Digital DVIR',1,'tms.dvir','{tenant_identity,vehicle_registry,driver_registry,unit_assignments,signed_records,documents,audit}','{}','{owner,manager,maintenance,driver}','tms_dvir',true,'Inspections, defects, photos, signatures, repair certification, holds.'),
  ('tms_dispatch','transportation',4,'Dispatch Manager',2,'tms.dispatch','{tenant_identity,vehicle_registry,driver_registry,unit_assignments,notifications,audit}','{}','{owner,manager}',null,false,'Not built.'),
  ('tms_routes','transportation',5,'Route Manager',2,'tms.routes','{tenant_identity,vehicle_registry,driver_registry,audit}','{}','{owner,manager}',null,false,'Not built.'),
  ('tms_driver_app','transportation',6,'Driver Mobile App',2,'tms.driver_app','{tenant_identity,driver_registry,notifications}','{tms_dvir,tms_dispatch,tms_routes}','{driver}',null,false,'The DVIR phone screen ships with tms_dvir; assignments and status are not built.'),
  ('tms_kpi','transportation',7,'Driver KPI Scorecards',2,'tms.kpi','{tenant_identity,driver_registry,audit}','{}','{owner,manager}','tms_kpi',false,'Backend exists in production (scorecard schema); no UI.'),
  ('tms_profitability','transportation',8,'Truck Profitability',3,'tms.profitability','{tenant_identity,vehicle_registry,cost_ledger}','{}','{owner,manager}',null,false,'Not built.'),
  ('tms_maintenance','transportation',9,'Maintenance Management',1,'tms.maintenance','{tenant_identity,vehicle_registry,cost_ledger,documents,signed_records,audit}','{}','{owner,manager,maintenance}',null,true,'Defect queue, work orders, service records.'),
  ('tms_executive','transportation',10,'Executive Dashboard',3,'tms.executive','{tenant_identity}','{tms_fleet,tms_dvir,tms_maintenance,tms_dispatch,tms_routes,tms_kpi,tms_profitability}','{owner,manager}',null,false,'Not built.'),
  ('tms_portal','transportation',11,'Customer Portal',3,'tms.portal','{tenant_identity,documents}','{tms_dispatch,tms_routes}','{}',null,false,'Not built.'),
  ('tms_automation','transportation',12,'Notifications and Automation',2,'tms.automation','{tenant_identity,notifications}','{tms_fleet,tms_drivers,tms_dvir,tms_maintenance,tms_dispatch,tms_routes}','{owner,manager}',null,false,'Not built.'),
  ('salon_website','salon',1,'Salon Website',1,'salon.website','{tenant_identity,audit}','{}','{owner,manager}','salon_website',true,'Branded site, services, team, hours, booking call to action.'),
  ('salon_crm','salon',2,'Customer CRM',1,'salon.crm','{tenant_identity,customer_registry,audit}','{}','{owner,manager,stylist}',null,true,'Customer profiles, visit history, preferences, follow-up.'),
  ('salon_booking','salon',3,'Appointment Booking',1,'salon.booking','{tenant_identity,customer_registry,service_catalog,staff_registry,audit}','{}','{owner,manager,stylist}',null,true,'Online booking, availability, reschedule, cancel.'),
  ('salon_staff','salon',4,'Staff and Chair Management',1,'salon.staff','{tenant_identity,staff_registry,audit}','{}','{owner,manager}',null,true,'Stylists, schedules, employee or chair-rental model.'),
  ('salon_notifications','salon',5,'Customer Notifications',1,'salon.notifications','{tenant_identity,notifications,consent}','{salon_booking,salon_crm}','{owner,manager}',null,true,'Confirmations, reminders, changes; consent and opt-out. Mock transport only.'),
  ('salon_reputation','salon',6,'Reputation Management',2,'salon.reputation','{tenant_identity,notifications,consent}','{salon_crm,salon_booking}','{owner,manager}',null,false,'Not built.'),
  ('salon_payments','salon',7,'Billing and Payments',2,'salon.payments','{tenant_identity,billing}','{salon_booking}','{owner,manager}',null,false,'Not built.'),
  ('salon_analytics','salon',8,'Business Analytics',2,'salon.analytics','{tenant_identity}','{salon_booking,salon_crm}','{owner,manager}',null,false,'Not built.'),
  ('salon_campaigns','salon',9,'Customer Campaigns',2,'salon.campaigns','{tenant_identity,notifications,consent}','{salon_crm}','{owner,manager}',null,false,'Not built.'),
  ('salon_dashboard','salon',10,'Business Dashboard',1,'salon.dashboard','{tenant_identity}','{salon_booking,salon_crm,salon_staff}','{owner,manager}',null,true,'Today''s appointments, schedules, alerts.')
on conflict (key) do nothing;

-- --- 2. Billing catalog: products and package plans -------------------------
-- Prices are NOT stored: they are proposals pending market research.
insert into billing.products (key, name, module, description) values
  ('transportation_os', 'HSCS TransportationOS', 'transportation', 'Modular transportation operating system.'),
  ('salon_os',          'HLG SalonOS',           'salon',          'Modular salon operating system.')
on conflict (key) do nothing;

insert into billing.plans (key, product_key, name, interval, trial_days) values
  ('tms_dvir',               'transportation_os', 'Digital DVIR',                  'month', 0),
  ('tms_fleet',              'transportation_os', 'Fleet Management',              'month', 0),
  ('tms_kpi',                'transportation_os', 'Driver KPI Scorecards',         'month', 0),
  ('tms_fleet_maintenance',  'transportation_os', 'Fleet + Maintenance',           'month', 0),
  ('tms_fleet_driver_dvir',  'transportation_os', 'Fleet + Driver + DVIR',         'month', 0),
  ('tms_complete',           'transportation_os', 'Complete TMS',                  'month', 0),
  ('salon_website',          'salon_os',          'Website only',                  'month', 0),
  ('salon_website_booking',  'salon_os',          'Website + Booking',             'month', 0),
  ('salon_crm_notifications','salon_os',          'CRM + Notifications',           'month', 0),
  ('salon_operations',       'salon_os',          'Salon Operations',              'month', 0),
  ('salon_full',             'salon_os',          'Full SalonOS',                  'month', 0)
on conflict (key) do nothing;

insert into entitlements.plan_features (plan_key, feature_key)
select p.plan, p.feature from (values
  ('tms_dvir','tms.dvir'),
  ('tms_fleet','tms.fleet'),
  ('tms_kpi','tms.kpi'),
  ('tms_fleet_maintenance','tms.fleet'),('tms_fleet_maintenance','tms.maintenance'),
  ('tms_fleet_driver_dvir','tms.fleet'),('tms_fleet_driver_dvir','tms.drivers'),('tms_fleet_driver_dvir','tms.dvir'),
  ('salon_website','salon.website'),
  ('salon_website_booking','salon.website'),('salon_website_booking','salon.booking'),
  ('salon_crm_notifications','salon.crm'),('salon_crm_notifications','salon.notifications'),
  ('salon_operations','salon.website'),('salon_operations','salon.booking'),('salon_operations','salon.crm'),
  ('salon_operations','salon.staff'),('salon_operations','salon.notifications'),('salon_operations','salon.dashboard')
) as p(plan, feature)
on conflict do nothing;
-- Complete / full packages: every BUILT module of the product. A module that
-- is not built is not granted by any plan, so nobody is billed for it; when it
-- ships, a later migration adds it here.
insert into entitlements.plan_features (plan_key, feature_key)
select 'tms_complete', m.feature_key from entitlements.modules m where m.product = 'transportation' and m.built
on conflict do nothing;
insert into entitlements.plan_features (plan_key, feature_key)
select 'salon_full', m.feature_key from entitlements.modules m where m.product = 'salon' and m.built
on conflict do nothing;
-- KPI Scorecards has a backend but no UI: the plan exists for pricing work
-- but cannot be bought.
update billing.plans set is_active = false where key = 'tms_kpi';

-- --- 3. The module gate -----------------------------------------------------
-- module_held: the tenant holds the module (activation OR an unexpired feature
-- entitlement for it) and the tenant is operable. No dependency logic.
create or replace function entitlements.module_held(p_tenant uuid, p_module extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select platform.tenant_is_operable(p_tenant) and (
    exists (select 1 from entitlements.module_activations a
            where a.tenant_id = p_tenant and a.module = p_module and a.active)
    or exists (select 1 from entitlements.tenant_entitlements te
               join entitlements.modules m on m.feature_key = te.feature_key
               where te.tenant_id = p_tenant and m.key = p_module
                 and (te.expires_at is null or te.expires_at > now())));
$$;

-- module_licensed: held AND its commercial dependency satisfied.
create or replace function entitlements.module_licensed(p_tenant uuid, p_module extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select entitlements.module_held(p_tenant, p_module)
     and coalesce((select cardinality(m.requires_any) = 0
                      or exists (select 1 from unnest(m.requires_any) d
                                 where entitlements.module_held(p_tenant, d))
                   from entitlements.modules m where m.key = p_module), false);
$$;
comment on function entitlements.module_licensed(uuid, extensions.citext) is
  'The server-side licence check every TransportationOS / SalonOS operation calls. Fails closed: an unknown module is never licensed.';

-- require_module: raise in plain English when not licensed. Product RPCs call this.
create or replace function entitlements.require_module(p_tenant uuid, p_module extensions.citext)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_name text;
begin
  if not entitlements.module_licensed(p_tenant, p_module) then
    select name into v_name from entitlements.modules where key = p_module;
    raise exception '% is not licensed for this company', coalesce(v_name, p_module::text)
      using errcode = 'insufficient_privilege';
  end if;
end; $$;

-- These reveal another company's licences, so they are not callable directly.
-- Product functions (owned by postgres) call them.
revoke all on function entitlements.module_held(uuid, extensions.citext) from public, anon, authenticated;
revoke all on function entitlements.module_licensed(uuid, extensions.citext) from public, anon, authenticated;
revoke all on function entitlements.require_module(uuid, extensions.citext) from public, anon, authenticated;

-- my_modules: a member may read their OWN company's licensed modules.
create or replace function entitlements.my_modules(p_tenant uuid)
returns table (module extensions.citext, licensed boolean, built boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not identity.is_member(p_tenant) then
    raise exception 'not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  return query select m.key, entitlements.module_licensed(p_tenant, m.key), m.built
               from entitlements.modules m order by m.product, m.number;
end; $$;
revoke all on function entitlements.my_modules(uuid) from public, anon;
grant execute on function entitlements.my_modules(uuid) to authenticated;

-- --- 4. Provider billing events (Stripe or any provider), idempotent --------
create table if not exists billing.provider_events (
  id            bigint generated always as identity primary key,
  provider_key  extensions.citext not null references billing.providers(key),
  event_id      text not null,
  event_type    text not null,
  tenant_id     uuid references platform.tenants(id) on delete set null,
  plan_key      extensions.citext,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  outcome       text,
  constraint provider_events_unique unique (provider_key, event_id)
);
comment on table billing.provider_events is
  'Every provider webhook event, once. The unique key makes re-delivery a no-op.';
alter table billing.provider_events enable row level security;
alter table billing.provider_events force row level security;
-- No member policy: platform-only, read through the billing service.

-- p_type is provider-NEUTRAL (the TS adapter maps Stripe event types to it):
--   subscription.activated | subscription.trialing | subscription.past_due |
--   subscription.canceled  | payment.succeeded     | payment.failed
create or replace function billing.apply_provider_event(
  p_provider extensions.citext, p_event_id text, p_type text, p_tenant uuid,
  p_plan extensions.citext, p_period_end timestamptz default null,
  p_subscription_ref extensions.citext default null)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_event bigint; v_status billing.subscription_status; v_outcome text;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the billing service may apply provider events' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_event_id, '') = '' then raise exception 'event id required'; end if;

  insert into billing.provider_events (provider_key, event_id, event_type, tenant_id, plan_key)
  values (p_provider, p_event_id, p_type, p_tenant, p_plan)
  on conflict (provider_key, event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';                       -- already applied: change nothing
  end if;

  v_status := case p_type
    when 'subscription.activated' then 'active'
    when 'payment.succeeded'      then 'active'
    when 'subscription.trialing'  then 'trialing'
    when 'subscription.past_due'  then 'past_due'
    when 'payment.failed'         then 'past_due'
    when 'subscription.canceled'  then 'canceled'
    else null end::billing.subscription_status;

  if v_status is null then
    v_outcome := 'ignored';
  elsif p_tenant is null or not exists (select 1 from platform.tenants t where t.id = p_tenant) then
    v_outcome := 'rejected: unknown tenant';
  elsif p_plan is null or not exists (select 1 from billing.plans p where p.key = p_plan) then
    v_outcome := 'rejected: unknown plan';
  else
    insert into billing.subscriptions (tenant_id, plan_key, provider_key, status,
        provider_subscription_ref, current_period_start, current_period_end, canceled_at)
    values (p_tenant, p_plan, p_provider, v_status, p_subscription_ref, now(), p_period_end,
            case when v_status = 'canceled' then now() end)
    on conflict (tenant_id, plan_key) do update
      set status = excluded.status,
          provider_key = excluded.provider_key,
          provider_subscription_ref = coalesce(excluded.provider_subscription_ref, billing.subscriptions.provider_subscription_ref),
          current_period_end = coalesce(excluded.current_period_end, billing.subscriptions.current_period_end),
          canceled_at = case when excluded.status = 'canceled' then now() else null end,
          cancel_at_period_end = false;
    -- Entitlements follow the subscription. Operational records are never
    -- touched: losing a licence closes the door, it does not delete the room.
    perform billing.reconcile_entitlements(p_tenant);
    v_outcome := 'applied: ' || v_status::text;
    perform events.emit('billing.provider_event.applied', p_tenant,
      jsonb_build_object('provider', p_provider, 'event', p_event_id, 'type', p_type, 'plan', p_plan));
  end if;

  update billing.provider_events set processed_at = now(), outcome = v_outcome where id = v_event;
  perform audit.log_security_event('billing.provider_event', 'allowed', 'info', p_tenant,
    'billing.provider_events', v_event::text,
    jsonb_build_object('provider', p_provider, 'type', p_type, 'outcome', v_outcome));
  return v_outcome;
end; $$;
revoke all on function billing.apply_provider_event(extensions.citext, text, text, uuid, extensions.citext, timestamptz, extensions.citext) from public, anon;
grant execute on function billing.apply_provider_event(extensions.citext, text, text, uuid, extensions.citext, timestamptz, extensions.citext) to authenticated;

-- --- 5. Communications delivery support --------------------------------------
alter table comms.messages add column if not exists next_attempt_at timestamptz not null default now();
alter table comms.messages add column if not exists claimed_at timestamptz;

-- claim_outbound: the delivery worker takes a batch. Re-checks suppression and
-- marketing consent AT SEND TIME (someone may have replied STOP since).
create or replace function comms.claim_outbound(p_limit integer default 20, p_channel comms.channel default null)
returns table (id uuid, tenant_id uuid, channel comms.channel, to_contact extensions.citext,
               from_identity text, subject text, body text, provider_key extensions.citext,
               attempts integer, message_class comms.message_class)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.is_platform_admin() then
    raise exception 'only the delivery worker may claim messages' using errcode = 'insufficient_privilege';
  end if;
  update comms.messages m set status = 'suppressed', failure_reason = 'suppressed at send time'
   where m.status in ('queued','approved')
     and (p_channel is null or m.channel = p_channel)
     and (exists (select 1 from comms.suppression s
                  where s.tenant_id = m.tenant_id and s.channel = m.channel and s.contact = m.to_contact)
          or (m.message_class = 'marketing' and not comms.has_consent(m.tenant_id, m.channel, m.to_contact)));
  return query
  update comms.messages m set claimed_at = now()
   where m.id in (
     select x.id from comms.messages x
      where x.status in ('queued','approved')
        and (p_channel is null or x.channel = p_channel)
        and x.next_attempt_at <= now()
        and (x.claimed_at is null or x.claimed_at < now() - interval '5 minutes')
      order by x.created_at
      for update skip locked
      limit greatest(1, least(p_limit, 200)))
  returning m.id, m.tenant_id, m.channel, m.to_contact, m.from_identity, m.subject, m.body,
            m.provider_key, m.attempts, m.message_class;
end; $$;
revoke all on function comms.claim_outbound(integer, comms.channel) from public, anon;
grant execute on function comms.claim_outbound(integer, comms.channel) to authenticated;

-- schedule_retry: a failed attempt. Exponential backoff; terminal after max.
create or replace function comms.schedule_retry(p_message uuid, p_reason text, p_max_attempts integer default 5)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_attempts integer; v_tenant uuid;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the delivery worker may schedule retries' using errcode = 'insufficient_privilege';
  end if;
  update comms.messages set attempts = attempts + 1, claimed_at = null, failure_reason = left(p_reason, 500)
   where id = p_message returning attempts, tenant_id into v_attempts, v_tenant;
  if not found then raise exception 'message % not found', p_message using errcode = 'no_data_found'; end if;
  if v_attempts >= p_max_attempts then
    update comms.messages set status = 'failed' where id = p_message;
    perform events.emit('communication.failed', v_tenant, jsonb_build_object('message', p_message, 'reason', p_reason));
    return 'failed';
  end if;
  update comms.messages set status = 'queued',
         next_attempt_at = now() + make_interval(mins => power(2, v_attempts)::integer)
   where id = p_message;
  return 'retry';
end; $$;
revoke all on function comms.schedule_retry(uuid, text, integer) from public, anon;
grant execute on function comms.schedule_retry(uuid, text, integer) to authenticated;

-- apply_inbound_keyword: STOP / START from the contact. The caller (webhook)
-- has already verified the provider signature.
create or replace function comms.apply_inbound_keyword(
  p_tenant uuid, p_channel comms.channel, p_contact extensions.citext, p_keyword text)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.is_platform_admin() then
    raise exception 'only the inbound worker may apply opt-out keywords' using errcode = 'insufficient_privilege';
  end if;
  if p_keyword = 'stop' then
    insert into comms.suppression (tenant_id, channel, contact, reason)
    values (p_tenant, p_channel, p_contact, 'opt_out') on conflict (tenant_id, channel, contact) do nothing;
    insert into comms.consent (tenant_id, channel, contact, status, source, revoked_at)
    values (p_tenant, p_channel, p_contact, 'revoked', 'inbound STOP', now())
    on conflict (tenant_id, channel, contact) do update set status = 'revoked', revoked_at = now(), source = 'inbound STOP';
    perform events.emit('communication.opt_out', p_tenant, jsonb_build_object('channel', p_channel));
    return 'suppressed';
  elsif p_keyword = 'start' then
    -- START lifts only an opt-out. Bounces and complaints stay suppressed.
    delete from comms.suppression where tenant_id = p_tenant and channel = p_channel
       and contact = p_contact and reason = 'opt_out';
    insert into comms.consent (tenant_id, channel, contact, status, source, granted_at)
    values (p_tenant, p_channel, p_contact, 'granted', 'inbound START', now())
    on conflict (tenant_id, channel, contact) do update set status = 'granted', granted_at = now(), source = 'inbound START';
    perform events.emit('communication.opt_in', p_tenant, jsonb_build_object('channel', p_channel));
    return 'resubscribed';
  end if;
  return 'ignored';
end; $$;
revoke all on function comms.apply_inbound_keyword(uuid, comms.channel, extensions.citext, text) from public, anon;
grant execute on function comms.apply_inbound_keyword(uuid, comms.channel, extensions.citext, text) to authenticated;

-- release_claim: give a claimed message back untouched (rate-limited for this
-- run). Not an attempt.
create or replace function comms.release_claim(p_message uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.is_platform_admin() then
    raise exception 'only the delivery worker may release claims' using errcode = 'insufficient_privilege';
  end if;
  update comms.messages set claimed_at = null where id = p_message;
end; $$;
revoke all on function comms.release_claim(uuid) from public, anon;
grant execute on function comms.release_claim(uuid) to authenticated;
