-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

begin;
select plan(5);
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
-- so it passes RLS to reach the row -- but it must not be able to promote its
-- own tenant to first_party. The guard raises insufficient_privilege (42501).
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

-- NOTE for review: a full suite should also assert the positive case -- a
-- platform admin (fixture 'padmin') CAN set first_party -- once padmin's
-- platform.tenant.manage grant in the 0005 seed is confirmed, so the RLS UPDATE
-- policy lets it reach the row.

select finish();
rollback;
