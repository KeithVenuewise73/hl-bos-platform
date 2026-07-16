-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

begin;
select plan(9);
select tests.seed();

-- === Correction 2: tenant bootstrap =======================================

-- 23  nobody inserts a tenant directly, at any privilege level
select tests.login_as(tests.uid('powner'));
select throws_ok($$
  insert into platform.tenants (slug, name) values ('sneaky', 'Sneaky') $$,
  '42501', null, 't_no_one_can_insert_tenant_directly: no INSERT policy exists');
select tests.logout();

-- 19  unauthorized user cannot provision
select tests.login_as(tests.uid('outsider'));
select throws_ok($$ select platform.provision_tenant('nope', 'Nope') $$,
  '42501', null, 't_unauthorized_user_cannot_provision_tenant: lacks platform.tenant.create');
select tests.logout();
select is((select count(*)::int from platform.tenants where slug = 'nope'), 0,
  't_unauthorized_user_cannot_provision_tenant: 0 tenants created');

-- Denials are NOT audited in-database, and this test pins that limitation so
-- it cannot be forgotten. PostgreSQL has no autonomous transactions: the RAISE
-- that denies also rolls back any audit row written first (proven by probe).
-- Successful paths audit fine. See the header note in 0006.
select is(
  (select count(*)::int from audit.security_events
    where action = 'platform.tenant.create' and outcome = 'denied'), 0,
  't_denials_are_not_audited_in_database: KNOWN LIMITATION, pinned deliberately');

-- 20  provisioning creates exactly one owner membership
select tests.login_as(tests.uid('powner'));
select lives_ok($$ select platform.provision_tenant('acme', 'Acme Inc') $$,
  't_provisioning_succeeds_for_platform_owner');
select tests.logout();

select is(
  (select count(*)::int from identity.memberships m
   join platform.tenants t on t.id = m.tenant_id where t.slug = 'acme'),
  1, 't_provisioning_creates_exactly_one_owner: exactly 1 membership');

select is(
  (select mr.role_key::text from identity.membership_roles mr
   join identity.memberships m on m.id = mr.membership_id
   join platform.tenants t on t.id = m.tenant_id where t.slug = 'acme'),
  'tenant_owner', 't_provisioning_creates_exactly_one_owner: role is tenant_owner');

-- 22  duplicate provisioning is safely rejected, with no partial state
select tests.login_as(tests.uid('powner'));
select throws_ok($$ select platform.provision_tenant('acme', 'Acme Again') $$,
  '23505', null, 't_duplicate_provisioning_is_rejected');
select tests.logout();
select is((select count(*)::int from platform.tenants where slug = 'acme'), 1,
  't_duplicate_provisioning_is_rejected: still exactly 1 tenant');

select * from finish();
rollback;
