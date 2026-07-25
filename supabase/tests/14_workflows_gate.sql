\ir _fixtures.sql.inc

-- Coverage for v0_workflows_gate: request/decide lifecycle, the permission gate
-- on decisions, is_approved(), single-decision, and non-member rejection.
begin;
select plan(7);
select tests.seed();

-- a member starts a gated process
select tests.login_as(tests.uid('owner_a'));
select ok(workflows.request_approval(tests.uid('tenant_a'), 'test.thing.publish', 'test', 'abc', 'tenant_admin') is not null,
  't_member_can_request_approval');
select tests.logout();

-- not approved yet
select is(workflows.is_approved((select id from workflows.instances where tenant_id=tests.uid('tenant_a') order by started_at desc limit 1)), false,
  't_not_approved_before_decision');

-- a member who can READ the task but lacks approval.manage cannot decide
-- (staff holds workflows.task.read but not workflows.approval.manage)
select tests.login_as(tests.uid('staff_a'));
select throws_ok($$ select workflows.decide(
  (select id from workflows.tasks where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1), 'approved') $$,
  '42501', null, 't_reader_without_decide_permission_cannot_decide');
select tests.logout();

-- a permission-holder can, and it flips is_approved
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$ select workflows.decide(
  (select id from workflows.tasks where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1), 'approved', 'looks good') $$,
  't_permission_holder_can_decide');
select tests.logout();
select is(workflows.is_approved((select id from workflows.instances where tenant_id=tests.uid('tenant_a') order by started_at desc limit 1)), true,
  't_approved_after_decision');

-- a task cannot be decided twice
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select workflows.decide(
  (select id from workflows.tasks where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1), 'rejected') $$,
  '23505', null, 't_task_cannot_be_decided_twice');
select tests.logout();

-- a non-member cannot start a process in someone else's tenant
select tests.login_as(tests.uid('outsider'));
select throws_ok($$ select workflows.request_approval(tests.uid('tenant_a'), 'x.y.z', 't', '1') $$,
  '42501', null, 't_non_member_cannot_request');
select tests.logout();

select * from finish();
