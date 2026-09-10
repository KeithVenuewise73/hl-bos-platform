\ir _fixtures.sql.inc

-- ===========================================================================
-- BarberOS owned_website — migration 0052.
--
-- The first module to come through the capability gate, so the first test that
-- the gate is load-bearing rather than advisory: with the capability off, the
-- tables refuse writes outright.
--
-- Then the two rules the module exists to keep:
--   * a page cannot be published until it carries the minimum a customer needs
--   * "the shop has not said" and "the shop says it is closed" stay different
--     facts, because rendering the first as the second sends someone to a
--     locked door
-- ===========================================================================
begin;
select plan(42);
select tests.seed();

-- --- The promotion is what makes the module real ---------------------------
select is(
  (select status::text from barberos.capabilities where key = 'owned_website'),
  'available', 't_owned_website_is_now_available');

-- Everything else is still honestly unbuilt.
select is(
  (select count(*)::int from barberos.capabilities where status = 'available'),
  1, 't_it_is_the_only_shipped_module');

select is(
  (select count(*)::int from barberos.capability_requires
    where capability_key = 'owned_website'),
  0, 't_it_has_no_prerequisites_so_a_shop_can_start_here');

-- ===========================================================================
-- The gate
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));
select ok(barberos.upsert_shop(tests.uid('tenant_a'), 'Elmwood Barber Co.', 2) is not null,
  't_the_shop_record_exists');

-- The capability is NOT enabled yet. Nothing may be written.
--
-- Run as the OWNER, deliberately. As `authenticated` the SELECT-only grant
-- denies the write first and raises the SAME SQLSTATE, so this assertion would
-- pass whether or not the gate trigger existed -- proving the grant and
-- nothing else. The first draft of this test did exactly that.
select tests.logout();
select throws_ok(
  format($$insert into barberos.sites (tenant_id, slug) values (%L::uuid, 'elmwood')$$,
    tests.uid('tenant_a')),
  '42501', 'the owned_website capability is not enabled for this shop, so sites cannot be written',
  't_no_page_can_exist_before_the_capability_is_enabled');
select tests.login_as(tests.uid('owner_a'));

select ok(barberos.enable_capability(tests.uid('tenant_a'), 'owned_website'),
  't_the_capability_can_now_be_enabled');

select ok(barberos.upsert_site(tests.uid('tenant_a'), 'elmwood-barber-co') is not null,
  't_the_page_can_be_created_once_it_is_on');

-- ...and turning it back off makes the rows unwritable again, rather than
-- merely hiding them behind an `if` somewhere in an application.
select ok(barberos.disable_capability(tests.uid('tenant_a'), 'owned_website'),
  't_the_capability_can_be_turned_off');
-- Again as the owner, and matching the trigger's own message, so only the gate
-- can satisfy these.
select tests.logout();
select throws_ok(
  format($$update barberos.sites set headline = 'Sneaky' where tenant_id = %L::uuid$$,
    tests.uid('tenant_a')),
  '42501', 'the owned_website capability is not enabled for this shop, so sites cannot be written',
  't_with_the_capability_off_the_page_cannot_be_edited');
select throws_ok(
  format($$insert into barberos.site_services (tenant_id, name) values (%L::uuid, 'Fade')$$,
    tests.uid('tenant_a')),
  '42501', 'the owned_website capability is not enabled for this shop, so site_services cannot be written',
  't_and_no_service_can_be_added_either');
select tests.login_as(tests.uid('owner_a'));

select ok(barberos.enable_capability(tests.uid('tenant_a'), 'owned_website'),
  't_back_on_for_the_rest_of_this_file');

-- --- Slugs ------------------------------------------------------------------
-- Constraint tests run as the OWNER throughout: as a client the grant refuses
-- the write before the constraint is reached.
select tests.logout();
select throws_ok(
  format($$update barberos.sites set slug = 'Elmwood_Barber' where tenant_id = %L::uuid$$,
    tests.uid('tenant_a')),
  '23514', null, 't_a_slug_with_uppercase_or_underscores_is_refused');
select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- Nothing is defaulted
-- ===========================================================================
select is(
  (select headline from barberos.sites where tenant_id = tests.uid('tenant_a')),
  null, 't_a_new_page_has_no_headline_rather_than_a_placeholder');
select is(
  (select count(*)::int from barberos.site_hours where tenant_id = tests.uid('tenant_a')),
  0, 't_and_no_hours_at_all_rather_than_nine_to_five');

-- --- A price is never invented ---------------------------------------------
select ok(barberos.upsert_site_service(tests.uid('tenant_a'), 'Haircut', 3500, 30, 1) is not null,
  't_a_service_with_a_price');
select ok(barberos.upsert_site_service(tests.uid('tenant_a'), 'Hot towel shave', null, 45, 2) is not null,
  't_a_service_whose_price_the_shop_did_not_give');
select is(
  (select price_cents from barberos.site_services
    where tenant_id = tests.uid('tenant_a') and name = 'Hot towel shave'),
  null, 't_the_missing_price_stays_null_and_is_not_zero');

-- Zero would advertise a free haircut. It is refused outright.
select tests.logout();
select throws_ok(
  format($$insert into barberos.site_services (tenant_id, name, price_cents)
    values (%L::uuid, 'Free cut', 0)$$, tests.uid('tenant_a')),
  '23514', null, 't_a_zero_price_is_refused');
select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- "Not said" and "closed" are different facts
-- ===========================================================================
select lives_ok(
  format($$select barberos.set_site_hours(%L::uuid, 1::smallint, false, '09:00', '19:00')$$,
    tests.uid('tenant_a')),
  't_monday_is_stated_as_open');
select lives_ok(
  format($$select barberos.set_site_hours(%L::uuid, 0::smallint, true)$$, tests.uid('tenant_a')),
  't_sunday_is_stated_as_closed');

select is(
  (select count(*)::int from barberos.site_hours where tenant_id = tests.uid('tenant_a')),
  2, 't_only_the_two_stated_days_exist');
select is(
  (select is_closed from barberos.site_hours
    where tenant_id = tests.uid('tenant_a') and day_of_week = 0),
  true, 't_sunday_carries_a_row_saying_closed');
select is(
  (select count(*)::int from barberos.site_hours
    where tenant_id = tests.uid('tenant_a') and day_of_week = 6),
  0, 't_saturday_has_no_row_at_all_which_is_not_the_same_as_closed');

-- A half-stated day would render as "9:00 –" and let the reader guess.
select tests.logout();
select throws_ok(
  format($$insert into barberos.site_hours (tenant_id, day_of_week, is_closed, opens_at)
    values (%L::uuid, 3::smallint, false, '09:00')$$, tests.uid('tenant_a')),
  '23514', null, 't_a_day_open_at_nine_and_closing_never_is_refused');

-- A closed day cannot also carry times.
select throws_ok(
  format($$insert into barberos.site_hours (tenant_id, day_of_week, is_closed, opens_at, closes_at)
    values (%L::uuid, 4::smallint, true, '09:00', '17:00')$$, tests.uid('tenant_a')),
  '23514', null, 't_a_closed_day_cannot_also_have_opening_times');

-- Closing before opening is a typo far more often than a 2am barbershop.
select throws_ok(
  format($$insert into barberos.site_hours (tenant_id, day_of_week, is_closed, opens_at, closes_at)
    values (%L::uuid, 5::smallint, false, '19:00', '09:00')$$, tests.uid('tenant_a')),
  '23514', null, 't_closing_before_opening_is_refused');
select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- The publish gate
-- ===========================================================================
-- The page has hours and services but still no headline, address or way to act.
select throws_ok(
  format($$select barberos.publish_site(%L::uuid)$$, tests.uid('tenant_a')),
  '23514',
  'this page cannot be published yet: it is missing a headline, a street address, a phone number or a booking link',
  't_an_unfinished_page_cannot_be_published');

select is(
  (select status::text from barberos.sites where tenant_id = tests.uid('tenant_a')),
  'draft', 't_and_it_is_still_a_draft');

-- Give it a headline and an address, but STILL no phone and no booking link.
select ok(barberos.upsert_site(tests.uid('tenant_a'), 'elmwood-barber-co',
    'Traditional cuts on Elmwood', null, null, '742 Elmwood Ave', 'Buffalo', 'NY', '14222')
  is not null, 't_a_headline_and_an_address_are_added');
select throws_ok(
  format($$select barberos.publish_site(%L::uuid)$$, tests.uid('tenant_a')),
  '23514', 'this page cannot be published yet: it is missing a phone number or a booking link',
  't_still_refused_with_no_way_for_a_customer_to_act');

-- A phone alone is enough to act on.
select ok(barberos.upsert_site(tests.uid('tenant_a'), 'elmwood-barber-co',
    null, null, '716-555-0100') is not null, 't_a_phone_number_is_added');
select is(
  barberos.publish_site(tests.uid('tenant_a'))::text,
  'published', 't_now_it_publishes');

select ok(
  (select published_at is not null and published_by is not null
     from barberos.sites where tenant_id = tests.uid('tenant_a')),
  't_published_carries_who_and_when');

-- ...and a partial edit does not silently blank what it did not mention.
select is(
  (select headline from barberos.sites where tenant_id = tests.uid('tenant_a')),
  'Traditional cuts on Elmwood', 't_the_partial_edit_kept_the_headline');

-- --- Publishing is a decision, not a save -----------------------------------
select tests.login_as(tests.uid('manager_a'));
select ok(barberos.upsert_site_service(tests.uid('tenant_a'), 'Beard trim', 2000) is not null,
  't_a_manager_may_edit_the_page');
select throws_ok(
  format($$select barberos.unpublish_site(%L::uuid)$$, tests.uid('tenant_a')),
  '42501', null, 't_but_a_manager_may_not_take_it_off_the_internet');

-- --- Tenant isolation -------------------------------------------------------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from barberos.sites), 0,
  't_another_tenant_cannot_see_this_page');
select is((select count(*)::int from barberos.site_services), 0,
  't_nor_its_prices');
select throws_ok(
  format($$select barberos.upsert_site(%L::uuid, 'hijacked')$$, tests.uid('tenant_a')),
  '42501', null, 't_nor_edit_it');

-- --- The content read path --------------------------------------------------
select tests.login_as(tests.uid('owner_a'));
select is(
  jsonb_array_length(barberos.site_content(tests.uid('tenant_a'))->'hours'),
  2, 't_site_content_returns_only_the_stated_days');
select is(
  (select v->>'price_cents'
     from jsonb_array_elements(barberos.site_content(tests.uid('tenant_a'))->'services') v
    where v->>'name' = 'Hot towel shave'),
  null, 't_and_leaves_an_ungiven_price_null');

-- --- search_path pinning ----------------------------------------------------
select tests.logout();
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'barberos'
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_barberos_function_still_pins_its_search_path');

select * from finish();
rollback;
