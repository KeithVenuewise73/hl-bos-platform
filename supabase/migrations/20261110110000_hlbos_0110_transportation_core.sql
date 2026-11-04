-- ===========================================================================
-- hlbos_0110_transportation_core — HSCS TransportationOS Release 1: data model,
-- module catalog, packages, permissions.
--
-- OWN schema (`transportation`) for operational data. Identity, tenancy, roles,
-- entitlements, audit, events and communications are the shared HL-BOS ones.
-- The legacy `fleet` schema (production FleetHuddle, SECURITY DEFINER fleet.api) is
-- NOT touched: promoting/porting it is a separate, approved step.
--
-- Direct table access is granted to NO API role. Every read and write goes through the
-- gated RPCs in 0111, which check module licence AND permission AND tenant.
--
-- rollback: DROP SCHEMA transportation CASCADE; then delete the trans.* rows from
--   entitlements.packages, entitlements.modules, identity.role_permissions, identity.permissions.
-- ===========================================================================
create schema if not exists transportation;
comment on schema transportation is 'HSCS TransportationOS operational data. NOT exposed via PostgREST; access via gated RPCs only.';
revoke all on schema transportation from public, anon, authenticated;
grant usage on schema transportation to authenticated;
alter default privileges in schema transportation revoke all on tables from public;
alter default privileges in schema transportation revoke all on functions from public;

do $$ begin create type transportation.vehicle_status as enum ('in_service','restricted','out_of_service'); exception when duplicate_object then null; end $$;
do $$ begin create type transportation.inspection_kind as enum ('pre_trip','post_trip'); exception when duplicate_object then null; end $$;
do $$ begin create type transportation.item_status as enum ('ok','defect','na'); exception when duplicate_object then null; end $$;
do $$ begin create type transportation.defect_severity as enum ('minor','major','critical'); exception when duplicate_object then null; end $$;
do $$ begin create type transportation.defect_status as enum ('open','in_repair','resolved'); exception when duplicate_object then null; end $$;

create table if not exists transportation.vehicles (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  unit_number text not null check (length(btrim(unit_number)) between 1 and 30),
  vin         text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  make        text, model text,
  model_year  integer check (model_year is null or model_year between 1980 and 2100),
  plate       text,
  status      transportation.vehicle_status not null default 'in_service',
  odometer    integer not null default 0 check (odometer >= 0),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  constraint vehicles_unit_unique unique (tenant_id, unit_number),
  constraint vehicles_id_tenant_unique unique (id, tenant_id)
);

create table if not exists transportation.drivers (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null check (length(btrim(display_name)) > 0),
  license_class text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint drivers_user_unique unique (tenant_id, user_id),
  constraint drivers_id_tenant_unique unique (id, tenant_id)
);

create table if not exists transportation.vehicle_assignments (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  vehicle_id  uuid not null,
  driver_id   uuid not null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  foreign key (vehicle_id, tenant_id) references transportation.vehicles (id, tenant_id) on delete cascade,
  foreign key (driver_id,  tenant_id) references transportation.drivers  (id, tenant_id) on delete cascade
);
create unique index if not exists assignments_one_active_per_vehicle on transportation.vehicle_assignments (vehicle_id) where released_at is null;
create unique index if not exists assignments_one_active_per_driver  on transportation.vehicle_assignments (driver_id)  where released_at is null;

create table if not exists transportation.inspections (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  vehicle_id           uuid not null,
  driver_id            uuid not null,
  kind                 transportation.inspection_kind not null,
  odometer             integer check (odometer is null or odometer >= 0),
  result               text not null check (result in ('pass','defects_found')),
  client_submission_id text not null check (length(client_submission_id) between 8 and 64),
  submitted_at         timestamptz not null default now(),
  foreign key (vehicle_id, tenant_id) references transportation.vehicles (id, tenant_id) on delete cascade,
  foreign key (driver_id,  tenant_id) references transportation.drivers  (id, tenant_id) on delete cascade,
  constraint inspections_idempotent unique (tenant_id, driver_id, client_submission_id),
  constraint inspections_id_tenant_unique unique (id, tenant_id)
);
create index if not exists inspections_vehicle_idx on transportation.inspections (vehicle_id, submitted_at desc);

create table if not exists transportation.inspection_items (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  inspection_id uuid not null,
  item_key      text not null check (item_key ~ '^[a-z0-9_]{2,40}$'),
  status        transportation.item_status not null,
  note          text,
  foreign key (inspection_id, tenant_id) references transportation.inspections (id, tenant_id) on delete cascade,
  constraint inspection_items_unique unique (inspection_id, item_key)
);

create table if not exists transportation.defects (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  vehicle_id    uuid not null,
  inspection_id uuid,
  item_key      text not null check (item_key ~ '^[a-z0-9_]{2,40}$'),
  severity      transportation.defect_severity not null,
  description   text not null check (length(btrim(description)) > 0),
  status        transportation.defect_status not null default 'open',
  reported_by   uuid references auth.users(id) on delete set null,
  reported_at   timestamptz not null default now(),
  resolved_at   timestamptz,
  foreign key (vehicle_id, tenant_id) references transportation.vehicles (id, tenant_id) on delete cascade,
  foreign key (inspection_id, tenant_id) references transportation.inspections (id, tenant_id) on delete set null (inspection_id),
  constraint defects_resolved_consistent check ((status = 'resolved') = (resolved_at is not null)),
  constraint defects_id_tenant_unique unique (id, tenant_id)
);
create index if not exists defects_vehicle_open_idx on transportation.defects (vehicle_id) where status <> 'resolved';

create table if not exists transportation.corrective_actions (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  defect_id    uuid not null,
  action       text not null check (length(btrim(action)) > 0),
  resolves     boolean not null default false,
  performed_by uuid references auth.users(id) on delete set null,
  performed_at timestamptz not null default now(),
  foreign key (defect_id, tenant_id) references transportation.defects (id, tenant_id) on delete cascade
);

-- RLS on, forced, NO policies and NO grants: the gated RPCs (SECURITY DEFINER, owner) are the only path.
do $$ declare t text; begin
  foreach t in array array['vehicles','drivers','vehicle_assignments','inspections','inspection_items','defects','corrective_actions'] loop
    execute format('alter table transportation.%I enable row level security', t);
    execute format('alter table transportation.%I force row level security', t);
    execute format('create policy %I on transportation.%I for all to postgres using (true) with check (true)', t || '_owner', t);
    execute format('create trigger %I after insert or update or delete on transportation.%I for each row execute function audit.emit()', t || '_audit', t);
  end loop;
end $$;

-- --- Permissions (tenant scope) ----------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('trans.fleet.read',     'View vehicles, assignments, inspection status and defects.', 'tenant'),
  ('trans.fleet.manage',   'Create vehicles and assign drivers to vehicles.', 'tenant'),
  ('trans.driver.manage',  'Register drivers.', 'tenant'),
  ('trans.dvir.create',    'Submit vehicle inspections and report defects (drivers).', 'tenant'),
  ('trans.defect.manage',  'Record corrective actions and resolve defects.', 'tenant')
on conflict (key) do nothing;
insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','trans.fleet.read'),('tenant_owner','trans.fleet.manage'),('tenant_owner','trans.driver.manage'),('tenant_owner','trans.defect.manage'),
  ('tenant_admin','trans.fleet.read'),('tenant_admin','trans.fleet.manage'),('tenant_admin','trans.driver.manage'),('tenant_admin','trans.defect.manage'),
  ('manager','trans.fleet.read'),('manager','trans.fleet.manage'),('manager','trans.driver.manage'),('manager','trans.defect.manage'),
  ('viewer','trans.fleet.read'),
  ('staff','trans.dvir.create')                 -- "staff" is the driver role in a transportation tenant
on conflict do nothing;

-- --- Module catalog (13 rows; only those with a backend in Release 1 can be licensed) ---
insert into entitlements.modules (module_key, product, name, description, requires, usage_limits) values
  ('trans.core',            'transportationos', 'Records foundation',     'Vehicle and driver records. Included in every package.', '{}', '{}'),
  ('trans.fleet',           'transportationos', 'Fleet Management',       'Fleet overview, driver-to-vehicle assignment.', '{trans.core}', '{}'),
  ('trans.dvir',            'transportationos', 'Digital DVIR',           'Driver inspections, defect reporting, corrective action.', '{trans.core}', '{}'),
  ('trans.maintenance',     'transportationos', 'Maintenance Management', 'Maintenance visibility from defect history (Release 1: read-only visibility).', '{trans.core,trans.dvir}', '{}'),
  ('trans.drivers',         'transportationos', 'Driver Management',      'Driver roster (Release 1: registration within trans.core).', '{trans.core}', '{"status":"planned"}'),
  ('trans.dispatch',        'transportationos', 'Dispatch Management',    '[planned]', '{trans.core}', '{"status":"planned"}'),
  ('trans.routes',          'transportationos', 'Route Management',      '[planned]', '{trans.dispatch}', '{"status":"planned"}'),
  ('trans.driver_app',      'transportationos', 'Driver Mobile App',      '[planned] Release 1 ships DVIR RPCs; a native app is not built.', '{trans.core,trans.dvir}', '{"status":"planned"}'),
  ('trans.kpi',             'transportationos', 'Driver KPI Scorecards',  '[planned]', '{trans.core}', '{"status":"planned"}'),
  ('trans.profitability',   'transportationos', 'Truck Profitability',    '[planned]', '{trans.core}', '{"status":"planned"}'),
  ('trans.dashboard',       'transportationos', 'Executive Dashboard',    '[planned]', '{trans.fleet}', '{"status":"planned"}'),
  ('trans.customer_portal', 'transportationos', 'Customer Portal',        '[planned]', '{trans.dispatch}', '{"status":"planned"}'),
  ('trans.automation',      'transportationos', 'Notifications and Automation', '[planned]', '{trans.core}', '{"status":"planned"}')
on conflict (module_key) do nothing;

insert into entitlements.packages (package_key, product, name, modules) values
  ('trans_dvir_only',         'transportationos', 'DVIR Only',          '{trans.core,trans.dvir}'),
  ('trans_fleet_management',  'transportationos', 'Fleet Management',   '{trans.core,trans.fleet}'),
  ('trans_fleet_dvir',        'transportationos', 'Fleet + DVIR',       '{trans.core,trans.fleet,trans.dvir}'),
  ('trans_fleet_maintenance', 'transportationos', 'Fleet + Maintenance','{trans.core,trans.fleet,trans.dvir,trans.maintenance}')
on conflict (package_key) do nothing;
