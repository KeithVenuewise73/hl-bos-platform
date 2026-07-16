-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

begin;
select plan(14);
select tests.seed();

-- === Bootstrap: one-time, owner-only =====================================
-- seed() already created platform admins, so the guard must fire.
select throws_ok($$ select platform.bootstrap_first_platform_owner('powner@example.test') $$,
  '23505', null, 't_bootstrap_is_one_time: inert once any platform admin exists');

-- Clear them to exercise the real first-run paths.
delete from identity.platform_admins;

-- PL/pgSQL raises `no_data_found` as P0002, not the SQL-standard 02000.
select throws_ok($$ select platform.bootstrap_first_platform_owner('nobody@example.test') $$,
  'P0002', null, 't_bootstrap_rejects_missing_user');

select throws_ok($$ select platform.bootstrap_first_platform_owner('unconfirmed@example.test') $$,
  '42501', null, 't_bootstrap_rejects_unconfirmed_user: refuses to grant on an unproven address');

-- ambiguity: two auth.users rows sharing an address
insert into auth.users (id, email, email_confirmed_at)
values (tests.uid('dupe1'), 'dupe@example.test', now()),
       (tests.uid('dupe2'), 'dupe@example.test', now());
select throws_ok($$ select platform.bootstrap_first_platform_owner('dupe@example.test') $$,
  '21000', null, 't_bootstrap_rejects_ambiguous_user: raises rather than picking one');

-- 41 / 47  not callable by any client credential
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select platform.bootstrap_first_platform_owner('owner-a@example.test') $$,
  '42501', null, 't_bootstrap_not_callable_by_clients: authenticated denied');
select tests.logout();

select tests.login_as_anon();
select throws_ok($$ select platform.bootstrap_first_platform_owner('owner-a@example.test') $$,
  '42501', null, 't_bootstrap_not_callable_by_clients: anon denied');
select tests.logout();

set local role service_role;
select throws_ok($$ select platform.bootstrap_first_platform_owner('owner-a@example.test') $$,
  '42501', null,
  't_bootstrap_not_callable_by_service_role: a leaked SUPABASE_SERVICE_ROLE_KEY cannot mint a platform_owner');

reset role;

-- 48  ...and service_role has no path to become the owner.
--
-- Asserting the GRANT GRAPH, not `SET ROLE`. SET ROLE is authorised against the
-- SESSION user, and this harness connects AS postgres (a superuser), so
-- `set role postgres` would trivially succeed here and prove nothing. In
-- production the session user is `authenticator`, which is not a member of
-- postgres. pg_has_role() tests the real invariant and is session-independent.
--
-- Verified against the live project's pg_auth_members: service_role is granted
-- TO postgres, but postgres is NOT granted to service_role. The asymmetry is
-- what makes the REVOKE on bootstrap_first_platform_owner meaningful.
select ok(
  not pg_has_role('service_role', 'postgres', 'USAGE'),
  't_service_role_cannot_escalate_to_owner: service_role is not a member of postgres'
);

-- 46  the successful bootstrap IS audited (it commits, so the log survives)
select lives_ok($$ select platform.bootstrap_first_platform_owner('owner-a@example.test') $$,
  't_bootstrap_succeeds_for_confirmed_user');
select is((select count(*)::int from audit.security_events
           where action = 'platform.bootstrap.first_owner' and severity = 'critical'),
  1, 't_bootstrap_is_audited: critical security event recorded');
select is((select count(*)::int from audit.events
           where resource_type = 'identity.platform_admins'
             and action = 'identity.platform_admins.insert'
             and resource_id = tests.uid('owner_a')::text),
  1, 't_bootstrap_is_audited: the platform_admins grant emitted its own audit event');

-- === Coverage =============================================================
-- 39
select is((select count(*)::int from audit.verify_rls_coverage()), 0,
  't_rls_coverage_is_complete: every table in platform/identity/audit has RLS + FORCE + >=1 policy');

-- 40
select tests.login_as_anon();
select throws_ok($$ select identity.has_permission('00000000-0000-4000-8000-000000000000'::uuid, 'tenancy.tenant.read') $$,
  '42501', null, 't_helpers_are_not_anon_executable');
select tests.logout();

-- 38  ct_eq has no early exit: differs at first byte and at last byte
select ok(
  identity.ct_eq(repeat('a',64), repeat('a',64))
  and not identity.ct_eq('b' || repeat('a',63), repeat('a',64))
  and not identity.ct_eq(repeat('a',63) || 'b', repeat('a',64))
  and not identity.ct_eq('short', repeat('a',64)),
  't_ct_eq_has_no_early_exit: equal, differs-at-1, differs-at-64, length-mismatch'
);

select * from finish();
rollback;
