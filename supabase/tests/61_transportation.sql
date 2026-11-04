\ir _fixtures.sql.inc

-- ===========================================================================
-- TransportationOS Release 1 — workflows T1-T4 against a persistent schema, plus
-- authentication, tenant isolation, module entitlement, duplicate/invalid input and audit.
-- ===========================================================================
begin;
select plan(51);
select tests.seed();

-- extra synthetic people
insert into auth.users (id, email, email_confirmed_at) values
  (tests.uid('driver2_a'), 'driver2-a@example.test', now()),
  (tests.uid('owner_c'),   'owner-c@example.test',   now()),
  (tests.uid('driver_c'),  'driver-c@example.test',  now())
on conflict (id) do nothing;
insert into identity.memberships (id, tenant_id, user_id, status) values
  (tests.uid('m_driver2_a'), tests.uid('tenant_a'), tests.uid('driver2_a'), 'active');
insert into identity.membership_roles (membership_id, role_key) values (tests.uid('m_driver2_a'), 'staff');

-- licensing: A = Fleet + Maintenance, B = unlicensed, C = DVIR Only (provisioned in one call)
select tests.login_as(tests.uid('padmin'));
select is(entitlements.apply_package(tests.uid('tenant_a'), 'trans_fleet_maintenance'), 4, 'tenant A licensed: core, fleet, dvir, maintenance');
create temp table tc as select platform.provision_product_tenant('dvir-co', 'DVIR Co', 'trans_dvir_only', tests.uid('owner_c')) as id;
grant select on tc to public;
select tests.logout();
insert into identity.memberships (id, tenant_id, user_id, status) values
  (tests.uid('m_driver_c'), (select id from tc), tests.uid('driver_c'), 'active');
insert into identity.membership_roles (membership_id, role_key) values (tests.uid('m_driver_c'), 'staff');

-- ---------------------------------------------------------------- records
select tests.login_as(tests.uid('manager_a'));
create temp table v1 as select transportation.add_vehicle(tests.uid('tenant_a'), 'T-101', '1FTFW1ET5DFC10312', 'Ford', 'F-150', 2021, 'ABC123', 1000) as id;
create temp table v2 as select transportation.add_vehicle(tests.uid('tenant_a'), 'T-102', null, 'Freightliner', 'M2', 2020, 'XYZ789', 5000) as id;
grant select on v1, v2 to public;
select ok((select id from v1) is not null and (select id from v2) is not null, 'manager creates vehicles');
select throws_ok($$select transportation.add_vehicle(tests.uid('tenant_a'), 'T-101')$$, '23505', null, 'duplicate unit number is refused');
select throws_ok($$select transportation.add_vehicle(tests.uid('tenant_a'), 'T-103', 'NOTAVIN')$$, '23514', null, 'invalid VIN is refused');
create temp table d1 as select transportation.register_driver(tests.uid('tenant_a'), tests.uid('staff_a'), 'Sam Driver', 'CDL-A') as id;
create temp table d2 as select transportation.register_driver(tests.uid('tenant_a'), tests.uid('driver2_a'), 'Dee Driver') as id;
grant select on d1, d2 to public;
select ok((select id from d1) is not null, 'manager registers a driver');
select throws_ok($$select transportation.register_driver(tests.uid('tenant_a'), tests.uid('owner_b'), 'Not Ours')$$, '23503', null,
  'cannot register a user who is not a member of the tenant');
select ok(transportation.assign_vehicle(tests.uid('tenant_a'), (select id from v1), (select id from d1)) is not null, 'driver assigned to vehicle');
select ok(transportation.assign_vehicle(tests.uid('tenant_a'), (select id from v2), (select id from d1)) is not null, 're-assigning the driver is allowed');
select tests.logout();
select is((select count(*)::int from transportation.vehicle_assignments where released_at is null), 1, 'only one active assignment per driver (previous one released, history kept)');
select is((select count(*)::int from transportation.vehicle_assignments), 2, 'assignment history persists');
select tests.login_as(tests.uid('manager_a'));
select transportation.assign_vehicle(tests.uid('tenant_a'), (select id from v1), (select id from d1));
select tests.logout();

-- ---------------------------------------------------------------- T1: driver inspection
select tests.login_as(tests.uid('staff_a'));
select is(jsonb_array_length(transportation.driver_vehicles(tests.uid('tenant_a'))), 2, 'driver sees the tenant''s vehicles');
create temp table i1 as select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 1010,
  '[{"item_key":"brakes","status":"ok"},{"item_key":"lights","status":"ok"},{"item_key":"tires","status":"na"}]', 'client-0001-aaaa') as id;
grant select on i1 to public;
select ok((select id from i1) is not null, 'T1: driver submits a passing inspection');
select is(transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 1010,
  '[{"item_key":"brakes","status":"ok"}]', 'client-0001-aaaa'), (select id from i1), 'duplicate submission returns the original, no second record');
select throws_ok($$select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 1010, '[]', 'client-0002-bbbb')$$, '22023', null, 'empty checklist refused');
select throws_ok($$select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 1010, '[{"item_key":"brakes","status":"great"}]', 'client-0003-cccc')$$, '22023', null, 'unknown item status refused');
select throws_ok($$select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 1010, '[{"item_key":"brakes","status":"defect"}]', 'client-0004-dddd')$$, '22023', null, 'defect without severity/description refused');
select throws_ok($$select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 900, '[{"item_key":"brakes","status":"ok"}]', 'client-0005-eeee')$$, '22023', null, 'odometer rollback refused');
select throws_ok($$select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 1020, '[{"item_key":"brakes","status":"ok"},{"item_key":"brakes","status":"ok"}]', 'client-0006-ffff')$$, '22023', null, 'duplicate checklist item refused');
select throws_ok($$select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'pre_trip', 1020, '[{"item_key":"brakes","status":"ok"}]', 'short')$$, '22023', null, 'weak idempotency key refused');
select throws_ok($$select transportation.submit_inspection(tests.uid('tenant_a'), gen_random_uuid(), 'pre_trip', 1020, '[{"item_key":"brakes","status":"ok"}]', 'client-0007-gggg')$$, 'P0002', null, 'unknown vehicle refused');
select tests.logout();
select is((select count(*)::int from transportation.inspections), 1, 'rejected submissions wrote nothing');
select is((select count(*)::int from transportation.inspection_items), 3, 'inspection items persisted');
select is((select odometer from transportation.vehicles where id = (select id from v1)), 1010, 'odometer updated from the inspection');
select is((select status::text from transportation.vehicles where id = (select id from v1)), 'in_service', 'clean inspection leaves vehicle in service');

-- ---------------------------------------------------------------- T2: defect -> manager -> corrective action
select tests.login_as(tests.uid('staff_a'));
create temp table i2 as select transportation.submit_inspection(tests.uid('tenant_a'), (select id from v1), 'post_trip', 1090,
  '[{"item_key":"brakes","status":"defect","severity":"critical","note":"Soft pedal, pulls left"},{"item_key":"lights","status":"ok"}]', 'client-0008-hhhh') as id;
select tests.logout();
select is((select result from transportation.inspections where id = (select id from i2)), 'defects_found', 'inspection with a defect is recorded as defects_found');
select is((select status::text from transportation.vehicles where id = (select id from v1)), 'out_of_service', 'critical defect puts the vehicle out of service');
create temp table df as select id from transportation.defects limit 1;
grant select on df to public;
select tests.login_as(tests.uid('manager_a'));
select is(jsonb_array_length(transportation.list_defects(tests.uid('tenant_a'))), 1, 'T2: manager sees the unresolved defect');
create temp table ca1 as select transportation.record_corrective_action(tests.uid('tenant_a'), (select id from df), 'Brake pads and line replaced', false) as id;
select tests.logout();
select is((select status::text from transportation.defects where id = (select id from df)), 'in_repair', 'recording an action moves the defect to in_repair');
select is((select status::text from transportation.vehicles where id = (select id from v1)), 'out_of_service', 'vehicle stays out of service until the defect is resolved');
select tests.login_as(tests.uid('manager_a'));
select transportation.record_corrective_action(tests.uid('tenant_a'), (select id from df), 'Road tested, brake test passed', true);
select throws_ok($$select transportation.record_corrective_action(tests.uid('tenant_a'), (select id from df), 'again', true)$$, '22023', null, 'a resolved defect cannot be actioned again');
select is(jsonb_array_length(transportation.list_defects(tests.uid('tenant_a'), false) -> 0 -> 'actions'), 2, 'defect history keeps both corrective actions');
select is(jsonb_array_length(transportation.list_defects(tests.uid('tenant_a'), true)), 0, 'no unresolved defects remain');
select tests.logout();
select is((select status::text from transportation.vehicles where id = (select id from v1)), 'in_service', 'resolving the defect returns the vehicle to service');
select tests.login_as(tests.uid('staff_a'));
select transportation.report_defect(tests.uid('tenant_a'), (select id from v2), 'mirror', 'major', 'Left mirror cracked');
select tests.logout();
select is((select status::text from transportation.vehicles where id = (select id from v2)), 'restricted', 'a major defect restricts the vehicle');

-- ---------------------------------------------------------------- T3: fleet manager overview
select tests.login_as(tests.uid('manager_a'));
create temp table fo as select transportation.fleet_overview(tests.uid('tenant_a')) as j;
grant select on fo to public;
select tests.logout();
select is((select j -> 0 ->> 'assigned_driver' from fo), 'Sam Driver', 'T3: overview shows the assigned driver');
select is((select j -> 1 ->> 'open_defects' from fo), '1', 'T3: overview shows unresolved defects per vehicle');

-- ---------------------------------------------------------------- permissions and isolation
select tests.login_as(tests.uid('staff_a'));
select throws_ok($$select transportation.fleet_overview(tests.uid('tenant_a'))$$, '42501', null, 'a driver cannot open the manager overview');
select throws_ok($$select transportation.record_corrective_action(tests.uid('tenant_a'), gen_random_uuid(), 'x', true)$$, '42501', null, 'a driver cannot record corrective actions');
select tests.logout();
select tests.login_as_anon();
select throws_ok($$select transportation.driver_vehicles(tests.uid('tenant_a'))$$, '42501', null, 'anon is denied');
select tests.logout();
select tests.login_as(tests.uid('owner_b'));
select throws_ok($$select transportation.fleet_overview(tests.uid('tenant_a'))$$, '42501', null, 'another tenant''s owner cannot read tenant A');
select throws_ok($$select transportation.fleet_overview(tests.uid('tenant_b'))$$, '42501', null, 'an unlicensed tenant is refused even for its own owner');
select tests.logout();

-- ---------------------------------------------------------------- T4: DVIR-only tenant
select tests.login_as(tests.uid('owner_c'));
create temp table cv as select transportation.add_vehicle((select id from tc), 'C-1') as id;
select tests.logout();
select tests.login_as(tests.uid('owner_c'));
select transportation.register_driver((select id from tc), tests.uid('driver_c'), 'Cal Driver');
select tests.logout();
select tests.login_as(tests.uid('driver_c'));
select ok(transportation.submit_inspection((select id from tc), (select id from cv), 'pre_trip', 10, '[{"item_key":"horn","status":"ok"}]', 'client-c-000001') is not null, 'T4: DVIR-only tenant inspects a vehicle');
select tests.logout();
select tests.login_as(tests.uid('owner_c'));
select is(jsonb_array_length(transportation.dvir_board((select id from tc))), 1, 'T4: DVIR-only tenant sees its board');
select throws_ok($$select transportation.fleet_overview((select id from tc))$$, '42501', null, 'T4: fleet management is not licensed to a DVIR-only tenant');
select throws_ok($$select transportation.maintenance_overview((select id from tc))$$, '42501', null, 'T4: maintenance is not licensed to a DVIR-only tenant');
select tests.logout();

-- ---------------------------------------------------------------- deactivation keeps data
select tests.login_as(tests.uid('padmin'));
select entitlements.set_module_active(tests.uid('tenant_a'), 'trans.maintenance', false);
select entitlements.set_module_active(tests.uid('tenant_a'), 'trans.dvir', false);
select tests.logout();
select tests.login_as(tests.uid('staff_a'));
select throws_ok($$select transportation.driver_vehicles(tests.uid('tenant_a'))$$, '42501', null, 'switching DVIR off closes the driver workflow on the server');
select tests.logout();
select is((select count(*)::int from transportation.inspections where tenant_id = tests.uid('tenant_a')), 2, 'inspection history is intact while the module is off');
select ok((select count(*) from audit.events where resource_type like '%inspections%') >= 2, 'inspections were written to the audit log');
select ok((select count(*) from events.outbox where topic = 'transportation.inspection.submitted') >= 2, 'domain events were emitted');

-- direct table access is closed to every API role: the gated RPCs are the only path
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select * from transportation.vehicles$$, '42501', null, 'even a tenant owner cannot read tables directly');
select throws_ok($$delete from transportation.defects$$, '42501', null, 'defect history cannot be deleted through the API');
select tests.logout();

select * from finish();
rollback;
