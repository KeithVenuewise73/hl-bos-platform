-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

-- Coverage for hlbos_0007_tenant_class and hlbos_0008_provision_tenant_class,
-- reconciled from the live HL-BOS Core project. The property under test: a
-- tenant is classified (first_party | customer) and may have a parent, but a
-- tenant CANNOT change its own class or parent -- only the platform can. This
-- is an anti-escalation control: a tenant admin who holds UPDATE on
-- platform.tenants must not be able to promote its own tenant to first_party.

begin;
select plan(10);
select tests.seed();

-- --- provisioning defaults to customer -------------------------------------
select tests.login_as(tests.uid('powner'));
select lives_ok($$ select platform.provision_tenant('cust1', 'Customer One') $$,
  't_provision_defaults_customer: provisioning without a class succeeds');
select tests.logout();
select is((select tenant_class::text from platform.tenants where slug = 'cust1'),
  'customer', 't_provision_default_class_is_customer');

-- --- a platform admin may provision a first_party tenant -------------------
select tests.login_as(tests.uid('powner'));
select lives_ok($$ select platform.provision_tenant('fp1', 'First Party One', null, 'first_party') $$,
  't_platform_admin_can_provision_first_party');
select tests.logout();
select is((select tenant_class::text from platform.tenants where slug = 'fp1'),
  'first_party', 't_first_party_class_is_recorded');

-- --- a platform admin may provision a child with a valid parent -----------
select tests.login_as(tests.uid('powner'));
select lives_ok($$
  select platform.provision_tenant('child1', 'Child One', null, 'customer', tests.uid('tenant_a')) $$,
  't_provision_with_parent_succeeds');
select tests.logout();
select is((select parent_tenant_id from platform.tenants where slug = 'child1'),
  tests.uid('tenant_a'), 't_parent_tenant_is_recorded');

-- --- an unknown parent is rejected ----------------------------------------
select tests.login_as(tests.uid('powner'));
select throws_ok($$
  select platform.provision_tenant('orphan', 'Orphan', null, 'customer',
    '00000000-0000-4000-8000-999999999999'::uuid) $$,
  '23503', null, 't_provision_rejects_unknown_parent');
select tests.logout();

-- --- a tenant owner can still edit its own tenant (no over-blocking) -------
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$
  update platform.tenants set name = 'Tenant A Renamed' where id = tests.uid('tenant_a') $$,
  't_owner_can_still_rename_own_tenant');
select tests.logout();

-- --- but a tenant owner CANNOT promote its own tenant to first_party -------
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$
  update platform.tenants set tenant_class = 'first_party' where id = tests.uid('tenant_a') $$,
  '42501', null, 't_owner_cannot_self_promote_to_first_party');
select tests.logout();

-- --- nor assign itself a parent tenant ------------------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$
  update platform.tenants set parent_tenant_id = tests.uid('tenant_b') where id = tests.uid('tenant_a') $$,
  '42501', null, 't_owner_cannot_set_own_parent_tenant');
select tests.logout();

select * from finish();
