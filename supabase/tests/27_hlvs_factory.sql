\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 8 — HLVS Factory Interface, Software Catalog & Creation Control.
-- The governed closed loop: catalog → duplicate determination → product
-- technical blueprint (immutable once approved) → software creation order →
-- Claude prompt package → development run → checkpoint reports → build
-- completion report → deterministic conformance → catalog update proposal →
-- Factory Build Package → HL-BOS intake → feedback. Plus permission/RLS
-- enforcement, AI-cannot-approve, non-exceptionable failures, no external
-- execution, events, and audit. Ids threaded via session GUCs. HLVS is a
-- platform-internal facility: operations run as the platform admin (padmin).
-- ===========================================================================
begin;
select plan(90);
select tests.seed();

select tests.login_as(tests.uid('padmin'));

-- --------------------------------------------------------------------------
-- Catalog: capabilities, modules, products — versioning + lifecycle + approval
-- --------------------------------------------------------------------------
select hlvs.register_capability('scheduling_x','Scheduling X','customer_experience');
select is((select lifecycle::text from hlvs.capabilities where key='scheduling_x'),'draft','t_capability_draft');
select hlvs.approve_capability('scheduling_x', true);
select is((select lifecycle::text from hlvs.capabilities where key='scheduling_x'),'approved','t_capability_approved');
select ok((select reusable from hlvs.capabilities where key='scheduling_x'),'t_capability_reusable');
select is((select version from hlvs.capabilities where key='scheduling_x'),2,'t_capability_versioned');

select hlvs.register_module('mod_a','Module A','core', jsonb_build_object('source_repository','repo','capabilities',jsonb_build_array('scheduling_x')));
select is((select production_eligible from hlvs.modules where key='mod_a'),false,'t_module_not_eligible_by_default');
select hlvs.approve_module_production('mod_a');
select ok((select production_eligible from hlvs.modules where key='mod_a'),'t_module_production_eligible');

select hlvs.register_product('recept_x','ReceptionX');
select is((select published from hlvs.products where key='recept_x'),false,'t_product_unpublished');
select hlvs.publish_product('recept_x');
select ok((select published from hlvs.products where key='recept_x'),'t_product_published');
select ok((select count(*) from hlvs.products where key='reception_ai') = 1,'t_seed_products_present');
select ok((select count(*) from hlvs.industry_templates) >= 7,'t_seed_templates_present');
select ok((select count(*) from hlvs.extraction_candidates) >= 12,'t_seed_extraction_candidates_present');

-- --------------------------------------------------------------------------
-- Duplicate-risk determination (deterministic; AI advisory only)
-- --------------------------------------------------------------------------
select set_config('h.dc1', hlvs.duplicate_check('mod_a', null, 'mod_a')::text, false);
select is((select determination::text from hlvs.duplicate_checks where id=current_setting('h.dc1')::uuid),'reuse_existing','t_determination_reuse');
select set_config('h.dc2', hlvs.duplicate_check('a totally novel widget', null, null, 'reuse_existing')::text, false);
select is((select determination::text from hlvs.duplicate_checks where id=current_setting('h.dc2')::uuid),'create_new','t_determination_create_new');
-- AI recommended reuse_existing but the deterministic determination governs (create_new)
select isnt((select determination::text from hlvs.duplicate_checks where id=current_setting('h.dc2')::uuid),
            (select ai_recommended::text from hlvs.duplicate_checks where id=current_setting('h.dc2')::uuid),'t_ai_recommendation_not_authoritative');
select is((select approved from hlvs.duplicate_checks where id=current_setting('h.dc1')::uuid),false,'t_determination_needs_approval');
select hlvs.approve_determination(current_setting('h.dc1')::uuid);
select ok((select approved from hlvs.duplicate_checks where id=current_setting('h.dc1')::uuid),'t_determination_approved');

-- extraction candidate workflow
select set_config('h.ext', hlvs.record_extraction_candidate('Venuewise','Event registration engine', jsonb_build_object('proposed_capability_key','registration'))::text, false);
select hlvs.review_extraction_candidate(current_setting('h.ext')::uuid,'approved_for_extraction','ok');
select is((select extraction_status::text from hlvs.extraction_candidates where id=current_setting('h.ext')::uuid),'approved_for_extraction','t_extraction_reviewed');

-- --------------------------------------------------------------------------
-- Product Technical Blueprint — immutable once approved
-- --------------------------------------------------------------------------
select set_config('h.bp', hlvs.create_product_blueprint('recept_x', jsonb_build_object('business_problem','x','required_modules',jsonb_build_array('mod_a')))::text, false);
select is((select status::text from hlvs.product_blueprints where id=current_setting('h.bp')::uuid),'draft','t_blueprint_draft');
-- order cannot be created from an unapproved blueprint
select throws_ok($$ select hlvs.create_software_creation_order(current_setting('h.bp')::uuid) $$,'22023',null,'t_order_requires_approved_blueprint');
select hlvs.approve_product_blueprint(current_setting('h.bp')::uuid);
select is((select status::text from hlvs.product_blueprints where id=current_setting('h.bp')::uuid),'approved','t_blueprint_approved');
select ok((select immutable from hlvs.product_blueprints where id=current_setting('h.bp')::uuid),'t_blueprint_immutable_flag');
-- immutability enforced (superuser attempt to mutate content raises)
select tests.logout();
select throws_ok(
  $$ update hlvs.product_blueprints set content = '{"tampered":true}'::jsonb where id=current_setting('h.bp')::uuid $$,
  '22023', null, 't_blueprint_immutable_enforced');
select tests.login_as(tests.uid('padmin'));

-- --------------------------------------------------------------------------
-- Software Creation Order — approval gates; Claude never gets an unapproved order
-- --------------------------------------------------------------------------
select set_config('h.ord', hlvs.create_software_creation_order(current_setting('h.bp')::uuid,
  jsonb_build_object('build_scope', jsonb_build_object('required_modules', jsonb_build_array('mod_a'), 'new_modules_authorized', jsonb_build_array())))::text, false);
select is((select status::text from hlvs.software_creation_orders where id=current_setting('h.ord')::uuid),'draft','t_order_draft');
-- prompt cannot be generated for an unapproved order
select throws_ok($$ select hlvs.generate_prompt_package(current_setting('h.ord')::uuid) $$,'22023',null,'t_prompt_requires_approved_order');
select hlvs.approve_software_creation_order(current_setting('h.ord')::uuid);
select is((select status::text from hlvs.software_creation_orders where id=current_setting('h.ord')::uuid),'approved','t_order_approved');

-- --------------------------------------------------------------------------
-- Prompt package — deterministic, versioned, live_execution false
-- --------------------------------------------------------------------------
select set_config('h.pp', hlvs.generate_prompt_package(current_setting('h.ord')::uuid)::text, false);
select is((select version from hlvs.prompt_packages where id=current_setting('h.pp')::uuid),1,'t_prompt_v1');
select is((select status::text from hlvs.software_creation_orders where id=current_setting('h.ord')::uuid),'prompt_generated','t_order_prompt_generated');
select ok((select json_export->>'mandatory_reuse_analysis' from hlvs.prompt_packages where id=current_setting('h.pp')::uuid)='true','t_prompt_has_reuse_requirement');
select is((select (json_export->>'live_execution')::boolean from hlvs.prompt_packages where id=current_setting('h.pp')::uuid),false,'t_prompt_no_live_execution');
select ok((select markdown_export from hlvs.prompt_packages where id=current_setting('h.pp')::uuid) is not null,'t_prompt_markdown_export');
-- regenerate -> version 2
select set_config('h.pp2', hlvs.generate_prompt_package(current_setting('h.ord')::uuid)::text, false);
select is((select version from hlvs.prompt_packages where id=current_setting('h.pp2')::uuid),2,'t_prompt_versioned');

-- --------------------------------------------------------------------------
-- Development run (R1, happy path) — external_execution false
-- --------------------------------------------------------------------------
select set_config('h.run', hlvs.start_development_run(current_setting('h.ord')::uuid, jsonb_build_object('repository','hl-bos-platform','branch','feature/x'))::text, false);
select is((select external_execution from hlvs.development_runs where id=current_setting('h.run')::uuid),false,'t_run_no_external_execution');
select is((select status::text from hlvs.software_creation_orders where id=current_setting('h.ord')::uuid),'development_active','t_order_development_active');

-- checkpoint report submit + review (append-only after accept)
select set_config('h.cr', hlvs.submit_checkpoint_report(current_setting('h.run')::uuid, 1, 'Foundations',
  jsonb_build_object('modules_created', jsonb_build_array('mod_a'), 'commit_id','abc123'))::text, false);
select is((select review::text from hlvs.checkpoint_reports where id=current_setting('h.cr')::uuid),'pending','t_report_pending');
select hlvs.review_checkpoint_report(current_setting('h.cr')::uuid, 'accepted');
select is((select review::text from hlvs.checkpoint_reports where id=current_setting('h.cr')::uuid),'accepted','t_report_accepted');
-- append-only: mutating an accepted report raises (as superuser)
select tests.logout();
select throws_ok(
  $$ update hlvs.checkpoint_reports set content='{"x":1}'::jsonb where id=current_setting('h.cr')::uuid $$,
  '22023', null, 't_report_append_only');
select tests.login_as(tests.uid('padmin'));

-- build completion requires all checkpoint reports accepted
select set_config('h.bcr', hlvs.submit_build_completion_report(current_setting('h.run')::uuid, jsonb_build_object('summary','done'), true)::text, false);
select ok(current_setting('h.bcr') is not null,'t_build_completion_created');
select ok((select drafted_by_ai from hlvs.build_completion_reports where id=current_setting('h.bcr')::uuid),'t_bcr_ai_drafted');
select is((select review::text from hlvs.build_completion_reports where id=current_setting('h.bcr')::uuid),'pending','t_bcr_pending_until_human');
select hlvs.accept_build_completion_report(current_setting('h.run')::uuid);
select is((select review::text from hlvs.build_completion_reports where id=current_setting('h.bcr')::uuid),'accepted','t_bcr_accepted');

-- conformance (R1) -> conformant
select set_config('h.conf', hlvs.run_conformance(current_setting('h.run')::uuid)::text, false);
select is((select verdict::text from hlvs.conformance_results where id=current_setting('h.conf')::uuid),'conformant','t_conformant');
select is((select jsonb_array_length(blocking) from hlvs.conformance_results where id=current_setting('h.conf')::uuid),0,'t_conformant_no_blocking');

-- catalog update proposal
select set_config('h.cup', hlvs.create_catalog_update_proposal(current_setting('h.run')::uuid, jsonb_build_object('new_modules',jsonb_build_array()))::text, false);
select is((select status from hlvs.catalog_update_proposals where id=current_setting('h.cup')::uuid),'draft','t_catalog_update_draft');
select hlvs.approve_catalog_update_proposal(current_setting('h.cup')::uuid);
select is((select status from hlvs.catalog_update_proposals where id=current_setting('h.cup')::uuid),'approved','t_catalog_update_approved');

-- --------------------------------------------------------------------------
-- Factory Build Package — deterministic readiness
-- --------------------------------------------------------------------------
select set_config('h.pkg', hlvs.build_factory_package(current_setting('h.run')::uuid, current_setting('h.conf')::uuid)::text, false);
select is((select readiness::text from hlvs.factory_build_packages where id=current_setting('h.pkg')::uuid),'ready','t_package_ready');
select ok((select release_candidate from hlvs.factory_build_packages where id=current_setting('h.pkg')::uuid) like 'rc-%','t_package_release_candidate');
select hlvs.approve_factory_package(current_setting('h.pkg')::uuid);
select is((select status::text from hlvs.factory_build_packages where id=current_setting('h.pkg')::uuid),'architecture_approved','t_package_arch_approved');
select set_config('h.intake', hlvs.submit_factory_package(current_setting('h.pkg')::uuid)::text, false);
select is((select status::text from hlvs.factory_build_packages where id=current_setting('h.pkg')::uuid),'submitted_to_hlbos','t_package_submitted');
select is((select status::text from hlvs.hlbos_intake where id=current_setting('h.intake')::uuid),'received','t_intake_received');

-- HL-BOS intake accept -> the furthest permitted status
select hlvs.hlbos_intake_review(current_setting('h.intake')::uuid, true, null);
select is((select status::text from hlvs.hlbos_intake where id=current_setting('h.intake')::uuid),'accepted_for_controlled_deployment_review','t_intake_accepted');
select is((select status::text from hlvs.factory_build_packages where id=current_setting('h.pkg')::uuid),'accepted_by_hlbos','t_package_accepted');

-- commercial authorization mismatch (a non-existent commercial auth is refused)
select set_config('h.pkg2', hlvs.build_factory_package(current_setting('h.run')::uuid, current_setting('h.conf')::uuid)::text, false);
select hlvs.approve_factory_package(current_setting('h.pkg2')::uuid);
select set_config('h.intake2', hlvs.submit_factory_package(current_setting('h.pkg2')::uuid)::text, false);
select throws_ok(
  $$ select hlvs.hlbos_intake_review(current_setting('h.intake2')::uuid, true, pg_catalog.gen_random_uuid()) $$,
  '22023', null, 't_commercial_authorization_mismatch');
-- HL-BOS intake reject path
select hlvs.hlbos_intake_review(current_setting('h.intake2')::uuid, false, null, jsonb_build_array('duplicate_submission'));
select is((select status::text from hlvs.hlbos_intake where id=current_setting('h.intake2')::uuid),'rejected','t_intake_rejected');
select is((select status::text from hlvs.factory_build_packages where id=current_setting('h.pkg2')::uuid),'rejected_by_hlbos','t_package_rejected');

-- feedback record (inert)
select ok(hlvs.record_hlbos_feedback(current_setting('h.pkg')::uuid,'validation_started', jsonb_build_object('note','mock')) > 0,'t_feedback_recorded');
select is((select external_execution from hlvs.hlbos_feedback order by id desc limit 1),false,'t_feedback_inert');

-- --------------------------------------------------------------------------
-- R2: missing required module -> nonconformant; exceptionable exception flips verdict
-- --------------------------------------------------------------------------
select set_config('h.ord2', hlvs.create_software_creation_order(current_setting('h.bp')::uuid,
  jsonb_build_object('build_scope', jsonb_build_object('required_modules', jsonb_build_array('mod_a'), 'new_modules_authorized', jsonb_build_array())))::text, false);
select hlvs.approve_software_creation_order(current_setting('h.ord2')::uuid);
select hlvs.generate_prompt_package(current_setting('h.ord2')::uuid);
select set_config('h.run2', hlvs.start_development_run(current_setting('h.ord2')::uuid)::text, false);
select set_config('h.cr2', hlvs.submit_checkpoint_report(current_setting('h.run2')::uuid, 1, 'Partial',
  jsonb_build_object('modules_created', jsonb_build_array()))::text, false);  -- mod_a NOT reported
select hlvs.review_checkpoint_report(current_setting('h.cr2')::uuid, 'accepted');
select hlvs.submit_build_completion_report(current_setting('h.run2')::uuid, jsonb_build_object('summary','partial'));
select hlvs.accept_build_completion_report(current_setting('h.run2')::uuid);
select set_config('h.conf2', hlvs.run_conformance(current_setting('h.run2')::uuid)::text, false);
select is((select verdict::text from hlvs.conformance_results where id=current_setting('h.conf2')::uuid),'nonconformant','t_nonconformant');
select ok((select blocking from hlvs.conformance_results where id=current_setting('h.conf2')::uuid) ? 'required_module_missing:mod_a','t_blocking_reason_structured');
-- a non-exceptionable rule can never be excepted
select throws_ok(
  $$ select hlvs.grant_conformance_exception(current_setting('h.conf2')::uuid,'secret_exposure','waive','x') $$,
  '22023', null, 't_non_exceptionable_rejected');
-- an exceptionable rule can be excepted -> verdict flips
select ok(hlvs.grant_conformance_exception(current_setting('h.conf2')::uuid,'required_module_missing:mod_a','approved gap','pilot') > 0,'t_exceptionable_granted');
select is((select verdict::text from hlvs.conformance_results where id=current_setting('h.conf2')::uuid),'conformant_with_approved_exceptions','t_verdict_flips_with_exception');
-- package readiness blocked when conformance nonconformant (before exception, use a fresh run) — covered by R3
select ok((select count(*) from audit.security_events where action='hlvs.conformance_exception') >= 1,'t_conformance_exception_audited');

-- --------------------------------------------------------------------------
-- R3: rogue (unauthorized) module -> non_exceptionable detection
-- --------------------------------------------------------------------------
select set_config('h.ord3', hlvs.create_software_creation_order(current_setting('h.bp')::uuid,
  jsonb_build_object('build_scope', jsonb_build_object('required_modules', jsonb_build_array('mod_a'), 'new_modules_authorized', jsonb_build_array())))::text, false);
select hlvs.approve_software_creation_order(current_setting('h.ord3')::uuid);
select hlvs.generate_prompt_package(current_setting('h.ord3')::uuid);
select set_config('h.run3', hlvs.start_development_run(current_setting('h.ord3')::uuid)::text, false);
select hlvs.submit_checkpoint_report(current_setting('h.run3')::uuid, 1, 'Rogue',
  jsonb_build_object('modules_created', jsonb_build_array('mod_a','rogue_mod')));  -- rogue not authorized
select set_config('h.conf3', hlvs.run_conformance(current_setting('h.run3')::uuid)::text, false);
select ok((select non_exceptionable from hlvs.conformance_results where id=current_setting('h.conf3')::uuid) ? 'unauthorized_module_duplication','t_unauthorized_duplication_detected');
select ok((select blocking from hlvs.conformance_results where id=current_setting('h.conf3')::uuid) ? 'unauthorized_module_duplication','t_non_exceptionable_blocks');
-- a package built on a non-conformant run is not ready
select set_config('h.pkg3', hlvs.build_factory_package(current_setting('h.run3')::uuid, current_setting('h.conf3')::uuid)::text, false);
select is((select readiness::text from hlvs.factory_build_packages where id=current_setting('h.pkg3')::uuid),'blocked','t_package_blocked_when_nonconformant');
select ok((select blocking_reasons from hlvs.factory_build_packages where id=current_setting('h.pkg3')::uuid) ? 'prohibited_deviation','t_package_prohibited_deviation');
select throws_ok($$ select hlvs.approve_factory_package(current_setting('h.pkg3')::uuid) $$,'22023',null,'t_cannot_approve_blocked_package');

-- --------------------------------------------------------------------------
-- Permission + RLS enforcement; AI/duplication guarantees; events; no dup bus
-- --------------------------------------------------------------------------
-- a non-platform tenant user cannot manage the HLVS catalog
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select hlvs.register_capability('sneaky','Sneaky','x') $$,'42501',null,'t_non_platform_cannot_manage');
select throws_ok($$ select hlvs.approve_product_blueprint(current_setting('h.bp')::uuid) $$,'42501',null,'t_non_platform_cannot_approve_blueprint');
-- RLS isolation: a non-platform tenant sees no HLVS records
select is((select count(*)::int from hlvs.products),0,'t_rls_products_hidden');
select is((select count(*)::int from hlvs.factory_build_packages),0,'t_rls_packages_hidden');
select is((select count(*)::int from hlvs.software_creation_orders),0,'t_rls_orders_hidden');
select tests.logout();

-- events on the existing bus + worker wiring
select ok((select count(*) from events.outbox where topic='hlvs.software_creation_order.approved') >= 1,'t_event_order_approved');
select ok((select count(*) from events.outbox where topic='hlvs.prompt_package.generated') >= 1,'t_event_prompt_generated');
select ok((select count(*) from events.outbox where topic='hlvs.development_run.started') >= 1,'t_event_run_started');
select ok((select count(*) from events.outbox where topic='hlvs.checkpoint_report.submitted') >= 1,'t_event_report_submitted');
select ok((select count(*) from events.outbox where topic='hlvs.checkpoint_report.accepted') >= 1,'t_event_report_accepted');
select ok((select count(*) from events.outbox where topic='hlvs.build_completion_report.submitted') >= 1,'t_event_bcr_submitted');
select ok((select count(*) from events.outbox where topic='hlvs.blueprint_conformance.completed') >= 1,'t_event_conformance');
select ok((select count(*) from events.outbox where topic='hlvs.catalog_update.approved') >= 1,'t_event_catalog_update');
select ok((select count(*) from events.outbox where topic='hlvs.factory_build_package.submitted') >= 1,'t_event_package_submitted');
select ok((select count(*) from events.outbox where topic='hlbos.factory_build_package.received') >= 1,'t_event_hlbos_received');
select ok((select count(*) from events.outbox where topic='hlbos.factory_build_package.accepted') >= 1,'t_event_hlbos_accepted');
select ok((select count(*) from events.outbox where topic='hlbos.production_review.ready') >= 1,'t_event_production_review_ready');
select ok((select count(*) from events.outbox where topic='hlbos.factory_build_package.rejected') >= 1,'t_event_hlbos_rejected');
select ok((select count(*) from events.subscriptions where key='hlvs_factory_worker') = 1,'t_worker_subscription');
select ok((select count(*) from events.handlers where subscription_key='hlvs_factory_worker') = 1,'t_worker_handler');

-- audit generation for HLVS platform records
select ok((select count(*) from audit.events where resource_type='hlvs.product_blueprints') >= 1,'t_blueprint_audited');
select ok((select count(*) from audit.events where resource_type='hlvs.factory_build_packages') >= 1,'t_package_audited');
select ok((select count(*) from audit.events where resource_type='hlvs.software_creation_orders') >= 1,'t_order_audited');

select * from finish();
rollback;
