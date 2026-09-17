\ir _fixtures.sql.inc

-- ===========================================================================
-- Business Transformation Audit — migrations 0053-0054.
--
-- The second half of the BarberOS reconstruction. Like the barberos schema,
-- this was built directly against production and never committed, so nothing
-- here had a test until now.
--
-- This schema produces a claim about someone else's business that we then put
-- in front of them, and the proposal is a commercial promise. So the
-- assertions below are mostly about one thing: the claim cannot be stronger
-- than the evidence, and the offer cannot be more generous than the catalog.
--
--   * findings are append-only -- a recorded observation cannot be revised
--     after a report has been built on it
--   * 'unknown' and a null score are the same fact, and a dimension cannot be
--     called 'verified' without a finding that carries an evidence URL
--   * composite_score is derived and cannot be written by hand
--   * a run with anything still unknown finishes 'partially_completed', never
--     'completed' -- which is why 5 of production's 40 runs read that way
--   * an outreach hook must cite a finding from its own run
--   * a proposal cannot name a capability the catalog does not have, cannot
--     mention a deferred one at all, and cannot call a planned one deliverable
--   * a sent proposal cannot be edited
--
-- As in 49_barberos.sql, the table-level guards are tested after logout, as
-- the owner: `authenticated` holds only SELECT here too, so a direct write as
-- a signed-in user fails on the GRANT before the trigger under test can fire.
-- ===========================================================================
begin;
select plan(77);
select tests.seed();

-- Resolved as the owner so the cross-tenant assertions can pass a REAL id that
-- RLS would otherwise hide, and fail for the right reason.
create or replace function tests.ta_prospect() returns uuid
language sql stable security definer as $$
  select id from visibility.prospects where business_name = 'Clarence Barber Co' limit 1
$$;
create or replace function tests.ta_rival() returns uuid
language sql stable security definer as $$
  select id from visibility.prospects where business_name = 'Main St Cuts' limit 1
$$;
create or replace function tests.ta_campaign() returns uuid
language sql stable security definer as $$
  select id from transform_audit.campaigns where key = 'wny_q4' limit 1
$$;
create or replace function tests.ta_run() returns uuid
language sql stable security definer as $$
  select id from transform_audit.runs order by started_at limit 1
$$;
create or replace function tests.ta_proposal() returns uuid
language sql stable security definer as $$
  select id from transform_audit.proposals
   where document @> '{"offer":[{"capability":"booking"}]}'::jsonb
   order by created_at desc limit 1
$$;
create or replace function tests.ta_empty_proposal() returns uuid
language sql stable security definer as $$
  select id from transform_audit.proposals
   where document = '{"offer": []}'::jsonb order by created_at limit 1
$$;
grant execute on function tests.ta_prospect() to public;
grant execute on function tests.ta_rival() to public;
grant execute on function tests.ta_campaign() to public;
grant execute on function tests.ta_run() to public;
grant execute on function tests.ta_proposal() to public;
grant execute on function tests.ta_empty_proposal() to public;

-- ===========================================================================
-- A. Structure
-- ===========================================================================
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'transform_audit' and c.relkind = 'r'),
  10, 't_ten_tables');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'transform_audit' and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity),
  10, 't_rls_enabled_and_forced_on_all_ten');
select is(
  (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'transform_audit' and p.polcmd <> 'r'),
  0, 't_no_write_policy_anywhere');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'transform_audit' and grantee = 'anon'),
  0, 't_anon_has_no_table_grant');

-- This schema's public API arrived in 0055 (see 55_barberos_audit_api.sql).
-- Until then it had none, and the assertion here said so. Note what it said:
-- it counted public functions named transform_audit*/audit_*/ta_*, and the API
-- that actually shipped is named barberos_audit_*. So the original assertion
-- would still have PASSED after the API existed -- vacuously, matching nothing.
-- Replaced with the surface itself, which cannot go stale that way.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_audit\_%'),
  22, 't_the_schema_is_reachable_through_exactly_twenty_two_public_functions');

-- ===========================================================================
-- B. Campaign, shops, and starting a run
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));

select throws_ok(
  $$ select transform_audit.upsert_campaign(tests.uid('tenant_a'), 'empty_c', 'Empty', '{}'::jsonb) $$,
  '23514', null, 't_a_campaign_must_weight_at_least_one_dimension');

select ok(transform_audit.upsert_campaign(tests.uid('tenant_a'), 'wny_q4',
       'Western New York Q4',
       '{"website": 60, "google_business": 30, "social": 10}'::jsonb) is not null,
  't_create_the_campaign');
select is((select count(*)::int from transform_audit.campaign_weights
            where campaign_id = tests.ta_campaign()),
  3, 't_three_dimensions_weighted');

-- Re-weighting replaces wholesale, so no dimension keeps a weight nobody chose.
select ok(transform_audit.upsert_campaign(tests.uid('tenant_a'), 'wny_q4',
       'Western New York Q4', '{"website": 100}'::jsonb) is not null,
  't_reweight_the_campaign');
select is((select count(*)::int from transform_audit.campaign_weights
            where campaign_id = tests.ta_campaign()),
  1, 't_reweighting_replaces_rather_than_merges');
select ok(transform_audit.upsert_campaign(tests.uid('tenant_a'), 'wny_q4',
       'Western New York Q4',
       '{"website": 60, "google_business": 30, "social": 10}'::jsonb) is not null,
  't_restore_the_three_weights');

select throws_ok(
  $$ select transform_audit.import_shop(tests.uid('tenant_a'), '{"postal_code":"14031"}'::jsonb) $$,
  '23514', null, 't_a_shop_row_must_carry_a_business_name');

select ok(transform_audit.import_shop(tests.uid('tenant_a'), jsonb_build_object(
       'business_name','Clarence Barber Co', 'locality','Clarence', 'region','NY',
       'postal_code','14031', 'address_line1','8383 Main St',
       'source_file','wny-barbershops.csv', 'source_row', 1)) is not null,
  't_import_a_shop');
select ok(transform_audit.import_shop(tests.uid('tenant_a'), jsonb_build_object(
       'business_name','Main St Cuts', 'locality','Clarence', 'postal_code','14031',
       'source_file','wny-barbershops.csv', 'source_row', 2)) is not null,
  't_import_a_second_shop');

-- Same name + postcode is the same shop, re-imported.
select is(
  transform_audit.import_shop(tests.uid('tenant_a'), jsonb_build_object(
    'business_name','Clarence Barber Co', 'postal_code','14031', 'phone','716-555-0123')),
  tests.ta_prospect(), 't_reimporting_the_same_shop_updates_it');
select is((select count(*)::int from transform_audit.shop_profiles
            where tenant_id = tests.uid('tenant_a')),
  2, 't_still_two_shops');
select is((select phone from visibility.prospects where id = tests.ta_prospect()),
  '716-555-0123', 't_and_the_re_import_filled_in_the_phone');

select ok(transform_audit.start_run(tests.ta_campaign(), tests.ta_prospect()) is not null,
  't_start_a_run');
select is((select dimensions_possible from transform_audit.runs where id = tests.ta_run()),
  3, 't_the_run_froze_the_campaigns_three_weighted_dimensions');

-- ===========================================================================
-- C. Evidence, and what may be claimed from it
-- ===========================================================================
-- 'verified' is refused until some finding on this run carries an evidence URL.
select throws_ok(
  $$ select transform_audit.record_dimension(tests.ta_run(), 'website', 80,
       'verified', 'barber_web_rubric_v1') $$,
  '23514', null, 't_cannot_score_verified_before_any_evidence_exists');

select ok(transform_audit.record_finding(tests.ta_run(), 'website', 'no_booking_link',
       'The homepage offers no way to book online.', 'verified', 'critical',
       'https://clarencebarber.example/', '{"cta_count": 0}'::jsonb, 'barber_web_rubric')
     is not null, 't_record_a_verified_finding_with_evidence');

select is(transform_audit.record_dimension(tests.ta_run(), 'website', 80,
       'verified', 'barber_web_rubric_v1'), 80,
  't_now_verified_is_allowed_and_the_composite_is_that_dimension');

-- An unreachable dimension is recorded as unknown, and unknown means unscored.
select ok(transform_audit.record_dimension(tests.ta_run(), 'google_business', null,
       'unknown', 'gbp_rubric_v1', 'No API access granted.') is not null,
  't_record_an_unknown_dimension');
select is((select score from transform_audit.dimension_scores
            where run_id = tests.ta_run() and dimension = 'google_business'),
  null, 't_unknown_carries_no_score');

-- Weighted-mean over the dimensions that actually scored.
select is(transform_audit.record_dimension(tests.ta_run(), 'social', 40,
       'inferred', 'social_rubric_v1'), 74,
  't_composite_is_the_weighted_mean_of_what_scored');
select is((select dimensions_scored from transform_audit.runs where id = tests.ta_run()),
  2, 't_and_counts_only_the_dimensions_that_scored');

-- The hook has to cite a finding from this run.
select lives_ok(
  $$ select transform_audit.set_outreach_hook(tests.ta_run(),
       (select id from transform_audit.findings where run_id = tests.ta_run() limit 1),
       'You have no way to book online.') $$,
  't_set_an_outreach_hook_that_cites_a_finding');
select is((select outreach_hook from transform_audit.runs where id = tests.ta_run()),
  'You have no way to book online.', 't_the_hook_is_recorded');

-- Recommendations resolve to real BarberOS capabilities.
select ok(transform_audit.add_recommendation(tests.ta_run(), 'structural',
       'Put a page they own in front of the booking link', 'Replaces the platform-hosted page.',
       'owned_website',
       (select id from transform_audit.findings where run_id = tests.ta_run() limit 1), 1)
     is not null, 't_add_a_recommendation_that_answers_a_finding');
select throws_ok(
  format($$ select transform_audit.add_recommendation(%L::uuid, 'quick_win', 'Bogus', '', null, 999999, 1) $$,
         tests.ta_run()),
  '23514', null, 't_a_recommendation_cannot_answer_a_finding_from_another_run');

select is((select capability_name from transform_audit.recommended_bundle(tests.ta_run())),
  'Owned Website / Landing Page', 't_the_bundle_resolves_to_the_real_capability');
select is((select is_shipped from transform_audit.recommended_bundle(tests.ta_run())),
  true, 't_and_reports_that_it_has_actually_shipped');

-- ===========================================================================
-- D. Finishing: unknown is not complete
-- ===========================================================================
select is(transform_audit.report(tests.ta_run())->'unscored_dimensions'->>0,
  'google_business', 't_the_report_names_the_dimension_it_could_not_assess');

select is(transform_audit.finish_run(tests.ta_run())::text, 'partially_completed',
  't_a_run_with_an_unknown_dimension_is_partially_completed_not_completed');

-- A finished run's evidence is closed.
select throws_ok(
  $$ select transform_audit.record_finding(tests.ta_run(), 'website', 'late_finding',
       'Added after the fact.', 'inferred') $$,
  '23514', null, 't_a_finished_run_accepts_no_further_findings');
select throws_ok(
  $$ select transform_audit.record_dimension(tests.ta_run(), 'social', 90,
       'inferred', 'social_rubric_v1') $$,
  '23514', null, 't_and_can_no_longer_be_rescored');

-- ===========================================================================
-- E. The proposal. The three honesty rules.
-- ===========================================================================
-- An empty offer is a legal DRAFT -- you have to start somewhere -- but it is
-- not a document, so it cannot be sent.
select lives_ok(
  format($$ select transform_audit.draft_proposal(%L::uuid, null, '{"offer": []}'::jsonb) $$,
         tests.ta_prospect()),
  't_an_empty_offer_is_a_legal_draft');
select throws_ok(
  format($$ select transform_audit.send_proposal(%L::uuid) $$, tests.ta_empty_proposal()),
  '23514', null, 't_but_a_proposal_that_offers_nothing_cannot_be_sent');

select throws_ok(
  format($$ select transform_audit.draft_proposal(%L::uuid, null, '{}'::jsonb) $$,
         tests.ta_prospect()),
  '23514', null, 't_a_proposal_document_must_carry_an_offer_array');

-- Rule 3: the catalog is the vocabulary.
select throws_ok(
  format($$ select transform_audit.draft_proposal(%L::uuid, null,
            '{"offer":[{"capability":"time_machine"}]}'::jsonb) $$, tests.ta_prospect()),
  '23503', null, 't_a_proposal_cannot_invent_a_capability');

-- Rule 1: deferred means a decision NOT to build it.
select throws_ok(
  format($$ select transform_audit.draft_proposal(%L::uuid, null,
            '{"offer":[{"capability":"payments"}]}'::jsonb) $$, tests.ta_prospect()),
  '23514', null, 't_a_deferred_capability_cannot_appear_in_a_proposal_at_all');

-- Rule 2: only what shipped may be sold as ready.
select throws_ok(
  format($$ select transform_audit.draft_proposal(%L::uuid, null,
            '{"offer":[{"capability":"booking","deliverable_today":true}]}'::jsonb) $$,
         tests.ta_prospect()),
  '23514', null, 't_a_planned_capability_cannot_be_offered_as_deliverable_today');

-- The same planned capability is fine when not claimed as ready.
select ok(transform_audit.draft_proposal(tests.ta_prospect(), null,
       '{"offer":[{"capability":"booking","deliverable_today":false}]}'::jsonb) is not null,
  't_but_may_be_offered_honestly_as_not_yet_deliverable');

-- A proposal cannot cite another shop's audit.
select throws_ok(
  format($$ select transform_audit.draft_proposal(%L::uuid, %L::uuid, '{"offer":[]}'::jsonb) $$,
         tests.ta_rival(), tests.ta_run()),
  '23514', null, 't_a_proposal_cannot_cite_another_shops_audit');

-- ===========================================================================
-- F. The proposal lifecycle
-- ===========================================================================
select ok(transform_audit.save_proposal(tests.ta_proposal(), jsonb_build_object(
       'offer', jsonb_build_array(
         jsonb_build_object('capability','owned_website','deliverable_today',true),
         jsonb_build_object('capability','booking','deliverable_today',false))))
     is not null, 't_a_draft_can_be_edited');

select ok(transform_audit.send_proposal(tests.ta_proposal()) is not null, 't_send_it');
select is((select status::text from transform_audit.proposals where id = tests.ta_proposal()),
  'sent', 't_it_is_sent');

-- The copy the shop owner is holding cannot be revised.
select throws_ok(
  format($$ select transform_audit.save_proposal(%L::uuid, '{"offer":[]}'::jsonb) $$,
         tests.ta_proposal()),
  '23514', null, 't_a_sent_proposal_cannot_be_edited');
select throws_ok(
  format($$ select transform_audit.send_proposal(%L::uuid) $$, tests.ta_proposal()),
  '23514', null, 't_and_cannot_be_sent_twice');

select throws_ok(
  format($$ select transform_audit.decide_proposal(%L::uuid, 'maybe') $$, tests.ta_proposal()),
  '23514', null, 't_an_outcome_must_be_one_of_the_three');
select ok(transform_audit.decide_proposal(tests.ta_proposal(), 'accepted', 'Signed on the call.')
     is not null, 't_record_the_outcome');
select is((select status::text from transform_audit.proposals where id = tests.ta_proposal()),
  'accepted', 't_it_is_accepted');
-- Looked up by id, not by position: every row in this test shares one
-- created_at (now() is transaction time), so the list's created_at DESC order
-- is not deterministic here. The first draft of this assertion read index 0 and
-- picked up the empty draft instead.
select is(
  (select e->>'offer_lines'
     from jsonb_array_elements(transform_audit.proposals_for(tests.ta_prospect())) e
    where (e->>'id')::uuid = tests.ta_proposal()),
  '2', 't_the_proposal_list_reports_how_many_lines_were_offered');

-- ===========================================================================
-- G. The discovery call
-- ===========================================================================
-- A call that established nothing must not claim to have happened.
select ok(transform_audit.record_discovery(tests.ta_prospect(), '{}'::jsonb) is not null,
  't_record_an_empty_discovery_call');
select is(transform_audit.discovery_for(tests.ta_prospect())->>'called', 'false',
  't_a_call_that_learned_nothing_is_not_recorded_as_answered');

select ok(transform_audit.record_discovery(tests.ta_prospect(),
       '{"own_website": false, "takes_walkins": true, "chairs": 3}'::jsonb) is not null,
  't_record_a_real_discovery_call');
select is(transform_audit.discovery_for(tests.ta_prospect())->>'called', 'true',
  't_now_it_is_answered');

-- A second call that only covered booking must not wipe what the first learned.
select ok(transform_audit.record_discovery(tests.ta_prospect(),
       '{"booking_platform": "Booksy"}'::jsonb) is not null, 't_a_second_partial_call');
select is(transform_audit.discovery_for(tests.ta_prospect())->>'chairs', '3',
  't_the_earlier_answer_survives_a_partial_update');
select is(transform_audit.discovery_for(tests.ta_prospect())->>'booking_platform', 'Booksy',
  't_and_the_new_answer_is_recorded');

-- ===========================================================================
-- H. Cross-tenant
-- ===========================================================================
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from transform_audit.runs), 0,
  't_another_agencys_owner_sees_no_runs');
select is((select count(*)::int from transform_audit.shop_profiles), 0,
  't_and_no_shops');
select is((select count(*)::int from transform_audit.proposals), 0,
  't_and_no_proposals');
select throws_ok(
  format($$ select transform_audit.report(%L::uuid) $$, tests.ta_run()),
  '42501', null, 't_cannot_read_another_agencys_audit_report');
select throws_ok(
  format($$ select transform_audit.start_run(%L::uuid, %L::uuid) $$,
         tests.ta_campaign(), tests.ta_prospect()),
  '42501', null, 't_cannot_run_an_audit_on_another_agencys_campaign');

-- ===========================================================================
-- I. Table-level guards, as the owner.
--
-- As in 49_barberos.sql: `authenticated` holds only SELECT, so these would all
-- fail on the GRANT before the guard under test could fire.
-- ===========================================================================
select tests.logout();

-- Findings are append-only. Both halves.
select throws_ok(
  format($$ update transform_audit.findings set statement = 'Softened.' where run_id = %L::uuid $$,
         tests.ta_run()),
  '42501', null, 't_a_finding_cannot_be_edited_after_the_fact');
select throws_ok(
  format($$ delete from transform_audit.findings where run_id = %L::uuid $$, tests.ta_run()),
  '42501', null, 't_and_cannot_be_deleted');

-- The derived columns.
select throws_ok(
  format($$ update transform_audit.runs set composite_score = 99 where id = %L::uuid $$,
         tests.ta_run()),
  '42501', null, 't_composite_score_cannot_be_written_by_hand');
select throws_ok(
  format($$ update transform_audit.runs set dimensions_scored = 3 where id = %L::uuid $$,
         tests.ta_run()),
  '42501', null, 't_nor_can_the_scored_count');

-- unknown and a score are the same fact, so they cannot disagree.
select throws_ok(
  format($$ insert into transform_audit.dimension_scores
            (run_id, dimension, score, confidence, rubric_version)
            values (%L::uuid, 'competitor', 50, 'unknown', 'v1') $$, tests.ta_run()),
  '23514', null, 't_unknown_cannot_carry_a_score');
select throws_ok(
  format($$ insert into transform_audit.dimension_scores
            (run_id, dimension, score, confidence, rubric_version)
            values (%L::uuid, 'competitor', null, 'inferred', 'v1') $$, tests.ta_run()),
  '23514', null, 't_and_a_known_confidence_cannot_be_unscored');

-- An unknown finding cannot also cite a page that proves it.
select throws_ok(
  format($$ insert into transform_audit.findings
            (run_id, dimension, code, statement, confidence, detector, evidence_url)
            values (%L::uuid, 'social', 'x_code', 'Unknown but evidenced?', 'unknown', 'manual', 'https://e.example/') $$,
         tests.ta_run()),
  '23514', null, 't_an_unknown_finding_cannot_carry_evidence');

-- A shop cannot be its own competitor.
select throws_ok(
  format($$ insert into transform_audit.run_competitors (run_id, competitor_prospect_id)
            values (%L::uuid, %L::uuid) $$, tests.ta_run(), tests.ta_prospect()),
  '23514', null, 't_a_shop_cannot_be_its_own_competitor');
select lives_ok(
  format($$ insert into transform_audit.run_competitors (run_id, competitor_prospect_id)
            values (%L::uuid, %L::uuid) $$, tests.ta_run(), tests.ta_rival()),
  't_but_a_different_shop_can_be');

-- The hook and its evidence stand or fall together.
select throws_ok(
  format($$ update transform_audit.runs set outreach_hook = 'Unsupported claim.',
            outreach_hook_finding_id = null where id = %L::uuid $$, tests.ta_run()),
  '23514', null, 't_an_outreach_hook_without_a_finding_is_refused');

-- The discovery call's own contradiction guard.
select throws_ok(
  format($$ update transform_audit.discovery
            set booking_platform = 'Square', online_booking = false
            where prospect_id = %L::uuid $$, tests.ta_prospect()),
  '23514', null, 't_naming_a_booking_platform_contradicts_having_no_online_booking');

-- A sent proposal's lifecycle cannot be rewound.
select throws_ok(
  format($$ update transform_audit.proposals set status = 'draft' where id = %L::uuid $$,
         tests.ta_proposal()),
  '23514', null, 't_a_decided_proposal_cannot_go_back_to_draft');

select * from finish();
rollback;
