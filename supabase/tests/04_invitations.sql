begin;
select plan(13);
select tests.seed();

-- === Correction 3: invitation lifecycle (token-authorized) ================

-- 24  no token / garbage token
select tests.login_as(tests.uid('invitee'));
select throws_ok($$ select identity.accept_invitation('garbage') $$,
  null, 'invalid or expired invitation', 't_cannot_accept_without_token');
select throws_ok($$ select identity.accept_invitation('aaaa.bbbb') $$,
  null, 'invalid or expired invitation', 't_cannot_accept_unknown_selector');
select tests.logout();

-- 25  *** the stolen-link case ***: valid token, wrong account
select set_config('tests.tok', tests.make_invitation(tests.uid('tenant_a'), 'invitee@example.test'), false);
select tests.login_as(tests.uid('outsider'));
select throws_ok(
  format($$ select identity.accept_invitation(%L) $$, current_setting('tests.tok')),
  null, 'invalid or expired invitation',
  't_cannot_accept_valid_token_for_another_email: stolen link is refused');
select tests.logout();

-- 36 + happy path: acceptance works for a user with ZERO permissions in the
-- tenant. Proves has_permission() was not weakened to make this path work.
select tests.login_as(tests.uid('invitee'));
select is(identity.has_permission(tests.uid('tenant_a'), 'tenancy.tenant.read'), false,
  't_accept_does_not_consult_tenant_permissions: invitee holds nothing beforehand');
select lives_ok(
  format($$ select identity.accept_invitation(%L) $$, current_setting('tests.tok')),
  't_accept_succeeds_with_valid_token');
select tests.logout();

-- 29/31  atomic: membership + role + status move together
select is((select status::text from identity.memberships
           where tenant_id = tests.uid('tenant_a') and user_id = tests.uid('invitee')),
  'active', 't_accept_is_atomic: membership active');
select is((select mr.role_key::text from identity.membership_roles mr
           join identity.memberships m on m.id = mr.membership_id
           where m.tenant_id = tests.uid('tenant_a') and m.user_id = tests.uid('invitee')),
  'staff', 't_accept_is_atomic: intended role assigned');
select is((select status::text from identity.invitations
           where email = 'invitee@example.test' and tenant_id = tests.uid('tenant_a')),
  'accepted', 't_accept_is_atomic: invitation marked accepted');

-- 28  replay
select tests.login_as(tests.uid('invitee'));
select throws_ok(
  format($$ select identity.accept_invitation(%L) $$, current_setting('tests.tok')),
  null, 'invalid or expired invitation', 't_token_cannot_be_replayed');
select tests.logout();
select is((select count(*)::int from identity.memberships
           where tenant_id = tests.uid('tenant_a') and user_id = tests.uid('invitee')),
  1, 't_token_cannot_be_replayed: membership count stays 1');

-- 26  expired
select set_config('tests.tok_exp',
  tests.make_invitation(tests.uid('tenant_b'), 'invitee@example.test', 'staff', now() - interval '1 day'), false);
select tests.login_as(tests.uid('invitee'));
select throws_ok(
  format($$ select identity.accept_invitation(%L) $$, current_setting('tests.tok_exp')),
  null, 'invalid or expired invitation', 't_cannot_accept_expired_token');
select tests.logout();

-- 27  revoked
select set_config('tests.tok_rev',
  tests.make_invitation(tests.uid('tenant_b'), 'revoked@example.test', 'staff',
                        now() + interval '7 days', 'revoked'), false);
select tests.login_as(tests.uid('invitee'));
select throws_ok(
  format($$ select identity.accept_invitation(%L) $$, current_setting('tests.tok_rev')),
  null, 'invalid or expired invitation', 't_cannot_accept_revoked_token');
select tests.logout();

-- 34  the raw token is never stored
select is(
  (select count(*)::int from identity.invitations
   where token_selector = current_setting('tests.tok')
      or token_verifier_hash = split_part(current_setting('tests.tok'), '.', 2)),
  0, 't_raw_token_is_never_stored: neither column holds the raw token or verifier');

select * from finish();
rollback;
