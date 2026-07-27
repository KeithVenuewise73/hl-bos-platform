\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 4 — Business Discovery Engine tests.
-- Profile creation, evidence collection + isolation, tenant isolation,
-- workflow generation, assessment lifecycle (score → review → complete),
-- honest composite scoring, audit, permissions, collector registration +
-- extensibility, profile updates, future-collector compatibility.
-- events/audit read after logout (platform-observability RLS).
-- ===========================================================================
begin;
select plan(34);
select tests.seed();

-- --- profile creation + update ----------------------------------------------
select tests.login_as(tests.uid('owner_a'));
select ok(discovery.create_profile(tests.uid('tenant_a'), 'Acme Salon', 'salon') is not null,
  't_create_profile');
select is((select status::text from discovery.profiles where business_name='Acme Salon'), 'active',
  't_profile_active');
select lives_ok(
  $$ select discovery.update_profile_summary(
       (select id from discovery.profiles where business_name='Acme Salon'),
       jsonb_build_object('headline','busy neighborhood salon')) $$,
  't_update_profile_summary');
select is((select summary->>'headline' from discovery.profiles where business_name='Acme Salon'),
  'busy neighborhood salon', 't_summary_updated');

-- --- evidence collection (interview active) + future-source compatibility ---
select ok(discovery.start_collection(
  (select id from discovery.profiles where business_name='Acme Salon'), 'business_interview') is not null,
  't_start_active_collection');
select ok(discovery.record_interview_answer(
  (select id from discovery.profiles where business_name='Acme Salon'), 'q_industry', 'salon') > 0,
  't_record_interview_answer');
select ok(discovery.record_evidence(
  (select id from discovery.profiles where business_name='Acme Salon'),
  'document_analysis', 'document', 'menu_items', jsonb_build_object('count', 24), 0.80) > 0,
  't_record_generic_evidence_future_source');
select ok((select count(*) from discovery.evidence
           where profile_id=(select id from discovery.profiles where business_name='Acme Salon')) >= 2,
  't_evidence_recorded');

-- --- collector extension point: inactive collector is inert -----------------
select throws_ok(
  $$ select discovery.start_collection(
       (select id from discovery.profiles where business_name='Acme Salon'), 'website_assessment') $$,
  '42501', null, 't_inactive_collector_inert');
select tests.logout();

-- --- permission + tenant + evidence isolation -------------------------------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select discovery.create_profile(tests.uid('tenant_a'),'Nope') $$,
  '42501', null, 't_viewer_cannot_create_profile');
select tests.logout();
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$ select discovery.create_profile(tests.uid('tenant_a'),'Cross') $$,
  '42501', null, 't_nonmember_cannot_create_profile');
select is((select count(*)::int from discovery.evidence
           where profile_id=(select id from discovery.profiles where business_name='Acme Salon')), 0,
  't_evidence_tenant_isolation');
select tests.logout();

-- --- assessment lifecycle ---------------------------------------------------
select tests.login_as(tests.uid('owner_a'));
select ok(discovery.start_assessment(
  (select id from discovery.profiles where business_name='Acme Salon')) is not null,
  't_start_assessment');
select lives_ok(
  $$ select discovery.score_dimension(
       (select id from discovery.assessments order by created_at desc limit 1),
       'maturity','digital_presence',4) $$,
  't_score_maturity');
select lives_ok(
  $$ select discovery.score_dimension(
       (select id from discovery.assessments order by created_at desc limit 1),
       'health','revenue_readiness',3) $$,
  't_score_health');
select throws_ok(
  $$ select discovery.score_dimension(
       (select id from discovery.assessments order by created_at desc limit 1),
       'maturity','not_a_dimension',3) $$,
  '23503', null, 't_unknown_dimension_rejected');
-- cannot complete without an approved human review
select throws_ok(
  $$ select discovery.complete_assessment(
       (select id from discovery.assessments order by created_at desc limit 1)) $$,
  '42501', null, 't_complete_requires_review');
-- submit for review -> workflow instance generated
select ok(discovery.submit_assessment_for_review(
  (select id from discovery.assessments order by created_at desc limit 1)) is not null,
  't_submit_for_review');
select is((select status::text from discovery.assessments order by created_at desc limit 1), 'in_review',
  't_assessment_in_review');
select ok((select count(*) from workflows.instances
           where tenant_id=tests.uid('tenant_a') and kind='discovery.assessment.review') >= 1,
  't_workflow_generated');
-- a permission-holder decides, then completion succeeds
select lives_ok(
  $$ select workflows.decide(
       (select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
          where i.kind='discovery.assessment.review' and i.tenant_id=tests.uid('tenant_a')
          order by t.created_at desc limit 1), 'approved', 'ok') $$,
  't_human_review_decides');
select lives_ok(
  $$ select discovery.complete_assessment(
       (select id from discovery.assessments order by created_at desc limit 1)) $$,
  't_complete_assessment');
select is((select status::text from discovery.assessments order by created_at desc limit 1), 'completed',
  't_assessment_completed');
select is((select maturity_score from discovery.assessments order by created_at desc limit 1), 80,
  't_maturity_score_computed');
select is((select health_score from discovery.assessments order by created_at desc limit 1), 60,
  't_health_score_computed');
-- reusable output containers
select ok(discovery.draft_blueprint(
  (select id from discovery.assessments order by created_at desc limit 1),
  jsonb_build_object('roadmap','[]')) is not null, 't_draft_blueprint');
select ok(discovery.add_recommendation(
  (select id from discovery.assessments order by created_at desc limit 1),
  'hl_bos_module','Activate VisibilityAI','', null, 'visibility', 'high-impact', 1) > 0,
  't_add_recommendation');
select tests.logout();

-- --- collector registration + extensibility ---------------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select discovery.register_collector('x_collector','X','integration',true) $$,
  '42501', null, 't_nonplatform_cannot_register_collector');
select tests.logout();
select tests.login_as(tests.uid('padmin'));
select lives_ok(
  $$ select discovery.register_collector('reviews_collector','Reviews','social_presence',true) $$,
  't_platform_registers_collector');
select tests.logout();
select tests.login_as(tests.uid('owner_a'));
select ok(discovery.start_collection(
  (select id from discovery.profiles where business_name='Acme Salon'), 'reviews_collector') is not null,
  't_new_collector_usable');
select tests.logout();

-- --- events + audit (read as postgres) --------------------------------------
select ok((select count(*) from events.outbox where topic='discovery.profile.created') >= 1,
  't_profile_created_event');
select ok((select count(*) from events.outbox where topic='discovery.assessment.completed') >= 1,
  't_assessment_completed_event');
select ok((select count(*) from audit.events where resource_type='discovery.profiles') >= 1,
  't_profiles_audited');
select ok((select count(*) from audit.events where resource_type='discovery.evidence') >= 1,
  't_evidence_audited');

select * from finish();
rollback;
