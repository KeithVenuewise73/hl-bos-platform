\ir _fixtures.sql.inc

-- ===========================================================================
-- HL-BTI (PCO #1) — Business Transformation Intelligence Platform tests.
-- Business registry, engagement lifecycle + deterministic stage machine, the
-- Venuewise analysis-only cap, executive assessment + the deterministic 7-score
-- engine (honest nulls), human-review gate, implementation delivery, ROI,
-- CEO dashboard (platform-gated), permissions, RLS+FORCE, tenant isolation,
-- audit. Reuses discovery/workflows/events/audit; introduces no platform service.
-- ===========================================================================
begin;
select plan(47);
select tests.seed();

-- --- catalog seeded ---------------------------------------------------------
select is((select count(*)::int from bti.intelligence_domains), 6, 't_six_domains_seeded');
select ok((select count(*) from bti.domain_dimensions) >= 40, 't_dimensions_seeded');
select ok((select count(*) from bti.industry_packs) >= 10, 't_industry_packs_seeded');
select ok(exists(select 1 from bti.industry_packs where key='transportation'), 't_transportation_pack');

-- --- business registry -------------------------------------------------------
select tests.login_as(tests.uid('owner_a'));
select ok(bti.register_business(tests.uid('tenant_a'),'hscs','Herman Supply Chain Solutions','logistics','transportation',false) is not null,
  't_register_business');
select ok(bti.register_business(tests.uid('tenant_a'),'venuewise','Venuewise','sports','sports',true) is not null,
  't_register_analysis_business');
select is((select count(*)::int from bti.engagements), 0, 't_no_engagements_yet');

-- --- engagement lifecycle ----------------------------------------------------
select ok(bti.open_engagement(tests.uid('tenant_a'),
  (select id from bti.businesses where key='hscs')) is not null, 't_open_engagement');
select is((select stage::text from bti.engagements
           where business_id=(select id from bti.businesses where key='hscs')), 'prospect', 't_engagement_starts_prospect');
select is((select mode::text from bti.engagements
           where business_id=(select id from bti.businesses where key='hscs')), 'full_transformation', 't_engagement_mode_full');

select ok(bti.open_engagement(tests.uid('tenant_a'),
  (select id from bti.businesses where key='venuewise')) is not null, 't_open_analysis_engagement');
select is((select mode::text from bti.engagements
           where business_id=(select id from bti.businesses where key='venuewise')), 'analysis_only', 't_engagement_mode_analysis');

-- stage machine: one ordered step ok
select lives_ok(
  $$ select bti.advance_stage((select id from bti.engagements where business_id=(select id from bti.businesses where key='hscs')),'lead_qualification') $$,
  't_advance_one_step');
-- skipping a step is blocked
select throws_ok(
  $$ select bti.advance_stage((select id from bti.engagements where business_id=(select id from bti.businesses where key='hscs')),'blueprint') $$,
  '23514', null, 't_advance_skip_blocked');
-- side state reachable, then forward from a side state blocked
select lives_ok(
  $$ select bti.advance_stage((select id from bti.engagements where business_id=(select id from bti.businesses where key='hscs')),'on_hold') $$,
  't_side_state_reachable');
select throws_ok(
  $$ select bti.advance_stage((select id from bti.engagements where business_id=(select id from bti.businesses where key='hscs')),'assessment') $$,
  '23514', null, 't_side_state_no_forward');

-- --- Venuewise analysis-only cap (hard PCO requirement) ----------------------
-- step the analysis engagement up to blueprint (allowed), then block proposal
select lives_ok(
  $$ do $x$ declare e uuid; s text;
     begin select id into e from bti.engagements where business_id=(select id from bti.businesses where key='venuewise');
       foreach s in array array['lead_qualification','business_discovery','assessment','executive_analysis','blueprint']
       loop perform bti.advance_stage(e, s::bti.engagement_stage); end loop; end $x$ $$,
  't_analysis_reaches_blueprint');
select throws_ok(
  $$ select bti.advance_stage((select id from bti.engagements where business_id=(select id from bti.businesses where key='venuewise')),'proposal') $$,
  '42501', null, 't_analysis_cap_blocks_proposal');
select throws_ok(
  $$ select bti.create_project((select id from bti.engagements where business_id=(select id from bti.businesses where key='venuewise')),'Nope') $$,
  '42501', null, 't_analysis_no_delivery');
select throws_ok(
  $$ select bti.record_roi_metric((select id from bti.engagements where business_id=(select id from bti.businesses where key='venuewise')),'Nope') $$,
  '42501', null, 't_analysis_no_roi');

-- --- executive assessment + deterministic scoring ---------------------------
select ok(bti.start_assessment(
  (select id from bti.engagements where business_id=(select id from bti.businesses where key='hscs'))) is not null,
  't_start_assessment');
-- unknown domain/dimension rejected
select throws_ok(
  $$ select bti.rate_dimension((select id from bti.assessments order by created_at desc limit 1),'business','not_a_dim',3) $$,
  '23503', null, 't_rate_unknown_dim');
-- rate business (all 4) and operations (5 + 2) -> deterministic 80 / 70
select lives_ok(
  $$ do $x$ declare a uuid; d text;
     begin select id into a from bti.assessments order by created_at desc limit 1;
       foreach d in array array['business_maturity','leadership','processes','customer_experience','growth_readiness']
       loop perform bti.rate_dimension(a,'business',d::extensions.citext,4); end loop;
       perform bti.rate_dimension(a,'operations','operations',5);
       perform bti.rate_dimension(a,'operations','supply_chain',2);
       perform bti.compute_scores(a); end $x$ $$,
  't_rate_and_compute');
select is((select score from bti.domain_scores
           where assessment_id=(select id from bti.assessments order by created_at desc limit 1) and domain_key='business'),
          80, 't_business_domain_score_deterministic');
select is((select score from bti.domain_scores
           where assessment_id=(select id from bti.assessments order by created_at desc limit 1) and domain_key='operations'),
          70, 't_operations_domain_score_deterministic');
select is((select business_health from bti.executive_scores
           where assessment_id=(select id from bti.assessments order by created_at desc limit 1)), 80, 't_exec_business_health');
select is((select operations from bti.executive_scores
           where assessment_id=(select id from bti.assessments order by created_at desc limit 1)), 70, 't_exec_operations');
-- honest null: growth was never rated
select is((select growth from bti.executive_scores
           where assessment_id=(select id from bti.assessments order by created_at desc limit 1)), null, 't_exec_growth_honest_null');
select is((select transformation from bti.executive_scores
           where assessment_id=(select id from bti.assessments order by created_at desc limit 1)), 75, 't_transformation_score_deterministic');

-- completion requires an approved human review
select throws_ok(
  $$ select bti.complete_assessment((select id from bti.assessments order by created_at desc limit 1)) $$,
  '42501', null, 't_complete_requires_review');
select ok(bti.submit_assessment_for_review((select id from bti.assessments order by created_at desc limit 1)) is not null,
  't_submit_for_review');
select ok((select count(*) from workflows.instances
           where tenant_id=tests.uid('tenant_a') and kind='bti.assessment.review') >= 1, 't_workflow_generated');
select lives_ok(
  $$ select workflows.decide(
       (select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
          where i.kind='bti.assessment.review' and i.tenant_id=tests.uid('tenant_a')
          order by t.created_at desc limit 1),'approved','ok') $$,
  't_human_review_decides');
select lives_ok(
  $$ select bti.complete_assessment((select id from bti.assessments order by created_at desc limit 1)) $$,
  't_complete_assessment');
select is((select status::text from bti.assessments order by created_at desc limit 1), 'completed', 't_assessment_completed');

-- --- implementation delivery (full engagement) ------------------------------
select lives_ok(
  $$ do $x$ declare e uuid; p uuid; m uuid; t uuid;
     begin select id into e from bti.engagements where business_id=(select id from bti.businesses where key='hscs');
       p := bti.create_project(e,'Warehouse Automation');
       m := bti.add_milestone(p,'Phase 1',1);
       t := bti.add_task(m,'Map current-state flows',1);
       perform bti.set_task_status(t,'done'); end $x$ $$,
  't_delivery_chain');
select is((select status::text from bti.tasks order by created_at desc limit 1), 'done', 't_task_done');

-- --- ROI tracking -----------------------------------------------------------
select lives_ok(
  $$ do $x$ declare e uuid; mid bigint;
     begin select id into e from bti.engagements where business_id=(select id from bti.businesses where key='hscs');
       mid := bti.record_roi_metric(e,'Labor hours saved','hours/mo',0,320);
       perform bti.realize_roi_metric(mid,290); end $x$ $$,
  't_roi_chain');
select is((select status::text from bti.roi_metrics order by id desc limit 1), 'realized', 't_roi_realized');
select is((select realized_value from bti.roi_metrics order by id desc limit 1), 290::numeric, 't_roi_value');

select tests.logout();

-- --- permissions + isolation ------------------------------------------------
-- viewer may not register a business
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select bti.register_business(tests.uid('tenant_a'),'nope','Nope') $$,
  '42501', null, 't_viewer_denied_manage');
select tests.logout();
-- cross-tenant: owner_b cannot open an engagement on tenant_a's business
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$ select bti.open_engagement(tests.uid('tenant_a'),(select id from bti.businesses where key='hscs')) $$,
  '42501', null, 't_cross_tenant_denied');
select tests.logout();

-- --- CEO dashboard: platform-gated ------------------------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok( $$ select * from bti.ceo_dashboard() $$, '42501', null, 't_dashboard_requires_platform');
select tests.logout();
select tests.login_as(tests.uid('padmin'));
select ok((select count(*) from bti.ceo_dashboard()) >= 2, 't_dashboard_returns_businesses');
-- completion emitted a security event (read as a platform observer)
select ok((select count(*) from audit.security_events
           where resource_type='bti.assessments' and action='bti.assessment.complete') >= 1, 't_completion_audited');
select tests.logout();

-- --- governance: RLS forced, permissions registered -------------------------
select is((select relforcerowsecurity from pg_class where oid='bti.businesses'::regclass), true, 't_rls_forced');
select is((select count(*)::int from identity.permissions where key like 'bti.%'), 12, 't_permissions_registered');

select * from finish();
rollback;
