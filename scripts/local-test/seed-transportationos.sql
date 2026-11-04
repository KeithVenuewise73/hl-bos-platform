-- ---------------------------------------------------------------------------
-- LOCAL TEST HARNESS ONLY. NOT A MIGRATION. NEVER APPLIED TO ANY SUPABASE
-- PROJECT. Run after scripts/local-test/tms-fleet-db.sh:
--
--   psql -h /tmp/tmspg -p 5434 -U postgres -d tms_fleet -f scripts/local-test/seed-transportationos.sql
--
-- SYNTHETIC data for the TransportationOS isolated environment. Every address
-- is on the reserved example.test domain. The shared demo password below is a
-- development fixture for a database that only exists on this computer, not
-- a secret.
--
-- Everything that can go through a real code path does:
--   licences  -> billing.apply_provider_event (the Stripe webhook path)
--   vehicles  -> public.hlg_fleet_rpc('save_fleet') as the manager
--   people    -> public.hlg_fleet_rpc('save_member') as the owner
--   a defect  -> public.hlg_fleet_rpc('submit_inspection') as the driver
-- Only identity rows (users, memberships, the service account) are inserted
-- directly; in production those come from sign-up and invitations.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
begin;

create temporary table seed_users (email text primary key, id uuid, company text, hlbos_role text, fleet_role text);
insert into seed_users (email, company, hlbos_role, fleet_role) values
  ('olivia@lakeshore.example.test', 'lakeshore', 'tenant_owner', 'owner'),
  ('morgan@lakeshore.example.test', 'lakeshore', 'manager',      'manager'),
  ('max@lakeshore.example.test',    'lakeshore', 'staff',        'maintenance'),
  ('dana@lakeshore.example.test',   'lakeshore', 'staff',        'driver'),
  ('devon@lakeshore.example.test',  'lakeshore', 'staff',        'driver'),
  ('sam@twotrucks.example.test',    'twotrucks', 'tenant_owner', 'owner'),
  ('riley@twotrucks.example.test',  'twotrucks', 'staff',        'driver');

with u as (
  insert into auth.users (email, email_confirmed_at, encrypted_password)
  select email, now(), extensions.crypt('tms-demo-2026', extensions.gen_salt('bf')) from seed_users
  returning id, email
) update seed_users s set id = u.id from u where u.email = s.email;

-- The billing / delivery service account.
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-4000-8000-00000000b111', 'billing-worker@hlbos.example.test', now());
insert into identity.platform_admins (user_id, role_key) values ('00000000-0000-4000-8000-00000000b111', 'platform_admin');

create temporary table seed_companies (key text primary key, id uuid, slug text, name text, plan text);
insert into seed_companies values
  ('lakeshore', '8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c', 'lakeshore-fuel', 'Lakeshore Fuel Delivery (synthetic)', 'tms_complete'),
  ('twotrucks', '3a9e7c1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c', 'two-trucks',     'Two Trucks Hauling (synthetic)',     'tms_dvir');

insert into platform.tenants (id, slug, name, status) select id, slug, name, 'active' from seed_companies;
insert into fleet.workspaces (id, name, bootstrap_owner_email)
select c.id, c.name, (select email from seed_users u where u.company = c.key and u.fleet_role = 'owner') from seed_companies c;

-- HL-BOS membership + fleet membership for every person (the two models are
-- separate today: finding S-2 in the security assessment).
with m as (
  insert into identity.memberships (tenant_id, user_id, status)
  select c.id, u.id, 'active' from seed_users u join seed_companies c on c.key = u.company
  returning id, tenant_id, user_id
)
insert into identity.membership_roles (membership_id, role_key)
select m.id, u.hlbos_role from m join seed_users u on u.id = m.user_id;
insert into fleet.members (workspace_id, user_id, role)
select c.id, u.id, u.fleet_role from seed_users u join seed_companies c on c.key = u.company;

-- Act as someone, the way PostgREST does.
create or replace function pg_temp.act(email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', coalesce((select id::text from seed_users where seed_users.email = act.email),
                                      '00000000-0000-4000-8000-00000000b111'), 'role', 'authenticated')::text, true)
$$;

-- Licences arrive the way they will from Stripe: as provider events.
select pg_temp.act('billing-worker@hlbos.example.test');
select billing.apply_provider_event('mock'::extensions.citext, 'seed-' || key, 'subscription.activated', id, plan::extensions.citext, now() + interval '1 month', ('seed-sub-' || key)::extensions.citext)
  from seed_companies;

-- Lakeshore's fleet.
select pg_temp.act('morgan@lakeshore.example.test');
select public.hlg_fleet_rpc('save_fleet', jsonb_build_object(
  'workspace', '8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c', 'revision', 0,
  'fleet', jsonb_build_object(
    'assets', jsonb_build_array(
      jsonb_build_object('id','T-101','name','Tanker 101','type','Tanker','tankConfig','3 compartments, 3,000 gal','status','Available','year',2019,'make','Synthetic','model','Tank truck','plate','TEST-101','vin','SYNTHETIC0000T101','registrationExpires',(current_date + 140)::text,'odometer',120400),
      jsonb_build_object('id','T-102','name','Tanker 102','type','Tanker','tankConfig','2 compartments, 2,500 gal','status','Available','year',2017,'make','Synthetic','model','Tank truck','plate','TEST-102','vin','SYNTHETIC0000T102','registrationExpires',(current_date + 21)::text,'odometer',188030),
      jsonb_build_object('id','T-104','name','Tanker 104','type','Tanker','tankConfig','1 compartment','status','Inactive','year',2012,'make','Synthetic','model','Tank truck','plate','TEST-104','vin','SYNTHETIC0000T104','registrationExpires',(current_date - 12)::text,'odometer',402115),
      jsonb_build_object('id','B-201','name','Box truck 201','type','Box truck','tankConfig','Not applicable','status','Available','year',2021,'make','Synthetic','model','Box 26ft','plate','TEST-201','vin','SYNTHETIC0000B201','registrationExpires',(current_date + 300)::text,'odometer',64000),
      jsonb_build_object('id','P-301','name','Pickup 301','type','Pickup','tankConfig','Not applicable','status','Available','year',2022,'make','Synthetic','model','Service pickup','plate','TEST-301','vin','SYNTHETIC0000P301','registrationExpires',(current_date + 200)::text,'odometer',31000)),
    'work', jsonb_build_array(jsonb_build_object('id','WO-1001','asset','B-201','title','Liftgate hydraulic seep','status','Open','cost',0,'opened',(current_date - 3)::text)),
    'fuel', '[]'::jsonb,
    'drivers', jsonb_build_array(
      jsonb_build_object('id','dana','name','Dana Driver','email','dana@lakeshore.example.test','licenseClass','CDL-A','endorsements','H, N, X','cdlExpires',(current_date + 410)::text,'medicalExpires',(current_date + 18)::text,'hired','2021-04-12'),
      jsonb_build_object('id','devon','name','Devon Driver','email','devon@lakeshore.example.test','licenseClass','CDL-B','endorsements','','cdlExpires',(current_date - 5)::text,'medicalExpires',(current_date + 220)::text,'hired','2023-09-01')),
    'driverEvents', '[]'::jsonb)));

select pg_temp.act('olivia@lakeshore.example.test');
select public.hlg_fleet_rpc('save_member', jsonb_build_object('workspace','8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c','email','dana@lakeshore.example.test','role','driver','active',true,'units',jsonb_build_array('T-101','T-102')));
select public.hlg_fleet_rpc('save_member', jsonb_build_object('workspace','8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c','email','devon@lakeshore.example.test','role','driver','active',true,'units',jsonb_build_array('B-201')));

-- One open defect, reported yesterday evening by the driver herself.
select pg_temp.act('dana@lakeshore.example.test');
select public.hlg_fleet_rpc('submit_inspection', jsonb_build_object('workspace','8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c','report', jsonb_build_object(
  'id', 'DV-' || gen_random_uuid(), 'asset', 'T-102', 'phase', 'End-of-day', 'odometer', 188030,
  'inspectedAt', (now() - interval '20 hours')::text, 'driver', 'Dana Driver', 'signature', 'Dana Driver', 'consent', true,
  'checks', (select jsonb_agg(case when i = 'Hoses / delivery equipment'
                                   then jsonb_build_object('item', i, 'result', 'Defect', 'level', 2, 'note', 'Delivery hose abraded near reel, weeping at coupling (SYNTHETIC)')
                                   else jsonb_build_object('item', i, 'result', 'Pass') end)
             from unnest(array['Service brakes / connections','Parking brake','Steering','Lights / reflectors','Tires','Horn','Windshield wipers','Mirrors','Coupling devices','Wheels / rims','Emergency equipment','Tank / fittings / leaks','Valves / caps / closures','Hoses / delivery equipment','Placards / markings','Emergency shutoff']) i))));

-- Two Trucks: DVIR only.
select pg_temp.act('sam@twotrucks.example.test');
select public.hlg_fleet_rpc('save_fleet', jsonb_build_object('workspace','3a9e7c1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c','revision',0,'fleet', jsonb_build_object(
  'assets', jsonb_build_array(
    jsonb_build_object('id','TT-1','name','Truck 1','type','Box truck','tankConfig','Not applicable','status','Available'),
    jsonb_build_object('id','TT-2','name','Truck 2','type','Flatbed','tankConfig','Not applicable','status','Available')),
  'work','[]'::jsonb,'fuel','[]'::jsonb,'drivers','[]'::jsonb,'driverEvents','[]'::jsonb)));
select public.hlg_fleet_rpc('save_member', jsonb_build_object('workspace','3a9e7c1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c','email','riley@twotrucks.example.test','role','driver','active',true,'units',jsonb_build_array('TT-1')));

commit;
select 'seeded: ' || (select count(*) from fleet.units) || ' vehicles, ' || (select count(*) from fleet.inspections) || ' inspection, '
       || (select count(*) from billing.subscriptions where status = 'active') || ' active subscriptions' as result;
