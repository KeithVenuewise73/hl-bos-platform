\ir _fixtures.sql.inc

-- Coverage for v0_venture_studio_foundation (HLVS V2):
--  * permission-gated intake (manage) and the CEO-only decision gate,
--  * advisory recommendation is never authoritative (generated column),
--  * RLS: no read without vstudio.opportunity.read; anon sees nothing,
--  * the full chain create → evidence → evaluation → recommendation → decision.
begin;
select plan(11);
select tests.seed();

-- A platform_owner (CEO-level) can capture an opportunity.
select tests.login_as(tests.uid('powner'));
select ok(
  vstudio.create_opportunity(tests.uid('tenant_a'), 'AI film-study for regional hockey',
    '{"summary":"Coaches want automated clip tagging","industry":"sports"}'::jsonb) is not null,
  't_owner_can_create_opportunity');
select tests.logout();

-- A tenant-only user without any vstudio platform permission cannot create.
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select vstudio.create_opportunity(tests.uid('tenant_a'), 'unauthorized', '{}'::jsonb) $$,
  '42501', null, 't_non_privileged_cannot_create_opportunity');
select tests.logout();

-- A tenant-only user sees no rows (RLS gated on vstudio.opportunity.read).
select tests.login_as(tests.uid('owner_a'));
select is((select count(*) from vstudio.opportunities)::int, 0, 't_no_read_without_permission');
select tests.logout();

-- Anonymous sees nothing.
select tests.login_as_anon();
select is((select count(*) from vstudio.opportunities)::int, 0, 't_anon_reads_nothing');
select tests.logout();

-- The owner can read, attach evidence, evaluate, and generate an advisory rec.
select tests.login_as(tests.uid('powner'));
select ok((select count(*) from vstudio.opportunities) >= 1, 't_owner_can_read');

select ok(
  vstudio.add_evidence(
    (select id from vstudio.opportunities order by created_at desc limit 1),
    'verified_fact', 'League published clip volume',
    '{"source_url":"https://example.test/report","reliability":"high"}'::jsonb) is not null,
  't_owner_can_add_evidence');

select ok(
  vstudio.record_evaluation(
    (select id from vstudio.opportunities order by created_at desc limit 1),
    '[{"dimension":"strategic_fit","score":78,"status":"estimated","confidence":"medium","methodology":"rubric","evidenceBasis":"1 verified fact"}]'::jsonb,
    '{"composite":"78","composite_status":"estimated","confidence":"medium"}'::jsonb) is not null,
  't_owner_can_record_evaluation');

select ok(
  vstudio.generate_recommendation(
    (select id from vstudio.opportunities order by created_at desc limit 1),
    'build', '{"rationale":"high reuse","confidence":"medium"}'::jsonb) is not null,
  't_owner_can_generate_recommendation');

-- HARD INVARIANT: a recommendation is never authoritative.
select is(
  (select bool_or(authoritative) from vstudio.recommendations),
  false, 't_recommendation_never_authoritative');
select tests.logout();

-- CEO-only decision gate: platform_admin (padmin) lacks vstudio.decision.record.
select tests.login_as(tests.uid('padmin'));
select throws_ok(
  $$ select vstudio.record_decision(
       (select id from vstudio.opportunities order by created_at desc limit 1),
       'build', '{}'::jsonb) $$,
  '42501', null, 't_non_ceo_cannot_record_decision');
select tests.logout();

-- The CEO (platform_owner) can record the authoritative decision.
select tests.login_as(tests.uid('powner'));
select ok(
  vstudio.record_decision(
    (select id from vstudio.opportunities order by created_at desc limit 1),
    'build', '{"rationale":"assemble on identity+ai"}'::jsonb) is not null,
  't_ceo_can_record_decision');
select tests.logout();

select * from finish();
rollback;
