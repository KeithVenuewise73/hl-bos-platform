\ir _fixtures.sql.inc

-- ===========================================================================
-- BarberOS capability spine — migration 0048.
--
-- This migration ships a toggle and NO modules, so the thing under test is the
-- toggle's refusals. Three claims are made in the migration header and each is
-- tested here as a refusal, not as an assertion:
--
--   * payments cannot be enabled (deferred, structurally)
--   * the review engine cannot be gated (non-negotiable #5, in the schema)
--   * a capability cannot outrun or abandon its prerequisites
--
-- Plus tenant isolation on the toggle table, and the honest state of the
-- catalog today: nothing has shipped, so nothing can be turned on.
--
-- A test-local capability is promoted to 'available' partway through, because
-- otherwise the enable path could never be exercised at all. That promotion is
-- exactly what a real module's own migration will do when it ships.
-- ===========================================================================
begin;
select plan(37);
select tests.seed();

-- --- The catalog is a shared, read-only vocabulary --------------------------
select is(
  (select count(*)::int from barberos.capabilities),
  9, 't_catalog_has_the_nine_v1_modules');

-- The honest state of BarberOS today. This assertion read 0 until 2026-09-10,
-- and failing was its job: `owned_website` shipped in migration 0052 and the
-- test made the catalog's new truth impossible to leave unstated.
select is(
  (select count(*)::int from barberos.capabilities where status = 'available'),
  1, 't_exactly_one_capability_has_shipped');
select is(
  (select string_agg(key::text, ',' order by key) from barberos.capabilities
    where status = 'available'),
  'owned_website', 't_and_it_is_owned_website');

select is(
  (select status::text from barberos.capabilities where key = 'payments'),
  'deferred', 't_payments_is_deferred_in_the_catalog');

select is(
  (select count(*)::int from barberos.capabilities where is_default),
  0, 't_nothing_is_default_on_while_nothing_has_shipped');

-- --- A default that has not shipped is refused by the schema ----------------
select throws_ok($$
  update barberos.capabilities set is_default = true where key = 'booking'
$$, '23514', null, 't_a_planned_capability_cannot_be_marked_default');

-- --- Prerequisites are real edges, not documentation ------------------------
select is(
  (select requires_key::text from barberos.capability_requires
    where capability_key = 'walkin_queue'),
  'client_crm', 't_walkin_queue_requires_client_records');

select is(
  (select count(*)::int from barberos.bundle_capabilities where bundle_key = 'starter'),
  3, 't_starter_bundle_is_three_capabilities');

-- --- The shop is a satellite on platform.tenants ----------------------------
select tests.login_as(tests.uid('owner_a'));
select is(
  barberos.upsert_shop(tests.uid('tenant_a'), 'Tenant A Barbershop', 2),
  tests.uid('tenant_a'), 't_owner_can_create_the_shop_record');

select is(
  (select chair_count from barberos.shops where tenant_id = tests.uid('tenant_a')),
  2, 't_shop_carries_its_chair_count');

-- A `manager` may look, not configure. Turning capability on is a commercial act.
select tests.login_as(tests.uid('manager_a'));
select throws_ok(
  format($$select barberos.upsert_shop(%L::uuid, 'Renamed By Manager')$$, tests.uid('tenant_a')),
  '42501', null, 't_manager_cannot_reconfigure_the_shop');

select tests.login_as(tests.uid('viewer_a'));
select is(
  (select count(*)::int from barberos.shops),
  1, 't_viewer_can_read_the_shop_record');

-- --- Cross-tenant isolation on the toggle -----------------------------------
select tests.login_as(tests.uid('owner_b'));
select is(
  (select count(*)::int from barberos.shops),
  0, 't_another_tenant_cannot_see_this_shops_record');
select throws_ok(
  format($$select barberos.upsert_shop(%L::uuid, 'Hijacked')$$, tests.uid('tenant_a')),
  '42501', null, 't_another_tenant_cannot_configure_this_shop');

-- --- Nothing has shipped, so nothing can be enabled -------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'booking')$$, tests.uid('tenant_a')),
  '23514', null, 't_a_planned_capability_cannot_be_enabled');

-- The payments deferral, enforced rather than documented. This is the same
-- refusal as above but it is asserted separately on purpose: `booking` becomes
-- enableable the day booking ships, and `payments` must not.
select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'payments')$$, tests.uid('tenant_a')),
  '23514', null, 't_payments_cannot_be_enabled');

select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'nonexistent_module')$$, tests.uid('tenant_a')),
  'P0002', null, 't_an_unknown_capability_is_rejected');

select is(
  (select count(*)::int from barberos.tenant_capabilities),
  0, 't_no_capability_is_enabled_anywhere');

-- ===========================================================================
-- Ship two modules, test-locally, so the enable path can be exercised at all.
-- This is precisely the one-line change a real module's migration makes.
-- ===========================================================================
select tests.logout();
update barberos.capabilities set status = 'available'
 where key in ('client_crm', 'review_engine');

select tests.login_as(tests.uid('owner_a'));

-- --- Prerequisites block, in the right order --------------------------------
select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'review_engine')$$, tests.uid('tenant_a')),
  '23503', null, 't_review_engine_blocked_without_client_records');

select ok(
  barberos.enable_capability(tests.uid('tenant_a'), 'client_crm'),
  't_client_crm_enables_once_available');

select ok(
  not barberos.enable_capability(tests.uid('tenant_a'), 'client_crm'),
  't_enabling_an_already_on_capability_reports_false_not_an_error');

select ok(
  barberos.enable_capability(tests.uid('tenant_a'), 'review_engine'),
  't_review_engine_enables_once_its_prerequisite_is_on');

select ok(
  barberos.is_enabled(tests.uid('tenant_a'), 'review_engine'),
  't_the_capability_gate_reports_it_on');
select ok(
  not barberos.is_enabled(tests.uid('tenant_b'), 'review_engine'),
  't_the_gate_is_tenant_scoped');

-- --- The dependency cannot be pulled out from underneath --------------------
select throws_ok(
  format($$select barberos.disable_capability(%L::uuid, 'client_crm')$$, tests.uid('tenant_a')),
  '23503', null, 't_cannot_disable_a_capability_something_else_depends_on');

-- ===========================================================================
-- Non-negotiable #5: the review engine cannot be gated by predicted sentiment.
-- Not "should not". Cannot.
-- ===========================================================================
select tests.logout();
delete from barberos.tenant_capabilities
 where tenant_id = tests.uid('tenant_a') and capability_key = 'review_engine';
select tests.login_as(tests.uid('owner_a'));

select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'review_engine', 'individual', null,
            '{"min_rating": 4}'::jsonb)$$, tests.uid('tenant_a')),
  '23514', null, 't_review_engine_refuses_a_minimum_rating_gate');

select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'review_engine', 'individual', null,
            '{"gate_by_sentiment": true}'::jsonb)$$, tests.uid('tenant_a')),
  '23514', null, 't_review_engine_refuses_a_sentiment_gate');

select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'review_engine', 'individual', null,
            '{"ask_only_if_happy": true}'::jsonb)$$, tests.uid('tenant_a')),
  '23514', null, 't_review_engine_refuses_an_ask_only_if_happy_gate');

-- Timing IS configurable. The rule is about who gets asked, not when.
select ok(
  barberos.enable_capability(tests.uid('tenant_a'), 'review_engine', 'individual', null,
    '{"delay_hours": 4}'::jsonb),
  't_review_engine_accepts_a_timing_setting');

-- --- A bundle refuses to half-apply -----------------------------------------
-- `starter` is client_crm + booking + review_engine, and booking has not
-- shipped. Enabling two of three and calling it "Starter" would be a lie about
-- what the shop bought, so the whole call fails.
select tests.logout();
delete from barberos.tenant_capabilities where tenant_id = tests.uid('tenant_b');
insert into barberos.shops (tenant_id, shop_name) values (tests.uid('tenant_b'), 'Tenant B Barbershop');
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  format($$select barberos.apply_bundle(%L::uuid, 'starter')$$, tests.uid('tenant_b')),
  '23514', null, 't_a_bundle_containing_an_unshipped_module_fails_whole');
select is(
  (select count(*)::int from barberos.tenant_capabilities where tenant_id = tests.uid('tenant_b')),
  0, 't_the_failed_bundle_left_nothing_enabled');

-- --- A capability cannot be enabled for a tenant that is not a shop ---------
select tests.logout();
delete from barberos.shops where tenant_id = tests.uid('tenant_b');
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  format($$select barberos.enable_capability(%L::uuid, 'client_crm')$$, tests.uid('tenant_b')),
  'P0002', null, 't_a_non_shop_tenant_cannot_enable_a_capability');

-- ===========================================================================
-- Guard semantics must not depend on the environment's search_path (0050)
--
-- These four assertions are the regression test for a real defect. As first
-- written, `check (key ~ '...')` on a citext column resolved the citext
-- operator in production (search_path includes `extensions`) and the text
-- operator in the local sandbox (it does not) -- so the guard was
-- case-INSENSITIVE in production while the suite proved it case-SENSITIVE.
-- The constraint read as stronger protection than it was.
--
-- Written against the VALUES rather than against the constraint text, so they
-- mean the same thing under either runner and fail if the divergence returns.
-- ===========================================================================
select tests.logout();

select throws_ok($$
  insert into barberos.capabilities (key, name, category)
  values ('Booking_Upper', 'Uppercase key', 'core')
$$, '23514', null, 't_a_capability_key_with_uppercase_is_refused');

select throws_ok($$
  insert into barberos.bundles (key, name) values ('Starter_Upper', 'Uppercase bundle')
$$, '23514', null, 't_a_bundle_key_with_uppercase_is_refused');

select lives_ok($$
  insert into barberos.capabilities (key, name, category)
  values ('lowercase_ok', 'Lowercase key', 'core')
$$, 't_a_lowercase_capability_key_is_accepted');

-- The other direction, deliberately: capability_requires holds citext foreign
-- keys onto a citext primary key, so 'Booking' and 'booking' ARE the same
-- catalog row. A self-requirement in different capitalisation is still a
-- self-requirement and is still refused.
select throws_ok($$
  insert into barberos.capability_requires (capability_key, requires_key)
  values ('booking', 'BOOKING')
$$, '23514', null, 't_a_self_requirement_is_refused_whatever_its_capitalisation');

-- --- Every function pins its search_path ------------------------------------
-- The 0047 forward-repair existed because one function did not. Asserted for
-- this schema from the start rather than after the advisor finds it.
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'barberos'
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_barberos_function_pins_its_search_path');

select * from finish();
rollback;
