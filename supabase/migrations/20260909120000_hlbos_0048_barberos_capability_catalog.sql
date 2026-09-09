-- ===========================================================================
-- hlbos_0048_barberos_capability_catalog — BarberOS, the on/off skeleton
--
-- BarberOS is the first fully-realized vertical of the ServiceOS line. This
-- migration ships ONLY the capability spine: the catalog of modules, their
-- prerequisites, the bundles they can be sold in, the per-tenant toggle, and
-- the shop record. It ships NO feature logic. There is no queue, no booking,
-- no review request in here, and this file does not pretend otherwise.
--
-- WHY THE SPINE COMES FIRST, AND ALONE
-- The spec's Phase 3. A capability toggle written after nine modules exist is
-- nine modules of conditional logic scattered through the app. Written first,
-- every module lands behind `barberos.is_enabled()` and SalonOS reuses the
-- same table with a different default-on bundle instead of a fork.
--
-- WHY IT IS ORDERED BEFORE transform_audit (0049), inverting the spec's phase
-- numbers: the audit tool's output is a RECOMMENDED CAPABILITY BUNDLE. A
-- recommendation row must reference a capability that actually exists, by
-- foreign key, or the report can recommend a module nobody ever built. The
-- catalog therefore has to exist before the thing that points at it.
--
-- REUSE, NOT A SECOND TENANT MODEL
-- The spec proposed `barberos_tenants` — "one row per shop". That would be the
-- platform's third tenant model, and the current-state audit records what the
-- first two cost. A shop IS a `platform.tenants` row. `barberos.shops` is a
-- satellite carrying the barbershop-specific facts, keyed BY the tenant id.
--
-- THREE RULES ENFORCED IN THE SCHEMA, NOT IN PROSE
--
--   1. PAYMENTS CANNOT BE TURNED ON. The spec defers it; deferral written only
--      in a document is a deferral that leaks. `payments` is seeded with
--      status 'deferred' and `enable_capability` refuses any capability that is
--      not 'available'. To ship payments, a later migration must promote the
--      row — a visible, reviewable act.
--
--   2. THE REVIEW ENGINE CANNOT BE GATED. Platform non-negotiable #5: no
--      review-gating by predicted sentiment, "enforced in the schema, not just
--      in policy prose". `review_engine` carries locked config keys; writing
--      `min_rating`, `gate_by_sentiment`, `suppress_below` or `ask_only_if_happy`
--      into its per-tenant config raises. Timing is the only variable, and the
--      constraint says so.
--
--   3. A CAPABILITY CANNOT OUTRUN ITS PREREQUISITE. `capability_requires` is a
--      real edge list, checked on enable and on disable. Turning on the walk-in
--      queue without client records, or turning off a capability another
--      enabled one depends on, both fail.
--
-- NOTHING IS ENABLED BY THIS FILE. It creates zero tenant_capabilities rows.
-- `is_default` on the catalog is a SUGGESTION for a starter bundle, never an
-- implicit grant — a default that silently enables itself is how a shop ends
-- up running a module nobody chose.
--
-- NOT APPLIED TO ANY ENVIRONMENT. Applying it is a separate, explicitly
-- authorized step. Additive: it creates one new schema and alters nothing.
--
-- rollback:
--   DROP SCHEMA IF EXISTS barberos CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'barberos.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'barberos.%';
--   (Additive migration: it creates a new schema and touches no existing
--    table, so dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists barberos;
comment on schema barberos is
  'HL-BOS: BarberOS vertical — capability catalog and per-tenant toggles. NOT exposed via PostgREST.';
revoke all on schema barberos from public, anon, authenticated;
grant usage on schema barberos to authenticated;
alter default privileges in schema barberos revoke all on tables from public;
alter default privileges in schema barberos revoke all on functions from public;

-- --- Types ------------------------------------------------------------------
-- 'planned' and 'deferred' are not decoration. A capability the sales report
-- may NAME but a tenant may not RUN needs to exist as a row (so a
-- recommendation can reference it) while being un-enableable (so nobody can
-- switch on something that was never built). Only 'available' can be enabled.
do $$ begin create type barberos.capability_status as enum
  ('available','planned','deferred');
  exception when duplicate_object then null; end $$;

do $$ begin create type barberos.enablement_source as enum
  ('individual','bundle','audit_recommendation');
  exception when duplicate_object then null; end $$;

-- --- Capability catalog -----------------------------------------------------
create table if not exists barberos.capabilities (
  key           extensions.citext primary key,
  name          text not null,
  category      extensions.citext not null,
  description   text not null default '',
  status        barberos.capability_status not null default 'planned',
  -- Suggested for a new shop's starter bundle. NEVER an implicit enablement.
  is_default    boolean not null default false,
  -- Config keys a tenant may NOT set, whatever their role. This is where an
  -- ethical rule stops being a paragraph and becomes a constraint.
  locked_config_keys text[] not null default '{}',
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  constraint capabilities_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint capabilities_version_pos check (version > 0),
  -- A capability nobody built cannot be the default-on suggestion for a new
  -- shop. Caught this on the first draft: `payments` was seeded deferred AND
  -- default, which would have put an unbuildable module in every proposal.
  constraint capabilities_default_must_be_available
    check (not is_default or status = 'available')
);
comment on table barberos.capabilities is
  'The BarberOS module catalog. Fixed vocabulary, versioned, changed only by migration. SalonOS will reuse this table with a different is_default set.';
comment on column barberos.capabilities.status is
  'Only ''available'' can be enabled for a tenant. ''deferred'' is how the payments module stays out of v1 structurally rather than by convention.';
comment on column barberos.capabilities.locked_config_keys is
  'Per-tenant config keys that are refused. review_engine locks every review-gating key -- platform non-negotiable #5.';

-- --- Prerequisites (a real edge list, enforced both ways) --------------------
create table if not exists barberos.capability_requires (
  capability_key extensions.citext not null references barberos.capabilities(key) on delete cascade,
  requires_key   extensions.citext not null references barberos.capabilities(key) on delete restrict,
  reason         text not null default '',
  primary key (capability_key, requires_key),
  constraint capability_requires_not_self check (capability_key <> requires_key)
);
comment on table barberos.capability_requires is
  'Hard prerequisites. Checked on enable AND on disable, so a dependency cannot be removed out from under a live capability.';

-- --- Bundles ----------------------------------------------------------------
-- Open question 4 in the spec asks whether capabilities map to pricing tiers or
-- are priced individually. This models BOTH and decides NEITHER: a bundle is a
-- named set of capabilities, `enablement_source` records which route a tenant
-- took, and pricing lives wherever billing already lives. The commercial
-- decision stays a business decision, and no schema change is needed either way.
create table if not exists barberos.bundles (
  key           extensions.citext primary key,
  name          text not null,
  description   text not null default '',
  display_order integer not null default 0,
  constraint bundles_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table barberos.bundles is
  'Named capability sets. Deliberately carries NO price: whether bundles are tiers or a convenience is a commercial decision, and this table survives either answer.';

create table if not exists barberos.bundle_capabilities (
  bundle_key     extensions.citext not null references barberos.bundles(key) on delete cascade,
  capability_key extensions.citext not null references barberos.capabilities(key) on delete restrict,
  primary key (bundle_key, capability_key)
);

-- --- The shop (satellite on platform.tenants, NOT a second tenant model) -----
create table if not exists barberos.shops (
  tenant_id       uuid primary key references platform.tenants(id) on delete cascade,
  shop_name       text not null,
  chair_count     integer not null default 1,
  timezone        text not null default 'America/New_York',
  -- The Tool -> BarberOS handoff. Set when a shop that was audited as a
  -- prospect becomes a customer, so the audit that won the deal stays attached
  -- to the account it produced.
  origin_prospect_id uuid references visibility.prospects(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint shops_chair_count_pos check (chair_count > 0),
  constraint shops_name_present check (length(btrim(shop_name)) > 0)
);
comment on table barberos.shops is
  'Barbershop-specific facts for a tenant. A shop IS a platform.tenants row; this is a satellite, deliberately not a third tenant model.';

-- --- The toggle -------------------------------------------------------------
create table if not exists barberos.tenant_capabilities (
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  capability_key extensions.citext not null references barberos.capabilities(key) on delete restrict,
  enabled_at     timestamptz not null default now(),
  enabled_by     uuid references auth.users(id) on delete set null,
  enabled_via    barberos.enablement_source not null default 'individual',
  bundle_key     extensions.citext references barberos.bundles(key) on delete set null,
  -- Traceable back to the audit that recommended it (0049 adds nothing here;
  -- the reference is deliberately soft so this migration stands alone).
  source_ref     text,
  config         jsonb not null default '{}'::jsonb,
  primary key (tenant_id, capability_key),
  constraint tenant_capabilities_bundle_consistency
    check ((enabled_via = 'bundle') = (bundle_key is not null))
);
comment on table barberos.tenant_capabilities is
  'Which capabilities are ON for which shop. A row EXISTS only while the capability is on -- disabling deletes it, so there is no "enabled=false" row to misread.';
comment on column barberos.tenant_capabilities.config is
  'Per-capability settings. Keys listed in capabilities.locked_config_keys are refused by trigger.';

create index if not exists tenant_capabilities_capability_idx
  on barberos.tenant_capabilities (capability_key);

-- ===========================================================================
-- Guards
-- ===========================================================================

-- Locked config keys. The review engine is the reason this exists: "every
-- customer gets asked, timing is the only variable" is a promise the platform
-- makes, and a promise a tenant could quietly break through a config blob is
-- not a promise. Generic, so any future capability can lock its own keys.
create or replace function barberos.enforce_locked_config()
returns trigger language plpgsql security definer set search_path = '' as $$
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
end; $$;

create trigger tenant_capabilities_locked_config
  before insert or update on barberos.tenant_capabilities
  for each row execute function barberos.enforce_locked_config();

-- A capability cannot be enabled without its prerequisites already on.
create or replace function barberos.enforce_prerequisites()
returns trigger language plpgsql security definer set search_path = '' as $$
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
end; $$;

create trigger tenant_capabilities_prerequisites
  before insert on barberos.tenant_capabilities
  for each row execute function barberos.enforce_prerequisites();

-- ...and cannot be removed while something enabled still depends on it.
create or replace function barberos.enforce_no_orphan_dependents()
returns trigger language plpgsql security definer set search_path = '' as $$
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
end; $$;

create trigger tenant_capabilities_no_orphan_dependents
  before delete on barberos.tenant_capabilities
  for each row execute function barberos.enforce_no_orphan_dependents();

-- --- updated_at + audit -----------------------------------------------------
create trigger shops_set_updated_at before update on barberos.shops
  for each row execute function platform.set_updated_at();
create trigger shops_audit after insert or update or delete on barberos.shops
  for each row execute function audit.emit();
create trigger tenant_capabilities_audit
  after insert or update or delete on barberos.tenant_capabilities
  for each row execute function audit.emit();

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table barberos.capabilities         enable row level security;
alter table barberos.capabilities         force  row level security;
alter table barberos.capability_requires  enable row level security;
alter table barberos.capability_requires  force  row level security;
alter table barberos.bundles              enable row level security;
alter table barberos.bundles              force  row level security;
alter table barberos.bundle_capabilities  enable row level security;
alter table barberos.bundle_capabilities  force  row level security;
alter table barberos.shops                enable row level security;
alter table barberos.shops                force  row level security;
alter table barberos.tenant_capabilities  enable row level security;
alter table barberos.tenant_capabilities  force  row level security;

-- The catalog, its prerequisites and the bundles are a shared vocabulary, not
-- tenant data: readable by any authenticated context, writable by migration only.
drop policy if exists capabilities_select on barberos.capabilities;
create policy capabilities_select on barberos.capabilities
  for select to authenticated using (true);
drop policy if exists capability_requires_select on barberos.capability_requires;
create policy capability_requires_select on barberos.capability_requires
  for select to authenticated using (true);
drop policy if exists bundles_select on barberos.bundles;
create policy bundles_select on barberos.bundles
  for select to authenticated using (true);
drop policy if exists bundle_capabilities_select on barberos.bundle_capabilities;
create policy bundle_capabilities_select on barberos.bundle_capabilities
  for select to authenticated using (true);

-- Shop rows and toggles are the shop's own. Tenant isolation is the whole
-- point: a shop must never see another shop's configuration.
drop policy if exists shops_select on barberos.shops;
create policy shops_select on barberos.shops for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.shop.read')
         or identity.is_platform_admin());

drop policy if exists tenant_capabilities_select on barberos.tenant_capabilities;
create policy tenant_capabilities_select on barberos.tenant_capabilities
  for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.shop.read')
         or identity.is_platform_admin());

-- SELECT only, everywhere. Every write goes through a SECURITY DEFINER
-- function that checks a permission first.
grant select on barberos.capabilities, barberos.capability_requires,
                barberos.bundles, barberos.bundle_capabilities,
                barberos.shops, barberos.tenant_capabilities
  to authenticated;

-- ===========================================================================
-- Write paths
-- ===========================================================================

create or replace function barberos.upsert_shop(
  p_tenant uuid, p_shop_name text, p_chair_count integer default 1,
  p_timezone text default 'America/New_York', p_origin_prospect uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'barberos.shop.manage') then
    raise exception 'insufficient privilege to configure a barbershop'
      using errcode = 'insufficient_privilege';
  end if;
  insert into barberos.shops (tenant_id, shop_name, chair_count, timezone, origin_prospect_id)
  values (p_tenant, p_shop_name, coalesce(p_chair_count, 1),
          coalesce(p_timezone, 'America/New_York'), p_origin_prospect)
  on conflict (tenant_id) do update
    set shop_name          = excluded.shop_name,
        chair_count        = excluded.chair_count,
        timezone           = excluded.timezone,
        origin_prospect_id = coalesce(excluded.origin_prospect_id, barberos.shops.origin_prospect_id),
        updated_at         = now();
  return p_tenant;
end; $$;
revoke all on function barberos.upsert_shop(uuid, text, integer, text, uuid) from public, anon;
grant execute on function barberos.upsert_shop(uuid, text, integer, text, uuid) to authenticated;

-- Enabling a capability. The status check is the payments deferral, made real.
create or replace function barberos.enable_capability(
  p_tenant uuid, p_capability extensions.citext,
  p_via barberos.enablement_source default 'individual',
  p_bundle extensions.citext default null,
  p_config jsonb default '{}'::jsonb,
  p_source_ref text default null)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
revoke all on function barberos.enable_capability(uuid, extensions.citext, barberos.enablement_source, extensions.citext, jsonb, text) from public, anon;
grant execute on function barberos.enable_capability(uuid, extensions.citext, barberos.enablement_source, extensions.citext, jsonb, text) to authenticated;

create or replace function barberos.disable_capability(
  p_tenant uuid, p_capability extensions.citext)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
revoke all on function barberos.disable_capability(uuid, extensions.citext) from public, anon;
grant execute on function barberos.disable_capability(uuid, extensions.citext) to authenticated;

-- The gate every future capability module will sit behind. It exists now, with
-- nothing behind it yet, so that no module ever ships without one.
create or replace function barberos.is_enabled(
  p_tenant uuid, p_capability extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from barberos.tenant_capabilities tc
     where tc.tenant_id = p_tenant and tc.capability_key = p_capability);
$$;
comment on function barberos.is_enabled(uuid, extensions.citext) is
  'The single capability gate. No BarberOS feature logic exists yet -- this ships first so that none ever ships without a gate.';
revoke all on function barberos.is_enabled(uuid, extensions.citext) from public, anon;
grant execute on function barberos.is_enabled(uuid, extensions.citext) to authenticated;

-- Enable a whole bundle, in prerequisite order. Returns how many turned on.
create or replace function barberos.apply_bundle(
  p_tenant uuid, p_bundle extensions.citext)
returns integer language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
revoke all on function barberos.apply_bundle(uuid, extensions.citext) from public, anon;
grant execute on function barberos.apply_bundle(uuid, extensions.citext) to authenticated;

-- ===========================================================================
-- Seed: the v1 candidate module set
--
-- Statuses are the honest ones as of this migration. NOTHING here is
-- 'available' because nothing here is BUILT: this file ships the toggle, not
-- the modules. Each module's own migration promotes its row to 'available' in
-- the same commit that makes it work. That is why `is_default` and
-- `capabilities_default_must_be_available` are both here — the day booking
-- ships, its row becomes available and defaultable together, and until then a
-- proposal cannot promise it as live.
-- ===========================================================================
insert into barberos.capabilities (key, name, category, description, status, is_default, locked_config_keys) values
  ('client_crm', 'Client CRM', 'core',
   'Visit history, preferences and notes per client. Foundation for retention and rebooking.',
   'planned', false, '{}'),
  ('booking', 'Booking & Scheduling', 'core',
   'Appointment booking with staff and chair assignment.',
   'planned', false, '{}'),
  ('walkin_queue', 'Walk-in Queue & Virtual Wait', 'core',
   'Digital line, estimated wait, and a "you''re next" SMS. The BarberOS differentiator.',
   'planned', false, '{}'),
  ('review_engine', 'Review Engine', 'growth',
   'Automated review requests. EVERY customer is asked; timing is the only variable.',
   'planned', false,
   -- Non-negotiable #5, as a constraint rather than a paragraph. Any config
   -- key that would let a tenant decide WHO gets asked is refused outright.
   '{min_rating,gate_by_sentiment,suppress_below,ask_only_if_happy,predicted_sentiment_threshold}'),
  ('missed_call_capture', 'Missed-Call Capture', 'growth',
   'Text-back on a missed call, with AI-answered routine questions.',
   'planned', false, '{}'),
  ('owned_website', 'Owned Website / Landing Page', 'presence',
   'Replaces or upgrades a booking-platform-hosted page. Direct answer to what the audit finds missing.',
   'planned', false, '{}'),
  ('reporting_dashboard', 'Reporting Dashboard', 'insight',
   'Owner-facing bookings, no-show rate, review velocity and revenue signal. Read-only.',
   'planned', false, '{}'),
  ('staff_management', 'Multi-chair / Staff Management', 'core',
   'Multiple barbers per shop with individual schedules and queues.',
   'planned', false, '{}'),
  ('payments', 'Payments', 'commerce',
   'Deferred. PCI and compliance weight is real and is not taken on until the core modules are proven.',
   'deferred', false, '{}')
on conflict (key) do nothing;

insert into barberos.capability_requires (capability_key, requires_key, reason) values
  ('booking',             'client_crm',       'An appointment belongs to a client record.'),
  ('walkin_queue',        'client_crm',       'A place in line belongs to a person, not a name on a screen.'),
  ('review_engine',       'client_crm',       'A review request is sent to a known client after a known visit.'),
  ('reporting_dashboard', 'booking',          'There is nothing honest to report before there are bookings to report on.'),
  ('staff_management',    'booking',          'Per-barber schedules only mean something once there are appointments to schedule.')
on conflict do nothing;

insert into barberos.bundles (key, name, description, display_order) values
  ('starter', 'Starter',
   'The smallest set that changes a shop''s day: client records, booking and the review engine.', 1),
  ('growth', 'Growth',
   'Starter plus the walk-in queue, missed-call capture and an owned web presence.', 2),
  ('full', 'Full',
   'Every shipped capability, including multi-chair staff management and reporting.', 3)
on conflict (key) do nothing;

insert into barberos.bundle_capabilities (bundle_key, capability_key) values
  ('starter','client_crm'), ('starter','booking'), ('starter','review_engine'),
  ('growth','client_crm'),  ('growth','booking'),  ('growth','review_engine'),
  ('growth','walkin_queue'),('growth','missed_call_capture'), ('growth','owned_website'),
  ('full','client_crm'),    ('full','booking'),    ('full','review_engine'),
  ('full','walkin_queue'),  ('full','missed_call_capture'),   ('full','owned_website'),
  ('full','staff_management'), ('full','reporting_dashboard')
on conflict do nothing;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('barberos.shop.read',         'Read a barbershop''s BarberOS configuration and enabled capabilities.', 'tenant'),
  ('barberos.shop.manage',       'Create and configure the barbershop record.', 'tenant'),
  ('barberos.capability.manage', 'Turn BarberOS capabilities on and off for the shop.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','barberos.shop.read'),  ('tenant_owner','barberos.shop.manage'),
  ('tenant_owner','barberos.capability.manage'),
  ('tenant_admin','barberos.shop.read'),  ('tenant_admin','barberos.shop.manage'),
  ('tenant_admin','barberos.capability.manage'),
  ('manager','barberos.shop.read'),
  ('staff','barberos.shop.read'),
  ('viewer','barberos.shop.read')
on conflict do nothing;
-- Deliberate: a `manager` may see the shop's configuration but not change what
-- the shop is paying for. Turning a capability on is a commercial act.
