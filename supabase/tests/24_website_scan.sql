\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 5 — Website Assessment Collector (Discovery Module 1) DB lifecycle.
-- Collector activation, scan request + idempotency, progress, evidence via the
-- canonical discovery.evidence store, scoring contribution, complete/partial,
-- re-run preservation, cancel, permission + tenant isolation, audit, events.
-- (SSRF/crawl/fetch logic is covered by the Deno tests; this is the durable
-- lifecycle + linkage.)
-- ===========================================================================
begin;
select plan(27);
select tests.seed();

-- collector is active after migration 0022
select is((select is_active from discovery.collectors where key='website_assessment'), true,
  't_collector_active');

select tests.login_as(tests.uid('owner_a'));
select discovery.create_profile(tests.uid('tenant_a'), 'Scan Biz', 'salon');

-- request a scan
select ok(discovery.request_website_scan(
  (select id from discovery.profiles where business_name='Scan Biz'),
  'http://example.com', 'http://example.com') is not null, 't_request_scan');
select is((select status::text from discovery.website_scans order by created_at limit 1), 'requested',
  't_scan_requested');
-- idempotency: same target while in-flight returns the same scan
select is(
  discovery.request_website_scan(
    (select id from discovery.profiles where business_name='Scan Biz'),
    'http://example.com', 'http://example.com'),
  (select id from discovery.website_scans order by created_at limit 1),
  't_scan_idempotent');
select is((select count(*)::int from discovery.website_scans), 1, 't_one_scan_in_flight');
select is((select count(*)::int from discovery.collections
           where collector_key='website_assessment'), 1, 't_one_collection');

-- progress
select lives_ok(
  $$ select discovery.update_scan_progress(
       (select id from discovery.website_scans order by created_at limit 1),
       'fetching', jsonb_build_object('pages_fetched',1,'redirect_count',0)) $$,
  't_update_progress');
select is((select pages_fetched from discovery.website_scans order by created_at limit 1), 1,
  't_pages_fetched');

-- record a website finding as canonical discovery evidence
select ok(discovery.record_scan_finding(
  (select id from discovery.website_scans order by created_at limit 1),
  'http://example.com/', 'has_title', jsonb_build_object('present', true),
  'search_visibility', 'info', 1.00, 'deterministic') > 0, 't_record_finding');
select is((select findings_count from discovery.website_scans order by created_at limit 1), 1,
  't_findings_count');
select ok((select count(*) from discovery.evidence e
           join discovery.profiles p on p.id=e.profile_id
           where p.business_name='Scan Biz' and e.source='website'
             and e.value->>'category'='search_visibility') >= 1, 't_evidence_is_canonical');

-- scoring contribution into the shared framework
select discovery.start_assessment((select id from discovery.profiles where business_name='Scan Biz'));
select lives_ok(
  $$ select discovery.set_scan_assessment(
       (select id from discovery.website_scans order by created_at limit 1),
       (select id from discovery.assessments order by created_at desc limit 1)) $$,
  't_link_assessment');
select lives_ok(
  $$ select discovery.score_dimension(
       (select id from discovery.assessments order by created_at desc limit 1),
       'maturity','digital_presence',3,'from website evidence') $$,
  't_score_contribution');
select is((select score from discovery.profile_scores
           where framework='maturity' and dimension_key='digital_presence'
           order by id desc limit 1), 3, 't_dimension_scored');

-- complete partially (e.g. AI failed but deterministic succeeded)
select lives_ok(
  $$ select discovery.complete_scan(
       (select id from discovery.website_scans order by created_at limit 1),
       'partially_completed') $$, 't_complete_partial');
select is((select status::text from discovery.website_scans order by created_at limit 1),
  'partially_completed', 't_scan_partial');
select is((select status::text from discovery.collections where collector_key='website_assessment'
           order by started_at limit 1), 'collected', 't_collection_collected');

-- re-run preserves prior evidence and creates a new scan
select ok(discovery.request_website_scan(
  (select id from discovery.profiles where business_name='Scan Biz'),
  'http://example.com', 'http://example.com') is not null, 't_rerun');
select is((select count(*)::int from discovery.website_scans), 2, 't_rerun_new_scan');
-- prior scan preserved (created_at is constant within the test tx, so select by
-- status rather than time-order the two scans)
select is((select count(*)::int from discovery.website_scans where status='partially_completed'), 1,
  't_prior_scan_preserved');

-- cancel the fresh re-run scan (the one still 'requested')
select lives_ok(
  $$ select discovery.cancel_scan((select id from discovery.website_scans where status='requested' limit 1)) $$,
  't_cancel');
select is((select count(*)::int from discovery.website_scans where status='cancelled'), 1,
  't_cancelled');
select tests.logout();

-- permission + tenant isolation
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select discovery.request_website_scan(
       (select id from discovery.profiles where business_name='Scan Biz'),
       'http://example.com','http://example.com') $$,
  '42501', null, 't_viewer_cannot_request');
select tests.logout();
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from discovery.website_scans), 0, 't_tenant_isolation');
select tests.logout();

-- events + audit (postgres bypasses observability RLS)
select ok((select count(*) from events.outbox where topic='discovery.website_scan.requested') >= 1,
  't_scan_requested_event');
select ok((select count(*) from events.outbox where topic='discovery.website_scan.completed') >= 1,
  't_scan_completed_event');
select ok((select count(*) from audit.events where resource_type='discovery.website_scans') >= 1,
  't_scans_audited');

select * from finish();
rollback;
