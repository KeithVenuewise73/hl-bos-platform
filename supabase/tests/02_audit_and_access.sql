-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

begin;
select plan(17);
select tests.seed();

-- === anon has zero reach ==================================================
select tests.login_as_anon();
select throws_ok($$ select count(*) from platform.tenants $$, '42501',
  null, 't_anon_cannot_access_anything: platform.tenants denied');
select throws_ok($$ select count(*) from identity.memberships $$, '42501',
  null, 't_anon_cannot_access_anything: identity.memberships denied');
select throws_ok($$ select count(*) from audit.events $$, '42501',
  null, 't_anon_cannot_access_anything: audit.events denied');
select tests.logout();

-- === tenant/membership status gates =======================================
-- 9  suspended tenant denies everything, to EVERY role including owner
update platform.tenants set status = 'suspended' where id = tests.uid('tenant_a');
select tests.login_as(tests.uid('owner_a'));
select is(identity.has_permission(tests.uid('tenant_a'), 'tenancy.tenant.read'), false,
  't_suspended_tenant_denies_all: even tenant_owner gets false');
select tests.logout();
update platform.tenants set status = 'active' where id = tests.uid('tenant_a');

-- 10 / 35  removed and suspended memberships resolve nothing
update identity.memberships set status = 'removed' where id = tests.uid('m_staff_a');
select tests.login_as(tests.uid('staff_a'));
select is(identity.has_permission(tests.uid('tenant_a'), 'tenancy.tenant.read'), false,
  't_removed_member_has_no_permissions');
select tests.logout();

update identity.memberships set status = 'suspended' where id = tests.uid('m_staff_a');
select tests.login_as(tests.uid('staff_a'));
select is(identity.has_permission(tests.uid('tenant_a'), 'tenancy.tenant.read'), false,
  't_suspended_and_removed_memberships_do_not_resolve_permissions');
select tests.logout();
update identity.memberships set status = 'active' where id = tests.uid('m_staff_a');

-- === scope guards: the anti-escalation constraints =========================
select throws_ok($$
  insert into identity.membership_roles (membership_id, role_key)
  values (tests.uid('m_staff_a'), 'platform_owner') $$,
  '23514', null, 't_role_scope_is_enforced: platform role rejected on a tenant membership');

select throws_ok($$
  insert into identity.role_permissions (role_key, permission_key)
  values ('viewer', 'platform.tenant.manage') $$,
  '23514', null, 't_permission_scope_is_enforced: platform permission rejected on a tenant role');

-- === Correction 1: audit is not user-writable =============================
-- 13
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$
  insert into audit.events (tenant_id, actor_type, actor_id, action, resource_type)
  values (tests.uid('tenant_a'), 'system', null, 'forged.event', 'x') $$,
  '42501', null, 't_user_cannot_insert_audit_directly: INSERT denied for authenticated');

-- 16
select throws_ok($$
  insert into audit.security_events (actor_type, action, outcome)
  values ('system', 'forged', 'allowed') $$,
  '42501', null, 't_user_cannot_write_security_events');

-- 15  trigger functions must not be callable as RPC (the legacy SEC-3 defect)
select throws_ok($$ select audit.emit() $$, '42501',
  null, 't_user_cannot_call_audit_emit_as_rpc');
select tests.logout();

-- 14  actor is DERIVED from auth.uid(), never supplied
select tests.login_as(tests.uid('owner_a'));
update platform.tenants set name = 'Renamed By Owner A' where id = tests.uid('tenant_a');
select tests.logout();
select is(
  (select actor_id from audit.events
    where action = 'platform.tenants.update' order by id desc limit 1),
  tests.uid('owner_a'),
  't_user_cannot_fabricate_actor: audit actor_id equals auth.uid() of the real caller'
);

-- 17  append-only, INCLUDING for service_role (which has BYPASSRLS)
select throws_ok($$ update audit.events set action = 'tampered' where id = (select min(id) from audit.events) $$,
  '42501', null, 't_audit_is_append_only: UPDATE rejected by trigger');
select throws_ok($$ delete from audit.events where id = (select min(id) from audit.events) $$,
  '42501', null, 't_audit_is_append_only: DELETE rejected by trigger');

set local role service_role;
select throws_ok($$ update audit.events set action = 'tampered' where id = (select min(id) from audit.events) $$,
  '42501', null, 't_audit_is_append_only: UPDATE rejected even for service_role (BYPASSRLS)');

-- TRUNCATE does NOT fire BEFORE DELETE row triggers, so it would bypass
-- audit.reject_mutation(). It is blocked by PRIVILEGE instead: service_role
-- holds nothing in these schemas -- not even USAGE. Pinned, because if a later
-- phase grants service_role access for workflows, this stops being true and
-- the trigger becomes the only control.
select throws_ok($$ truncate audit.events $$, '42501', null,
  't_audit_cannot_be_truncated: service_role has no privilege in schema audit');
reset role;

select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ truncate audit.events $$, '42501', null,
  't_audit_cannot_be_truncated: authenticated cannot TRUNCATE (would bypass the trigger)');
select tests.logout();

select * from finish();
rollback;
