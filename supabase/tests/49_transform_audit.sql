\ir _fixtures.sql.inc

-- ===========================================================================
-- Business Transformation Analysis Tool — migration 0049.
--
-- The spec's discipline is: every claim in a report traces to something
-- actually fetched, and nothing is invented. This file tests that as a set of
-- refusals, because a discipline you can only assert is a discipline you can
-- only break quietly:
--
--   * a dimension cannot be scored 'verified' without a real evidence URL
--   * an 'unknown' dimension cannot carry a score, and a scored one cannot be
--     called unknown
--   * the composite cannot be written by hand
--   * the composite is weighted over the dimensions actually scored, and an
--     unreachable dimension is reported as a gap, not averaged in as a zero
--   * a finding, once recorded, cannot be edited or deleted
--   * an outreach hook cannot exist without a finding of this run behind it
--   * a recommendation cannot name a BarberOS module that does not exist
--   * a run that never reached a weighted dimension cannot call itself complete
--
-- Plus the ingest path (idempotent, no seeded data) and tenant isolation.
-- ===========================================================================
begin;
select plan(64);
select tests.seed();

create or replace function tests.hld() returns uuid language sql stable as $$
  select tests.uid('tenant_a')
$$;

-- --- Campaign + weighting ---------------------------------------------------
select tests.login_as(tests.uid('owner_a'));

create temporary table t_ids (k text primary key, v uuid);
insert into t_ids values ('campaign',
  transform_audit.upsert_campaign(tests.hld(), 'wny_barbers_50',
    'WNY 50 barbershop prospect list',
    '{"website": 60, "google_business": 40}'::jsonb));

select ok((select v from t_ids where k = 'campaign') is not null,
  't_campaign_created_with_its_own_weighting');

select is(
  (select count(*)::int from transform_audit.campaign_weights
    where campaign_id = (select v from t_ids where k = 'campaign')),
  2, 't_campaign_weights_two_dimensions');

-- A campaign that weights nothing could not produce a score, so it is refused.
select throws_ok(
  format($$select transform_audit.upsert_campaign(%L::uuid, 'empty_campaign', 'Empty', '{}'::jsonb)$$,
    tests.hld()),
  '23514', null, 't_a_campaign_must_weight_at_least_one_dimension');

-- A `manager` runs audits but cannot restate every future report by
-- re-weighting the campaign.
select tests.login_as(tests.uid('manager_a'));
select throws_ok(
  format($$select transform_audit.upsert_campaign(%L::uuid, 'wny_barbers_50', 'Reweighted',
    '{"website": 100}'::jsonb)$$, tests.hld()),
  '42501', null, 't_manager_cannot_reweight_a_campaign');

-- --- Ingest -- nothing is seeded, everything is imported --------------------
select tests.logout();
select is((select count(*)::int from transform_audit.shop_profiles), 0,
  't_the_tool_ships_with_zero_shops');

select tests.login_as(tests.uid('manager_a'));
insert into t_ids values ('shop', transform_audit.import_shop(tests.hld(), jsonb_build_object(
  'business_name', 'Example Cuts',
  'phone', '716-555-0100',
  'address_line1', '1 Main St',
  'locality', 'Buffalo',
  'region', 'NY',
  'postal_code', '14201',
  'website_url', 'https://example-cuts.test',
  'website_platform', 'glossgenius',
  'source_file', 'WNY_50_Barber_HLD_Prospect_List.xlsx',
  'source_row', 7)));

select ok((select v from t_ids where k = 'shop') is not null, 't_a_shop_row_imports');
select is(
  (select business_name from visibility.prospects where id = (select v from t_ids where k = 'shop')),
  'Example Cuts', 't_the_shop_became_a_visibility_prospect_not_a_second_prospect_table');
select is(
  (select website_platform::text from transform_audit.shop_profiles
    where prospect_id = (select v from t_ids where k = 'shop')),
  'glossgenius', 't_the_hosting_platform_is_captured_as_a_fact');
select is(
  (select source_row from transform_audit.shop_profiles
    where prospect_id = (select v from t_ids where k = 'shop')),
  7, 't_the_source_row_is_traceable');

-- Re-importing the same list must not duplicate the shop.
select is(
  transform_audit.import_shop(tests.hld(), jsonb_build_object(
    'business_name', 'Example Cuts', 'postal_code', '14201', 'phone', '716-555-0199')),
  (select v from t_ids where k = 'shop'), 't_reimporting_the_same_shop_updates_it');
select is((select count(*)::int from transform_audit.shop_profiles), 1,
  't_reimport_did_not_duplicate');
select is(
  (select phone from visibility.prospects where id = (select v from t_ids where k = 'shop')),
  '716-555-0199', 't_reimport_refreshed_the_phone');

select throws_ok(
  format($$select transform_audit.import_shop(%L::uuid, '{"phone":"716-555-0000"}'::jsonb)$$, tests.hld()),
  '23514', null, 't_a_shop_row_without_a_name_is_refused');

-- --- Starting a run ---------------------------------------------------------
insert into t_ids values ('run',
  transform_audit.start_run((select v from t_ids where k = 'campaign'),
                            (select v from t_ids where k = 'shop')));

select is(
  (select weights from transform_audit.runs where id = (select v from t_ids where k = 'run')),
  '{"website": 60, "google_business": 40}'::jsonb,
  't_the_run_snapshots_the_campaign_weights');
select is(
  (select dimensions_possible from transform_audit.runs where id = (select v from t_ids where k = 'run')),
  2, 't_the_run_records_how_many_dimensions_are_possible');

-- A shop belonging to another tenant cannot be audited under this campaign.
select tests.logout();
insert into visibility.prospects (id, tenant_id, business_name)
  values (tests.uid('other_shop'), tests.uid('tenant_b'), 'Other Tenant Shop');
select tests.login_as(tests.uid('manager_a'));
select throws_ok(
  format($$select transform_audit.start_run(%L::uuid, %L::uuid)$$,
    (select v from t_ids where k = 'campaign'), tests.uid('other_shop')),
  '23514', null, 't_cannot_audit_a_shop_from_another_tenant');

-- ===========================================================================
-- The evidence discipline
-- ===========================================================================

-- Nothing has been fetched yet, so nothing can claim to be verified.
select throws_ok(
  format($$select transform_audit.record_dimension(%L::uuid, 'website', 72, 'verified', 'barber-web-0.1.0')$$,
    (select v from t_ids where k = 'run')),
  '23514', null, 't_verified_is_refused_before_any_evidence_exists');

-- An observation WITHOUT a source URL is still a finding -- it just cannot
-- promote the dimension to 'verified'.
insert into t_ids values ('f_hearsay', null);
update t_ids set v = null where k = 'f_hearsay';
select ok(transform_audit.record_finding(
    (select v from t_ids where k = 'run'), 'website', 'reported_no_booking',
    'Owner said by phone that there is no online booking.', 'inferred', 'medium')
  is not null, 't_a_finding_without_a_source_url_is_still_recordable');

select throws_ok(
  format($$select transform_audit.record_dimension(%L::uuid, 'website', 72, 'verified', 'barber-web-0.1.0')$$,
    (select v from t_ids where k = 'run')),
  '23514', null, 't_an_unsourced_finding_does_not_unlock_verified');

-- Now a real fetch, with the page it came from.
create temporary table t_find (k text primary key, v bigint);
insert into t_find values ('booking', transform_audit.record_finding(
  (select v from t_ids where k = 'run'), 'website', 'no_online_booking',
  'No online booking found on the site.', 'verified', 'critical',
  'https://example-cuts.test/', '{"forms": 0, "booking_links": 0}'::jsonb, 'barber_web_rubric'));

select ok(transform_audit.record_dimension(
    (select v from t_ids where k = 'run'), 'website', 72, 'verified', 'barber-web-0.1.0')
  is not null, 't_verified_is_accepted_once_a_finding_carries_its_source');

-- --- No client writes a score table directly at all -------------------------
-- Every table in this schema is SELECT-only to `authenticated`; scores arrive
-- through record_dimension(), which checks a permission first.
select throws_ok(
  format($$insert into transform_audit.dimension_scores
    (run_id, dimension, score, confidence, rubric_version)
    values (%L::uuid, 'google_business', 40, 'inferred', 'x')$$,
    (select v from t_ids where k = 'run')),
  '42501', null, 't_a_client_cannot_write_a_dimension_score_directly');

-- --- unknown is structurally unscoreable ------------------------------------
-- Run as the OWNER, deliberately: as a client the grant refuses the write
-- before the constraint is reached, which would prove the grant and not the
-- constraint. These two assertions are what make the rule survive a future
-- migration that widens the grants.
select tests.logout();
select throws_ok(
  format($$insert into transform_audit.dimension_scores
    (run_id, dimension, score, confidence, rubric_version)
    values (%L::uuid, 'google_business', 40, 'unknown', 'x')$$,
    (select v from t_ids where k = 'run')),
  '23514', null, 't_an_unknown_dimension_cannot_carry_a_score');

select throws_ok(
  format($$insert into transform_audit.dimension_scores
    (run_id, dimension, score, confidence, rubric_version)
    values (%L::uuid, 'google_business', null, 'inferred', 'x')$$,
    (select v from t_ids where k = 'run')),
  '23514', null, 't_a_scored_dimension_cannot_be_null');
select tests.login_as(tests.uid('manager_a'));

-- An 'unknown' finding is a statement that we could NOT see something, so it
-- cannot carry a link to what we saw.
select throws_ok(
  format($$select transform_audit.record_finding(%L::uuid, 'google_business', 'gbp_unreachable',
    'Could not reach the profile.', 'unknown', 'info', 'https://maps.example.test/x')$$,
    (select v from t_ids where k = 'run')),
  '23514', null, 't_an_unknown_finding_cannot_cite_evidence');

-- ===========================================================================
-- The composite is derived, and its coverage is stated
-- ===========================================================================
select is(
  (select composite_score from transform_audit.runs where id = (select v from t_ids where k = 'run')),
  72, 't_composite_is_the_single_scored_dimension_so_far');
select is(
  (select dimensions_scored from transform_audit.runs where id = (select v from t_ids where k = 'run')),
  1, 't_coverage_says_one_of_two_dimensions');

-- The unreachable dimension is recorded as a gap. It is NOT scored zero: a
-- shop we could not look at is not a shop with a bad profile.
select lives_ok(
  format($$select transform_audit.record_dimension(%L::uuid, 'google_business', null, 'unknown',
    'barber-gbp-0.1.0', 'Places API access not configured; profile not fetched.')$$,
    (select v from t_ids where k = 'run')),
  't_an_unreachable_dimension_is_recorded_as_unknown');
select is(
  (select confidence::text from transform_audit.dimension_scores
    where run_id = (select v from t_ids where k = 'run') and dimension = 'google_business'),
  'unknown', 't_the_unreachable_dimension_is_stored_as_a_gap');
select is(
  (select score from transform_audit.dimension_scores
    where run_id = (select v from t_ids where k = 'run') and dimension = 'google_business'),
  null, 't_the_gap_carries_no_number');

select is(
  (select composite_score from transform_audit.runs where id = (select v from t_ids where k = 'run')),
  72, 't_the_unknown_dimension_did_not_drag_the_composite_to_zero');
select is(
  (select dimensions_scored from transform_audit.runs where id = (select v from t_ids where k = 'run')),
  1, 't_coverage_still_says_one_of_two');

-- Weighted, not averaged: website 60 / google_business 40.
select tests.logout();
update transform_audit.dimension_scores
   set score = 20, confidence = 'inferred'
 where run_id = (select v from t_ids where k = 'run') and dimension = 'google_business';
select is(transform_audit.recompute_composite((select v from t_ids where k = 'run')),
  51, 't_composite_is_weighted_not_a_plain_mean');   -- (72*60 + 20*40)/100 = 51.2 -> 51

-- --- The composite cannot be asserted by hand -------------------------------
select throws_ok(
  format($$update transform_audit.runs set composite_score = 95 where id = %L::uuid$$,
    (select v from t_ids where k = 'run')),
  '42501', null, 't_composite_cannot_be_written_directly');
select throws_ok(
  format($$update transform_audit.runs set dimensions_scored = 4 where id = %L::uuid$$,
    (select v from t_ids where k = 'run')),
  '42501', null, 't_coverage_cannot_be_written_directly');
select is(
  (select composite_score from transform_audit.runs where id = (select v from t_ids where k = 'run')),
  51, 't_the_composite_survived_the_attempts_to_overwrite_it');

-- ===========================================================================
-- Findings are evidence: append-only
-- ===========================================================================
select throws_ok(
  format($$update transform_audit.findings set statement = 'Actually they do have booking.'
    where id = %L$$, (select v from t_find where k = 'booking')),
  '42501', null, 't_a_finding_cannot_be_edited_after_the_fact');
select throws_ok(
  format($$delete from transform_audit.findings where id = %L$$,
    (select v from t_find where k = 'booking')),
  '42501', null, 't_a_finding_cannot_be_deleted');

-- ===========================================================================
-- Recommendations: judgment, separate from evidence, and bound to real modules
-- ===========================================================================
select tests.login_as(tests.uid('manager_a'));
select ok(transform_audit.add_recommendation(
    (select v from t_ids where k = 'run'), 'quick_win',
    'Put an online booking link on the site',
    'The page has no booking path at all; the fastest fix is a link.',
    'booking', (select v from t_find where k = 'booking'), 1) is not null,
  't_a_recommendation_can_name_a_real_barberos_module');

select throws_ok(
  format($$select transform_audit.add_recommendation(%L::uuid, 'structural', 'Add loyalty tiers',
    '', 'loyalty_tiers')$$, (select v from t_ids where k = 'run')),
  '23503', null, 't_a_recommendation_cannot_name_a_module_that_does_not_exist');

-- A recommendation that claims to answer a finding must answer one of this run's.
select throws_ok(
  format($$select transform_audit.add_recommendation(%L::uuid, 'quick_win', 'Unrelated', '', null, 999999)$$,
    (select v from t_ids where k = 'run')),
  '23514', null, 't_a_recommendation_cannot_cite_a_finding_from_another_run');

-- Advice that is not software needs no module, and that is allowed.
select ok(transform_audit.add_recommendation(
    (select v from t_ids where k = 'run'), 'quick_win',
    'Claim the Google Business Profile', 'Advice, not software.') is not null,
  't_advice_without_a_module_is_allowed');

-- ===========================================================================
-- The outreach hook must be traceable to an observation
-- ===========================================================================
select tests.logout();
select throws_ok(
  format($$update transform_audit.runs set outreach_hook = 'You are losing bookings.'
    where id = %L::uuid$$, (select v from t_ids where k = 'run')),
  '23514', null, 't_a_hook_without_a_cited_finding_is_refused');
select tests.login_as(tests.uid('manager_a'));

select lives_ok(
  format($$select transform_audit.set_outreach_hook(%L::uuid, %L, %L)$$,
    (select v from t_ids where k = 'run'), (select v from t_find where k = 'booking'),
    'Your site has no way to book -- every after-hours visitor leaves.'),
  't_a_hook_citing_a_real_finding_is_accepted');

-- ===========================================================================
-- Competitors
-- ===========================================================================
select throws_ok(
  format($$insert into transform_audit.run_competitors (run_id, competitor_prospect_id)
    values (%L::uuid, %L::uuid)$$,
    (select v from t_ids where k = 'run'), (select v from t_ids where k = 'shop')),
  '42501', null, 't_a_client_cannot_attach_a_competitor_directly');

select tests.logout();
select throws_ok(
  format($$insert into transform_audit.run_competitors (run_id, competitor_prospect_id)
    values (%L::uuid, %L::uuid)$$,
    (select v from t_ids where k = 'run'), (select v from t_ids where k = 'shop')),
  '23514', null, 't_a_shop_is_not_its_own_competitor');
select lives_ok(
  format($$insert into transform_audit.run_competitors (run_id, competitor_prospect_id, note)
    values (%L::uuid, %L::uuid, 'suggested by geography, not yet confirmed')$$,
    (select v from t_ids where k = 'run'), tests.uid('other_shop')),
  't_a_different_shop_can_be_attached_as_a_competitor');
select is(
  (select confirmed_at from transform_audit.run_competitors
    where run_id = (select v from t_ids where k = 'run')),
  null, 't_an_unconfirmed_competitor_is_stored_as_a_suggestion');
select tests.login_as(tests.uid('manager_a'));

-- ===========================================================================
-- Closing the run honestly
-- ===========================================================================
select is(
  transform_audit.finish_run((select v from t_ids where k = 'run'))::text,
  'completed', 't_a_run_with_every_weighted_dimension_addressed_completes');

select throws_ok(
  format($$select transform_audit.record_finding(%L::uuid, 'website', 'late_finding',
    'Added after the report was closed.', 'inferred')$$, (select v from t_ids where k = 'run')),
  '23514', null, 't_a_finished_run_accepts_no_further_findings');

-- A run that never reached a weighted dimension cannot call itself complete.
insert into t_ids values ('run2',
  transform_audit.start_run((select v from t_ids where k = 'campaign'),
                            (select v from t_ids where k = 'shop')));
select ok(transform_audit.record_finding(
    (select v from t_ids where k = 'run2'), 'website', 'site_unreachable',
    'The site did not respond.', 'unknown', 'high') is not null,
  't_second_run_records_an_unreachable_site');
select ok(transform_audit.record_dimension(
    (select v from t_ids where k = 'run2'), 'website', null, 'unknown', 'barber-web-0.1.0') is null,
  't_second_run_marks_website_unknown');
-- A hook must cite a finding of ITS OWN run: run 1 cannot borrow run 2's.
select tests.logout();
select throws_ok(
  format($$update transform_audit.runs
     set outreach_hook = 'Borrowed evidence.',
         outreach_hook_finding_id = (select max(id) from transform_audit.findings where run_id = %L::uuid)
   where id = %L::uuid$$,
    (select v from t_ids where k = 'run2'), (select v from t_ids where k = 'run')),
  '23514', null, 't_a_hook_cannot_borrow_a_finding_from_another_run');
select tests.login_as(tests.uid('manager_a'));

select is(
  transform_audit.finish_run((select v from t_ids where k = 'run2'))::text,
  'partially_completed',
  't_a_run_that_never_reached_a_weighted_dimension_is_only_partially_complete');
select is(
  (select composite_score from transform_audit.runs where id = (select v from t_ids where k = 'run2')),
  null, 't_a_run_with_no_reachable_dimension_has_no_composite_at_all');

-- ===========================================================================
-- The report, and the honest bundle
-- ===========================================================================
select is(
  transform_audit.report((select v from t_ids where k = 'run'))->>'outreach_hook',
  'Your site has no way to book -- every after-hours visitor leaves.',
  't_the_report_carries_the_outreach_hook');
select is(
  jsonb_array_length(transform_audit.report((select v from t_ids where k = 'run'))->'findings'),
  2, 't_the_report_lists_the_findings_that_were_recorded');
select is(
  transform_audit.report((select v from t_ids where k = 'run2'))->'unscored_dimensions',
  '["google_business"]'::jsonb,
  't_the_report_names_the_dimensions_it_never_reached');
select is(
  transform_audit.report((select v from t_ids where k = 'run2'))->'coverage',
  '{"scored": 0, "possible": 2}'::jsonb,
  't_the_report_states_its_own_coverage');

-- Phase 5, honestly: the audit points at a module, and says it has not shipped.
select is(
  (select count(*)::int from transform_audit.recommended_bundle((select v from t_ids where k = 'run'))),
  1, 't_the_recommended_bundle_has_one_module');
select ok(
  not (select is_shipped from transform_audit.recommended_bundle((select v from t_ids where k = 'run'))),
  't_the_recommended_bundle_admits_the_module_has_not_shipped');

-- --- Tenant isolation -------------------------------------------------------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from transform_audit.runs), 0,
  't_another_tenant_sees_no_runs');
select is((select count(*)::int from transform_audit.findings), 0,
  't_another_tenant_sees_no_findings');
select throws_ok(
  format($$select transform_audit.report(%L::uuid)$$, (select v from t_ids where k = 'run')),
  '42501', null, 't_another_tenant_cannot_read_the_report');

-- --- search_path pinning ----------------------------------------------------
select tests.logout();
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'transform_audit'
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_transform_audit_function_pins_its_search_path');

select * from finish();
rollback;
