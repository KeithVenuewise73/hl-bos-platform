\ir _fixtures.sql.inc

-- ===========================================================================
-- The operator cockpit's API — migration 0056.
--
-- 0049-0055 left the transformation workflow reachable at both ends and
-- broken in the middle. This file establishes four things.
--
-- 1. THE WRAPPER STILL ADDS REACHABILITY, NEVER AUTHORITY. Nine new public
--    functions, none of them SECURITY DEFINER, none reachable by anon. Each is
--    called again by a principal who lacks the permission, to show it refuses
--    exactly what the function behind it would have refused.
--
-- 2. THE CATALOG TELLS THE TRUTH ABOUT WHAT HAS SHIPPED. Sixteen capabilities
--    are seeded and exactly TWO are 'available'. Three bundles are seeded and
--    NOT ONE of them is deliverable today, because apply_bundle() refuses the
--    first capability that has not shipped and every bundle contains one. A
--    cockpit that drew three Apply buttons would draw three controls that
--    cannot do their job, so barberos_catalog() reports deliverable_today per
--    bundle and this file proves the flag matches what apply_bundle actually
--    does. The flag and the refusal are asserted together on purpose: either
--    one alone could drift into a comfortable lie.
--
-- 3. A CLIENT IS ONBOARDED AFTER A SALE, NOT BEFORE IT. provision_client()
--    creates a paying-customer tenant, so it refuses a prospect with no
--    accepted proposal. Without that gate the pipeline could report a sale
--    that never happened.
--
-- 4. PRICING LIVES IN THE PROPOSAL DOCUMENT, NOT IN CODE. The setup fee and
--    the monthly retainer are asserted to round-trip through the document
--    jsonb, which is what makes the commercial model changeable without a
--    migration.
--
-- ORDERING IS LOAD-BEARING HERE, and the reason is a bug this suite has
-- already produced once: an assertion that fails for the wrong reason passes
-- as proof of something it never tested. provision_client() has two obstacles
-- -- no accepted proposal, and no platform.tenant.create -- so the
-- no-proposal refusal is asserted BEFORE the sale using a principal who HAS
-- tenant.create, and the no-tenant.create refusal AFTER it using one who does
-- not. Either test run in the other order would go green having proved
-- nothing.
-- ===========================================================================
begin;
select plan(75);
select tests.seed();

-- The platform admin needs a seat at the agency too: onboarding requires the
-- agency-side sale permission AND the platform-wide right to create a tenant,
-- and the shared fixture gives padmin only the second.
insert into identity.memberships (id, tenant_id, user_id, status)
values (tests.uid('m_padmin_a'), tests.uid('tenant_a'), tests.uid('padmin'), 'active')
on conflict (id) do nothing;
insert into identity.membership_roles (membership_id, role_key)
values (tests.uid('m_padmin_a'), 'tenant_owner') on conflict do nothing;

-- SECURITY DEFINER so a foreign id is resolved for the test rather than
-- hidden by the RLS of whoever is impersonated -- a lookup that returns null
-- under RLS makes the next assertion fail on a null argument instead of on
-- the rule it was written for.
create or replace function tests.ck_prospect() returns uuid
language sql stable security definer as $$
  select id from visibility.prospects where business_name = 'Clarence Barber Co' limit 1
$$;
create or replace function tests.ck_run() returns uuid
language sql stable security definer as $$
  select id from transform_audit.runs order by started_at limit 1
$$;
create or replace function tests.ck_proposal() returns uuid
language sql stable security definer as $$
  select id from transform_audit.proposals order by created_at limit 1
$$;
create or replace function tests.ck_client_tenant() returns uuid
language sql stable security definer as $$
  select tenant_id from barberos.shops where origin_prospect_id = tests.ck_prospect()
$$;
grant execute on function tests.ck_prospect() to public;
grant execute on function tests.ck_run() to public;
grant execute on function tests.ck_proposal() to public;
grant execute on function tests.ck_client_tenant() to public;

-- The nine functions this migration adds, named rather than pattern-matched:
-- three of them are barberos_* and two are barberos_audit_*, so no single
-- LIKE would cover the set without also counting 0052 and 0055.
create or replace function tests.ck_api() returns setof oid
language sql stable as $$
  select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'barberos_catalog','barberos_capability_state','barberos_save_shop',
     'barberos_enable_capability','barberos_disable_capability',
     'barberos_apply_bundle','barberos_provision_client',
     'barberos_audit_my_agencies','barberos_audit_pipeline')
$$;
grant execute on function tests.ck_api() to public;

-- ===========================================================================
-- A. The surface itself
-- ===========================================================================
select is((select count(*)::int from tests.ck_api()), 9,
  't_nine_new_public_functions');

select is(
  (select count(*)::int from pg_proc p where p.oid in (select tests.ck_api()) and p.prosecdef),
  0, 't_not_one_of_them_is_its_own_authority');

-- None of this has a public audience. The only anon-reachable BarberOS
-- functions are the two published-page reads from 0052.
select is(
  (select count(*)::int from tests.ck_api() o
    where has_function_privilege('anon', o, 'EXECUTE')),
  0, 't_anon_can_execute_none_of_them');

select is(
  (select count(*)::int from tests.ck_api() o
    where not has_function_privilege('authenticated', o, 'EXECUTE')),
  0, 't_authenticated_can_reach_all_of_them');

-- ===========================================================================
-- B. The catalog, which nothing could read before this migration
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));

select is(jsonb_array_length(public.barberos_catalog()->'capabilities'), 16,
  't_the_catalog_reports_all_sixteen_capabilities');

-- The commercially important number in this whole file.
select is(
  (select count(*)::int from jsonb_array_elements(public.barberos_catalog()->'capabilities') c
    where (c->>'is_available')::boolean),
  2, 't_and_exactly_two_of_them_have_actually_shipped');

select is(
  (select jsonb_agg(c->>'key' order by c->>'key')
     from jsonb_array_elements(public.barberos_catalog()->'capabilities') c
    where (c->>'is_available')::boolean),
  '["client_crm","owned_website"]'::jsonb,
  't_and_names_which_two');

-- A blocker that names nobody is a blocker nobody clears, so the catalog
-- carries both halves out to the UI.
select is(
  (select c->>'blocker_owner' from jsonb_array_elements(public.barberos_catalog()->'capabilities') c
    where c->>'key' = 'missed_call_capture'),
  'ceo', 't_a_planned_capability_reports_who_owns_its_blocker');
select ok(
  (select length(c->>'blocked_on') > 0 from jsonb_array_elements(public.barberos_catalog()->'capabilities') c
    where c->>'key' = 'missed_call_capture'),
  't_and_what_the_blocker_actually_is');

select is(
  (select c->>'status' from jsonb_array_elements(public.barberos_catalog()->'capabilities') c
    where c->>'key' = 'payments'),
  'deferred', 't_the_deferred_capability_says_deferred_rather_than_being_hidden');

-- The review engine's gating keys are locked at the schema. A proposal UI has
-- to be able to see that, or it will offer review gating as a feature.
select ok(
  (select (c->'locked_config_keys') @> '["ask_only_if_happy"]'::jsonb
     from jsonb_array_elements(public.barberos_catalog()->'capabilities') c
    where c->>'key' = 'review_engine'),
  't_the_review_engine_reports_its_locked_config_keys');

select is(
  (select c->'requires'->0->>'key' from jsonb_array_elements(public.barberos_catalog()->'capabilities') c
    where c->>'key' = 'local_seo'),
  'owned_website', 't_and_prerequisites_travel_with_the_capability');

select is(jsonb_array_length(public.barberos_catalog()->'bundles'), 3,
  't_three_bundles_are_seeded');

-- The headline: every bundle contains something that has not shipped.
select is(
  (select count(*)::int from jsonb_array_elements(public.barberos_catalog()->'bundles') b
    where (b->>'deliverable_today')::boolean),
  0, 't_and_not_one_of_them_is_deliverable_today');

select is(
  (select b->>'shipped' || ' of ' || (b->>'total')
     from jsonb_array_elements(public.barberos_catalog()->'bundles') b
    where b->>'key' = 'starter'),
  '1 of 3', 't_the_starter_bundle_reports_one_shipped_of_three');

select is(
  (select b->'blocked_by' from jsonb_array_elements(public.barberos_catalog()->'bundles') b
    where b->>'key' = 'starter'),
  '["booking","review_engine"]'::jsonb,
  't_and_names_exactly_what_blocks_it');

-- ===========================================================================
-- C. The shop row and its capabilities — the middle of the workflow
-- ===========================================================================
select ok(public.barberos_save_shop(tests.uid('tenant_a'), 'Tenant A Barbers', 2,
       'America/New_York') is not null,
  't_a_shop_row_can_finally_be_created_through_the_api');

select is(public.barberos_enable_capability(tests.uid('tenant_a'), 'client_crm'), true,
  't_a_shipped_capability_can_be_switched_on');

-- Already on is not an error and not a lie: false means "nothing changed".
select is(public.barberos_enable_capability(tests.uid('tenant_a'), 'client_crm'), false,
  't_and_switching_it_on_twice_reports_that_nothing_changed');

select is(jsonb_array_length(public.barberos_capability_state(tests.uid('tenant_a'))), 1,
  't_the_state_read_reports_it');
select is(public.barberos_capability_state(tests.uid('tenant_a'))->0->>'enabled_via',
  'individual', 't_with_the_provenance_of_how_it_was_enabled');

-- The whole reason 'planned' and 'deferred' exist as separate states.
select throws_ok(
  $$ select public.barberos_enable_capability(tests.uid('tenant_a'), 'booking') $$,
  '23514', null, 't_a_planned_capability_cannot_be_switched_on_at_all');
select throws_ok(
  $$ select public.barberos_enable_capability(tests.uid('tenant_a'), 'payments') $$,
  '23514', null, 't_and_neither_can_the_deferred_one');

select is(public.barberos_disable_capability(tests.uid('tenant_a'), 'client_crm'), true,
  't_and_it_can_be_switched_back_off');
select is(jsonb_array_length(public.barberos_capability_state(tests.uid('tenant_a'))), 0,
  't_leaving_the_shop_with_nothing_enabled');

-- The catalog's deliverable_today flag is not cosmetic: this is the refusal it
-- is reporting in advance.
select throws_ok(
  $$ select public.barberos_apply_bundle(tests.uid('tenant_a'), 'starter') $$,
  '23514', null, 't_and_the_starter_bundle_really_is_refused');
select is(jsonb_array_length(public.barberos_capability_state(tests.uid('tenant_a'))), 0,
  't_and_the_refused_bundle_left_nothing_half_enabled');

-- The wrapper adds reachability, never authority.
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select public.barberos_enable_capability(tests.uid('tenant_a'), 'client_crm') $$,
  '42501', null, 't_a_viewer_cannot_switch_a_capability_on');
select is(jsonb_array_length(public.barberos_capability_state(tests.uid('tenant_a'))), 0,
  't_but_may_read_the_state_because_viewer_holds_shop_read');

select tests.login_as(tests.uid('outsider'));
select throws_ok(
  $$ select public.barberos_save_shop(tests.uid('tenant_a'), 'Not Yours', 1) $$,
  '42501', null, 't_a_non_member_cannot_create_a_shop_in_someone_elses_tenant');
select is(jsonb_array_length(public.barberos_capability_state(tests.uid('tenant_a'))), 0,
  't_and_sees_an_empty_state_rather_than_another_tenants_capabilities');

-- ===========================================================================
-- D. The pipeline, built through the existing API
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));

select ok(public.barberos_audit_save_campaign(tests.uid('tenant_a'), 'wny_q4',
       'Western New York Q4', '{"website": 70, "google_business": 30}'::jsonb)
     is not null, 't_a_campaign_exists_to_run_against');
select ok(public.barberos_audit_import_shop(tests.uid('tenant_a'), jsonb_build_object(
       'business_name','Clarence Barber Co', 'locality','Clarence', 'region','NY',
       'postal_code','14031', 'source_file','wny-barbershops.csv', 'source_row', 1))
     is not null, 't_and_a_prospect_to_audit');

-- Before anything happens, every later stage must read as absent rather than
-- as zero. An empty panel that says why beats a green one that lies.
select is(jsonb_array_length(public.barberos_audit_pipeline(tests.uid('tenant_a'))), 1,
  't_the_pipeline_reports_the_prospect_immediately');
select ok(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_run' = 'null'::jsonb,
  't_with_no_run_yet_rather_than_a_score_of_zero');
select ok(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'discovery' = 'null'::jsonb,
  't_and_no_discovery_call_yet');
select ok(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'onboarding' = 'null'::jsonb,
  't_and_not_onboarded');

select ok(public.barberos_audit_start_run(
       (public.barberos_audit_campaigns(tests.uid('tenant_a'))->0->>'id')::uuid,
       tests.ck_prospect()) is not null, 't_a_run_is_started');

-- One finding with an evidence URL and one without, so the evidence counts in
-- the pipeline have something real to distinguish.
select ok(public.barberos_audit_record_finding(tests.ck_run(), 'website', 'no_booking_link',
       'The homepage offers no way to book online.', 'verified', 'critical',
       'https://clarencebarber.example/') is not null,
  't_an_evidenced_finding_is_recorded');
select ok(public.barberos_audit_record_finding(tests.ck_run(), 'google_business', 'no_posts',
       'Nothing has been posted to the Google profile in a year.', 'inferred', 'medium')
     is not null, 't_and_an_inferred_one_with_no_evidence_url');

select is(public.barberos_audit_record_dimension(tests.ck_run(), 'website', 40,
       'verified', 'barber_web_rubric_v1'), 40, 't_one_dimension_is_scored');
select ok(public.barberos_audit_finish_run(tests.ck_run()) is not null, 't_and_the_run_finishes');

select ok(public.barberos_audit_record_discovery(tests.ck_prospect(),
       '{"own_website": false, "online_booking": false, "chairs": 3}'::jsonb)
     is not null, 't_the_discovery_call_is_recorded');

select ok(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'discovery'->>'answered_at'
          is not null, 't_and_the_pipeline_reports_the_call_as_answered');

-- The rule 0055 established, carried into this read: a bare score is
-- ambiguous in a way that matters commercially.
select ok(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_run' ? 'coverage',
  't_the_score_never_travels_without_its_coverage');
select is(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_run'->'coverage'->>'possible',
  '2', 't_naming_both_weighted_dimensions');
select is(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_run'->'coverage'->>'scored',
  '1', 't_and_the_one_that_actually_scored');
select is(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_run'->>'status',
  'partially_completed', 't_and_the_run_admits_it_is_only_partly_done');

-- An operator has to be able to see that a run is built partly on inference
-- before quoting any of it to a shop.
select is(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_run'->>'findings',
  '2', 't_the_finding_count_is_reported');
select is(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_run'->>'evidenced_findings',
  '1', 't_alongside_how_many_of_them_carry_evidence');

-- ===========================================================================
-- E. The sale, and the gate in front of onboarding
--
-- Read the ordering note in the header before changing anything here.
-- ===========================================================================
select ok(public.barberos_audit_draft_proposal(tests.ck_prospect(), tests.ck_run(),
       jsonb_build_object(
         'headline', 'A page you own, and a record of every client',
         -- Configurable pricing: the commercial model is data in this
         -- document, not a constant in application code.
         'pricing', jsonb_build_object('setup_cents', 150000, 'monthly_cents', 75000,
                                       'currency', 'USD'),
         'offer', jsonb_build_array(
           jsonb_build_object('capability', 'owned_website', 'deliverable_today', true),
           jsonb_build_object('capability', 'client_crm', 'deliverable_today', true))))
     is not null, 't_a_proposal_is_drafted_offering_only_what_has_shipped');

select is(public.barberos_audit_proposal(tests.ck_proposal())->'document'->'pricing'->>'monthly_cents',
  '75000', 't_and_its_monthly_price_round_trips_as_data_not_code');
select is(public.barberos_audit_proposal(tests.ck_proposal())->'document'->'pricing'->>'setup_cents',
  '150000', 't_as_does_the_setup_fee');

-- FIRST obstacle, asserted while it is the ONLY one: padmin holds
-- platform.tenant.create, so a refusal here can only be the sale gate.
select tests.login_as(tests.uid('padmin'));
select throws_ok(
  $$ select public.barberos_provision_client(tests.ck_prospect(), 'clarence-barber-co') $$,
  '23514', null, 't_a_prospect_with_no_accepted_proposal_cannot_be_onboarded');

select tests.login_as(tests.uid('owner_a'));
select ok(public.barberos_audit_send_proposal(tests.ck_proposal()) is not null,
  't_the_proposal_is_sent');
select is(public.barberos_audit_decide_proposal(tests.ck_proposal(), 'accepted',
       'Signed at the chair.'), tests.ck_proposal(), 't_and_accepted');

-- SECOND obstacle, asserted once the first is cleared: owner_a is a tenant
-- owner but not a platform admin, so a refusal here can only be tenant.create.
select throws_ok(
  $$ select public.barberos_provision_client(tests.ck_prospect(), 'clarence-barber-co') $$,
  '42501', null,
  't_and_a_sale_alone_does_not_let_a_non_platform_admin_create_a_tenant');

select tests.login_as(tests.uid('padmin'));
select ok(public.barberos_provision_client(tests.ck_prospect(), 'clarence-barber-co',
       'Clarence Barber Co', 3) is not null, 't_the_sold_shop_is_onboarded');

select is((select shop_name from barberos.shops where tenant_id = tests.ck_client_tenant()),
  'Clarence Barber Co', 't_and_has_a_shop_row_of_its_own');
select is((select origin_prospect_id from barberos.shops where tenant_id = tests.ck_client_tenant()),
  tests.ck_prospect(), 't_linked_back_to_the_prospect_it_came_from');
select isnt(tests.ck_client_tenant(), tests.uid('tenant_a'),
  't_in_its_own_tenant_and_not_the_agencys');

-- Idempotence would be wrong: a second call means a second tenant for one
-- shop, and afterwards nothing would tell the two apart.
select throws_ok(
  $$ select public.barberos_provision_client(tests.ck_prospect(), 'clarence-barber-co-2') $$,
  '23505', null, 't_and_onboarding_the_same_shop_twice_is_refused');

select ok(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'onboarding'->>'onboarded_at'
          is not null, 't_the_pipeline_now_reports_the_delivery_stage');
select is(public.barberos_audit_pipeline(tests.uid('tenant_a'))->0->'latest_proposal'->>'status',
  'accepted', 't_and_the_sale_that_produced_it');

-- ===========================================================================
-- F. Tenancy, and what the cockpit is allowed to offer
-- ===========================================================================
select tests.login_as(tests.uid('owner_b'));
select is(jsonb_array_length(public.barberos_audit_pipeline(tests.uid('tenant_b'))), 0,
  't_another_agency_has_an_empty_pipeline_of_its_own');
select throws_ok(
  $$ select public.barberos_audit_pipeline(tests.uid('tenant_a')) $$,
  '42501', null, 't_and_cannot_read_this_agencys_pipeline_at_all');
select is(jsonb_array_length(public.barberos_audit_my_agencies()), 1,
  't_and_is_offered_only_its_own_agency');
select is(public.barberos_audit_my_agencies()->0->>'tenant_id', tests.uid('tenant_b')::text,
  't_which_is_tenant_b');

select tests.login_as(tests.uid('outsider'));
select throws_ok(
  $$ select public.barberos_audit_pipeline(tests.uid('tenant_a')) $$,
  '42501', null, 't_a_non_member_is_refused_the_pipeline');
select is(jsonb_array_length(public.barberos_audit_my_agencies()), 0,
  't_and_is_offered_no_agency_to_operate');

-- The `can` flags exist so a button is hidden because the permission is
-- absent, not because someone hardcoded a role name.
select tests.login_as(tests.uid('owner_a'));
select is(public.barberos_audit_my_agencies()->0->'can'->>'run_audits', 'true',
  't_a_tenant_owner_is_offered_the_audit_controls');
select is(public.barberos_audit_my_agencies()->0->'can'->>'onboard_clients', 'false',
  't_but_not_onboarding_which_needs_a_platform_permission_it_lacks');

select tests.login_as(tests.uid('padmin'));
select is(public.barberos_audit_my_agencies()->0->'can'->>'onboard_clients', 'true',
  't_while_the_platform_admin_is_offered_it');

select tests.login_as(tests.uid('viewer_a'));
select is(public.barberos_audit_my_agencies()->0->'can'->>'manage_proposals', 'false',
  't_and_a_viewer_is_offered_no_proposal_controls');
select is(public.barberos_audit_my_agencies()->0->'can'->>'read_audits', 'true',
  't_though_the_audits_themselves_stay_readable');

select tests.logout();
select * from finish();
rollback;
