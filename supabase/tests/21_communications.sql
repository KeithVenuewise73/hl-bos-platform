\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 3 — shared communications (comms) tests.
-- Authorized/denied requests, tenant isolation, template version + variable
-- rendering, missing-variable failure, consent + opt-out enforcement,
-- marketing vs transactional, idempotency, provider-failure + retry, delivery
-- status, human-approval routing, audit, and vault-ref-at-rest.
-- events.outbox / audit are platform-observability only, so those assertions
-- run after logout (postgres bypasses their tenant/platform RLS).
-- ===========================================================================
begin;
select plan(31);
select tests.seed();

-- --- authorized request + template/version + rendering ----------------------
select tests.login_as(tests.uid('owner_a'));
select ok(
  comms.request_message(p_tenant => tests.uid('tenant_a'), p_module => 'visibility',
    p_channel => 'email', p_template => 'proposal_delivery', p_version => 1,
    p_to => 'c1@ex.test',
    p_vars => jsonb_build_object('business','Acme','contact','Dana','link','https://x'),
    p_idempotency => 'idem1') is not null,
  't_authorized_request');
select is((select template_version from comms.messages where to_contact='c1@ex.test'), 1,
  't_template_version_tracked');
select is((select status::text from comms.messages where to_contact='c1@ex.test'), 'queued',
  't_transactional_queued');
-- body substitutes {{contact}} and {{link}}; subject substitutes {{business}}
select ok((select body from comms.messages where to_contact='c1@ex.test') like '%Dana%'
      and (select subject from comms.messages where to_contact='c1@ex.test') like '%Acme%',
  't_variable_rendering');

-- --- missing variable => failure -------------------------------------------
select throws_ok(
  $$ select comms.request_message(p_tenant => tests.uid('tenant_a'), p_module=>'visibility',
       p_channel=>'email', p_template=>'proposal_delivery', p_version=>1, p_to=>'c2@ex.test',
       p_vars => jsonb_build_object('business','Acme','contact','Dana')) $$,
  '23514', null, 't_missing_variable_fails');

-- --- idempotency: same key returns same message id --------------------------
select is(
  comms.request_message(p_tenant => tests.uid('tenant_a'), p_module=>'visibility',
    p_channel=>'email', p_template=>'proposal_delivery', p_version=>1, p_to=>'c1@ex.test',
    p_vars => jsonb_build_object('business','Acme','contact','Dana','link','https://x'),
    p_idempotency => 'idem1'),
  (select id from comms.messages where to_contact='c1@ex.test'),
  't_idempotent_request');
select tests.logout();

-- --- unauthorized (viewer has read, not send) + tenant isolation -----------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select comms.request_message(p_tenant=>tests.uid('tenant_a'),p_module=>'x',p_channel=>'sms',
       p_template=>'appointment_reminder',p_version=>1,p_to=>'v@ex.test',
       p_vars=>jsonb_build_object('service','cut','date','Mon')) $$,
  '42501', null, 't_viewer_cannot_send');
select tests.logout();
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$ select comms.request_message(p_tenant=>tests.uid('tenant_a'),p_module=>'x',p_channel=>'email',
       p_template=>'proposal_delivery',p_version=>1,p_to=>'z@ex.test',
       p_vars=>jsonb_build_object('business','A','contact','B','link','L')) $$,
  '42501', null, 't_nonmember_cannot_send_other_tenant');
select tests.logout();

-- --- consent: marketing requires it; transactional does not -----------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select comms.request_message(p_tenant=>tests.uid('tenant_a'),p_module=>'visibility',
       p_channel=>'email',p_template=>'proposal_delivery',p_version=>1,p_to=>'lead@ex.test',
       p_class=>'marketing',
       p_vars=>jsonb_build_object('business','A','contact','B','link','L')) $$,
  '42501', null, 't_marketing_without_consent_denied');
select lives_ok(
  $$ select comms.set_consent(tests.uid('tenant_a'),'email','lead@ex.test','granted','signup') $$,
  't_set_consent');
select lives_ok(
  $$ select comms.request_message(p_tenant=>tests.uid('tenant_a'),p_module=>'visibility',
       p_channel=>'email',p_template=>'proposal_delivery',p_version=>1,p_to=>'lead@ex.test',
       p_class=>'marketing',
       p_vars=>jsonb_build_object('business','A','contact','B','link','L')) $$,
  't_marketing_with_consent_allowed');
select lives_ok(
  $$ select comms.request_message(p_tenant=>tests.uid('tenant_a'),p_module=>'visibility',
       p_channel=>'email',p_template=>'proposal_delivery',p_version=>1,p_to=>'anon@ex.test',
       p_vars=>jsonb_build_object('business','A','contact','B','link','L')) $$,
  't_transactional_no_consent_ok');

-- --- opt-out suppression wins ----------------------------------------------
select lives_ok($$ select comms.suppress(tests.uid('tenant_a'),'email','blocked@ex.test','opt_out') $$,
  't_suppress');
-- request then read in SEPARATE statements (same-statement snapshot predates the insert)
select comms.request_message(p_tenant=>tests.uid('tenant_a'),p_module=>'visibility',
  p_channel=>'email',p_template=>'proposal_delivery',p_version=>1,p_to=>'blocked@ex.test',
  p_vars=>jsonb_build_object('business','A','contact','B','link','L'));
select is((select status::text from comms.messages where to_contact='blocked@ex.test'),
  'suppressed', 't_suppressed_contact_not_sent');

-- --- human approval routing -------------------------------------------------
select ok(
  comms.request_message(p_tenant=>tests.uid('tenant_a'),p_module=>'visibility',
    p_channel=>'email',p_template=>'proposal_delivery',p_version=>1,p_to=>'approve@ex.test',
    p_vars=>jsonb_build_object('business','A','contact','B','link','L'),
    p_require_approval => true) is not null,
  't_request_with_approval');
select is((select status::text from comms.messages where to_contact='approve@ex.test'), 'pending',
  't_approval_pending');
select throws_ok(
  $$ select comms.approve_message((select id from comms.messages where to_contact='approve@ex.test')) $$,
  '42501', null, 't_cannot_approve_before_decision');
select lives_ok(
  $$ select workflows.decide(
       (select t.id from workflows.tasks t join workflows.instances i on i.id=t.instance_id
          where i.subject_id = (select id::text from comms.messages where to_contact='approve@ex.test')
          order by t.created_at desc limit 1), 'approved', 'ok') $$,
  't_human_decides');
select lives_ok(
  $$ select comms.approve_message((select id from comms.messages where to_contact='approve@ex.test')) $$,
  't_approve_after_decision');
select is((select status::text from comms.messages where to_contact='approve@ex.test'), 'approved',
  't_message_approved');
select tests.logout();

-- --- delivery status is provider-only (anti-fabrication) + retry ------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select comms.record_delivery((select id from comms.messages where to_contact='c1@ex.test'),'delivered') $$,
  '42501', null, 't_tenant_cannot_record_delivery');
select tests.logout();

select tests.login_as(tests.uid('padmin'));
select lives_ok(
  $$ select comms.record_delivery((select id from comms.messages where to_contact='c1@ex.test'),'sent','prov-1') $$,
  't_provider_records_sent');
select lives_ok(
  $$ select comms.record_delivery((select id from comms.messages where to_contact='c1@ex.test'),'delivered') $$,
  't_provider_records_delivered');
select lives_ok(
  $$ select comms.record_delivery((select id from comms.messages where to_contact='anon@ex.test'),'failed',null,'bounce') $$,
  't_provider_records_failure');
select lives_ok(
  $$ select comms.record_delivery((select id from comms.messages where to_contact='anon@ex.test'),'failed',null,'bounce2') $$,
  't_retry_second_failure');
select tests.logout();

select is((select status::text from comms.messages where to_contact='c1@ex.test'), 'delivered',
  't_delivery_status_updated');
select is((select attempts from comms.messages where to_contact='anon@ex.test'), 2,
  't_retry_attempts_tracked');

-- --- events + audit + secret-at-rest (read as postgres) ---------------------
select ok((select count(*) from events.outbox where topic='communication.requested') >= 1,
  't_requested_event');
select ok((select count(*) from events.outbox where topic='communication.suppressed') >= 1,
  't_suppressed_event');
select ok((select count(*) from audit.events where resource_type='comms.messages') >= 1,
  't_messages_audited');
select ok((select bool_and(credential_ref is null or credential_ref ~ '^vault:') from comms.providers),
  't_provider_credentials_are_vault_refs');

select * from finish();
rollback;
