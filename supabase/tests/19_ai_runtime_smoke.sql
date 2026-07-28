\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 2 — AI runtime + background-processing smoke tests.
--
-- Exercises the DB-enforced half of the AI gateway runtime end-to-end with the
-- MOCK provider semantics (no live key, no network): authorized/denied runs,
-- tenant isolation, prompt/version + token/cost accounting, provider-failure
-- recording, budget enforcement, idempotency, the ai.run.completed event and
-- its dispatch fan-out, and human-approval routing for a gated AI action.
--
-- The edge-function half (structured-output validation, secret redaction,
-- provider retry) is covered by Deno unit tests in supabase/functions/tests/.
--
-- Reuses the existing gateway/events/workflows primitives — no new engine.
-- ===========================================================================
begin;
select plan(24);
select tests.seed();

-- give tenant_a a budget so cost accounting has somewhere to accrue
insert into ai.budgets (tenant_id, period, limit_usd, spent_usd)
  values (tests.uid('tenant_a'), 'month', 10.00, 0);

-- --- authorized AI request + prompt/version/model tracking ------------------
select tests.login_as(tests.uid('owner_a'));
select ok(
  ai.begin_run(tests.uid('tenant_a'), 'seo-content', 1, 'mock-model', null) > 0,
  't_authorized_begin_run');
select tests.logout();

-- inspect the pending run just created (as postgres, bypassing RLS)
select is((select prompt_key    from ai.runs order by id desc limit 1)::text, 'seo-content',
  't_run_records_prompt_key');
select is((select prompt_version from ai.runs order by id desc limit 1), 1,
  't_run_records_prompt_version');
select is((select model_key     from ai.runs order by id desc limit 1)::text, 'mock-model',
  't_run_records_model_key');
select is((select status::text  from ai.runs order by id desc limit 1), 'pending',
  't_run_starts_pending');

-- --- unauthorized denial (viewer has no ai.run.create) ----------------------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select ai.begin_run(tests.uid('tenant_a'), 'seo-content', 1, 'mock-model', null) $$,
  '42501', null, 't_unauthorized_viewer_denied');
select tests.logout();

-- --- tenant isolation: a non-member cannot run for another tenant -----------
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$ select ai.begin_run(tests.uid('tenant_a'), 'seo-content', 1, 'mock-model', null) $$,
  '42501', null, 't_nonmember_cannot_run_for_other_tenant');
select tests.logout();

-- --- token + cost accounting on success (mock-style cost) -------------------
select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  $$ select ai.finish_run(
       (select id from ai.runs where tenant_id=tests.uid('tenant_a') order by id desc limit 1),
       100, 200, 0.50, 'succeeded') $$,
  't_finish_success_records');
select tests.logout();
select is((select input_tokens from ai.runs order by id desc limit 1), 100,
  't_records_input_tokens');
select is((select cost_usd from ai.runs order by id desc limit 1), 0.50,
  't_records_cost');
select is((select spent_usd from ai.budgets
           where tenant_id=tests.uid('tenant_a') and period='month'), 0.50,
  't_cost_accrues_to_budget');

-- --- provider failure recorded honestly (status failed, no cost accrued) ----
select tests.login_as(tests.uid('owner_a'));
select ok(ai.begin_run(tests.uid('tenant_a'), 'seo-content', 1, 'mock-model', null) > 0,
  't_begin_second_run');
select lives_ok(
  $$ select ai.finish_run(
       (select id from ai.runs where tenant_id=tests.uid('tenant_a') and status='pending'
         order by id desc limit 1),
       0, 0, 0, 'failed') $$,
  't_provider_failure_recorded');
select tests.logout();
select is((select status::text from ai.runs where tenant_id=tests.uid('tenant_a')
           order by id desc limit 1), 'failed',
  't_failed_run_status');
select is((select spent_usd from ai.budgets
           where tenant_id=tests.uid('tenant_a') and period='month'), 0.50,
  't_failed_run_accrues_no_cost');

-- --- idempotency: a completed run cannot be finished again ------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select ai.finish_run(
       (select id from ai.runs where tenant_id=tests.uid('tenant_a') and status='succeeded'
         order by id desc limit 1),
       1, 1, 0.01, 'succeeded') $$,
  null, null, 't_finish_run_is_idempotent');
select tests.logout();

-- --- budget enforcement: an exhausted budget blocks new runs ----------------
insert into ai.budgets (tenant_id, period, limit_usd, spent_usd)
  values (tests.uid('tenant_b'), 'month', 1.00, 1.00);
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$ select ai.begin_run(tests.uid('tenant_b'), 'seo-content', 1, 'mock-model', null) $$,
  '42501', null, 't_exhausted_budget_blocks_run');
select tests.logout();

-- --- event emission + dispatch fan-out (background processing) --------------
-- finish_run emitted 'ai.run.completed' to events.outbox. Register a subscriber
-- and dispatch: at-least-once fan-out writes one delivery and marks published.
insert into events.subscriptions (key, topic, consumer_module, active)
  values ('smoke_ai_completed', 'ai.run.completed', 'test_consumer', true)
  on conflict (key) do nothing;
select ok((select events.dispatch_batch(100)) >= 1, 't_dispatch_processed_events');
select ok(
  (select count(*) from events.deliveries d
     join events.outbox o on o.id = d.outbox_id
    where o.topic = 'ai.run.completed' and d.subscription_key = 'smoke_ai_completed') >= 1,
  't_delivery_written_for_completed_event');

-- --- human-approval routing for a gated AI action ---------------------------
-- request approval as a member; a permission-holder decides; is_approved flips.
select tests.login_as(tests.uid('owner_a'));
select ok(
  workflows.request_approval(tests.uid('tenant_a'), 'ai.content.publish',
    'ai.run', '1', 'tenant_admin') is not null,
  't_request_approval_routes');
select is(
  workflows.is_approved(
    (select id from workflows.instances where tenant_id=tests.uid('tenant_a')
      order by started_at desc limit 1)),
  false, 't_not_approved_before_decision');
select lives_ok(
  $$ select workflows.decide(
       (select t.id from workflows.tasks t
          join workflows.instances i on i.id = t.instance_id
         where i.tenant_id=tests.uid('tenant_a') order by t.created_at desc limit 1),
       'approved', 'smoke') $$,
  't_permission_holder_decides');
select is(
  workflows.is_approved(
    (select id from workflows.instances where tenant_id=tests.uid('tenant_a')
      order by started_at desc limit 1)),
  true, 't_approved_after_decision');
select tests.logout();

-- --- redaction guarantee at rest: a provider credential is a Vault ref ------
-- The DB never stores a raw secret; it stores 'vault:<name>'. This is the
-- at-rest half of secret protection; log/response redaction is tested in Deno.
select ok(
  (select bool_and(credential_ref is null or credential_ref ~ '^vault:')
     from ai.providers), 't_ai_credentials_are_vault_refs_never_secrets');

select * from finish();
rollback;
