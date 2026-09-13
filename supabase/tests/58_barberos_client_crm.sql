\ir _fixtures.sql.inc

-- ===========================================================================
-- Client CRM — migration 0058. The second BarberOS module to ship.
--
-- What is worth testing hardest is not that a row can be stored. It is the
-- four things this schema refuses to let anyone claim:
--
--   * a visit is something that HAPPENED -- no future dates, because booking
--     is not built and a mix of fact and intention makes every count useless
--   * a guard number only exists where it means something -- a contradiction
--     stored quietly becomes a "preference" read back to a client who never
--     said it
--   * a rhythm is not an average of one -- "overdue" from a single haircut is
--     how this module loses a shop's trust in week one
--   * lifetime value reports its own gaps
-- ===========================================================================
begin;
select plan(39);
select tests.seed();

select tests.login_as(tests.uid('owner_a'));
select barberos.upsert_shop(tests.uid('tenant_a'), 'Truth Barbershop', 3);
select barberos.upsert_shop(tests.uid('tenant_b'), 'Someone Else Cuts', 1)
  from (select tests.login_as(tests.uid('owner_b'))) _;
select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- Nothing is writable until the shop is paying for the module
-- ===========================================================================
select throws_ok(
  format($$select barberos.upsert_client(%L::uuid, 'Too Early')$$, tests.uid('tenant_a')),
  '42501', null, 't_a_client_cannot_be_stored_before_the_capability_is_on');

select ok(
  barberos.enable_capability(tests.uid('tenant_a'), 'client_crm'),
  't_the_module_can_be_switched_on');

-- ===========================================================================
-- The client
-- ===========================================================================
create temporary table t_c (id uuid);
insert into t_c select barberos.upsert_client(
  tests.uid('tenant_a'), 'Marcus Webb', '716-555-0101', 'marcus@example.test');

select is(
  (select display_name from barberos.clients where id = (select id from t_c)),
  'Marcus Webb', 't_a_client_is_stored');

-- The same regular written down twice must not end up with two half-histories.
select is(
  barberos.upsert_client(tests.uid('tenant_a'), 'Marcus W', '716-555-0101'),
  (select id from t_c), 't_the_same_phone_number_is_the_same_person');

select is(
  (select count(*)::int from barberos.clients where tenant_id = tests.uid('tenant_a')),
  1, 't_so_no_duplicate_record_is_created');

select is(
  (select email::text from barberos.clients where id = (select id from t_c)),
  'marcus@example.test', 't_and_editing_one_field_does_not_blank_the_others');

-- Two clients with no phone are two clients, not a duplicate.
select lives_ok(
  format($$select barberos.upsert_client(%L::uuid, 'Walk-in One')$$, tests.uid('tenant_a')),
  't_a_client_with_no_phone_is_allowed');
select lives_ok(
  format($$select barberos.upsert_client(%L::uuid, 'Walk-in Two')$$, tests.uid('tenant_a')),
  't_and_two_of_them_are_two_people_not_a_duplicate');

-- ===========================================================================
-- A visit is something that happened
-- ===========================================================================
select throws_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid,
            jsonb_build_object('visited_on', (current_date + 7)::text))$$,
         tests.uid('tenant_a'), (select id from t_c)),
  '23514', null, 't_a_visit_cannot_be_in_the_future');

-- ===========================================================================
-- A guard number only exists where it means something
-- ===========================================================================
select throws_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid,
            jsonb_build_object('top_finish','scissor','top_guard',4))$$,
         tests.uid('tenant_a'), (select id from t_c)),
  '23514', null, 't_a_top_guard_on_a_scissor_cut_is_a_contradiction');

select throws_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid,
            jsonb_build_object('beard', false, 'beard_guard', 2))$$,
         tests.uid('tenant_a'), (select id from t_c)),
  '23514', null, 't_a_beard_guard_on_a_client_whose_beard_is_not_done_is_refused');

select throws_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid,
            jsonb_build_object('sides_guard', 12))$$,
         tests.uid('tenant_a'), (select id from t_c)),
  '23514', null, 't_and_a_guard_number_that_does_not_exist_is_refused');

-- ===========================================================================
-- The cut, and the kit
-- ===========================================================================
select lives_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid, jsonb_build_object(
            'visited_on', (current_date - 90)::text,
            'sides_guard', 2, 'top_finish', 'scissor', 'fade', 'low',
            'beard', true, 'beard_guard', 1, 'line_up', true,
            'service_name', 'Skin fade + beard', 'price_cents', 4000,
            'barber', 'Dee',
            'tools', jsonb_build_array('Wahl Magic Clip', 'T-liner')))$$,
         tests.uid('tenant_a'), (select id from t_c)),
  't_a_cut_is_recorded_with_its_guards_and_its_tools');

select is(
  (select count(*)::int from barberos.tools where tenant_id = tests.uid('tenant_a')),
  2, 't_the_shops_kit_list_builds_itself_out_of_what_was_used');

select is(
  (select (barberos.client_timeline((select id from t_c))
            -> 'visits' -> 0 -> 'tools' ->> 0)),
  'T-liner', 't_and_the_visit_remembers_which_tools');

-- Removing a clipper from the kit must not rewrite forty past haircuts. Run as
-- the session superuser: signed in, this is refused by a missing grant, which
-- would prove the grant rather than the restriction. It has to be the foreign
-- key that says no, because a fix-up script would be running exactly here.
select tests.logout();
select throws_ok(
  $$delete from barberos.tools where name = 'T-liner'$$,
  '23503', null, 't_a_tool_used_on_a_visit_cannot_be_deleted_out_from_under_it');
select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- A rhythm is not an average of one
-- ===========================================================================
select is(
  (barberos.client_rhythm((select id from t_c)) ->> 'typical_days'),
  null, 't_one_visit_is_not_a_rhythm');

select is(
  (barberos.client_rhythm((select id from t_c)) ->> 'basis'),
  'not enough visits to know a rhythm', 't_and_the_answer_says_why');

select is(
  (barberos.client_rhythm((select id from t_c)) ->> 'overdue_by_days'),
  null, 't_so_nobody_is_overdue_on_the_strength_of_one_haircut');

select lives_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid,
            jsonb_build_object('visited_on', (current_date - 62)::text,
                               'sides_guard', 2, 'price_cents', 4000))$$,
         tests.uid('tenant_a'), (select id from t_c)),
  't_a_second_visit_is_recorded');

select is(
  (barberos.client_rhythm((select id from t_c)) ->> 'typical_days'),
  null, 't_two_visits_is_one_gap_which_is_still_not_a_rhythm');

select lives_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid,
            jsonb_build_object('visited_on', (current_date - 34)::text,
                               'sides_guard', 2))$$,
         tests.uid('tenant_a'), (select id from t_c)),
  't_a_third_visit_is_recorded');

select is(
  (barberos.client_rhythm((select id from t_c)) ->> 'typical_days'),
  '28', 't_three_visits_give_a_rhythm_measured_against_himself');

select is(
  (barberos.client_rhythm((select id from t_c)) ->> 'basis'),
  'average of the last gaps', 't_and_the_answer_says_where_it_came_from');

select is(
  (barberos.client_rhythm((select id from t_c)) ->> 'overdue_by_days'),
  '6', 't_and_he_is_six_days_past_his_own_usual_gap');

-- ===========================================================================
-- Who is due -- the module's first piece of revenue
-- ===========================================================================
select is(
  (select jsonb_array_length(barberos.clients_due(tests.uid('tenant_a')))),
  1, 't_the_overdue_list_has_exactly_the_client_with_a_rhythm');

select is(
  (barberos.clients_due(tests.uid('tenant_a')) -> 0 ->> 'display_name'),
  'Marcus W', 't_and_it_is_him');

-- The two walk-ins have no visits at all, so no rhythm, so no row. There is no
-- entry in this list that means "we guessed".
select is(
  (select count(*)::int from jsonb_array_elements(
     barberos.clients_due(tests.uid('tenant_a'))) e
    where e->>'display_name' like 'Walk-in%'),
  0, 't_and_nobody_without_a_rhythm_appears_in_it');

-- ===========================================================================
-- Lifetime value reports its own gaps
-- ===========================================================================
select is(
  (barberos.client_timeline((select id from t_c)) -> 'value' ->> 'total_cents'),
  '8000', 't_lifetime_value_totals_what_was_actually_recorded');

select is(
  (barberos.client_timeline((select id from t_c)) -> 'value' ->> 'visits_without_a_price'),
  '1', 't_and_says_how_many_visits_have_no_price_on_them');

-- ===========================================================================
-- Whose client is whose
-- ===========================================================================
select throws_ok(
  format($$select barberos.record_visit(%L::uuid, %L::uuid, '{}'::jsonb)$$,
         tests.uid('tenant_b'), (select id from t_c)),
  '42501', null, 't_another_shop_cannot_file_a_visit_against_this_shops_client');

select tests.login_as(tests.uid('owner_b'));
select is(
  (select count(*)::int from barberos.clients),
  0, 't_another_shops_owner_cannot_see_these_clients_at_all');

select throws_ok(
  format($$select barberos.client_list(%L::uuid)$$, tests.uid('tenant_a')),
  '42501', null, 't_nor_read_the_list_by_tenant_id');

-- ===========================================================================
-- Who may write it
--
-- The barber at the chair records the cut. A shop where only the owner may
-- write the record is a shop with no records.
-- ===========================================================================
select tests.login_as(tests.uid('staff_a'));
select lives_ok(
  format($$select barberos.upsert_client(%L::uuid, 'Walk-in Three')$$, tests.uid('tenant_a')),
  't_staff_can_add_a_client_because_that_is_the_work');

select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  format($$select barberos.upsert_client(%L::uuid, 'Nope')$$, tests.uid('tenant_a')),
  '42501', null, 't_a_viewer_cannot');

select ok(
  (select count(*) from barberos.clients) > 0,
  't_but_a_viewer_can_still_read_them');

-- ===========================================================================
-- The catalog now says so
-- ===========================================================================
select tests.logout();
select is(
  (select status::text from barberos.capabilities where key = 'client_crm'),
  'available', 't_the_module_is_marked_shipped_in_the_same_migration_that_built_it');

select is(
  (select blocked_on from barberos.capabilities where key = 'client_crm'),
  null, 't_and_is_waiting_on_nothing');

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'barberos'
      and p.proname in ('upsert_client','upsert_tool','record_visit',
                        'client_list','client_timeline','client_rhythm','clients_due')
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_new_function_pins_its_search_path');

select * from finish();
rollback;
