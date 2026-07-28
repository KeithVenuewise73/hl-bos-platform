\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 6 — Business Transformation Blueprint Engine.
-- Blueprint lifecycle (request → generate → review → approve), versioning,
-- the single extended recommendation engine (origin/state/rule/evidence/
-- service/module + inactive-catalog exclusion + AI-requires-evidence + dedupe),
-- findings, roadmap ordering, impact scenarios, events, audit, tenant
-- isolation, and the guarantee that an AI run can never approve a blueprint.
-- Runs as the superuser session; tenant context via tests.login_as/logout.
-- Object ids are threaded through session GUCs (portable: no psql \gset, and
-- readable under any role, so the identical file runs under pg_prove in CI and
-- the local node runner).
-- ===========================================================================
begin;
select plan(65);
select tests.seed();

-- --- seed a completed assessment for tenant_a (reuses the CP4 lifecycle) -----
select tests.login_as(tests.uid('admin_a'));
select set_config('bp.p', discovery.create_profile(tests.uid('tenant_a'), 'Blueprint Biz', 'services')::text, false);
select set_config('bp.a', discovery.start_assessment(current_setting('bp.p')::uuid)::text, false);
select discovery.score_dimension(current_setting('bp.a')::uuid, 'maturity','digital_presence',4);
select discovery.score_dimension(current_setting('bp.a')::uuid, 'maturity','security',1);
select discovery.score_dimension(current_setting('bp.a')::uuid, 'maturity','communications',2);
select discovery.score_dimension(current_setting('bp.a')::uuid, 'health','revenue_readiness',3);
select discovery.submit_assessment_for_review(current_setting('bp.a')::uuid);
-- admin_a holds workflows.approval.manage, so it can decide the review task.
select workflows.decide(
  (select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
     where i.kind='discovery.assessment.review' and i.tenant_id=tests.uid('tenant_a')
     order by t.created_at desc limit 1), 'approved', 'ok');
select discovery.complete_assessment(current_setting('bp.a')::uuid);
select is((select status::text from discovery.assessments where id=current_setting('bp.a')::uuid), 'completed', 't_assessment_completed');

-- --- catalogs seeded --------------------------------------------------------
select ok((select count(*) from discovery.roadmap_phases) >= 8, 't_phases_seeded');
select ok((select count(*) from discovery.service_catalog) >= 20, 't_services_seeded');
select ok((select count(*) from discovery.module_catalog) >= 20, 't_modules_seeded');
select ok((select count(*) from discovery.recommendation_rules where is_active) >= 5, 't_rules_seeded');
select is((select availability::text from discovery.service_catalog where key='website_creation'), 'available', 't_service_available');
select is((select availability::text from discovery.service_catalog where key='content_creation'), 'coming_soon', 't_service_coming_soon');
select ok((select pricing_ref from discovery.service_catalog where key='website_creation') like 'pending-ceo:%', 't_pricing_is_reference');

-- --- request a blueprint (authorized) ---------------------------------------
select set_config('bp.bp', discovery.request_blueprint(current_setting('bp.a')::uuid)::text, false);
select ok(current_setting('bp.bp') is not null, 't_request_blueprint');
select is((select lifecycle::text from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'draft', 't_blueprint_draft');
select is((select version from discovery.blueprints where id=current_setting('bp.bp')::uuid), 1, 't_blueprint_v1');

-- --- unauthorized request denied + incomplete-assessment rejected -----------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select discovery.request_blueprint(current_setting('bp.a')::uuid) $$,
  '42501', null, 't_request_denied_viewer');
select tests.login_as(tests.uid('admin_a'));
select set_config('bp.a2', discovery.start_assessment(
  discovery.create_profile(tests.uid('tenant_a'), 'Incomplete Biz', 'services'))::text, false);
select throws_ok(
  $$ select discovery.request_blueprint(current_setting('bp.a2')::uuid) $$,
  '22023', null, 't_request_requires_completed_assessment');

-- --- generation: sections, findings, recommendations ------------------------
select discovery.start_blueprint_generation(current_setting('bp.bp')::uuid);
select is((select lifecycle::text from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'generating', 't_generating');

-- record an evidence row to reference (reuses the canonical evidence store)
select set_config('bp.col', discovery.start_collection(current_setting('bp.p')::uuid, 'business_interview')::text, false);
select set_config('bp.ev', discovery.record_evidence(current_setting('bp.p')::uuid,'business_interview','interview','https',
  jsonb_build_object('present',false),1.00,'[]'::jsonb,current_setting('bp.col')::uuid)::text, false);

-- deterministic section
select ok(discovery.add_blueprint_section(current_setting('bp.bp')::uuid,'current_state',
  jsonb_build_object('title','Current State','maturity',60),'deterministic',
  jsonb_build_array(current_setting('bp.ev')::bigint)) > 0, 't_add_section');

-- AI-assisted section WITHOUT evidence is rejected
select throws_ok(
  $$ select discovery.add_blueprint_section(current_setting('bp.bp')::uuid,'executive_summary',
    jsonb_build_object('title','Exec'),'ai_assisted','[]'::jsonb) $$,
  '22023', null, 't_ai_section_requires_evidence');
-- AI-assisted section WITH evidence is accepted
select ok(discovery.add_blueprint_section(current_setting('bp.bp')::uuid,'executive_summary',
  jsonb_build_object('title','Exec Summary'),'ai_assisted',
  jsonb_build_array(current_setting('bp.ev')::bigint), 0.7, null, 1) > 0, 't_ai_section_with_evidence');

-- deterministic finding traceable to evidence + affected dimensions
select ok(discovery.add_blueprint_finding(current_setting('bp.bp')::uuid,'security','No HTTPS','critical',
  jsonb_build_object('description','Site not secure','urgency','immediate',
    'evidence_refs',jsonb_build_array(current_setting('bp.ev')::bigint),
    'affected_dimensions',jsonb_build_array('security'),
    'priority_band','critical')) > 0, 't_add_finding');
select is((select severity::text from discovery.blueprint_findings where blueprint_id=current_setting('bp.bp')::uuid limit 1),
  'critical', 't_finding_severity');
select is((select jsonb_array_length(evidence_refs) from discovery.blueprint_findings where blueprint_id=current_setting('bp.bp')::uuid limit 1),
  1, 't_finding_evidence_preserved');
-- AI finding without evidence rejected
select throws_ok(
  $$ select discovery.add_blueprint_finding(current_setting('bp.bp')::uuid,'marketing','AI guess','medium',
    jsonb_build_object('origin','ai_assisted','evidence_refs','[]'::jsonb)) $$,
  '22023', null, 't_ai_finding_requires_evidence');

-- rule-based deterministic recommendation (service), traceable to rule+evidence
select set_config('bp.r1', discovery.recommend(current_setting('bp.bp')::uuid,'service','Secure the website with HTTPS',
  jsonb_build_object('origin','deterministic','service_key','website_modernization',
    'rule_key','rule_no_https','rule_version','rules-0.1.0','confidence',1.00,
    'severity','critical','priority_band','critical','effort_band','s','cost_band','low',
    'evidence_refs',jsonb_build_array(current_setting('bp.ev')::bigint),
    'affected_dimensions',jsonb_build_array('security','digital_presence'),
    'dedupe_group','secure_site'))::text, false);
select ok(current_setting('bp.r1')::bigint > 0, 't_recommend_service');
select is((select origin::text from discovery.recommendations where id=current_setting('bp.r1')::bigint), 'deterministic', 't_rec_origin');
select is((select rule_key::text from discovery.recommendations where id=current_setting('bp.r1')::bigint), 'rule_no_https', 't_rec_traceable_to_rule');
select is((select priority_band::text from discovery.recommendations where id=current_setting('bp.r1')::bigint), 'critical', 't_rec_priority_band');
select is((select jsonb_array_length(evidence_refs) from discovery.recommendations where id=current_setting('bp.r1')::bigint), 1, 't_rec_evidence_refs');

-- module recommendation
select set_config('bp.r2', discovery.recommend(current_setting('bp.bp')::uuid,'hl_bos_module','Stand up communications',
  jsonb_build_object('module_key','communications','rule_key','rule_low_comms_dim',
    'severity','medium','priority_band','medium','dedupe_group','comms'))::text, false);
select is((select module_key::text from discovery.recommendations where id=current_setting('bp.r2')::bigint), 'communications', 't_recommend_module');

-- AI-assisted recommendation WITHOUT evidence rejected; WITH evidence accepted
select throws_ok(
  $$ select discovery.recommend(current_setting('bp.bp')::uuid,'service','AI idea',
    jsonb_build_object('origin','ai_assisted','evidence_refs','[]'::jsonb)) $$,
  '22023', null, 't_ai_rec_requires_evidence');
select ok(discovery.recommend(current_setting('bp.bp')::uuid,'service','AI-explained follow-up',
  jsonb_build_object('origin','ai_assisted','service_key','customer_follow_up',
    'evidence_refs',jsonb_build_array(current_setting('bp.ev')::bigint))) > 0, 't_ai_rec_with_evidence');

-- inactive/unavailable service and module are excluded. Flip availability as
-- the superuser session (catalogs are platform config; no tenant write path).
select tests.logout();
update discovery.service_catalog set availability='unavailable' where key='payments';
update discovery.module_catalog set availability='unavailable' where key='reviews';
select tests.login_as(tests.uid('admin_a'));
select throws_ok(
  $$ select discovery.recommend(current_setting('bp.bp')::uuid,'service','Payments',
    jsonb_build_object('service_key','payments')) $$,
  '22023', null, 't_inactive_service_excluded');
select throws_ok(
  $$ select discovery.recommend(current_setting('bp.bp')::uuid,'hl_bos_module','Reviews',
    jsonb_build_object('module_key','reviews')) $$,
  '22023', null, 't_inactive_module_excluded');

-- duplicate consolidation: a second proposed rec in the same dedupe_group
select set_config('bp.rdup', discovery.recommend(current_setting('bp.bp')::uuid,'service','Duplicate secure-site',
  jsonb_build_object('service_key','website_modernization','confidence',0.5,'dedupe_group','secure_site'))::text, false);
select is(discovery.consolidate_recommendations(current_setting('bp.bp')::uuid), 1, 't_consolidate_defers_one');
select is((select state::text from discovery.recommendations where id=current_setting('bp.rdup')::bigint), 'deferred', 't_duplicate_deferred');
select is((select state::text from discovery.recommendations where id=current_setting('bp.r1')::bigint), 'proposed', 't_highest_confidence_kept');

-- human override + acceptance/proposal flags
select discovery.set_recommendation_state(current_setting('bp.r2')::bigint, 'accepted');
select is((select state::text from discovery.recommendations where id=current_setting('bp.r2')::bigint), 'accepted', 't_rec_accepted');
select discovery.set_recommendation_state(current_setting('bp.r2')::bigint, 'included_in_proposal');
select is((select state::text from discovery.recommendations where id=current_setting('bp.r2')::bigint), 'included_in_proposal', 't_rec_proposal_flag');
select discovery.override_recommendation(current_setting('bp.r1')::bigint, 'CEO prefers full rebuild');
select is((select state::text from discovery.recommendations where id=current_setting('bp.r1')::bigint), 'overridden', 't_rec_overridden');
select ok((select reviewed_by from discovery.recommendations where id=current_setting('bp.r1')::bigint) is not null, 't_override_records_reviewer');

-- roadmap: dependency ordering (critical items precede dependents)
select ok(discovery.add_roadmap_item(current_setting('bp.bp')::uuid,1,'immediate_stabilization','Secure the site',
  jsonb_build_object('estimated_effort','s','duration_low_days',1,'duration_high_days',5,
    'expected_impact','risk reduction','responsible_party','herman_legacy',
    'related_recommendations',jsonb_build_array(current_setting('bp.r1')::bigint))) > 0
  and discovery.add_roadmap_item(current_setting('bp.bp')::uuid,2,'digital_foundation','Modernize website',
  jsonb_build_object('estimated_effort','l','dependencies',jsonb_build_array(1),
    'required_approvals',jsonb_build_array('tenant_admin'))) > 0, 't_add_roadmap_items');
select is((select sequence from discovery.roadmap_items where blueprint_id=current_setting('bp.bp')::uuid order by sequence limit 1), 1, 't_roadmap_ordered');
select is((select estimated_effort::text from discovery.roadmap_items where blueprint_id=current_setting('bp.bp')::uuid and sequence=1), 's', 't_roadmap_effort_retained');
select ok((select jsonb_array_length(required_approvals) from discovery.roadmap_items where blueprint_id=current_setting('bp.bp')::uuid and sequence=2) = 1, 't_roadmap_approvals_retained');
select throws_ok(
  $$ select discovery.add_roadmap_item(current_setting('bp.bp')::uuid,3,'not_a_phase','x') $$,
  '23503', null, 't_unknown_phase_rejected');

-- impact estimate: illustrative when no financial input; scenarios + caveats
select set_config('bp.ie', discovery.add_impact_estimate(current_setting('bp.bp')::uuid,'lead_generation',
  'Assuming 100 monthly visitors and a 2% lift','illustrative',
  jsonb_build_object('calculation_method','visitors * conversion delta',
    'scenario_low','+1 lead/mo','scenario_expected','+2 leads/mo','scenario_high','+4 leads/mo',
    'confidence',0.4,'illustrative',true,'caveats','No customer revenue data provided.'))::text, false);
select ok(current_setting('bp.ie')::bigint > 0, 't_add_impact');
select is((select illustrative from discovery.impact_estimates where id=current_setting('bp.ie')::bigint), true, 't_impact_illustrative');
select ok((select caveats from discovery.impact_estimates where id=current_setting('bp.ie')::bigint) is not null, 't_impact_caveats');

-- --- mark generated, submit for review --------------------------------------
select discovery.mark_blueprint_generated(current_setting('bp.bp')::uuid, false, 'rules-0.1.0','priority-0.1.0','impact-0.1.0');
select is((select lifecycle::text from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'generated', 't_generated');
select is((select rule_version from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'rules-0.1.0', 't_rule_version_recorded');

-- AI cannot self-approve: approving before human review fails
select throws_ok(
  $$ select discovery.approve_blueprint(current_setting('bp.bp')::uuid) $$,
  '42501', null, 't_cannot_approve_without_review');

select discovery.submit_blueprint_for_review(current_setting('bp.bp')::uuid);
select is((select lifecycle::text from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'awaiting_review', 't_awaiting_review');

-- human approves via the reused workflow, then blueprint approval succeeds
select workflows.decide(
  (select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
     where i.kind='discovery.blueprint.review' and i.tenant_id=tests.uid('tenant_a')
     order by t.created_at desc limit 1), 'approved', 'looks good');
select discovery.approve_blueprint(current_setting('bp.bp')::uuid);
select is((select lifecycle::text from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'approved', 't_approved');
select discovery.mark_ready_for_proposal(current_setting('bp.bp')::uuid);
select is((select lifecycle::text from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'ready_for_proposal', 't_ready_for_proposal');

-- --- regeneration preserves the prior version -------------------------------
select set_config('bp.bp2', discovery.new_blueprint_version(current_setting('bp.a')::uuid)::text, false);
select is((select version from discovery.blueprints where id=current_setting('bp.bp2')::uuid), 2, 't_new_version_v2');
select is((select lifecycle::text from discovery.blueprints where id=current_setting('bp.bp')::uuid), 'superseded', 't_prior_superseded');
select is((select superseded_by from discovery.blueprints where id=current_setting('bp.bp')::uuid), current_setting('bp.bp2')::uuid, 't_supersede_pointer');
select ok((select count(*) from discovery.blueprint_findings where blueprint_id=current_setting('bp.bp')::uuid) >= 1, 't_prior_findings_preserved');

-- --- tenant isolation: tenant_b cannot see tenant_a's blueprint -------------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from discovery.blueprints where id=current_setting('bp.bp')::uuid), 0, 't_tenant_isolation_blueprint');
select is((select count(*)::int from discovery.blueprint_findings where blueprint_id=current_setting('bp.bp')::uuid), 0, 't_tenant_isolation_findings');
select tests.logout();

-- --- events + audit ---------------------------------------------------------
select ok((select count(*) from events.outbox where topic='blueprint.requested') >= 1, 't_event_requested');
select ok((select count(*) from events.outbox where topic='blueprint.approved') >= 1, 't_event_approved');
select ok((select count(*) from events.outbox where topic='recommendation.created') >= 1, 't_event_rec_created');
select ok((select count(*) from events.outbox where topic='recommendation.overridden') >= 1, 't_event_rec_overridden');
select ok((select count(*) from events.subscriptions where key='discovery_blueprint_worker') = 1, 't_worker_subscription');
select ok((select count(*) from events.handlers where subscription_key='discovery_blueprint_worker') = 1, 't_worker_handler');
select ok((select count(*) from audit.events where resource_type='discovery.blueprints') >= 1, 't_blueprint_audited');

select * from finish();
rollback;
