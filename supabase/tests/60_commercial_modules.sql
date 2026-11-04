\ir _fixtures.sql.inc

-- ===========================================================================
-- hlbos_0055/0056 — commercial module licensing + internal message queue.
-- Server-side enforcement: platform-admin-only packaging, dependency rules,
-- fail-closed gate, tenant isolation, no data loss on deactivation, mock transport off by default.
-- ===========================================================================
begin;
select plan(33);
select tests.seed();

-- test-only catalog (rolled back with the transaction)
insert into entitlements.modules (module_key, product, name, requires) values
  ('test.base',  'platform', 'Test base',  '{}'),
  ('test.alpha', 'platform', 'Test alpha', '{test.base}'),
  ('test.beta',  'platform', 'Test beta',  '{test.alpha}');
insert into entitlements.modules (module_key, product, name, usage_limits) values ('test.future', 'platform', 'Planned', '{"status":"planned"}');
insert into entitlements.packages (package_key, product, name, modules) values ('test_future_pkg', 'salonos', 'Future pkg', '{test.future}');
insert into entitlements.packages (package_key, product, name, modules) values
  ('test_alpha_pkg', 'salonos', 'Alpha pkg', '{test.base,test.alpha}'),
  ('test_broken_pkg', 'salonos', 'Broken pkg', '{test.alpha}'),
  ('test_ghost_pkg', 'salonos', 'Ghost pkg', '{test.nope}');

-- fail closed: nothing licensed yet
select throws_ok($$select entitlements.require_module(tests.uid('tenant_a'), 'test.alpha')$$, '42501', null,
  'unlicensed module is refused (fail closed)');
select throws_ok($$select entitlements.require_module(tests.uid('tenant_a'), 'test.unknown')$$, '42704', null,
  'unknown module is refused');

-- only platform administrators package
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select entitlements.apply_package(tests.uid('tenant_a'), 'test_alpha_pkg')$$, '42501', null,
  'a tenant owner cannot grant themselves a package');
select throws_ok($$select entitlements.set_module_active(tests.uid('tenant_a'), 'test.base', true)$$, '42501', null,
  'a tenant owner cannot switch a module on');
select tests.logout();
select tests.login_as_anon();
select throws_ok($$select entitlements.apply_package(tests.uid('tenant_a'), 'test_alpha_pkg')$$, '42501', null,
  'anon cannot apply a package');
select tests.logout();

-- the gate is internal: authenticated users cannot call it directly
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select entitlements.require_module(tests.uid('tenant_a'), 'test.alpha')$$, '42501', null,
  'authenticated users cannot probe licences through the gate');
select tests.logout();

-- platform admin: package integrity
select tests.login_as(tests.uid('padmin'));
select throws_ok($$select entitlements.apply_package(tests.uid('tenant_a'), 'test_broken_pkg')$$, '23514', null,
  'a package missing a dependency is refused');
select throws_ok($$select entitlements.apply_package(tests.uid('tenant_a'), 'test_ghost_pkg')$$, '42704', null,
  'a package naming an unknown module is refused');
select throws_ok($$select entitlements.apply_package(tests.uid('tenant_a'), 'no_such_pkg')$$, '42704', null,
  'unknown package is refused');
select throws_ok($$select entitlements.apply_package(tests.uid('tenant_a'), 'test_future_pkg')$$, '0A000', null,
  'a planned (unbuilt) module cannot be licensed');
select throws_ok($$select entitlements.set_module_active(tests.uid('tenant_a'), 'test.future', true)$$, '0A000', null,
  'a planned module cannot be switched on');
select is(entitlements.apply_package(tests.uid('tenant_a'), 'test_alpha_pkg'), 2, 'package applied: 2 modules activated');
select is(entitlements.apply_package(tests.uid('tenant_a'), 'test_alpha_pkg'), 2, 'applying again is idempotent (no duplicate rows)');
select tests.logout();
select is((select count(*)::int from entitlements.module_activations where tenant_id = tests.uid('tenant_a')), 2,
  'exactly two activation rows for tenant A');

-- the gate now opens for A, still closed for B, and enforces dependencies
select lives_ok($$select entitlements.require_module(tests.uid('tenant_a'), 'test.alpha')$$, 'licensed module passes the gate');
select throws_ok($$select entitlements.require_module(tests.uid('tenant_b'), 'test.alpha')$$, '42501', null,
  'tenant B is not licensed by tenant A''s package');
select throws_ok($$select entitlements.require_module(tests.uid('tenant_a'), 'test.beta')$$, '42501', null,
  'a module that was never activated stays closed');

-- dependency rules + no data loss
select tests.login_as(tests.uid('padmin'));
select throws_ok($$select entitlements.set_module_active(tests.uid('tenant_a'), 'test.base', false)$$, '23514', null,
  'cannot switch off a module that an active module requires');
select lives_ok($$select entitlements.set_module_active(tests.uid('tenant_a'), 'test.alpha', false)$$, 'dependent module can be switched off');
select throws_ok($$select entitlements.set_module_active(tests.uid('tenant_a'), 'test.beta', true)$$, '23514', null,
  'cannot switch on a module whose dependency is off');
select tests.logout();
select throws_ok($$select entitlements.require_module(tests.uid('tenant_a'), 'test.alpha')$$, '42501', null,
  'a deactivated module is refused again');
select is((select active from entitlements.module_activations where tenant_id = tests.uid('tenant_a') and module = 'test.alpha'), false,
  'deactivation keeps the row (history preserved, nothing deleted)');

-- provisioning
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select platform.provision_product_tenant('new-shop', 'New Shop', 'test_alpha_pkg')$$, '42501', null,
  'a tenant owner cannot provision a product tenant');
select tests.logout();
select tests.login_as(tests.uid('padmin'));
select ok(platform.provision_product_tenant('new-shop', 'New Shop', 'test_alpha_pkg') is not null, 'platform admin provisions a tenant with its package in one call');
select tests.logout();


-- --- internal message queue + mock transport -----------------------------------
insert into comms.templates (key, name, channel, module) values ('test_note', 'Test note', 'email', 'test');
insert into comms.template_versions (template_key, version, subject, body, variables)
  values ('test_note', 1, 'Hi {{name}}', 'Your visit is {{when}}', '{name,when}');
select ok(comms.enqueue_internal(tests.uid('tenant_a'), 'test', 'email', 'test_note', 1, 'cust@example.test',
  '{"name":"Ann","when":"Monday"}', 'k1') is not null, 'internal enqueue creates a queued message');
select is((select status::text from comms.messages where idempotency_key = 'k1'), 'queued', 'message is queued, not sent');
select is(comms.enqueue_internal(tests.uid('tenant_a'), 'test', 'email', 'test_note', 1, 'cust@example.test',
  '{"name":"Ann","when":"Monday"}', 'k1'), (select id from comms.messages where idempotency_key = 'k1'),
  'same idempotency key returns the same message (no duplicate)');
insert into comms.suppression (tenant_id, channel, contact, reason) values (tests.uid('tenant_a'), 'email', 'stop@example.test', 'opt_out');
create temp table supp_msg as select comms.enqueue_internal(tests.uid('tenant_a'), 'test', 'email', 'test_note', 1,
  'stop@example.test', '{"name":"Bo","when":"Tuesday"}', 'k2') as id;
select is((select m.status::text from comms.messages m join supp_msg s on s.id = m.id), 'suppressed', 'a suppressed contact is never queued');
create temp table supp_case as select comms.enqueue_internal(tests.uid('tenant_a'), 'test', 'email', 'test_note', 1,
  'STOP@Example.test', '{"name":"Bo","when":"Tuesday"}', 'k2b') as id;
select is((select m.status::text from comms.messages m join supp_case s on s.id = m.id), 'suppressed', 'suppression matches regardless of letter case');
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$select comms.enqueue_internal(tests.uid('tenant_a'), 'test', 'email', 'test_note', 1, 'x@example.test', '{"name":"x","when":"y"}', 'k3')$$,
  '42501', null, 'authenticated users cannot call the internal enqueue directly');
select tests.logout();
select throws_ok($$select comms.dev_dispatch_mock()$$, '42501', null, 'mock transport refuses to run unless explicitly enabled');
select set_config('hlbos.allow_mock_transport', 'on', true);
select is(comms.dev_dispatch_mock(), 1, 'with the dev flag on, the mock transport marks exactly the one queued message as sent');
select is((select provider_key::text from comms.messages where idempotency_key = 'k1'), 'mock', 'delivery was by the mock provider (no network)');

select * from finish();
rollback;
