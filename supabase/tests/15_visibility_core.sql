\ir _fixtures.sql.inc

-- Coverage for v0_visibility_core: the module boundary end to end.
-- Proves: entitlement gating; content CANNOT publish without the human gate
-- (Principle 4); reviews CANNOT be fabricated (Principle 5).
begin;
select plan(10);
select tests.seed();

-- Activate the module + grant the content feature for tenant_a (platform action)
select tests.login_as(tests.uid('powner'));
select entitlements.activate_module(tests.uid('tenant_a'), 'visibility');
select tests.logout();
insert into entitlements.tenant_entitlements (tenant_id, feature_key, source)
  values (tests.uid('tenant_a'), 'visibility.content', 'grant');

-- draft content (gated by permission + module active + feature)
select tests.login_as(tests.uid('owner_a'));
select ok(visibility.draft_content(tests.uid('tenant_a'), null, 'article', 'Hello', 'body text', null) is not null,
  't_draft_content_succeeds_when_entitled');
select is((select status::text from visibility.content_assets where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1),
  'draft', 't_content_starts_as_draft');
select tests.logout();

-- a tenant WITHOUT the module active cannot draft (tenant_b never activated)
select tests.login_as(tests.uid('owner_b'));
select throws_ok($$ select visibility.draft_content(tests.uid('tenant_b'), null, 'article', 'X', 'y', null) $$,
  '42501', null, 't_draft_denied_when_module_inactive');
select tests.logout();

-- reviews cannot be fabricated: no direct insert, and ingest is connector-only
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ insert into visibility.reviews (tenant_id, source, external_id, rating, body)
  values (tests.uid('tenant_a'), 'google', 'x1', 5, 'we are amazing') $$,
  '42501', null, 't_tenant_cannot_directly_insert_review');
select throws_ok($$ select visibility.ingest_review(tests.uid('tenant_a'), 'google', 'x1', 5, 'we are amazing') $$,
  '42501', null, 't_tenant_cannot_fabricate_via_ingest');
select tests.logout();

-- the trusted connector (platform actor) may ingest a real review
select tests.login_as(tests.uid('powner'));
select ok(visibility.ingest_review(tests.uid('tenant_a'), 'google', 'rev-1', 4, 'genuine feedback', 'positive') is not null,
  't_connector_can_ingest_review');
select tests.logout();

-- the publish gate: submit -> cannot publish until approved -> approve -> publish
select tests.login_as(tests.uid('owner_a'));
select ok(visibility.submit_content_for_approval(
  (select id from visibility.content_assets where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1)) is not null,
  't_submit_for_approval_creates_gate');
select throws_ok($$ select visibility.publish_content(
  (select id from visibility.content_assets where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1)) $$,
  '42501', null, 't_cannot_publish_without_approval');
select tests.logout();

-- approve via the workflow, then publish succeeds
select tests.login_as(tests.uid('owner_a'));
select workflows.decide(
  (select id from workflows.tasks where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1), 'approved', 'ok');
select lives_ok($$ select visibility.publish_content(
  (select id from visibility.content_assets where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1)) $$,
  't_publish_succeeds_after_approval');
select is((select status::text from visibility.content_assets where tenant_id=tests.uid('tenant_a') order by created_at desc limit 1),
  'published', 't_content_is_published_after_gate');
select tests.logout();

select * from finish();
