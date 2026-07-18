-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

begin;
select plan(10);
select tests.seed();

-- === tenant_class ==========================================================
-- Herman Legacy companies are the first tenants; external customers are the
-- same shape. The class is data, and a tenant may not change its own.

-- 1  A tenant provisioned without a class is a customer (least assumption).
select tests.login_as(tests.uid('owner_a'));
select is(
  (select tenant_class::text from platform.tenants where id = tests.uid('tenant_a')),
  'customer',
  't_new_tenant_defaults_to_customer'
);
select tests.logout();

-- 2  *** the security fix ***
-- A tenant admin holds UPDATE on platform.tenants and can edit its own tenant,
-- so it passes RLS to reach the row -- but it must not promote its own tenant
-- to first_party. The guard raises insufficient_privilege (42501).
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ update platform.tenants
       set tenant_class = 'first_party'
     where id = tests.uid('tenant_a') $$,
  '42501', null,
  't_tenant_admin_cannot_self_promote_to_first_party'
);
select tests.logout();

-- 3  The guard is surgical: ordinary edits by the same tenant admin still work.
select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  $$ update platform.tenants
       set name = 'Tenant A (edited)'
     where id = tests.uid('tenant_a') $$,
  't_tenant_admin_can_still_edit_its_tenant'
);
select tests.logout();

-- 4  The corporate-hierarchy column exists.
select has_column(
  'platform', 'tenants', 'parent_tenant_id',
  't_parent_tenant_id_column_exists'
);

-- 5  The guard function exists.
select has_function(
  'platform', 'enforce_tenant_class_managed',
  't_class_guard_function_exists'
);

-- === provision_tenant(..., tenant_class) ===================================
-- powner has platform.tenant.create and is a verified platform admin.

-- 6  Provisioning with no class succeeds and yields a customer.
select tests.login_as(tests.uid('powner'));
select lives_ok(
  $$ select platform.provision_tenant('cust-co', 'Customer Co') $$,
  't_provision_defaults_to_customer_class'
);
-- 7
select is(
  (select tenant_class::text from platform.tenants where slug = 'cust-co'),
  'customer',
  't_provisioned_default_is_customer'
);
select tests.logout();

-- 8  A platform admin may provision a first_party tenant explicitly.
select tests.login_as(tests.uid('powner'));
select lives_ok(
  $$ select platform.provision_tenant('hl-co', 'HL Company', null, 'first_party') $$,
  't_platform_admin_can_provision_first_party'
);
-- 9
select is(
  (select tenant_class::text from platform.tenants where slug = 'hl-co'),
  'first_party',
  't_provisioned_first_party_recorded'
);
select tests.logout();

-- 10  A user who is not a platform admin cannot provision a first_party tenant.
--     (owner_a lacks platform.tenant.create, so it is denied with 42501; the
--     class gate is additional defense in depth for a would-be non-admin
--     provisioner.)
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select platform.provision_tenant('sneaky', 'Sneaky', null, 'first_party') $$,
  '42501', null,
  't_non_admin_cannot_provision_first_party'
);
select tests.logout();

select finish();
rollback;
