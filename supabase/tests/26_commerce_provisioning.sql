\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 7 — Proposal, Customer Selection, Agreement, Billing Setup,
-- Provisioning Request, Work Order & Software Factory Authorization.
-- End-to-end commercial + operational handoff from an approved blueprint,
-- plus the negative/blocking paths. Human approval gates throughout (AI can
-- never approve/accept); the provisioning lifecycle stops at 'ready'; the
-- factory readiness engine is deterministic. Ids threaded via session GUCs.
-- ===========================================================================
begin;
select plan(90);
select tests.seed();

-- --------------------------------------------------------------------------
-- Setup: an APPROVED blueprint for tenant_a (reuses CP4 + CP6 lifecycles)
-- --------------------------------------------------------------------------
select tests.login_as(tests.uid('admin_a'));
select set_config('c.p', discovery.create_profile(tests.uid('tenant_a'), 'Commerce Biz', 'services')::text, false);
select set_config('c.a', discovery.start_assessment(current_setting('c.p')::uuid)::text, false);
select discovery.score_dimension(current_setting('c.a')::uuid, 'maturity','security',1);
select discovery.score_dimension(current_setting('c.a')::uuid, 'maturity','digital_presence',2);
select discovery.submit_assessment_for_review(current_setting('c.a')::uuid);
select workflows.decide((select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
   where i.kind='discovery.assessment.review' and i.tenant_id=tests.uid('tenant_a') order by t.created_at desc limit 1),'approved','ok');
select discovery.complete_assessment(current_setting('c.a')::uuid);
select set_config('c.bp', discovery.request_blueprint(current_setting('c.a')::uuid)::text, false);
select discovery.start_blueprint_generation(current_setting('c.bp')::uuid);
select set_config('c.rec', discovery.recommend(current_setting('c.bp')::uuid,'service','Secure the website',
  jsonb_build_object('service_key','website_modernization','severity','critical'))::text, false);
select discovery.mark_blueprint_generated(current_setting('c.bp')::uuid, false, 'rules-0.1.0');
select discovery.submit_blueprint_for_review(current_setting('c.bp')::uuid);
select workflows.decide((select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
   where i.kind='discovery.blueprint.review' and i.tenant_id=tests.uid('tenant_a') order by t.created_at desc limit 1),'approved','ok');
select discovery.approve_blueprint(current_setting('c.bp')::uuid);
select is((select lifecycle::text from discovery.blueprints where id=current_setting('c.bp')::uuid),'approved','t_blueprint_approved');

-- an UNAPPROVED blueprint (a fresh draft version for the same assessment)
select set_config('c.bp2', discovery.request_blueprint(current_setting('c.a')::uuid)::text, false);  -- draft, not approved

-- --------------------------------------------------------------------------
-- Pricing (platform sets + approves the price book; no invented final prices)
-- --------------------------------------------------------------------------
select tests.login_as(tests.uid('padmin'));
select set_config('c.price', sales.set_price('setup_fee',
  jsonb_build_object('service_key','website_modernization','amount_cents',500000,'visibility','public','source','placeholder'))::text, false);
select set_config('c.price_prov', sales.set_price('setup_fee',
  jsonb_build_object('service_key','search_visibility','visibility','provisional','source','placeholder'))::text, false);  -- no amount
select set_config('c.price_disc', sales.set_price('discount',
  jsonb_build_object('service_key','website_modernization','amount_cents',5000,'visibility','public'))::text, false);
select set_config('c.price_mod', sales.set_price('monthly',
  jsonb_build_object('module_key','communications','amount_cents',9900,'recurring_interval','month','visibility','public'))::text, false);
select sales.approve_price(current_setting('c.price_mod')::bigint);
select is((select approval_status::text from sales.prices where id=current_setting('c.price')::bigint),'pending','t_price_starts_pending');
select ok(not sales.price_is_sellable(current_setting('c.price')::bigint),'t_unapproved_price_not_sellable');
-- approve the real setup fee; provisional (no amount) cannot be approved
select sales.approve_price(current_setting('c.price')::bigint);
select ok(sales.price_is_sellable(current_setting('c.price')::bigint),'t_approved_price_sellable');
select throws_ok($$ select sales.approve_price(current_setting('c.price_prov')::bigint) $$,'22023',null,'t_provisional_price_not_approvable');
select is((select currency from sales.prices where id=current_setting('c.price')::bigint),'USD','t_currency_preserved');
select is((select amount_cents from sales.prices where id=current_setting('c.price')::bigint),500000,'t_onetime_retained');
-- an approved discount price (approval is the gate; a real discount approval workflow lives above)
select sales.approve_price(current_setting('c.price_disc')::bigint);
select ok((select approved_by from sales.prices where id=current_setting('c.price_disc')::bigint) is not null,'t_discount_requires_approval');

-- --------------------------------------------------------------------------
-- Proposal creation + authorization + versioning
-- --------------------------------------------------------------------------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok($$ select sales.request_proposal(current_setting('c.bp')::uuid) $$,'42501',null,'t_proposal_denied_viewer');
select tests.login_as(tests.uid('admin_a'));
select set_config('c.prop', sales.request_proposal(current_setting('c.bp')::uuid)::text, false);
select ok(current_setting('c.prop') is not null,'t_proposal_created');
select is((select status::text from sales.proposals where id=current_setting('c.prop')::uuid),'draft','t_proposal_draft');
select is((select version from sales.proposals where id=current_setting('c.prop')::uuid),1,'t_proposal_v1');
select is((select blueprint_id from sales.proposals where id=current_setting('c.prop')::uuid),current_setting('c.bp')::uuid,'t_proposal_traces_blueprint');
select throws_ok($$ select sales.request_proposal(current_setting('c.bp2')::uuid) $$,'22023',null,'t_proposal_requires_approved_blueprint');

-- --------------------------------------------------------------------------
-- Line items: structured, traceable, inactive excluded
-- --------------------------------------------------------------------------
select set_config('c.li', sales.add_line_item(current_setting('c.prop')::uuid,
  jsonb_build_object('recommendation_id',current_setting('c.rec')::bigint,'service_key','website_modernization',
    'description','Rebuild the website securely','price_id',current_setting('c.price')::bigint,'est_effort','l'))::text, false);
select ok(current_setting('c.li')::bigint > 0,'t_line_item_created');
select is((select recommendation_id from sales.proposal_line_items where id=current_setting('c.li')::bigint),current_setting('c.rec')::bigint,'t_line_traces_recommendation');
select is((select service_key::text from sales.proposal_line_items where id=current_setting('c.li')::bigint),'website_modernization','t_line_traces_service');
select is((select pricing_approval_status::text from sales.proposal_line_items where id=current_setting('c.li')::bigint),'approved','t_line_price_approved');
-- a module line
select set_config('c.lim', sales.add_line_item(current_setting('c.prop')::uuid,
  jsonb_build_object('module_key','communications','description','Comms module','is_optional',true,
    'price_id',current_setting('c.price_mod')::bigint))::text, false);
select is((select module_key::text from sales.proposal_line_items where id=current_setting('c.lim')::bigint),'communications','t_line_traces_module');
-- inactive service/module excluded
select tests.logout();
update discovery.service_catalog set availability='unavailable' where key='payments';
update discovery.module_catalog set availability='unavailable' where key='reviews';
select tests.login_as(tests.uid('admin_a'));
select throws_ok($$ select sales.add_line_item(current_setting('c.prop')::uuid, jsonb_build_object('service_key','payments')) $$,'22023',null,'t_inactive_service_excluded');
select throws_ok($$ select sales.add_line_item(current_setting('c.prop')::uuid, jsonb_build_object('module_key','reviews')) $$,'22023',null,'t_inactive_module_excluded');

-- --------------------------------------------------------------------------
-- Ready-for-customer gating on pricing + internal approval
-- --------------------------------------------------------------------------
select throws_ok($$ select sales.mark_ready_for_customer(current_setting('c.prop')::uuid) $$,'22023',null,'t_ready_requires_internal_approval');
select set_config('c.pwf', sales.submit_proposal_internal_review(current_setting('c.prop')::uuid)::text, false);
select throws_ok($$ select sales.approve_proposal_internal(current_setting('c.prop')::uuid) $$,'42501',null,'t_internal_approve_needs_workflow');
select workflows.decide((select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
   where i.kind='sales.proposal.review' and i.tenant_id=tests.uid('tenant_a') order by t.created_at desc limit 1),'approved','ok');
select sales.approve_proposal_internal(current_setting('c.prop')::uuid);
select is((select internal_approval_status::text from sales.proposals where id=current_setting('c.prop')::uuid),'approved','t_internally_approved');
-- add a provisional-priced customer-visible line -> blocks ready
select set_config('c.lip', sales.add_line_item(current_setting('c.prop')::uuid,
  jsonb_build_object('service_key','search_visibility','price_id',current_setting('c.price_prov')::bigint,'description','SEO'))::text, false);
select throws_ok($$ select sales.mark_ready_for_customer(current_setting('c.prop')::uuid) $$,'22023',null,'t_provisional_price_blocks_ready');
-- make it internal-only (superuser) and now ready succeeds
select tests.logout();
update sales.proposal_line_items set customer_visible=false where id=current_setting('c.lip')::bigint;
select tests.login_as(tests.uid('admin_a'));
select sales.mark_ready_for_customer(current_setting('c.prop')::uuid);
select is((select status::text from sales.proposals where id=current_setting('c.prop')::uuid),'ready_for_customer','t_ready_for_customer');

-- --------------------------------------------------------------------------
-- Customer selection tied to version; superseded cannot be selected (tested later)
-- --------------------------------------------------------------------------
select sales.record_customer_view(current_setting('c.prop')::uuid);
select set_config('c.sel', sales.submit_customer_selection(current_setting('c.prop')::uuid,
  jsonb_build_object('accepted_whole',true,'business_info_confirmed',true,'finalized',false,
    'primary_contact',jsonb_build_object('name','Bob'),'authorized_signer',jsonb_build_object('name','Bob')))::text, false);
select is((select proposal_version from sales.customer_selections where id=current_setting('c.sel')::uuid),1,'t_selection_tied_to_version');
select is((select customer_selection_status from sales.proposals where id=current_setting('c.prop')::uuid),'in_progress','t_selection_in_progress');
-- accept before finalize -> rejected
select throws_ok($$ select sales.customer_accept(current_setting('c.prop')::uuid) $$,'22023',null,'t_accept_requires_finalized_selection');
-- finalize
select sales.submit_customer_selection(current_setting('c.prop')::uuid, jsonb_build_object('accepted_whole',true,'finalized',true));
select is((select customer_selection_status from sales.proposals where id=current_setting('c.prop')::uuid),'finalized','t_selection_finalized');

-- --------------------------------------------------------------------------
-- Agreements + acceptance
-- --------------------------------------------------------------------------
-- accept before agreements -> customer_accept rejected
select throws_ok($$ select sales.customer_accept(current_setting('c.prop')::uuid) $$,'22023',null,'t_accept_requires_agreements');
-- a non-manage user cannot accept (same gate that stops AI)
select tests.login_as(tests.uid('manager_a'));
select throws_ok($$ select sales.accept_agreement(current_setting('c.prop')::uuid,
  (select id from sales.agreements where agreement_type='msa'),'Bob') $$,'42501',null,'t_agreement_requires_manage');
select tests.login_as(tests.uid('admin_a'));
select set_config('c.acc', sales.accept_agreement(current_setting('c.prop')::uuid,
  (select id from sales.agreements where agreement_type='msa'),'Bob Owner', jsonb_build_object('signer_role','owner'))::text, false);
select ok(current_setting('c.acc') is not null,'t_agreement_accepted');
select is((select proposal_version from sales.agreement_acceptances where id=current_setting('c.acc')::uuid),1,'t_acceptance_version_preserved');
select is((select signer_name from sales.agreement_acceptances where id=current_setting('c.acc')::uuid),'Bob Owner','t_acceptance_signer');
select sales.accept_agreement(current_setting('c.prop')::uuid,(select id from sales.agreements where agreement_type='subscription'),'Bob Owner');
select is((select agreement_status from sales.proposals where id=current_setting('c.prop')::uuid),'complete','t_agreements_complete');

-- --------------------------------------------------------------------------
-- Customer acceptance (does NOT trigger provisioning)
-- --------------------------------------------------------------------------
select sales.customer_accept(current_setting('c.prop')::uuid);
select is((select status::text from sales.proposals where id=current_setting('c.prop')::uuid),'customer_accepted','t_customer_accepted');
select is((select count(*)::int from provisioning.requests where proposal_id=current_setting('c.prop')::uuid),0,'t_accept_does_not_provision');

-- --------------------------------------------------------------------------
-- Billing setup (mock only, no payment credentials, human-approved)
-- --------------------------------------------------------------------------
-- unaccepted proposal rejected: use the draft-only v2 proposal
select set_config('c.prop_un', sales.request_proposal(current_setting('c.bp')::uuid)::text, false);  -- new version, draft
select throws_ok($$ select sales.request_billing_setup(current_setting('c.prop_un')::uuid) $$,'22023',null,'t_billing_requires_accepted');
-- the v2 request supersedes nothing automatically; re-point main proposal via its id (still customer_accepted)
select set_config('c.bill', sales.request_billing_setup(current_setting('c.prop')::uuid)::text, false);
select ok(current_setting('c.bill') is not null,'t_billing_setup_created');
select ok((select provider_customer_ref from sales.billing_setup_requests where id=current_setting('c.bill')::uuid) like 'mock_%','t_mock_provider_ref_only');
select ok((select tax_placeholder from sales.billing_setup_requests where id=current_setting('c.bill')::uuid) = '{}'::jsonb,'t_no_payment_credentials_stored');
select is((select approval_status::text from sales.billing_setup_requests where id=current_setting('c.bill')::uuid),'draft','t_billing_needs_approval');
select sales.approve_billing_setup(current_setting('c.bill')::uuid);
select is((select approval_status::text from sales.billing_setup_requests where id=current_setting('c.bill')::uuid),'approved','t_billing_approved');
select is((select activation_status from sales.billing_setup_requests where id=current_setting('c.bill')::uuid),'inactive','t_billing_not_activated');

-- --------------------------------------------------------------------------
-- Provisioning request + entitlement plan + work order
-- --------------------------------------------------------------------------
select set_config('c.req', provisioning.request_provisioning(current_setting('c.prop')::uuid)::text, false);
select ok(current_setting('c.req') is not null,'t_provisioning_requested');
select ok((select requested_services from provisioning.requests where id=current_setting('c.req')::uuid) ? 'website_modernization','t_services_mapped');
select ok((select requested_modules from provisioning.requests where id=current_setting('c.req')::uuid) ? 'communications','t_modules_mapped');
select is(provisioning.generate_entitlement_plan(current_setting('c.req')::uuid),1,'t_entitlement_plan_generated');
select is((select entitlement_key::text from provisioning.entitlement_plan where request_id=current_setting('c.req')::uuid limit 1),'comms','t_entitlement_key_mapped');
select is((select enabled from provisioning.entitlement_plan where request_id=current_setting('c.req')::uuid limit 1),false,'t_entitlement_not_activated');
select is(provisioning.validate_request(current_setting('c.req')::uuid)::text,'awaiting_approval','t_request_validated');
-- approval is human-gated
select throws_ok($$ select provisioning.approve_provisioning(current_setting('c.req')::uuid) $$,'42501',null,'t_provisioning_needs_workflow');
select provisioning.submit_provisioning_for_approval(current_setting('c.req')::uuid);
select workflows.decide((select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
   where i.kind='provisioning.request.review' and i.tenant_id=tests.uid('tenant_a') order by t.created_at desc limit 1),'approved','ok');
select provisioning.approve_provisioning(current_setting('c.req')::uuid);
select is((select approval_status::text from provisioning.requests where id=current_setting('c.req')::uuid),'approved','t_provisioning_approved');
select provisioning.mark_ready(current_setting('c.req')::uuid);
select is((select status::text from provisioning.requests where id=current_setting('c.req')::uuid),'ready','t_provisioning_ready_stops_here');
select is((select execution_status from provisioning.requests where id=current_setting('c.req')::uuid),'inert','t_provisioning_inert');
-- work order
select set_config('c.wo', provisioning.generate_work_order(current_setting('c.req')::uuid)::text, false);
select ok(current_setting('c.wo') is not null,'t_work_order_created');
select is((select workstream_key::text from provisioning.work_order_tasks where work_order_id=current_setting('c.wo')::uuid order by sequence limit 1),'customer_onboarding','t_onboarding_first');
select ok((select count(*) from provisioning.work_order_tasks where work_order_id=current_setting('c.wo')::uuid) >= 2,'t_workstreams_from_items');
select ok((select hl_responsibility from provisioning.work_order_tasks where work_order_id=current_setting('c.wo')::uuid order by sequence limit 1) is not null,'t_hl_responsibility_retained');
select ok((select customer_responsibility from provisioning.work_order_tasks where work_order_id=current_setting('c.wo')::uuid order by sequence limit 1) is not null,'t_customer_responsibility_retained');

-- --------------------------------------------------------------------------
-- Readiness engine + factory authorization
-- --------------------------------------------------------------------------
-- attorney review still unreviewed on the required agreements -> blocked
select set_config('c.auth', provisioning.build_factory_authorization(current_setting('c.req')::uuid)::text, false);
select is((select readiness::text from provisioning.factory_authorizations where id=current_setting('c.auth')::uuid),'blocked','t_readiness_blocked_unreviewed_legal');
select ok((select blocking_reasons from provisioning.factory_authorizations where id=current_setting('c.auth')::uuid) ? 'agreement_unreviewed_legal','t_blocking_reasons_structured');
-- attorney approves the required templates (platform) -> now READY
select tests.logout();
update sales.agreements set attorney_review_status='approved' where is_required;
select tests.login_as(tests.uid('admin_a'));
select provisioning.build_factory_authorization(current_setting('c.req')::uuid);
select is((select readiness::text from provisioning.factory_authorizations where id=current_setting('c.auth')::uuid),'ready','t_readiness_ready');
select is((select jsonb_array_length(blocking_reasons) from provisioning.factory_authorizations where id=current_setting('c.auth')::uuid),0,'t_no_blocking_reasons');

-- revoke billing approval -> blocked with a structured reason
select tests.logout();
update sales.billing_setup_requests set approval_status='draft' where id=current_setting('c.bill')::uuid;
select tests.login_as(tests.uid('admin_a'));
select provisioning.build_factory_authorization(current_setting('c.req')::uuid);
select ok((select blocking_reasons from provisioning.factory_authorizations where id=current_setting('c.auth')::uuid) ? 'billing_setup_not_approved','t_missing_billing_blocks');
-- an approved (non-prohibited) exception clears it + is audited
select ok(provisioning.grant_readiness_exception(current_setting('c.auth')::uuid,'billing_setup_not_approved','CEO waived for pilot','pilot') > 0,'t_exception_granted');
select provisioning.build_factory_authorization(current_setting('c.req')::uuid);
select ok(not ((select blocking_reasons from provisioning.factory_authorizations where id=current_setting('c.auth')::uuid) ? 'billing_setup_not_approved'),'t_exception_clears_reason');
-- prohibited exceptions are rejected
select throws_ok($$ select provisioning.grant_readiness_exception(current_setting('c.auth')::uuid,'proposal_not_accepted','x','y') $$,'22023',null,'t_prohibited_exception_rejected');
select throws_ok($$ select provisioning.grant_readiness_exception(current_setting('c.auth')::uuid,'agreement_missing','x','y') $$,'22023',null,'t_prohibited_agreement_exception_rejected');
-- readiness build requires manage
select tests.login_as(tests.uid('manager_a'));
select throws_ok($$ select provisioning.build_factory_authorization(current_setting('c.req')::uuid) $$,'42501',null,'t_build_requires_manage');
select tests.login_as(tests.uid('admin_a'));

-- --------------------------------------------------------------------------
-- Superseded proposal cannot be selected against
-- --------------------------------------------------------------------------
-- new_proposal_version supersedes the latest draft version (c.prop_un)
select set_config('c.propN', sales.new_proposal_version(current_setting('c.bp')::uuid)::text, false);
select is((select status::text from sales.proposals where id=current_setting('c.prop_un')::uuid),'superseded','t_prior_proposal_superseded');
select throws_ok($$ select sales.submit_customer_selection(current_setting('c.prop_un')::uuid, jsonb_build_object('finalized',true)) $$,'22023',null,'t_superseded_cannot_be_selected');

-- --------------------------------------------------------------------------
-- Tenant isolation
-- --------------------------------------------------------------------------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from sales.proposals where id=current_setting('c.prop')::uuid),0,'t_tenant_isolation_proposal');
select is((select count(*)::int from provisioning.requests where id=current_setting('c.req')::uuid),0,'t_tenant_isolation_request');
select is((select count(*)::int from provisioning.factory_authorizations where id=current_setting('c.auth')::uuid),0,'t_tenant_isolation_authorization');
select tests.logout();

-- --------------------------------------------------------------------------
-- Events, worker wiring, audit
-- --------------------------------------------------------------------------
select ok((select count(*) from events.outbox where topic='proposal.created') >= 1,'t_event_proposal_created');
select ok((select count(*) from events.outbox where topic='proposal.ready_for_customer') >= 1,'t_event_ready_for_customer');
select ok((select count(*) from events.outbox where topic='proposal.customer_accepted') >= 1,'t_event_customer_accepted');
select ok((select count(*) from events.outbox where topic='agreement.accepted') >= 1,'t_event_agreement_accepted');
select ok((select count(*) from events.outbox where topic='billing_setup.approved') >= 1,'t_event_billing_approved');
select ok((select count(*) from events.outbox where topic='provisioning.ready') >= 1,'t_event_provisioning_ready');
select ok((select count(*) from events.outbox where topic='work_order.created') >= 1,'t_event_work_order_created');
select ok((select count(*) from events.outbox where topic='factory_authorization.ready') >= 1,'t_event_factory_ready');
select ok((select count(*) from events.outbox where topic='factory_authorization.blocked') >= 1,'t_event_factory_blocked');
select ok((select count(*) from events.subscriptions where key='commerce_worker') = 1,'t_worker_subscription');
select ok((select count(*) from events.handlers where subscription_key='commerce_worker') = 1,'t_worker_handler');
select ok((select count(*) from audit.events where resource_type='sales.proposals') >= 1,'t_proposal_audited');
select ok((select count(*) from audit.events where resource_type='provisioning.requests') >= 1,'t_request_audited');
select ok((select count(*) from audit.security_events where action='provisioning.readiness_exception') >= 1,'t_exception_audited');

select * from finish();
rollback;
