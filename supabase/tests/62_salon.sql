\ir _fixtures.sql.inc

-- ===========================================================================
-- SalonOS Release 1 — workflows S1-S5 against a persistent schema: booking, availability,
-- double-booking prevention, reschedule/cancel + queued notifications, CRM identity, employee vs
-- chair-rental behaviour, tenant isolation, module entitlements.
-- ===========================================================================
begin;
select plan(67);
select tests.seed();

insert into auth.users (id, email, email_confirmed_at) values
  (tests.uid('stylist2_a'), 'stylist2-a@example.test', now()),
  (tests.uid('owner_c'),    'owner-c@example.test',    now()),
  (tests.uid('renter1_c'),  'renter1-c@example.test',  now()),
  (tests.uid('renter2_c'),  'renter2-c@example.test',  now())
on conflict (id) do nothing;
insert into identity.memberships (id, tenant_id, user_id, status) values
  (tests.uid('m_stylist2_a'), tests.uid('tenant_a'), tests.uid('stylist2_a'), 'active');
insert into identity.membership_roles (membership_id, role_key) values (tests.uid('m_stylist2_a'), 'staff');

-- next Monday, at least a week out (salon-local calendar)
create temp table p as select (current_date + 7 + ((8 - extract(dow from current_date)::int) % 7))::date as day;
grant select on p to public;
create or replace function pg_temp.at(p_time text) returns timestamptz language sql stable as $$ select ((select day from p) + p_time::time) at time zone 'America/New_York' $$;
grant execute on function pg_temp.at(text) to public;

-- licensing
select tests.login_as(tests.uid('padmin'));
select entitlements.apply_package(tests.uid('tenant_a'), 'salon_operations');
select entitlements.apply_package(tests.uid('tenant_b'), 'salon_booking');
create temp table tc as select platform.provision_product_tenant('chair-co', 'Chair Co', 'salon_operations', tests.uid('owner_c')) as id;
grant select on tc to public;
select tests.logout();
insert into identity.memberships (id, tenant_id, user_id, status) values
  (tests.uid('m_r1'), (select id from tc), tests.uid('renter1_c'), 'active'),
  (tests.uid('m_r2'), (select id from tc), tests.uid('renter2_c'), 'active');
insert into identity.membership_roles (membership_id, role_key) values (tests.uid('m_r1'), 'staff'), (tests.uid('m_r2'), 'staff');

-- ------------------------------------------------------------ setup (employee salon)
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$select salon.configure_salon(tests.uid('tenant_a'), 'Canvas Test Salon', 'employee')$$, 'owner configures the salon');
select throws_ok($$select salon.configure_salon(tests.uid('tenant_a'), 'X', 'employee', 'Mars/Phobos')$$, '22023', null, 'unknown timezone refused');
create temp table sv as select salon.add_service(tests.uid('tenant_a'), 'Cut', 30, 4000) as cut, salon.add_service(tests.uid('tenant_a'), 'Color', 90, 12000) as color;
grant select on sv to public;
select throws_ok($$select salon.add_service(tests.uid('tenant_a'), 'Bad', 2, 100)$$, '23514', null, 'a 2-minute service is refused');
select throws_ok($$select salon.add_service(tests.uid('tenant_a'), 'Cut', 30, 4000)$$, '23505', null, 'duplicate service name refused');
select throws_ok($$select salon.add_stylist(tests.uid('tenant_a'), 'Renter', null, 'chair_rental', 30000)$$, '23514', null, 'a chair renter cannot join an employee salon');
select throws_ok($$select salon.add_stylist(tests.uid('tenant_a'), 'Emp', null, 'employee', 5000)$$, '23514', null, 'employees do not pay rent');
select throws_ok($$select salon.add_stylist(tests.uid('tenant_a'), 'Ghost', null, 'employee', 0, array[gen_random_uuid()])$$, 'P0002', null, 'unknown service refused');
create temp table st as select
  salon.add_stylist(tests.uid('tenant_a'), 'Ann', tests.uid('staff_a'), 'employee', 0, array[(select cut from sv), (select color from sv)]) as ann,
  salon.add_stylist(tests.uid('tenant_a'), 'Ben', tests.uid('stylist2_a'), 'employee', 0, array[(select cut from sv)]) as ben;
grant select on st to public;
select tests.logout();

select tests.login_as(tests.uid('staff_a'));
select throws_ok($$select salon.set_availability(tests.uid('tenant_a'), (select ann from st), '[{"weekday":1,"start":"09:00","end":"17:00"}]')$$, '42501', null,
  'S4: in an employee salon a stylist cannot set their own hours');
select throws_ok($$select salon.add_service(tests.uid('tenant_a'), 'Perm', 30, 1000)$$, '42501', null, 'a stylist cannot edit the catalog');
select tests.logout();
select tests.login_as(tests.uid('manager_a'));
select is(salon.set_availability(tests.uid('tenant_a'), (select ann from st), '[{"weekday":1,"start":"09:00","end":"17:00"}]'), 1, 'manager sets Ann''s Monday hours');
select is(salon.set_availability(tests.uid('tenant_a'), (select ben from st), '[{"weekday":1,"start":"09:00","end":"12:00"}]'), 1, 'manager sets Ben''s Monday hours');
select throws_ok($$select salon.set_availability(tests.uid('tenant_a'), (select ann from st), '[{"weekday":1,"start":"17:00","end":"09:00"}]')$$, '22023', null, 'backwards hours refused');
select tests.logout();

-- ------------------------------------------------------------ S1: service -> stylist -> times -> book
select tests.login_as(tests.uid('svc_a'));
select is(jsonb_array_length(salon.available_slots(tests.uid('tenant_a'), (select cut from sv), (select ann from st), (select day from p))), 31, 'S1: Ann has 31 start times for a 30-minute cut');
select is(jsonb_array_length(salon.available_slots(tests.uid('tenant_a'), (select color from sv), (select ann from st), (select day from p))), 27, 'service duration changes the available times (90-minute colour)');
select throws_ok($$select salon.available_slots(tests.uid('tenant_a'), (select color from sv), (select ben from st), (select day from p))$$, 'P0002', null, 'Ben does not offer colour');
create temp table b1 as select salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('10:00'), 'Cara Customer', 'cara@example.test', '5551230001', 'book-key-0001') as id;
grant select on b1 to public;
select ok((select id from b1) is not null, 'S1: customer books Ann at 10:00');
select is(salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('10:00'), 'Cara Customer', 'cara@example.test', '5551230001', 'book-key-0001'), (select id from b1), 'retrying with the same key does not double-book');
select is(jsonb_array_length(salon.available_slots(tests.uid('tenant_a'), (select cut from sv), (select ann from st), (select day from p))), 28, 'the booked time (and overlapping starts) disappear from the slots');
select throws_ok($$select salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('10:00'), 'Dan', 'dan@example.test', null, 'book-key-0002')$$, '23P01', null, 'double booking the same stylist and time is refused');
select throws_ok($$select salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('10:15'), 'Dan', 'dan@example.test', null, 'book-key-0003')$$, '23P01', null, 'an overlapping start is refused');
select ok(salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ben from st), pg_temp.at('10:00'), 'Dan', 'dan@example.test', null, 'book-key-0004') is not null, 'the same time with a different stylist is allowed');
select throws_ok($$select salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('18:00'), 'Eve', 'eve@example.test')$$, '22023', null, 'outside the stylist''s hours is refused');
select throws_ok($$select salon.book_appointment(tests.uid('tenant_a'), (select color from sv), (select ann from st), pg_temp.at('16:00'), 'Eve', 'eve@example.test')$$, '22023', null, 'a service that would run past closing is refused');
select throws_ok($$select salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), now() - interval '1 day', 'Eve', 'eve@example.test')$$, '22023', null, 'the past is refused');
select throws_ok($$select salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('14:00'), '', null)$$, '22023', null, 'a customer without a name/contact is refused');
select tests.logout();
select is((select count(*)::int from salon.appointments where tenant_id = tests.uid('tenant_a')), 2, 'only the two valid bookings persisted');

-- ------------------------------------------------------------ S3: customer identity + history
select tests.login_as(tests.uid('svc_a'));
create temp table b2 as select salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('13:00'), 'CARA CUSTOMER', 'CARA@example.test', null, 'book-key-0005') as id;
select tests.logout();
select is((select count(*)::int from salon.customers where tenant_id = tests.uid('tenant_a') and email = 'cara@example.test'), 1, 'S3: the same email is the same customer (case-insensitive), no duplicate record');
create temp table cara as select id from salon.customers where email = 'cara@example.test';
grant select on cara to public;
select tests.login_as(tests.uid('manager_a'));
select is(jsonb_array_length(salon.customer_history(tests.uid('tenant_a'), (select id from cara)) -> 'visits'), 2, 'S3: both visits stay attached to the customer');
select ok(salon.upsert_customer(tests.uid('tenant_a'), 'Cara Customer', 'cara@example.test', null, 'Prefers mornings') = (select id from cara), 'S3: updating a customer keeps the same record');
select tests.logout();

-- ------------------------------------------------------------ S2: reschedule / cancel + notification queue
select tests.login_as(tests.uid('staff_a'));
select lives_ok($$select salon.reschedule_appointment(tests.uid('tenant_a'), (select id from b1), pg_temp.at('11:00'))$$, 'S2: a stylist reschedules their own appointment');
select throws_ok($$select salon.reschedule_appointment(tests.uid('tenant_a'), (select id from b2), pg_temp.at('11:00'))$$, '23P01', null, 'rescheduling onto a taken time is refused');
select tests.logout();
select is((select count(*)::int from comms.messages where template_key = 'salon_booking_rescheduled'), 1, 'S2: a reschedule notification is queued');
select is((select status::text from comms.messages where template_key = 'salon_booking_rescheduled'), 'queued', 'the notification is queued, not sent');
select ok((select body from comms.messages where template_key = 'salon_booking_rescheduled') like '%Cara Customer%Ann%', 'the notice names the customer and stylist');
select tests.login_as(tests.uid('stylist2_a'));
select throws_ok($$select salon.cancel_appointment(tests.uid('tenant_a'), (select id from b1), 'nope')$$, '42501', null, 'a stylist cannot cancel another stylist''s appointment');
select is(jsonb_array_length(salon.list_appointments(tests.uid('tenant_a'), now(), now() + interval '30 days')), 1, 'a stylist''s list shows only their own appointments');
select tests.logout();
select tests.login_as(tests.uid('manager_a'));
select lives_ok($$select salon.cancel_appointment(tests.uid('tenant_a'), (select id from b1), 'customer called')$$, 'S2: a manager cancels');
select throws_ok($$select salon.reschedule_appointment(tests.uid('tenant_a'), (select id from b1), pg_temp.at('15:00'))$$, '22023', null, 'a cancelled appointment cannot be rescheduled');
select throws_ok($$select salon.cancel_appointment(tests.uid('tenant_a'), (select id from b1))$$, '22023', null, 'cancelling twice is refused');
select tests.logout();
select is((select count(*)::int from comms.messages where template_key = 'salon_booking_cancelled'), 1, 'S2: a cancellation notification is queued');
select is((select count(*)::int from comms.messages where template_key = 'salon_booking_confirmed'), 3, 'confirmations were queued for each booking (one per booking)');
select tests.login_as(tests.uid('svc_a'));
select ok(salon.book_appointment(tests.uid('tenant_a'), (select cut from sv), (select ann from st), pg_temp.at('11:00'), 'Fay', 'fay@example.test', null, 'book-key-0006') is not null, 'a cancelled slot can be booked again');
select tests.logout();
select set_config('hlbos.allow_mock_transport', 'on', true);
select ok(comms.dev_dispatch_mock() >= 5, 'the mock transport drains the queue without any network call');
select is((select count(*)::int from comms.messages where status = 'queued'), 0, 'nothing remains queued after the mock dispatch');

-- ------------------------------------------------------------ isolation
select tests.login_as(tests.uid('owner_b'));
select throws_ok($$select salon.list_appointments(tests.uid('tenant_a'), now(), now() + interval '30 days')$$, '42501', null, 'another tenant cannot list tenant A''s appointments');
select throws_ok($$select salon.cancel_appointment(tests.uid('tenant_b'), (select id from b2))$$, 'P0002', null, 'tenant A''s appointment id is invisible through tenant B');
select throws_ok($$select salon.customer_history(tests.uid('tenant_b'), (select id from cara))$$, '42501', null, 'tenant B has no CRM licence');
select tests.logout();
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select * from salon.appointments$$, '42501', null, 'tables are not readable directly, even by the tenant owner');
select tests.logout();
select tests.login_as_anon();
select throws_ok($$select salon.available_slots(tests.uid('tenant_a'), (select cut from sv), (select ann from st), (select day from p))$$, '42501', null, 'anon is denied');
select tests.logout();

-- ------------------------------------------------------------ S4: chair rental behaves differently
select tests.login_as(tests.uid('owner_c'));
select salon.configure_salon((select id from tc), 'Chair Co', 'chair_rental');
create temp table cs as select salon.add_service((select id from tc), 'Cut', 30, 5000) as cut;
grant select on cs to public;
create temp table rs as select
  salon.add_stylist((select id from tc), 'Cleo', tests.uid('renter1_c'), 'chair_rental', 30000, array[(select cut from cs)]) as cleo,
  salon.add_stylist((select id from tc), 'Dax', tests.uid('renter2_c'), 'chair_rental', 25000, array[(select cut from cs)]) as dax;
grant select on rs to public;
select throws_ok($$select salon.add_stylist((select id from tc), 'Emp', null, 'employee')$$, '23514', null, 'S4: an employee cannot join a chair-rental salon');
select tests.logout();
select tests.login_as(tests.uid('renter1_c'));
select is(salon.set_availability((select id from tc), (select cleo from rs), '[{"weekday":1,"start":"09:00","end":"17:00"}]'), 1, 'S4: a chair renter sets their OWN hours');
select throws_ok($$select salon.set_availability((select id from tc), (select dax from rs), '[{"weekday":1,"start":"09:00","end":"17:00"}]')$$, '42501', null, 'S4: a renter cannot set another renter''s hours');
select tests.logout();
select tests.login_as(tests.uid('owner_c'));
select salon.set_availability((select id from tc), (select dax from rs), '[{"weekday":1,"start":"09:00","end":"17:00"}]');
create temp table cb as select
  salon.book_appointment((select id from tc), (select cut from cs), (select cleo from rs), pg_temp.at('10:00'), 'Gus', 'gus@example.test', null, 'chair-key-0001') as a1,
  salon.book_appointment((select id from tc), (select cut from cs), (select dax from rs), pg_temp.at('10:00'), 'Gus', 'gus@example.test', null, 'chair-key-0002') as a2;
grant select on cb to public;
select tests.logout();
create temp table gus as select id from salon.customers where email = 'gus@example.test';
grant select on gus to public;
select tests.login_as(tests.uid('renter1_c'));
select is(jsonb_array_length(salon.customer_history((select id from tc), (select id from gus)) -> 'visits'), 1, 'S4: a renter sees only their own visits with a shared customer');
select lives_ok($$select salon.complete_appointment((select id from tc), (select a1 from cb))$$, 'a renter completes their own appointment');
select tests.logout();
select tests.login_as(tests.uid('owner_c'));
select is(salon.owner_dashboard((select id from tc)) ->> 'chair_rent_due_cents', '55000', 'S4: the owner''s dashboard reports chair rent due');
select is(salon.owner_dashboard((select id from tc)) ->> 'shop_service_revenue_cents', '0', 'S4: chair-renter service revenue is not the shop''s revenue');
select is(jsonb_array_length(salon.customer_history((select id from tc), (select id from gus)) -> 'visits'), 2, 'the owner sees every visit');
select tests.logout();
select tests.login_as(tests.uid('manager_a'));
select salon.complete_appointment(tests.uid('tenant_a'), (select id from b2));
select is(salon.owner_dashboard(tests.uid('tenant_a')) ->> 'shop_service_revenue_cents', '4000', 'employee salon: completed service revenue is the shop''s');
select tests.logout();

-- ------------------------------------------------------------ S5: entitlements
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select salon.analytics_summary(tests.uid('tenant_a'))$$, '42501', null, 'S5: a tenant without the analytics module is refused');
select throws_ok($$select salon.create_campaign_draft(tests.uid('tenant_a'), 'Spring', 'Hello')$$, '42501', null, 'S5: a tenant without the campaigns module is refused');
select tests.logout();
select tests.login_as(tests.uid('owner_b'));
select throws_ok($$select salon.owner_dashboard(tests.uid('tenant_b'))$$, '42501', null, 'a booking-only tenant cannot open the dashboard');
select tests.logout();
select tests.login_as(tests.uid('padmin'));
select entitlements.apply_package(tests.uid('tenant_a'), 'salon_complete');
select tests.logout();
select tests.login_as(tests.uid('owner_a'));
select ok((salon.analytics_summary(tests.uid('tenant_a')) -> 'cancellation_rate') is not null, 'after upgrading, analytics works');
select ok(salon.create_campaign_draft(tests.uid('tenant_a'), 'Spring', 'Hello') is not null, 'after upgrading, campaigns can be drafted');
select tests.logout();
select is((select count(*)::int from salon.customers where tenant_id = tests.uid('tenant_a')), 3, 'upgrading did not duplicate or lose customer records');
select tests.login_as(tests.uid('padmin'));
select entitlements.set_module_active(tests.uid('tenant_a'), 'salon.campaigns', false);
select tests.logout();
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select salon.create_campaign_draft(tests.uid('tenant_a'), 'Summer', 'Hi')$$, '42501', null, 'disabling a module closes it on the server');
select tests.logout();
select is((select count(*)::int from salon.campaigns where tenant_id = tests.uid('tenant_a')), 1, 'disabling a module kept the records');
select ok((select count(*) from audit.events where resource_type like '%appointments%') >= 4, 'appointment changes are in the audit log');

select * from finish();
rollback;
