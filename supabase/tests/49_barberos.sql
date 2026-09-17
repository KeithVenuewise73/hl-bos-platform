\ir _fixtures.sql.inc

-- ===========================================================================
-- BarberOS — migrations 0049-0052.
--
-- These migrations are a reconstruction of a schema that was built directly
-- against production and never committed (see
-- docs/products/barberos/02-production-drift-map.md). Until now NOTHING here
-- had a test: the RLS looked right when read, but this repository had never
-- proven it. That is what this file is for.
--
-- It asserts the four claims BarberOS makes structurally:
--
--   1. A capability that is off is genuinely off -- the write is refused at
--      the table, not hidden in a UI. A capability that has not shipped
--      cannot be switched on at all.
--   2. One shop cannot see or touch another shop's clients. This is the most
--      sensitive data on the platform: named private individuals and their
--      phone numbers.
--   3. Exactly two functions are reachable without signing in, they are the
--      public shop page, and they cannot return a draft.
--   4. The product refuses to invent. No rhythm from too few visits, no
--      lifetime value without its own gaps, no publishing a page that cannot
--      tell a visitor where the shop is.
--
-- A NOTE ON WHY THE TABLE-LEVEL GUARDS ARE TESTED LAST, AS THE OWNER.
--
-- `authenticated` holds SELECT and nothing else on every barberos table, so a
-- direct INSERT as a signed-in user is refused with 42501 by the GRANT, before
-- any trigger or CHECK runs. The capability trigger also raises 42501. Written
-- naively, a test for the capability gate passes on the grant and never
-- exercises the trigger at all -- a green assertion proving nothing. The
-- trigger and constraint tests therefore run after logout, as the superuser
-- owner, where grants and RLS are out of the way and the guard under test is
-- the only thing that can fire.
-- ===========================================================================
begin;
select plan(74);
select tests.seed();

-- Created as the owner, before any impersonation: SECURITY DEFINER so it still
-- resolves the client id from a session that RLS would hide it from. That is
-- what lets the cross-tenant test below pass a REAL foreign id to record_visit
-- instead of a null that would fail for the wrong reason.
create or replace function tests.kh() returns uuid
language sql stable security definer as $$
  select id from barberos.clients where phone = '716-555-0101' limit 1
$$;
grant execute on function tests.kh() to public;

-- ===========================================================================
-- A. Structure
-- ===========================================================================
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'barberos' and c.relkind = 'r'),
  14, 't_fourteen_tables');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'barberos' and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity),
  14, 't_rls_enabled_and_forced_on_all_fourteen');

-- FORCE matters specifically: without it the table owner bypasses every policy,
-- and every write path here is a SECURITY DEFINER function running as the owner.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'barberos' and c.relkind = 'r' and not c.relforcerowsecurity),
  0, 't_no_table_without_force');

-- Reads are policy-gated; writes have NO policy at all, so every write must go
-- through a permission-checked RPC.
select is(
  (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'barberos' and p.polcmd <> 'r'),
  0, 't_no_write_policy_anywhere');

-- ===========================================================================
-- B. anon reaches exactly the public page, and nothing else
-- ===========================================================================
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'barberos' and grantee = 'anon'),
  0, 't_anon_has_no_table_grant_in_barberos');

select ok(not has_table_privilege('anon', 'barberos.clients', 'SELECT'),
  't_anon_cannot_select_clients');
select ok(not has_table_privilege('anon', 'barberos.visits', 'SELECT'),
  't_anon_cannot_select_visits');

-- The whole anon surface: two functions, both the public shop page.
select is(
  (select coalesce(string_agg(p.proname, ',' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_%'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'barberos_published_site,barberos_published_sitemap',
  't_anon_reaches_exactly_the_two_public_page_functions');

-- No function that takes an argument -- which is every function that reads or
-- writes a shop's data -- is reachable by anon.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'barberos' and p.pronargs > 0
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 't_anon_cannot_execute_any_barberos_function_that_takes_data');

-- What IS left: the five trigger functions carry PostgreSQL's built-in default
-- of EXECUTE to PUBLIC (their proacl is null). This is recorded rather than
-- fixed, because these migrations reproduce production exactly and production
-- is in this same state -- changing it here would be a behaviour change
-- smuggled in under a reconciliation. It is inert, and the next assertion
-- proves that: a trigger function cannot be called directly at all.
select is(
  (select coalesce(string_agg(p.proname, ',' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'barberos' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'enforce_locked_config,enforce_no_orphan_dependents,enforce_prerequisites,enforce_publishable,require_capability',
  't_the_only_anon_executable_barberos_functions_are_the_five_triggers');

select throws_ok(
  $$ select barberos.enforce_publishable() $$,
  '0A000', null, 't_and_a_trigger_function_cannot_be_called_directly');

-- ===========================================================================
-- C. The shop, and the capability catalog
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));

select is(barberos.upsert_shop(tests.uid('tenant_a'), 'Herman & Sons', 3, 'America/New_York'),
  tests.uid('tenant_a'), 't_owner_can_create_the_shop');

-- A capability that has not shipped cannot be switched on. This is the
-- difference between a roadmap and a lie.
select throws_ok(
  $$ select barberos.enable_capability(tests.uid('tenant_a'), 'booking') $$,
  '23514', null, 't_cannot_enable_a_planned_capability');
select throws_ok(
  $$ select barberos.enable_capability(tests.uid('tenant_a'), 'payments') $$,
  '23514', null, 't_cannot_enable_a_deferred_capability');
select throws_ok(
  $$ select barberos.enable_capability(tests.uid('tenant_a'), 'not_a_real_capability') $$,
  'P0002', null, 't_cannot_enable_an_unknown_capability');

-- A tenant that is not a shop cannot hold capabilities.
select throws_ok(
  $$ select barberos.enable_capability(tests.uid('tenant_b'), 'client_crm') $$,
  null, null, 't_a_non_shop_tenant_cannot_enable_anything');

select ok(barberos.enable_capability(tests.uid('tenant_a'), 'client_crm'),
  't_enable_client_crm');
select ok(not barberos.enable_capability(tests.uid('tenant_a'), 'client_crm'),
  't_enabling_twice_reports_false_rather_than_erroring');
select ok(barberos.is_enabled(tests.uid('tenant_a'), 'client_crm'),
  't_is_enabled_reports_it');
select ok(barberos.enable_capability(tests.uid('tenant_a'), 'owned_website'),
  't_enable_owned_website');

-- A viewer may read the shop but may not change what it can do.
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select barberos.enable_capability(tests.uid('tenant_a'), 'client_crm') $$,
  '42501', null, 't_a_viewer_cannot_change_capabilities');
select tests.login_as(tests.uid('owner_a'));

-- The anti-review-gating lock, as data. These keys are refused by a trigger.
select is(
  (select locked_config_keys from barberos.capabilities where key = 'review_engine'),
  array['min_rating','gate_by_sentiment','suppress_below','ask_only_if_happy','predicted_sentiment_threshold'],
  't_review_engine_locks_the_gating_keys');

-- ===========================================================================
-- D. Clients, visits, and the rhythm
-- ===========================================================================
select ok(barberos.upsert_client(tests.uid('tenant_a'), 'Keith Herman', '716-555-0101') is not null,
  't_create_a_client');

-- The same phone twice is the same person, not a second record that splits
-- their history in half.
select is(
  barberos.upsert_client(tests.uid('tenant_a'), 'Keith H', '716-555-0101'),
  barberos.upsert_client(tests.uid('tenant_a'), 'Keith Herman', '716-555-0101'),
  't_same_phone_updates_rather_than_duplicating');
select is((select count(*)::int from barberos.clients where tenant_id = tests.uid('tenant_a')),
  1, 't_still_one_client');

-- A rhythm needs three visits. Two is not a rhythm.
select ok(barberos.record_visit(tests.uid('tenant_a'), tests.kh(),
       jsonb_build_object('visited_on', (current_date - 96)::text, 'price_cents', 4000,
                          'sides_guard', 2, 'top_finish', 'scissor', 'fade', 'mid',
                          'tools', jsonb_build_array('Wahl Magic Clip'))) is not null,
  't_record_first_visit');
select ok(barberos.record_visit(tests.uid('tenant_a'), tests.kh(),
       jsonb_build_object('visited_on', (current_date - 68)::text, 'price_cents', 4000)) is not null,
  't_record_second_visit');

select is(barberos.client_rhythm(tests.kh())->>'typical_days', null,
  't_no_rhythm_claimed_from_two_visits');
select is(barberos.client_rhythm(tests.kh())->>'basis', 'not enough visits to know a rhythm',
  't_and_it_says_why_in_plain_words');
select is(barberos.client_rhythm(tests.kh())->>'overdue_by_days', null,
  't_overdue_is_null_not_zero_when_there_is_no_rhythm');
select is(jsonb_array_length(barberos.clients_due(tests.uid('tenant_a'))), 0,
  't_and_nobody_is_reported_due_on_a_rhythm_we_do_not_know');

-- Third visit: now there is a rhythm, and it is 28 days.
select ok(barberos.record_visit(tests.uid('tenant_a'), tests.kh(),
       jsonb_build_object('visited_on', (current_date - 40)::text)) is not null,
  't_record_third_visit');
select is(barberos.client_rhythm(tests.kh())->>'typical_days', '28',
  't_rhythm_is_learned_from_the_gaps');
select is(barberos.client_rhythm(tests.kh())->>'basis', 'average of the last gaps',
  't_basis_names_how_it_was_derived');
select is(barberos.client_rhythm(tests.kh())->>'overdue_by_days', '12',
  't_overdue_by_twelve_forty_days_since_a_twenty_eight_day_rhythm');

-- The overdue engine the retention capability will run on.
select is(jsonb_array_length(barberos.clients_due(tests.uid('tenant_a'))), 1,
  't_clients_due_finds_the_overdue_regular');
select is(barberos.clients_due(tests.uid('tenant_a'))->0->>'display_name', 'Keith Herman',
  't_and_names_them');

-- Lifetime value is never readable without its own gaps.
select is(barberos.client_timeline(tests.kh())->'value'->>'total_cents', '8000',
  't_lifetime_value_sums_what_is_recorded');
select is(barberos.client_timeline(tests.kh())->'value'->>'visits_without_a_price', '1',
  't_and_discloses_the_visit_with_no_price');

-- The cut itself, and the kit, survive. Visits are newest-first, so the first
-- one recorded is last in the list.
select is(barberos.client_timeline(tests.kh())->'visits'->2->>'fade', 'mid',
  't_the_fade_is_remembered');
select is(barberos.client_timeline(tests.kh())->'visits'->2->'tools'->>0, 'Wahl Magic Clip',
  't_the_tool_used_is_remembered');
select is((select count(*)::int from barberos.tools where tenant_id = tests.uid('tenant_a')),
  1, 't_the_kit_list_built_itself_from_use');

-- ===========================================================================
-- E. Cross-tenant. The most important assertions in this file.
-- ===========================================================================
select tests.login_as(tests.uid('owner_b'));

select is((select count(*)::int from barberos.clients), 0,
  't_another_shops_owner_sees_no_clients_at_all');
select is((select count(*)::int from barberos.visits), 0,
  't_and_no_visits');
select is((select count(*)::int from barberos.shops), 0,
  't_and_not_even_the_shop_row');

-- tests.kh() is SECURITY DEFINER, so this passes a REAL foreign client id.
-- record_visit must reject it on ownership, not on it being missing.
select throws_ok(
  format($$ select barberos.record_visit(%L::uuid, %L::uuid, '{}'::jsonb) $$,
         tests.uid('tenant_b'), tests.kh()),
  '23514', null, 't_cannot_file_a_visit_against_another_shops_client');

select throws_ok(
  format($$ select barberos.client_timeline(%L::uuid) $$, tests.kh()),
  '42501', null, 't_cannot_read_another_shops_client_timeline');
select throws_ok(
  format($$ select barberos.clients_due(%L::uuid) $$, tests.uid('tenant_a')),
  '42501', null, 't_cannot_run_another_shops_overdue_report');

-- ===========================================================================
-- F. The publish gate
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));
select ok(barberos.upsert_site(tests.uid('tenant_a'), 'herman-and-sons',
       'Traditional cuts in Clarence') is not null, 't_create_the_page');

-- Missing an address, a way to act, and hours.
select throws_ok(
  $$ select barberos.publish_site(tests.uid('tenant_a')) $$,
  '23514', null, 't_cannot_publish_a_page_that_cannot_tell_a_visitor_anything');

select is(barberos.published_site('herman-and-sons'), null,
  't_an_unpublished_page_is_not_readable_by_slug');

select ok(barberos.upsert_site(tests.uid('tenant_a'), 'herman-and-sons', null, null,
       '716-555-0199', '8383 Main St', 'Clarence', 'NY', '14031') is not null,
  't_fill_in_the_address_and_phone');
select lives_ok(
  $$ select barberos.set_site_hours(tests.uid('tenant_a'), 2::smallint, false,
       '09:00'::time, '18:00'::time) $$,
  't_set_tuesday_hours');
select is(barberos.publish_site(tests.uid('tenant_a'))::text, 'published',
  't_now_it_publishes');
select ok(barberos.published_site('herman-and-sons') is not null,
  't_and_is_readable_by_slug');

-- The visitor gets the shop's facts and none of the platform's identifiers.
select ok(barberos.published_site('herman-and-sons') ? 'shop_name',
  't_public_page_carries_the_shop_name');
select ok(not (barberos.published_site('herman-and-sons') ? 'tenant_id'),
  't_public_page_does_not_leak_the_tenant_id');
select is(jsonb_array_length(barberos.published_sitemap()), 1,
  't_the_sitemap_lists_the_one_published_page');

select is(barberos.unpublish_site(tests.uid('tenant_a'))::text, 'unpublished',
  't_unpublish');
select is(barberos.published_site('herman-and-sons'), null,
  't_and_it_stops_being_readable_immediately');
select is(jsonb_array_length(barberos.published_sitemap()), 0,
  't_and_leaves_the_sitemap');

-- ===========================================================================
-- G. Table-level guards, as the owner.
--
-- See the header: as `authenticated` these all fail on the GRANT (42501)
-- before the guard under test can fire, so a passing assertion there would
-- prove nothing. As the superuser owner the grants and RLS are out of the way
-- and the trigger or CHECK is the only thing left that can refuse the write.
-- ===========================================================================
select tests.logout();

-- The capability gate. tenant_b is not a shop and has nothing enabled.
select throws_ok(
  format($$ insert into barberos.clients (tenant_id, display_name)
            values (%L::uuid, 'Should Not Exist') $$, tests.uid('tenant_b')),
  '42501', null, 't_capability_trigger_refuses_a_client_write_when_client_crm_is_off');
select throws_ok(
  format($$ insert into barberos.tools (tenant_id, name)
            values (%L::uuid, 'Should Not Exist') $$, tests.uid('tenant_b')),
  '42501', null, 't_capability_trigger_refuses_a_tool_write_too');

-- The locked config keys, refused by the trigger rather than by convention.
select throws_ok(
  format($$ insert into barberos.tenant_capabilities (tenant_id, capability_key, config)
            values (%L::uuid, 'review_engine', '{"ask_only_if_happy": true}'::jsonb) $$,
         tests.uid('tenant_a')),
  '23514', null, 't_review_gating_config_is_refused_at_the_schema');

-- Prerequisites, and dependents.
-- ai_advisor requires reporting_dashboard, which is not enabled. (local_seo
-- would NOT have worked here: its prerequisite, owned_website, is already on --
-- the first draft of this test passed for that reason and proved nothing.)
select throws_ok(
  format($$ insert into barberos.tenant_capabilities (tenant_id, capability_key)
            values (%L::uuid, 'ai_advisor') $$, tests.uid('tenant_a')),
  '23503', null, 't_prerequisite_is_enforced_by_the_trigger');
select lives_ok(
  format($$ insert into barberos.tenant_capabilities (tenant_id, capability_key)
            values (%L::uuid, 'retention_engine') $$, tests.uid('tenant_a')),
  't_a_capability_whose_prerequisite_is_met_inserts');
select throws_ok(
  format($$ delete from barberos.tenant_capabilities
             where tenant_id = %L::uuid and capability_key = 'client_crm' $$,
         tests.uid('tenant_a')),
  '23503', null, 't_cannot_disable_something_another_capability_depends_on');

-- The cut's own constraints.
select throws_ok(
  format($$ insert into barberos.visits (tenant_id, client_id, visited_on)
            values (%L::uuid, tests.kh(), current_date + 1) $$, tests.uid('tenant_a')),
  '23514', null, 't_a_visit_cannot_be_in_the_future');
select throws_ok(
  format($$ insert into barberos.visits (tenant_id, client_id, sides_guard)
            values (%L::uuid, tests.kh(), 14) $$, tests.uid('tenant_a')),
  '23514', null, 't_guard_fourteen_is_a_typo_not_a_haircut');
select throws_ok(
  format($$ insert into barberos.visits (tenant_id, client_id, top_finish, top_guard)
            values (%L::uuid, tests.kh(), 'scissor', 3) $$, tests.uid('tenant_a')),
  '23514', null, 't_a_guard_number_needs_a_guard_finish');
select throws_ok(
  format($$ insert into barberos.visits (tenant_id, client_id, beard, beard_guard)
            values (%L::uuid, tests.kh(), false, 3) $$, tests.uid('tenant_a')),
  '23514', null, 't_a_beard_guard_needs_a_beard');

-- The page's own constraints.
select throws_ok(
  format($$ update barberos.sites set slug = 'Not A Slug' where tenant_id = %L::uuid $$,
         tests.uid('tenant_a')),
  '23514', null, 't_a_slug_must_look_like_a_slug');
select throws_ok(
  format($$ update barberos.sites set booking_url = 'javascript:alert(1)'
             where tenant_id = %L::uuid $$, tests.uid('tenant_a')),
  '23514', null, 't_a_booking_link_must_be_http_or_https');
select throws_ok(
  format($$ insert into barberos.site_hours (tenant_id, day_of_week, is_closed, opens_at)
            values (%L::uuid, 3, false, '09:00') $$, tests.uid('tenant_a')),
  '23514', null, 't_an_open_day_cannot_be_half_stated');

select * from finish();
rollback;
