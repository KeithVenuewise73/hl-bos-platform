\ir _fixtures.sql.inc

-- Coverage for v0_opportunity_pipeline (HLVS V2 B2):
--  * relate opportunities (and self-relation rejection),
--  * AI opportunity summary is never authoritative,
--  * priority set,
--  * permission gate (manage) and anon read denial.
--
-- NOTE: the two setup opportunities are selected by TITLE, not by created_at
-- ordering. now() is constant within a transaction, so both rows share a
-- created_at and `order by created_at limit 1` is non-deterministic (it can
-- return the same row twice). Title selection is deterministic and distinct.
begin;
select plan(9);
select tests.seed();

select tests.login_as(tests.uid('powner'));

select ok(
  vstudio.create_opportunity(tests.uid('tenant_a'), 'Pipeline Opp One', '{}'::jsonb) is not null,
  't_setup_opp_one');
select ok(
  vstudio.create_opportunity(tests.uid('tenant_a'), 'Pipeline Opp Two', '{}'::jsonb) is not null,
  't_setup_opp_two');

select ok(
  vstudio.relate_opportunities(
    (select id from vstudio.opportunities where title = 'Pipeline Opp One'),
    (select id from vstudio.opportunities where title = 'Pipeline Opp Two'),
    'related_to', '{"similarity":"42.5","note":"tag overlap"}'::jsonb) is not null,
  't_owner_can_relate');

select throws_ok(
  $$ select vstudio.relate_opportunities(
       (select id from vstudio.opportunities where title = 'Pipeline Opp One'),
       (select id from vstudio.opportunities where title = 'Pipeline Opp One'),
       'related_to', '{}'::jsonb) $$,
  '23514', null, 't_self_relation_rejected');

select ok(
  vstudio.record_opportunity_summary(
    (select id from vstudio.opportunities where title = 'Pipeline Opp One'),
    '{"summary":"auto","category":"saas","confidence":"medium","build_effort_value":"6","build_effort_status":"estimated","revenue_status":"unknown","recommendation":"build"}'::jsonb) is not null,
  't_owner_can_summarize');

select is(
  (select bool_or(authoritative) from vstudio.opportunity_summaries),
  false, 't_summary_never_authoritative');

select lives_ok(
  $$ select vstudio.set_opportunity_priority(
       (select id from vstudio.opportunities where title = 'Pipeline Opp One'), 80, 'now') $$,
  't_owner_can_set_priority');

select tests.logout();

-- A tenant-only user without vstudio.opportunity.manage cannot relate.
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select vstudio.relate_opportunities(
       gen_random_uuid(), gen_random_uuid(), 'related_to', '{}'::jsonb) $$,
  '42501', null, 't_non_privileged_cannot_relate');
select tests.logout();

-- Anonymous is denied at the table-grant level.
select tests.login_as_anon();
select throws_ok(
  'select count(*) from vstudio.opportunity_relationships',
  '42501', null, 't_anon_cannot_read_relationships');
select tests.logout();

select * from finish();
rollback;
