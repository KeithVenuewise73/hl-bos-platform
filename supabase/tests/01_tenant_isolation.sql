begin;
select plan(12);
select tests.seed();

-- === Tenant isolation =====================================================

-- 1
select tests.login_as(tests.uid('owner_a'));
select is(
  (select count(*)::int from platform.tenants where id = tests.uid('tenant_b')),
  0, 't_tenant_a_cannot_read_tenant_b: A''s owner sees 0 rows for B'
);
select tests.logout();

-- 2
select tests.login_as(tests.uid('owner_a'));
with upd as (
  update platform.tenants set name = 'HIJACKED' where id = tests.uid('tenant_b') returning 1
)
select is((select count(*)::int from upd), 0,
  't_tenant_a_cannot_modify_tenant_b: 0 rows affected');
select tests.logout();
select is((select name from platform.tenants where id = tests.uid('tenant_b')),
  'Tenant B', 't_tenant_a_cannot_modify_tenant_b: B''s name is unchanged');

-- 3
select tests.login_as(tests.uid('owner_a'));
select is(
  (select count(*)::int from identity.memberships where tenant_id = tests.uid('tenant_b')),
  0, 't_tenant_a_cannot_read_b_memberships'
);
select tests.logout();

-- 4  *** the most important test in Phase 2 ***
-- A valid session, a real tenant UUID that is not mine. The tenant id is a
-- filter, never proof. If this ever returns true, the platform is broken.
select tests.login_as(tests.uid('owner_a'));
select is(
  identity.has_permission(tests.uid('tenant_b'), 'tenancy.tenant.read'), false,
  't_arbitrary_tenant_id_is_not_proof: has_permission(other_tenant) is false with a valid session'
);
select is(
  identity.is_member(tests.uid('tenant_b')), false,
  't_arbitrary_tenant_id_is_not_proof: is_member(other_tenant) is false'
);
select is(
  (select count(*)::int from identity.my_tenant_ids() t where t = tests.uid('tenant_b')),
  0, 't_arbitrary_tenant_id_is_not_proof: my_tenant_ids() excludes B'
);
select tests.logout();

-- === Roles ================================================================

-- 5
select tests.login_as(tests.uid('staff_a'));
select is(identity.has_permission(tests.uid('tenant_a'), 'tenancy.tenant.manage'), false,
  't_staff_cannot_perform_owner_actions: staff lacks tenancy.tenant.manage');
select tests.logout();

-- 6
select tests.login_as(tests.uid('viewer_a'));
with upd as (
  update platform.tenants set name = 'VIEWER EDIT' where id = tests.uid('tenant_a') returning 1
)
select is((select count(*)::int from upd), 0, 't_viewer_cannot_modify: tenant update blocked');
select is(identity.has_permission(tests.uid('tenant_a'), 'identity.membership.create'), false,
  't_viewer_cannot_modify: viewer lacks membership.create');
select tests.logout();

-- 8  platform_admin has NO blanket tenant access
select tests.login_as(tests.uid('padmin'));
select is(identity.has_permission(tests.uid('tenant_a'), 'identity.membership.read'), false,
  't_platform_admin_has_no_blanket_tenant_access: no tenant permission');
select is(identity.has_permission(tests.uid('tenant_a'), 'tenancy.tenant.update'), false,
  't_platform_admin_has_no_blanket_tenant_access: cannot update a tenant it does not belong to');
select tests.logout();

select * from finish();
rollback;
