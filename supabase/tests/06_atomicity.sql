-- Fixtures are included per-file: the CLI wraps each test in its own
-- transaction and rolls it back, so they cannot be loaded once globally.
\ir _fixtures.sql.inc

begin;
select plan(3);
select tests.seed();

-- 21  *** partial provisioning must roll back completely ***
-- Force the LAST step (the tenant_owner role assignment) to fail, and prove the
-- tenant and membership created by the earlier steps do not survive.
create function pg_temp.break_role_assignment() returns trigger
language plpgsql as $$ begin raise exception 'injected failure at role assignment'; end $$;

create trigger zzz_injected_failure
  before insert on identity.membership_roles
  for each row execute function pg_temp.break_role_assignment();

select tests.login_as(tests.uid('powner'));
select throws_ok($$ select platform.provision_tenant('rollback-test', 'Rollback Test') $$,
  null, 'injected failure at role assignment',
  't_partial_provisioning_rolls_back: the call fails at the final step');
select tests.logout();

select is((select count(*)::int from platform.tenants where slug = 'rollback-test'), 0,
  't_partial_provisioning_rolls_back: 0 tenants remain -- no ownerless tenant');
select is((select count(*)::int from identity.memberships m
           join platform.tenants t on t.id = m.tenant_id where t.slug = 'rollback-test'), 0,
  't_partial_provisioning_rolls_back: 0 memberships remain');

drop trigger zzz_injected_failure on identity.membership_roles;

select * from finish();
rollback;
