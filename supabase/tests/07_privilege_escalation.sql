-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

begin;
select plan(8);
select tests.seed();

-- ===========================================================================
-- Regression tests for three escalation paths found during final review.
-- Each of these PASSED (i.e. the attack succeeded) before identity.can_grant_role.
-- ===========================================================================

-- A) tenant_admin deliberately lacks tenancy.tenant.manage. It must not be
--    obtainable by self-granting the role that has it.
select tests.login_as(tests.uid('admin_a'));
select is(identity.has_permission(tests.uid('tenant_a'), 'tenancy.tenant.manage'), false,
  't_admin_lacks_tenant_manage: precondition');
select is(identity.can_grant_role(tests.uid('tenant_a'), 'tenant_owner'), false,
  't_admin_cannot_grant_owner: can_grant_role is false -- owner holds a permission admin does not');
select throws_ok($$
  insert into identity.membership_roles (membership_id, role_key)
  values (tests.uid('m_admin_a'), 'tenant_owner') $$,
  '42501', null,
  't_admin_cannot_self_grant_owner: RLS blocks the escalation');
select tests.logout();

-- B) manager has invitation.create but NOT role.assign. An invitation is a
--    deferred role grant and is held to the same rule.
select tests.login_as(tests.uid('manager_a'));
select throws_ok($$
  insert into identity.invitations
    (tenant_id, email, role_key, token_selector, token_verifier_hash, expires_at)
  values (tests.uid('tenant_a'), 'newowner@example.test', 'tenant_owner',
          'sel_esc_b', repeat('a',64), now() + interval '7 days') $$,
  '42501', null,
  't_manager_cannot_confer_owner_via_invitation');
select tests.logout();

-- C) invitations may only carry TENANT roles, rejected at INSERT rather than
--    failing later at accept time.
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$
  insert into identity.invitations
    (tenant_id, email, role_key, token_selector, token_verifier_hash, expires_at)
  values (tests.uid('tenant_a'), 'pown@example.test', 'platform_owner',
          'sel_esc_c', repeat('b',64), now() + interval '7 days') $$,
  '23514', null,
  't_invitation_cannot_carry_platform_role: rejected immediately, not at accept');

-- Positive control: the rule must not over-block. An owner holds everything a
-- staff role holds, so granting staff is allowed.
select is(identity.can_grant_role(tests.uid('tenant_a'), 'staff'), true,
  't_owner_can_grant_lesser_role: no over-blocking');
select lives_ok($$
  insert into identity.invitations
    (tenant_id, email, role_key, token_selector, token_verifier_hash, expires_at)
  values (tests.uid('tenant_a'), 'newstaff@example.test', 'staff',
          'sel_ok', repeat('c',64), now() + interval '7 days') $$,
  't_owner_can_invite_staff: legitimate invitation still works');
select tests.logout();

-- The definer flows must remain unaffected: the first owner and an invitee
-- legitimately hold nothing at the moment their role is assigned. If
-- can_grant_role applied to them, provisioning would be impossible.
select tests.login_as(tests.uid('powner'));
select lives_ok($$ select platform.provision_tenant('escalation-check', 'Escalation Check') $$,
  't_provisioning_unaffected_by_no_escalation_rule: SECURITY DEFINER bypasses RLS, as designed');
select tests.logout();

select * from finish();
rollback;
