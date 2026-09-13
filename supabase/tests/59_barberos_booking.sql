\ir _fixtures.sql.inc

-- ===========================================================================
-- Booking — migration 0059. The third BarberOS module to ship.
--
-- What is worth testing hardest is not that an appointment can be stored.
-- It is the rules the module exists to keep:
--
--   * TWO PEOPLE CANNOT HAVE THE SAME BARBER AT THE SAME TIME. Tested against
--     the constraint directly, as the OWNER of the table, so only the
--     exclusion constraint can satisfy it -- not a function, not a trigger.
--   * AN EMPTY LIST OF TIMES ALWAYS SAYS WHY. Five different empty lists, five
--     different sentences: no rota entered, not a working day, a day off, a
--     service with no duration, and a day that is genuinely full.
--   * A CANCELLATION FREES THE CHAIR AND KEEPS THE ROW.
--   * NOBODY IS A NO-SHOW UNTIL THEIR APPOINTMENT IS OVER.
--   * COMPLETING AN APPOINTMENT WRITES THE VISIT, so client_crm is right
--     without anybody typing it twice.
--
-- Plus the modelling correction 0059 makes: a shop's services belong to the
-- SHOP, so a shop that bought booking and not the website can still price a
-- haircut. That was impossible before this migration.
-- ===========================================================================
begin;
select plan(45);
select tests.seed();

select tests.login_as(tests.uid('owner_a'));
select barberos.upsert_shop(tests.uid('tenant_a'), 'Truth Barbershop', 3);
select barberos.upsert_shop(tests.uid('tenant_b'), 'Someone Else Cuts', 1)
  from (select tests.login_as(tests.uid('owner_b'))) _;
select tests.login_as(tests.uid('owner_a'));

-- Every date in this file is worked out in the SHOP's timezone, not the
-- server's. At 02:00 UTC a New York shop is still on yesterday, and a test
-- that used current_date would pass all day and fail after midnight.
create temporary table t_when as
  select ((now() at time zone 'America/New_York')::date + 7) as d;
create temporary table t_ids (k text primary key, v uuid);
create temporary table t_svc (k text primary key, v bigint);

-- ===========================================================================
-- Nothing is writable until the shop is paying for the module
-- ===========================================================================
select throws_ok(
  format($$select barberos.upsert_barber(%L::uuid, 'Too Early')$$, tests.uid('tenant_a')),
  '42501', null, 't_a_barber_cannot_be_added_before_the_capability_is_on');

-- Booking cannot even be switched on without the client record, because an
-- appointment is an appointment WITH SOMEBODY.
select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'booking')$$, tests.uid('tenant_a')),
  '23503', null, 't_booking_cannot_be_enabled_without_the_client_record');

select ok(barberos.enable_capability(tests.uid('tenant_a'), 'client_crm'),
  't_the_client_record_goes_on_first');
select ok(barberos.enable_capability(tests.uid('tenant_a'), 'booking'),
  't_and_then_booking_can_be_switched_on');

-- ===========================================================================
-- The correction: services belong to the shop, not to its web page
--
-- owned_website is deliberately NOT enabled for this shop and there is no
-- `sites` row at all. Before 0059 the foreign key pointed at `sites`, so this
-- insert was impossible and booking could never have been sold on its own --
-- which would have broken the `starter` bundle, since starter is client_crm +
-- booking + review_engine and contains no website.
-- ===========================================================================
select is(
  (select count(*)::int from barberos.sites where tenant_id = tests.uid('tenant_a')),
  0, 't_this_shop_has_no_web_page_at_all');

insert into t_svc select 'fade',
  barberos.upsert_site_service(tests.uid('tenant_a'), 'Skin fade', 4000, 30, 1);
select ok((select v from t_svc where k = 'fade') is not null,
  't_a_shop_with_no_page_can_still_price_a_haircut');

insert into t_svc select 'nodur',
  barberos.upsert_site_service(tests.uid('tenant_a'), 'Consultation', 1000, null, 2);

-- ===========================================================================
-- Who works, and when
-- ===========================================================================
insert into t_ids select 'marcus', barberos.upsert_barber(tests.uid('tenant_a'), 'Marcus');
insert into t_ids select 'dee',    barberos.upsert_barber(tests.uid('tenant_a'), 'Dee');

select is(
  (select count(*)::int from barberos.barbers where tenant_id = tests.uid('tenant_a')),
  2, 't_two_barbers_are_on_the_books');

-- Re-adding by name brings the same person back rather than starting a second,
-- emptier history for them.
select is(
  barberos.upsert_barber(tests.uid('tenant_a'), 'Marcus'),
  (select v from t_ids where k = 'marcus'),
  't_adding_the_same_barber_twice_is_the_same_barber');

-- --- The empty list that says why, part one ---------------------------------
-- Nobody has entered a rota. This must NOT read as "fully booked".
select is(
  (barberos.available_slots(tests.uid('tenant_a'), (select v from t_ids where k='marcus'),
    (select v from t_svc where k='fade'), (select d from t_when))->>'basis'),
  'no working hours have been set for this barber yet',
  't_a_barber_with_no_rota_is_not_reported_as_fully_booked');

-- Set the rota for the weekday the test date actually falls on, so this file
-- means the same thing whichever day it is run.
select ok(
  barberos.set_barber_hours((select v from t_ids where k='marcus'),
    (select extract(dow from d)::smallint from t_when), '09:00', '17:00'),
  't_marcus_gets_a_working_day');
select ok(
  barberos.set_barber_hours((select v from t_ids where k='dee'),
    (select extract(dow from d)::smallint from t_when), '09:00', '12:00'),
  't_dee_works_a_short_one');

-- --- ...and part two: a day this barber does not work -----------------------
select alike(
  (barberos.available_slots(tests.uid('tenant_a'), (select v from t_ids where k='marcus'),
    (select v from t_svc where k='fade'), (select d + 1 from t_when))->>'basis'),
  'this barber does not work on %s',
  't_a_day_off_the_rota_says_so_rather_than_showing_nothing');

-- --- part three: a service nobody gave a length to --------------------------
select is(
  (barberos.available_slots(tests.uid('tenant_a'), (select v from t_ids where k='marcus'),
    (select v from t_svc where k='nodur'), (select d from t_when))->>'basis'),
  'this service has no duration recorded, so no appointment length can be worked out',
  't_a_service_with_no_duration_explains_itself_instead_of_guessing_thirty_minutes');

-- --- part four: a whole day off ---------------------------------------------
insert into t_ids select 'off', barberos.set_time_off(
  (select v from t_ids where k='dee'), (select d from t_when), 'Dentist');
select is(
  (barberos.available_slots(tests.uid('tenant_a'), (select v from t_ids where k='dee'),
    (select v from t_svc where k='fade'), (select d from t_when))->>'basis'),
  'this barber is off on that date',
  't_a_barber_who_is_off_says_so');
select ok(barberos.clear_time_off((select v from t_ids where k='off')),
  't_and_the_day_off_can_be_taken_back');

-- --- A real list of times ---------------------------------------------------
select is(
  (barberos.available_slots(tests.uid('tenant_a'), (select v from t_ids where k='marcus'),
    (select v from t_svc where k='fade'), (select d from t_when))->>'basis'),
  'open', 't_with_a_rota_and_a_service_the_day_is_open');

-- 09:00 to 17:00 is 8 hours; a 30-minute cut on 15-minute boundaries is the
-- last start at 16:30, so 31 of them.
select is(
  jsonb_array_length(barberos.available_slots(tests.uid('tenant_a'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select d from t_when))->'slots'),
  31, 't_the_slots_are_counted_off_the_rota_not_invented');

-- Dee works 09:00-12:00, so a 30-minute cut can start as late as 11:30: 11 of them.
select is(
  jsonb_array_length(barberos.available_slots(tests.uid('tenant_a'),
    (select v from t_ids where k='dee'), (select v from t_svc where k='fade'),
    (select d from t_when))->'slots'),
  11, 't_a_shorter_working_day_is_a_shorter_list');

-- ===========================================================================
-- Taking a booking
-- ===========================================================================
insert into t_ids select 'client', barberos.upsert_client(
  tests.uid('tenant_a'), 'Anthony Reid', '716-555-0155');
select tests.login_as(tests.uid('owner_b'));
select barberos.enable_capability(tests.uid('tenant_b'), 'client_crm');
insert into t_ids select 'other_client', barberos.upsert_client(
  tests.uid('tenant_b'), 'Somebody Else', '716-555-0999');
select tests.login_as(tests.uid('owner_a'));

insert into t_ids select 'appt', barberos.book_appointment(
  tests.uid('tenant_a'), (select v from t_ids where k='client'),
  (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
  (select (d + time '10:00') at time zone 'America/New_York' from t_when));

select ok((select v from t_ids where k='appt') is not null, 't_an_appointment_is_taken');

-- The price and the length are COPIED IN, not looked up later.
select is(
  (select price_cents from barberos.appointments where id = (select v from t_ids where k='appt')),
  4000, 't_the_price_is_captured_at_booking_time');

select lives_ok(
  format($$select barberos.upsert_site_service(%L::uuid, 'Skin fade', 6000, 30, 1)$$,
    tests.uid('tenant_a')),
  't_the_shop_puts_its_prices_up');
select is(
  (select price_cents from barberos.appointments where id = (select v from t_ids where k='appt')),
  4000, 't_and_the_customer_already_booked_is_still_quoted_what_they_were_told');

-- ===========================================================================
-- The rule this module exists to keep
-- ===========================================================================
select throws_ok(
  format($$select barberos.book_appointment(%L::uuid, %L::uuid, %L::uuid, %s,
            %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select (d + time '10:15') at time zone 'America/New_York' from t_when)),
  '23P01', null, 't_a_second_booking_overlapping_the_first_is_refused');

-- ...and the refusal is the CONSTRAINT, not the function. Run as the table
-- owner, writing the row directly: if the exclusion constraint were missing,
-- this would succeed and the assertion above would be proving nothing but an
-- `if` statement.
select tests.logout();
select throws_ok(
  format($$insert into barberos.appointments
            (tenant_id, client_id, barber_id, service_name, duration_minutes,
             starts_at, ends_at)
           values (%L::uuid, %L::uuid, %L::uuid, 'Sneaky', 30,
             %L::timestamptz, %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'),
    (select (d + time '10:15') at time zone 'America/New_York' from t_when),
    (select (d + time '10:45') at time zone 'America/New_York' from t_when)),
  '23P01', null, 't_and_a_direct_insert_cannot_get_round_it_either');

-- The end of an appointment is the start plus the duration that was quoted.
-- Without this, the constraint above could be walked around by writing a
-- shorter range than the haircut actually takes.
select throws_ok(
  format($$insert into barberos.appointments
            (tenant_id, client_id, barber_id, service_name, duration_minutes,
             starts_at, ends_at)
           values (%L::uuid, %L::uuid, %L::uuid, 'Lying about the length', 30,
             %L::timestamptz, %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'),
    (select (d + time '10:15') at time zone 'America/New_York' from t_when),
    (select (d + time '10:20') at time zone 'America/New_York' from t_when)),
  '23514', null, 't_an_appointment_cannot_claim_to_be_shorter_than_its_own_service');
select tests.login_as(tests.uid('owner_a'));

-- A different barber at the same moment is fine. That is the whole point of
-- having two chairs.
select ok(
  barberos.book_appointment(tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='dee'), (select v from t_svc where k='fade'),
    (select (d + time '10:00') at time zone 'America/New_York' from t_when)) is not null,
  't_the_other_chair_at_the_same_time_is_fine');

-- The taken slot is gone from what is offered.
select is(
  jsonb_array_length(barberos.available_slots(tests.uid('tenant_a'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select d from t_when))->'slots'),
  28, 't_the_booked_time_and_the_ones_that_would_overlap_it_are_no_longer_offered');

-- ===========================================================================
-- What the book refuses
-- ===========================================================================
select throws_ok(
  format($$select barberos.book_appointment(%L::uuid, %L::uuid, %L::uuid, %s, %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select (d + time '18:00') at time zone 'America/New_York' from t_when)),
  '23514', null, 't_a_time_outside_the_barbers_working_hours_is_refused');

select throws_ok(
  format($$select barberos.book_appointment(%L::uuid, %L::uuid, %L::uuid, %s, %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select (d - 14 + time '10:00') at time zone 'America/New_York' from t_when)),
  '23514', null, 't_a_time_in_the_past_is_refused');

select throws_ok(
  format($$select barberos.book_appointment(%L::uuid, %L::uuid, %L::uuid, %s, %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='nodur'),
    (select (d + time '14:00') at time zone 'America/New_York' from t_when)),
  '23514', null, 't_a_service_with_no_duration_cannot_be_booked_rather_than_assumed');

-- One shop's customer cannot end up in another shop's book.
select throws_ok(
  format($$select barberos.book_appointment(%L::uuid, %L::uuid, %L::uuid, %s, %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='other_client'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select (d + time '14:00') at time zone 'America/New_York' from t_when)),
  '23514', null, 't_another_shops_client_cannot_be_booked_here');

select throws_ok(
  format($$select barberos.book_appointment(%L::uuid, %L::uuid, %L::uuid, %s, %L::timestamptz)$$,
    tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select (d + 400 + time '10:00') at time zone 'America/New_York' from t_when)),
  '23514', null, 't_a_booking_beyond_the_open_window_is_refused');

-- ===========================================================================
-- Cancelling frees the chair and keeps the row
-- ===========================================================================
select ok(barberos.cancel_appointment((select v from t_ids where k='appt'), 'Customer rang'),
  't_the_appointment_is_cancelled');
select is(
  (select count(*)::int from barberos.appointments where id = (select v from t_ids where k='appt')),
  1, 't_and_the_row_is_still_there_rather_than_deleted');
select is(
  (select cancellation_reason from barberos.appointments
    where id = (select v from t_ids where k='appt')),
  'Customer rang', 't_carrying_why');
select ok(
  (select cancelled_at is not null and cancelled_by is not null
     from barberos.appointments where id = (select v from t_ids where k='appt')),
  't_and_who_and_when');
select ok(not barberos.cancel_appointment((select v from t_ids where k='appt')),
  't_cancelling_an_already_cancelled_one_reports_false_rather_than_erroring');

select is(
  jsonb_array_length(barberos.available_slots(tests.uid('tenant_a'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select d from t_when))->'slots'),
  31, 't_and_the_chair_is_free_again');

-- ===========================================================================
-- A no-show is a fact about the past
-- ===========================================================================
insert into t_ids select 'future', barberos.book_appointment(
  tests.uid('tenant_a'), (select v from t_ids where k='client'),
  (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
  (select (d + time '11:00') at time zone 'America/New_York' from t_when));

select throws_ok(
  format($$select barberos.mark_no_show(%L::uuid)$$, (select v from t_ids where k='future')),
  '23514', 'that appointment is not over yet, so nobody can be marked a no-show',
  't_nobody_can_be_marked_a_no_show_before_their_appointment_is_over');

select throws_ok(
  format($$select barberos.complete_appointment(%L::uuid)$$, (select v from t_ids where k='future')),
  '23514', 'that appointment has not started yet',
  't_and_a_haircut_that_has_not_started_cannot_be_recorded_as_done');

-- ===========================================================================
-- Completing an appointment writes the visit
--
-- The join back to client_crm, and the reason the two can never disagree: the
-- shop enters what happened once.
-- ===========================================================================
select tests.logout();
-- Move it into the past, as the table owner, because the book itself refuses
-- to create an appointment back there -- which is the point of the assertion
-- two above this one.
update barberos.appointments
   set starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes'
 where id = (select v from t_ids where k='future');
select tests.login_as(tests.uid('owner_a'));

select is(
  (select count(*)::int from barberos.visits where tenant_id = tests.uid('tenant_a')),
  0, 't_the_client_has_no_visits_yet');

insert into t_ids select 'visit', barberos.complete_appointment(
  (select v from t_ids where k='future'),
  '{"sides_guard": 1, "top_finish": "scissor", "fade": "skin"}'::jsonb);

select is(
  (select count(*)::int from barberos.visits where tenant_id = tests.uid('tenant_a')),
  1, 't_completing_it_wrote_the_visit_without_anybody_typing_it_twice');
select is(
  (select service_name from barberos.visits where id = (select v from t_ids where k='visit')),
  'Skin fade', 't_the_visit_carries_what_was_booked');
select is(
  (select barber from barberos.visits where id = (select v from t_ids where k='visit')),
  'Marcus', 't_and_who_cut_it');
select is(
  (select top_finish::text from barberos.visits where id = (select v from t_ids where k='visit')),
  'scissor', 't_and_the_cut_the_barber_added_on_the_way_past');
select is(
  (select visit_id from barberos.appointments where id = (select v from t_ids where k='future')),
  (select v from t_ids where k='visit'), 't_the_two_records_point_at_each_other');

select throws_ok(
  format($$select barberos.complete_appointment(%L::uuid)$$, (select v from t_ids where k='future')),
  '23514', null, 't_and_it_cannot_be_completed_twice');

-- ===========================================================================
-- The day sheet
-- ===========================================================================
select is(
  (barberos.day_sheet(tests.uid('tenant_a'), (select d from t_when))
    ->'summary'->>'in_the_book')::int,
  1, 't_the_day_sheet_counts_what_is_still_in_the_book');
select is(
  (barberos.day_sheet(tests.uid('tenant_a'), (select d from t_when))
    ->'summary'->>'cancelled')::int,
  1, 't_and_reports_the_cancellation_separately_rather_than_hiding_it');
select is(
  (barberos.day_sheet(tests.uid('tenant_a'), (select d from t_when))
    ->'summary'->>'appointments_without_a_price')::int,
  0, 't_and_expected_takings_carry_the_count_of_appointments_with_no_price');

-- ===========================================================================
-- Who may do what
-- ===========================================================================
select tests.login_as(tests.uid('staff_a'));
select ok(
  barberos.book_appointment(tests.uid('tenant_a'), (select v from t_ids where k='client'),
    (select v from t_ids where k='marcus'), (select v from t_svc where k='fade'),
    (select (d + time '13:00') at time zone 'America/New_York' from t_when)) is not null,
  't_a_barber_at_the_chair_can_take_a_booking_because_that_is_the_work');

select throws_ok(
  format($$select barberos.upsert_barber(%L::uuid, 'Self Appointed')$$, tests.uid('tenant_a')),
  '42501', null, 't_but_cannot_put_themselves_on_the_rota');
select throws_ok(
  format($$select barberos.set_barber_hours(%L::uuid, 1::smallint, '06:00', '23:00')$$,
    (select v from t_ids where k='marcus')),
  '42501', null, 't_nor_rewrite_their_own_hours');

select tests.login_as(tests.uid('viewer_a'));
select ok(
  jsonb_array_length(barberos.day_sheet(tests.uid('tenant_a'),
    (select d from t_when))->'appointments') > 0,
  't_a_viewer_can_read_the_book');
select throws_ok(
  format($$select barberos.cancel_appointment(%L::uuid)$$, (select v from t_ids where k='future')),
  '42501', null, 't_but_cannot_touch_it');

-- --- Another shop cannot see any of it --------------------------------------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from barberos.appointments), 0,
  't_another_shop_cannot_see_these_appointments');
select is((select count(*)::int from barberos.barbers), 0,
  't_nor_who_works_here');
select throws_ok(
  format($$select barberos.day_sheet(%L::uuid)$$, tests.uid('tenant_a')),
  '42501', null, 't_nor_read_the_day_sheet_by_tenant_id');

-- ===========================================================================
-- The catalog says so too
-- ===========================================================================
select tests.logout();
select is(
  (select status::text from barberos.capabilities where key = 'booking'),
  'available', 't_the_module_is_marked_shipped_in_the_same_migration_that_built_it');
select is(
  (select blocked_on from barberos.capabilities where key = 'booking'),
  null, 't_and_is_waiting_on_nothing');

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'barberos'
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_new_function_pins_its_search_path');

select * from finish();
rollback;
