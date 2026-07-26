\ir _fixtures.sql.inc

-- Coverage for v0_billing_core: the catalog is seeded and readable, providers
-- are platform-only and carry no raw secrets, and catalog management is
-- platform-gated.
begin;
select plan(9);
select tests.seed();

-- catalog seeded by the migration (plan definitions, not customers)
select is((select count(*)::int from billing.plans where key = 'salonai_pro'), 1, 't_plan_seeded');
select is((select count(*)::int from billing.plan_prices where plan_key = 'salonai_pro'), 2, 't_prices_seeded');
select is((select is_active from billing.providers where key = 'stripe'), false, 't_stripe_seeded_inactive');

-- no raw secret ever stored: every provider credential is a vault: reference
select is((select count(*)::int from billing.providers
           where credential_ref is not null and credential_ref !~ '^vault:'), 0, 't_no_raw_secrets');

-- a tenant member may read the plan catalog
select tests.login_as(tests.uid('owner_a'));
select ok((select count(*) from billing.plans) >= 2, 't_member_reads_catalog');
-- ...but NOT the provider registry (platform-only)
select is((select count(*)::int from billing.providers), 0, 't_member_cannot_read_providers');
select tests.logout();

-- a platform admin may read the provider registry
select tests.login_as(tests.uid('padmin'));
select ok((select count(*) from billing.providers) >= 3, 't_platform_reads_providers');
select tests.logout();

-- catalog management is platform-gated
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select billing.upsert_plan('x_plan','salonai','X', 'month', 0) $$,
  '42501', null, 't_member_cannot_manage_catalog');
select tests.logout();

select tests.login_as(tests.uid('padmin'));
select lives_ok($$ select billing.upsert_plan('salonai_pro','salonai','SalonAI Pro','month',14) $$,
  't_platform_manages_catalog');
select tests.logout();

select * from finish();
rollback;
