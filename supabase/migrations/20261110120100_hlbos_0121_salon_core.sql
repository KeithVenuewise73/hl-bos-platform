-- ===========================================================================
-- hlbos_0121_salon_core — HLG SalonOS Release 1: data model, module catalog, packages,
-- permissions, notification templates. Shared HL-BOS identity/tenancy/entitlements/comms.
-- Direct table access is granted to NO API role; gated RPCs in 0122 are the only path.
-- rollback: DROP SCHEMA salon CASCADE; delete salon.* rows from entitlements.packages/modules,
--   identity.role_permissions/permissions and the salon_* comms templates.
-- ===========================================================================
create schema if not exists salon;
comment on schema salon is 'HLG SalonOS operational data. NOT exposed via PostgREST; access via gated RPCs only.';
revoke all on schema salon from public, anon, authenticated;
grant usage on schema salon to authenticated;
alter default privileges in schema salon revoke all on tables from public;
alter default privileges in schema salon revoke all on functions from public;

do $$ begin create type salon.operating_model as enum ('employee','chair_rental','mixed'); exception when duplicate_object then null; end $$;
do $$ begin create type salon.stylist_model as enum ('employee','chair_rental'); exception when duplicate_object then null; end $$;
do $$ begin create type salon.appointment_status as enum ('booked','cancelled','completed','no_show'); exception when duplicate_object then null; end $$;

create table if not exists salon.settings (
  tenant_id       uuid primary key references platform.tenants(id) on delete cascade,
  display_name    text not null check (length(btrim(display_name)) > 0),
  operating_model salon.operating_model not null default 'employee',
  timezone        text not null default 'America/New_York',
  branding        jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);
create table if not exists salon.services (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  duration_min integer not null check (duration_min between 5 and 480),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint services_name_unique unique (tenant_id, name),
  constraint services_id_tenant_unique unique (id, tenant_id)
);
create table if not exists salon.stylists (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) > 0),
  model salon.stylist_model not null default 'employee',
  chair_rent_cents integer not null default 0 check (chair_rent_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint stylists_id_tenant_unique unique (id, tenant_id)
);
create unique index if not exists stylists_user_unique on salon.stylists (tenant_id, user_id) where user_id is not null;
create table if not exists salon.stylist_services (
  tenant_id uuid not null, stylist_id uuid not null, service_id uuid not null,
  primary key (stylist_id, service_id),
  foreign key (stylist_id, tenant_id) references salon.stylists (id, tenant_id) on delete cascade,
  foreign key (service_id, tenant_id) references salon.services (id, tenant_id) on delete cascade
);
create table if not exists salon.availability (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null, stylist_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday, local to the salon timezone
  start_time time not null, end_time time not null,
  check (start_time < end_time),
  foreign key (stylist_id, tenant_id) references salon.stylists (id, tenant_id) on delete cascade
);
create table if not exists salon.customers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  email extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_contact_required check (email is not null or phone is not null),
  constraint customers_id_tenant_unique unique (id, tenant_id)
);
create unique index if not exists customers_email_unique on salon.customers (tenant_id, email) where email is not null;
create unique index if not exists customers_phone_unique on salon.customers (tenant_id, phone) where phone is not null;
create table if not exists salon.appointments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null, customer_id uuid not null, stylist_id uuid not null, service_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status salon.appointment_status not null default 'booked',
  price_cents integer not null check (price_cents >= 0),     -- snapshot at booking time
  idempotency_key text,
  cancel_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  foreign key (customer_id, tenant_id) references salon.customers (id, tenant_id) on delete restrict,
  foreign key (stylist_id,  tenant_id) references salon.stylists  (id, tenant_id) on delete restrict,
  foreign key (service_id,  tenant_id) references salon.services  (id, tenant_id) on delete restrict,
  constraint appointments_idempotent unique (tenant_id, idempotency_key),
  constraint appointments_no_double_booking exclude using gist
    (stylist_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'booked')
);
create index if not exists appointments_tenant_time_idx on salon.appointments (tenant_id, starts_at);
create index if not exists appointments_customer_idx on salon.appointments (customer_id, starts_at desc);
create table if not exists salon.campaigns (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  body text not null,
  status text not null default 'draft' check (status = 'draft'),   -- Release 1 creates drafts only; nothing is ever sent
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['settings','services','stylists','stylist_services','availability','customers','appointments','campaigns'] loop
    execute format('alter table salon.%I enable row level security', t);
    execute format('alter table salon.%I force row level security', t);
    execute format('create policy %I on salon.%I for all to postgres using (true) with check (true)', t || '_owner', t);
  end loop;
  foreach t in array array['services','stylists','customers','appointments','campaigns'] loop
    execute format('create trigger %I after insert or update or delete on salon.%I for each row execute function audit.emit()', t || '_audit', t);
  end loop;
end $$;

insert into identity.permissions (key, description, scope) values
  ('salon.settings.manage',    'Configure the salon (name, operating model, branding).', 'tenant'),
  ('salon.catalog.manage',     'Manage services, stylists and any stylist''s availability.', 'tenant'),
  ('salon.availability.update','Update OWN availability (chair-rental stylists).', 'tenant'),
  ('salon.appointment.create', 'Book appointments.', 'tenant'),
  ('salon.appointment.manage', 'View and change any appointment.', 'tenant'),
  ('salon.appointment.update', 'View and change OWN appointments.', 'tenant'),
  ('salon.customer.manage',    'Create and edit customer records.', 'tenant'),
  ('salon.customer.read',      'View customer records and history.', 'tenant'),
  ('salon.report.read',        'View the owner dashboard and analytics.', 'tenant'),
  ('salon.campaign.manage',    'Draft customer campaigns.', 'tenant')
on conflict (key) do nothing;
insert into identity.role_permissions (role_key, permission_key)
select r, p from unnest(array['tenant_owner','tenant_admin']) r,
  unnest(array['salon.settings.manage','salon.catalog.manage','salon.appointment.create','salon.appointment.manage','salon.customer.manage','salon.customer.read','salon.report.read','salon.campaign.manage']) p
on conflict do nothing;
insert into identity.role_permissions (role_key, permission_key) values
  ('manager','salon.catalog.manage'),('manager','salon.appointment.create'),('manager','salon.appointment.manage'),('manager','salon.customer.manage'),('manager','salon.customer.read'),('manager','salon.report.read'),
  ('staff','salon.availability.update'),('staff','salon.appointment.create'),('staff','salon.appointment.update'),('staff','salon.customer.read'),
  ('service_account','salon.appointment.create')       -- the public booking site acts through a service-account membership
on conflict do nothing;

insert into entitlements.modules (module_key, product, name, description, requires, usage_limits) values
  ('salon.core',          'salonos', 'Salon Foundation',      'Settings, services, stylist and customer records. Included in every package.', '{}', '{}'),
  ('salon.stylists',      'salonos', 'Stylist and Chair Management', 'Stylist profiles, availability, employee / chair-rental configuration.', '{salon.core}', '{}'),
  ('salon.booking',       'salonos', 'Online Booking',        'Availability, booking, rescheduling, cancellation.', '{salon.core,salon.stylists}', '{}'),
  ('salon.crm',           'salonos', 'Customer CRM',          'Customer profiles and visit history.', '{salon.core}', '{}'),
  ('salon.notifications', 'salonos', 'SMS/Email Notifications','Queues booking / reschedule / cancellation notices (mock transport in development).', '{salon.core,salon.crm}', '{}'),
  ('salon.dashboard',     'salonos', 'Owner Dashboard',       'Owner view of schedule load and revenue / chair rent.', '{salon.core,salon.booking}', '{}'),
  ('salon.analytics',     'salonos', 'Business Analytics',    'Service mix and cancellation analytics.', '{salon.core,salon.booking}', '{}'),
  ('salon.campaigns',     'salonos', 'Customer Campaigns',    'Draft campaigns (Release 1 never sends).', '{salon.crm,salon.notifications}', '{}'),
  ('salon.website',       'salonos', 'Salon Website',         '[planned] Existing apps/shop-pages code not yet integrated.', '{salon.core}', '{"status":"planned"}'),
  ('salon.reputation',    'salonos', 'Reputation Management', '[planned]', '{salon.core}', '{"status":"planned"}'),
  ('salon.payments',      'salonos', 'Payments and Billing',  '[planned] No live payment processing is authorized.', '{salon.core}', '{"status":"planned"}')
on conflict (module_key) do nothing;
insert into entitlements.packages (package_key, product, name, modules) values
  ('salon_booking',        'salonos', 'Booking',            '{salon.core,salon.stylists,salon.booking}'),
  ('salon_crm_notifications','salonos','CRM + Notifications','{salon.core,salon.crm,salon.notifications}'),
  ('salon_operations',     'salonos', 'Salon Operations',   '{salon.core,salon.stylists,salon.booking,salon.crm,salon.notifications,salon.dashboard}'),
  ('salon_complete',       'salonos', 'Complete SalonOS (built modules)', '{salon.core,salon.stylists,salon.booking,salon.crm,salon.notifications,salon.dashboard,salon.analytics,salon.campaigns}')
on conflict (package_key) do nothing;

insert into comms.templates (key, name, channel, module) values
  ('salon_booking_confirmed',   'Salon booking confirmed',   'email', 'salon'),
  ('salon_booking_rescheduled', 'Salon booking rescheduled', 'email', 'salon'),
  ('salon_booking_cancelled',   'Salon booking cancelled',   'email', 'salon')
on conflict (key) do nothing;
insert into comms.template_versions (template_key, version, subject, body, variables) values
  ('salon_booking_confirmed',   1, 'Your appointment is booked', 'Hi {{customer_name}}, you are booked for {{service}} with {{stylist}} on {{when}}.', '{customer_name,service,stylist,when}'),
  ('salon_booking_rescheduled', 1, 'Your appointment was moved', 'Hi {{customer_name}}, your {{service}} with {{stylist}} is now {{when}}.', '{customer_name,service,stylist,when}'),
  ('salon_booking_cancelled',   1, 'Your appointment was cancelled', 'Hi {{customer_name}}, your {{service}} with {{stylist}} on {{when}} was cancelled.', '{customer_name,service,stylist,when}')
on conflict do nothing;
