\ir _fixtures.sql.inc

-- ===========================================================================
-- The discovery call — migration 0054.
--
-- The audit sees a shop's website. Only the owner can tell us about the phones,
-- the appointment book and the card in the drawer. This table holds what they
-- said, and the thing worth testing hardest is the distinction the whole
-- proposal rests on:
--
--   true  = they have it
--   false = we asked, and they do not
--   NULL  = nobody asked
--
-- Collapsing the last two is how a proposal ends up telling an owner they have
-- no online booking when nobody raised it.
-- ===========================================================================
begin;
select plan(28);
select tests.seed();

-- A prospect to call. visibility.prospects is the agency's own sales list, and
-- is written through its own guarded path -- so the fixture row is created as
-- the owner, before anyone signs in, exactly as the other suites do.
-- A FIXED id, deliberately. Looking the prospect up by name inside the tests
-- below would return NULL once we sign in as someone RLS hides it from -- and
-- a guard test handed a NULL id proves nothing while appearing to pass. An
-- earlier draft of this file did exactly that.
insert into visibility.prospects (id, tenant_id, business_name, city)
values ('11111111-1111-1111-1111-111111111111'::uuid, tests.uid('tenant_a'), 'Truth Barbershop', 'West Seneca');

select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- Before anyone has called
-- ===========================================================================
select is(
  (transform_audit.discovery_for(
     '11111111-1111-1111-1111-111111111111'::uuid)
   ->>'called')::boolean,
  false, 't_a_shop_nobody_has_called_reports_that_plainly');

select is(
  (select count(*)::int from transform_audit.discovery),
  0, 't_and_stores_no_row_for_it');

-- ===========================================================================
-- The call
-- ===========================================================================
select ok(
  transform_audit.record_discovery(
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object(
      'own_website', false,
      'booking_platform', 'GlossGenius',
      'online_booking', true,
      'chairs', 3,
      'notes', 'Owner answers the phone himself between cuts.')
  ) is not null,
  't_a_call_can_be_recorded');

select is(
  (transform_audit.discovery_for(
     '11111111-1111-1111-1111-111111111111'::uuid)
   ->>'booking_platform'),
  'GlossGenius', 't_what_they_said_comes_back');

select is(
  (transform_audit.discovery_for(
     '11111111-1111-1111-1111-111111111111'::uuid)
   ->>'called')::boolean,
  true, 't_and_the_shop_now_counts_as_called');

-- --- The distinction the proposal rests on ----------------------------------
select is(
  (select own_website from transform_audit.discovery),
  false, 't_asked_and_they_do_not_have_one_is_false');

select is(
  (select missed_call_handling from transform_audit.discovery),
  null, 't_never_raised_on_the_call_stays_null');

select isnt(
  (select own_website::text from transform_audit.discovery),
  (select coalesce(missed_call_handling::text,'__null__') from transform_audit.discovery),
  't_false_and_null_are_not_the_same_stored_value');

-- ===========================================================================
-- Provenance: an answer with nobody behind it is a rumour
-- ===========================================================================
select ok(
  (select answered_at is not null and answered_by is not null
     from transform_audit.discovery),
  't_a_recorded_call_carries_who_and_when');

select is(
  (select answered_by from transform_audit.discovery),
  tests.uid('owner_a'), 't_and_it_is_whoever_made_the_call');

select tests.logout();
select throws_ok(
  $$insert into transform_audit.discovery (prospect_id, tenant_id, own_website, answered_at)
    select id, tenant_id, true, now() from visibility.prospects limit 1$$,
  '23514', null, 't_an_answer_with_a_time_but_no_person_is_refused');
select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- A second call adds to the picture rather than replacing it
-- ===========================================================================
select ok(
  transform_audit.record_discovery(
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('missed_call_handling', false, 'takes_walkins', true)
  ) is not null, 't_a_second_call_can_be_recorded');

select is(
  (select booking_platform from transform_audit.discovery),
  'GlossGenius', 't_the_second_call_did_not_wipe_the_first');

select is(
  (select missed_call_handling from transform_audit.discovery),
  false, 't_and_the_new_answer_is_stored');

select is(
  (select chairs from transform_audit.discovery),
  3, 't_a_field_the_second_call_never_mentioned_is_untouched');

-- --- ...but an explicit null CLEARS, for the call that wrote down the wrong shop
select ok(
  transform_audit.record_discovery(
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('chairs', null)
  ) is not null, 't_an_answer_can_be_explicitly_unsaid');

select is(
  (select chairs from transform_audit.discovery),
  null, 't_and_it_goes_back_to_nobody_asked');

-- ===========================================================================
-- A call that established nothing does not claim it did
-- ===========================================================================
create temp table _before as
  select answered_at, answered_by from transform_audit.discovery;

select lives_ok(
  $$select transform_audit.record_discovery(
      '11111111-1111-1111-1111-111111111111'::uuid, '{}'::jsonb)$$,
  't_an_empty_payload_is_allowed');

-- `now()` is frozen for the whole transaction, so "is it earlier than now" can
-- never be true here. Comparing against what was stored BEFORE the empty call
-- is the only version of this assertion that means anything.
select is(
  (select answered_at from transform_audit.discovery),
  (select answered_at from _before),
  't_and_does_not_restamp_a_call_that_established_nothing');

-- ===========================================================================
-- Contradictions are caught on the call, not in the proposal
-- ===========================================================================
select tests.logout();
select throws_ok(
  $$update transform_audit.discovery
       set booking_platform = 'Booksy', online_booking = false$$,
  '23514', null,
  't_a_named_booking_platform_cannot_coexist_with_no_online_booking');
select throws_ok(
  $$update transform_audit.discovery set chairs = 0$$,
  '23514', null, 't_a_shop_with_zero_chairs_is_refused');
select tests.login_as(tests.uid('owner_a'));

-- A platform with booking simply UNASKED is fine: that is not a contradiction,
-- it is an incomplete call.
select lives_ok(
  format($$select transform_audit.record_discovery(%L::uuid,
    jsonb_build_object('booking_platform','Booksy','online_booking',null))$$,
    '11111111-1111-1111-1111-111111111111'::uuid),
  't_but_a_platform_with_booking_unasked_is_just_an_incomplete_call');

-- ===========================================================================
-- Permissions and isolation
-- ===========================================================================
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  format($$select transform_audit.record_discovery(%L::uuid,
    jsonb_build_object('own_website', true))$$,
    '11111111-1111-1111-1111-111111111111'::uuid),
  '42501', null, 't_a_viewer_cannot_record_a_call');

select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from transform_audit.discovery), 0,
  't_another_tenant_cannot_see_the_call');
select throws_ok(
  format($$select transform_audit.discovery_for(%L::uuid)$$,
    '11111111-1111-1111-1111-111111111111'::uuid),
  '42501', null, 't_nor_read_it_by_id');
select throws_ok(
  format($$select transform_audit.record_discovery(%L::uuid,
    jsonb_build_object('own_website', true))$$,
    '11111111-1111-1111-1111-111111111111'::uuid),
  '42501', null, 't_nor_record_against_it');

-- A prospect that does not exist is an error, not a silent no-op.
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$select transform_audit.record_discovery(
      '00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb)$$,
  'P0002', null, 't_recording_against_a_prospect_that_does_not_exist_raises');

-- --- search_path pinning ----------------------------------------------------
select tests.logout();
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'transform_audit'
      and p.proname in ('record_discovery','discovery_for')
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_both_new_functions_pin_their_search_path');

select * from finish();
rollback;
