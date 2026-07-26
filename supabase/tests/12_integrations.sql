\ir _fixtures.sql.inc

-- Coverage for v0_integrations: permission-gated connection management,
-- the Vault-reference credential constraint, sync-run lifecycle, isolation.
begin;
select plan(7);
select tests.seed();

-- a member with manage can create a connection; a viewer cannot
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$ select integrations.upsert_connection(tests.uid('tenant_a'), 'mock', '{"x":1}'::jsonb, 'vault:mock_key') $$,
  't_manager_can_upsert_connection');
select tests.logout();

select tests.login_as(tests.uid('viewer_a'));
select throws_ok($$ select integrations.upsert_connection(tests.uid('tenant_a'), 'mock', '{}'::jsonb, null) $$,
  '42501', null, 't_viewer_cannot_upsert_connection');
select tests.logout();

-- a raw secret cannot be stored: credential_ref must be a vault: reference
select throws_ok($$
  insert into integrations.connections (tenant_id, connector_key, credential_ref)
  values (tests.uid('tenant_a'), 'mock', 'sk-super-secret-not-a-vault-ref') $$,
  '23514', null, 't_credential_must_be_vault_reference');

-- sync-run lifecycle is honestly recorded
select tests.login_as(tests.uid('owner_a'));
select ok(integrations.begin_sync(tests.uid('tenant_a'), 'mock') > 0, 't_begin_sync_returns_id');
select lives_ok($$ select integrations.finish_sync(
  (select id from integrations.sync_runs where tenant_id=tests.uid('tenant_a') order by id desc limit 1),
  'succeeded', '{"items":3}'::jsonb) $$, 't_finish_sync_records_result');
select is((select status::text from integrations.sync_runs where tenant_id=tests.uid('tenant_a') order by id desc limit 1),
  'succeeded', 't_sync_run_status_succeeded');
select tests.logout();

-- isolation
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from integrations.connections where tenant_id = tests.uid('tenant_a')), 0,
  't_tenant_cannot_read_other_tenant_connections');
select tests.logout();

select * from finish();
