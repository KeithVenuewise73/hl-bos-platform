\ir _fixtures.sql.inc

-- Coverage for v0_entitlements: the feature gate, platform-only activation,
-- expiry, and tenant isolation.
begin;
select plan(7);
select tests.seed();

-- not entitled yet
select is(entitlements.has_feature(tests.uid('tenant_a'), 'visibility.content'), false,
  't_has_feature_false_when_not_entitled');

-- a tenant admin cannot activate a module for its own tenant
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select entitlements.activate_module(tests.uid('tenant_a'), 'visibility') $$,
  '42501', null, 't_tenant_cannot_self_activate_module');
select tests.logout();

-- a platform admin can
select tests.login_as(tests.uid('powner'));
select lives_ok($$ select entitlements.activate_module(tests.uid('tenant_a'), 'visibility') $$,
  't_platform_admin_can_activate_module');
select tests.logout();
select is(entitlements.module_is_active(tests.uid('tenant_a'), 'visibility'), true,
  't_module_active_after_activation');

-- an entitlement makes the gate open; an expired one does not
insert into entitlements.tenant_entitlements (tenant_id, feature_key, source) values
  (tests.uid('tenant_a'), 'visibility.content', 'grant');
insert into entitlements.tenant_entitlements (tenant_id, feature_key, source, expires_at) values
  (tests.uid('tenant_b'), 'visibility.content', 'trial', now() - interval '1 day');
select is(entitlements.has_feature(tests.uid('tenant_a'), 'visibility.content'), true,
  't_has_feature_true_when_entitled');
select is(entitlements.has_feature(tests.uid('tenant_b'), 'visibility.content'), false,
  't_has_feature_false_when_expired');

-- tenant isolation on entitlement reads
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from entitlements.tenant_entitlements where tenant_id = tests.uid('tenant_a')), 0,
  't_tenant_cannot_read_other_tenant_entitlements');
select tests.logout();

select * from finish();
