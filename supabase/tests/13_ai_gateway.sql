\ir _fixtures.sql.inc

-- Coverage for v0_ai_gateway: permission-gated runs, budget enforcement,
-- honest cost recording, tenant isolation of the run ledger.
begin;
select plan(6);
select tests.seed();

-- a member with ai.run.create can begin a run; a viewer (read-only) cannot
select tests.login_as(tests.uid('owner_a'));
select ok(ai.begin_run(tests.uid('tenant_a'), 'seo-content', 1, 'mock-model', null) > 0,
  't_member_can_begin_run');
select tests.logout();

select tests.login_as(tests.uid('viewer_a'));
select throws_ok($$ select ai.begin_run(tests.uid('tenant_a'), 'seo-content', 1, 'mock-model', null) $$,
  '42501', null, 't_viewer_cannot_begin_run');
select tests.logout();

-- finishing a run records real cost and accrues it to the budget
insert into ai.budgets (tenant_id, period, limit_usd, spent_usd) values (tests.uid('tenant_a'), 'month', 10.00, 0);
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$ select ai.finish_run(
  (select id from ai.runs where tenant_id=tests.uid('tenant_a') order by id desc limit 1), 100, 200, 0.50, 'succeeded') $$,
  't_finish_run_records_cost');
select tests.logout();
select is((select spent_usd from ai.budgets where tenant_id=tests.uid('tenant_a') and period='month'), 0.50,
  't_cost_accrues_to_budget');

-- an exhausted budget blocks new runs
insert into ai.budgets (tenant_id, period, limit_usd, spent_usd) values (tests.uid('tenant_b'), 'month', 1.00, 1.00);
select tests.login_as(tests.uid('owner_b'));
select throws_ok($$ select ai.begin_run(tests.uid('tenant_b'), 'seo-content', 1, 'mock-model', null) $$,
  '42501', null, 't_exhausted_budget_blocks_run');
select tests.logout();

-- isolation of the run ledger
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from ai.runs where tenant_id = tests.uid('tenant_a')), 0,
  't_tenant_cannot_read_other_tenant_runs');
select tests.logout();

select * from finish();
