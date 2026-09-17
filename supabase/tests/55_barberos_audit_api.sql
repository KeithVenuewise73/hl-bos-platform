\ir _fixtures.sql.inc

-- ===========================================================================
-- The Business Transformation Audit public API — migration 0055.
--
-- NEW work, not a reconstruction: this API does not exist in production. It
-- exists because transform_audit held 27 functions and, in production, 40
-- recorded audit runs against 50 real barbershops, and NOTHING could read any
-- of it.
--
-- Two things this file has to establish.
--
-- 1. THE WRAPPER ADDS REACHABILITY, NEVER AUTHORITY. Every public function is
--    SECURITY INVOKER and delegates to a SECURITY DEFINER function that checks
--    its own permission. So the whole API is exercised here THROUGH the public
--    surface, and then called again by principals who lack the permission, to
--    show the wrapper refuses exactly what the inner function would have.
--    A public RPC that quietly granted more than the schema function behind it
--    would be the worst possible defect in this design, and it is the one this
--    file is really for.
--
-- 2. THE SCORE NEVER TRAVELS WITHOUT ITS COVERAGE. Every response carrying
--    composite_score carries `coverage` in the same object. A bare 0 is
--    ambiguous in a way that matters commercially: it can mean "we looked and
--    it was bad" or "nothing ever reached this dimension". In production today
--    35 runs read completed at 1 of 1 with a composite of 0, 5 read
--    partially_completed at 0 of 1 with no score, and not one of the 45
--    findings carries an evidence URL -- so a caller must not be able to render
--    "0/100" as a judgement about the barbershop.
-- ===========================================================================
begin;
select plan(55);
select tests.seed();

create or replace function tests.api_prospect() returns uuid
language sql stable security definer as $$
  select id from visibility.prospects where business_name = 'Clarence Barber Co' limit 1
$$;
create or replace function tests.api_run() returns uuid
language sql stable security definer as $$
  select id from transform_audit.runs order by started_at limit 1
$$;
create or replace function tests.api_finding() returns bigint
language sql stable security definer as $$
  select id from transform_audit.findings order by id limit 1
$$;
grant execute on function tests.api_prospect() to public;
grant execute on function tests.api_run() to public;
grant execute on function tests.api_finding() to public;

-- ===========================================================================
-- A. The surface itself
-- ===========================================================================
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_audit\_%'),
  -- The 22 this migration shipped, plus the two 0056 added
  -- (barberos_audit_my_agencies, barberos_audit_pipeline).
  24, 't_twenty_four_public_functions');

-- The design rule, asserted rather than trusted: not one of them is its own
-- authority.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_audit\_%' and p.prosecdef),
  0, 't_not_one_wrapper_is_security_definer');

-- Unlike the shop's public page, none of this has a public audience.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_audit\_%'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 't_anon_can_execute_none_of_them');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_audit\_%'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 't_authenticated_can_reach_all_of_them');

-- ===========================================================================
-- B. The whole audit, driven entirely through the public API
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));

select ok(public.barberos_audit_save_campaign(tests.uid('tenant_a'), 'wny_q4',
       'Western New York Q4',
       '{"website": 60, "google_business": 30, "social": 10}'::jsonb) is not null,
  't_save_a_campaign_through_the_api');
select is(jsonb_array_length(public.barberos_audit_campaigns(tests.uid('tenant_a'))), 1,
  't_and_list_it_back');
select is(public.barberos_audit_campaigns(tests.uid('tenant_a'))->0->'weights'->>'website', '60',
  't_with_its_weights');
select is(public.barberos_audit_campaigns(tests.uid('tenant_a'))->0->>'runs', '0',
  't_and_no_runs_yet');

select ok(public.barberos_audit_import_shop(tests.uid('tenant_a'), jsonb_build_object(
       'business_name','Clarence Barber Co', 'locality','Clarence', 'region','NY',
       'postal_code','14031', 'website_url','https://clarencebarber.example/',
       'source_file','wny-barbershops.csv', 'source_row', 1)) is not null,
  't_import_a_shop_through_the_api');

-- The queue is visible before anything has been run, rather than being
-- inferred from an absent score.
select is(public.barberos_audit_shops(tests.uid('tenant_a'))->0->>'audited', 'false',
  't_an_unaudited_shop_says_so');
select is(public.barberos_audit_shops(tests.uid('tenant_a'))->0->>'called', 'false',
  't_and_an_uncalled_shop_says_so');
select is(public.barberos_audit_shops(tests.uid('tenant_a'))->0->>'has_gbp', 'false',
  't_and_reports_having_no_google_profile_on_file');
select is(jsonb_array_length(public.barberos_audit_shops(tests.uid('tenant_a'), 'clarence')), 1,
  't_and_the_search_matches_on_locality');
select is(jsonb_array_length(public.barberos_audit_shops(tests.uid('tenant_a'), 'buffalo')), 0,
  't_and_misses_when_it_should');

select ok(public.barberos_audit_start_run(
       (public.barberos_audit_campaigns(tests.uid('tenant_a'))->0->>'id')::uuid,
       tests.api_prospect()) is not null, 't_start_a_run_through_the_api');

select ok(public.barberos_audit_record_finding(tests.api_run(), 'website', 'no_booking_link',
       'The homepage offers no way to book online.', 'verified', 'critical',
       'https://clarencebarber.example/', '{"cta_count": 0}'::jsonb, 'barber_web_rubric')
     is not null, 't_record_a_finding_through_the_api_passing_enums_as_text');

select is(public.barberos_audit_record_dimension(tests.api_run(), 'website', 80,
       'verified', 'barber_web_rubric_v1'), 80,
  't_record_a_dimension_through_the_api');
select ok(public.barberos_audit_record_dimension(tests.api_run(), 'google_business', null,
       'unknown', 'gbp_rubric_v1', 'No API access granted.') is not null,
  't_record_an_unknown_dimension_through_the_api');

select ok(public.barberos_audit_add_recommendation(tests.api_run(), 'structural',
       'Put a page they own in front of the booking link', 'Replaces the rented page.',
       'owned_website', tests.api_finding(), 1) is not null,
  't_add_a_recommendation_through_the_api');
select lives_ok(
  $$ select public.barberos_audit_set_hook(tests.api_run(), tests.api_finding(),
       'You have no way to book online.') $$,
  't_set_the_outreach_hook_through_the_api');

-- ===========================================================================
-- C. The honesty rule: the score never travels without its coverage
-- ===========================================================================
select ok(public.barberos_audit_report(tests.api_run()) ? 'coverage',
  't_the_report_carries_coverage');
select is(public.barberos_audit_report(tests.api_run())->'coverage'->>'possible', '3',
  't_naming_all_three_weighted_dimensions');
select is(public.barberos_audit_report(tests.api_run())->'coverage'->>'scored', '1',
  't_and_the_one_that_actually_scored');
select is(public.barberos_audit_report(tests.api_run())->'unscored_dimensions'->>0,
  'google_business', 't_and_names_what_it_could_not_assess');

-- The two list endpoints must not let a caller separate them either.
select ok(public.barberos_audit_runs(tests.uid('tenant_a'))->0 ? 'coverage',
  't_the_run_list_carries_coverage_beside_the_score');
select ok(public.barberos_audit_runs(tests.uid('tenant_a'))->0 ? 'composite_score',
  't_and_the_score');
select is(public.barberos_audit_runs(tests.uid('tenant_a'))->0->'coverage'->>'scored', '1',
  't_with_the_real_number_in_it');
select ok(public.barberos_audit_shops(tests.uid('tenant_a'))->0->'latest_run' ? 'coverage',
  't_and_the_shop_lists_latest_run_carries_it_too');

-- Evidence is countable from the list, so "45 findings" can never read as
-- "45 evidenced findings" -- the distinction that makes production's 40 runs
-- honest rather than impressive.
select is(public.barberos_audit_runs(tests.uid('tenant_a'))->0->>'findings', '1',
  't_the_run_list_counts_findings');
select is(public.barberos_audit_runs(tests.uid('tenant_a'))->0->>'evidenced_findings', '1',
  't_and_counts_separately_how_many_carry_evidence');

-- ===========================================================================
-- D. The bundle, and whether it has shipped
-- ===========================================================================
select is(jsonb_array_length(public.barberos_audit_bundle(tests.api_run())), 1,
  't_the_bundle_returns_one_document_not_a_row_set');
select is(public.barberos_audit_bundle(tests.api_run())->0->>'capability_key', 'owned_website',
  't_naming_the_capability');
select is(public.barberos_audit_bundle(tests.api_run())->0->>'is_shipped', 'true',
  't_and_whether_it_actually_exists_yet');

-- A recommendation for something not yet built must say so.
select ok(public.barberos_audit_add_recommendation(tests.api_run(), 'quick_win',
       'Text back missed calls', '', 'missed_call_capture', null, 1) is not null,
  't_recommend_a_capability_that_has_not_shipped');
select is(
  (select b->>'is_shipped' from jsonb_array_elements(public.barberos_audit_bundle(tests.api_run())) b
    where b->>'capability_key' = 'missed_call_capture'),
  'false', 't_and_the_bundle_reports_it_as_not_shipped');
-- Structural first, matching report()'s ordering rather than enum order.
select is(public.barberos_audit_bundle(tests.api_run())->0->>'priority', 'structural',
  't_structural_recommendations_come_first');

select is(public.barberos_audit_finish_run(tests.api_run()), 'partially_completed',
  't_finish_the_run_through_the_api_and_it_is_honest_about_the_unknown');

-- ===========================================================================
-- E. Discovery and proposal, through the API
-- ===========================================================================
select ok(public.barberos_audit_record_discovery(tests.api_prospect(),
       '{"own_website": false, "chairs": 3}'::jsonb) is not null,
  't_record_a_discovery_call_through_the_api');
select is(public.barberos_audit_discovery(tests.api_prospect())->>'called', 'true',
  't_and_read_it_back');
select is(public.barberos_audit_shops(tests.uid('tenant_a'))->0->>'called', 'true',
  't_and_the_shop_list_now_shows_it_as_called');

-- The proposal's honesty rules still hold when reached through the API.
select throws_ok(
  format($$ select public.barberos_audit_draft_proposal(%L::uuid, null,
            '{"offer":[{"capability":"payments"}]}'::jsonb) $$, tests.api_prospect()),
  '23514', null, 't_the_api_cannot_offer_a_deferred_capability_either');
select throws_ok(
  format($$ select public.barberos_audit_draft_proposal(%L::uuid, null,
            '{"offer":[{"capability":"booking","deliverable_today":true}]}'::jsonb) $$,
         tests.api_prospect()),
  '23514', null, 't_nor_call_a_planned_one_deliverable_today');

select ok(public.barberos_audit_draft_proposal(tests.api_prospect(), tests.api_run(),
       '{"offer":[{"capability":"owned_website","deliverable_today":true}]}'::jsonb) is not null,
  't_draft_an_honest_proposal_through_the_api');
select ok(public.barberos_audit_send_proposal(
       (public.barberos_audit_proposals(tests.api_prospect())->0->>'id')::uuid) is not null,
  't_send_it_through_the_api');
select ok(public.barberos_audit_decide_proposal(
       (public.barberos_audit_proposals(tests.api_prospect())->0->>'id')::uuid,
       'accepted', 'Signed on the call.') is not null,
  't_record_the_outcome_through_the_api');
select is(public.barberos_audit_proposal(
       (public.barberos_audit_proposals(tests.api_prospect())->0->>'id')::uuid)->>'status',
  'accepted', 't_and_read_the_proposal_back');

-- ===========================================================================
-- F. The wrapper is not a privilege escalation.
--
-- The point of the whole design. Each principal below reaches the public
-- function and is refused by the inner one, with the permission it lacks.
-- ===========================================================================

-- viewer_a holds transform_audit.audit.read and nothing else.
select tests.login_as(tests.uid('viewer_a'));
select ok(public.barberos_audit_runs(tests.uid('tenant_a')) is not null,
  't_a_viewer_can_read_the_runs');
select throws_ok(
  $$ select public.barberos_audit_save_campaign(tests.uid('tenant_a'), 'sneaky', 'Sneaky') $$,
  '42501', null, 't_but_cannot_create_a_campaign_through_the_api');
select throws_ok(
  format($$ select public.barberos_audit_start_run(
            (select id from transform_audit.campaigns limit 1), %L::uuid) $$,
         tests.api_prospect()),
  '42501', null, 't_nor_start_a_run');
select throws_ok(
  format($$ select public.barberos_audit_record_discovery(%L::uuid, '{"chairs": 9}'::jsonb) $$,
         tests.api_prospect()),
  '42501', null, 't_nor_record_a_discovery_call');

-- svc_a is a member of the same tenant whose role carries NO transform_audit
-- permission at all. The API must be entirely closed to it, reads included.
select tests.login_as(tests.uid('svc_a'));
select throws_ok(
  $$ select public.barberos_audit_runs(tests.uid('tenant_a')) $$,
  '42501', null, 't_a_role_with_no_audit_permission_cannot_even_list_runs');
select throws_ok(
  $$ select public.barberos_audit_shops(tests.uid('tenant_a')) $$,
  '42501', null, 't_nor_list_shops');
select throws_ok(
  format($$ select public.barberos_audit_report(%L::uuid) $$, tests.api_run()),
  '42501', null, 't_nor_read_a_report');

-- Another agency's owner, through the public surface.
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  format($$ select public.barberos_audit_report(%L::uuid) $$, tests.api_run()),
  '42501', null, 't_another_agency_cannot_read_the_report_through_the_api');
select is(jsonb_array_length(public.barberos_audit_runs(tests.uid('tenant_b'))), 0,
  't_and_sees_an_empty_list_for_its_own_tenant');

select tests.logout();
select * from finish();
rollback;
