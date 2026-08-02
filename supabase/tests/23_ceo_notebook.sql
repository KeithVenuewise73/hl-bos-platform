\ir _fixtures.sql.inc

-- Coverage for v0_ceo_notebook (HLVS V2 B1) — notebook entries assembled on
-- vstudio.notes:
--  * standalone (tenant-anchored) and opportunity-linked entry creation,
--  * task-status transition,
--  * backward-compatibility of the original add_note,
--  * permission gate (manage) and anon read denial.
begin;
select plan(9);
select tests.seed();

select tests.login_as(tests.uid('powner'));

-- A standalone notebook entry (no opportunity) is anchored by its tenant.
select ok(
  vstudio.create_notebook_entry(tests.uid('tenant_a'), 'personal_task', 'Call the CFO',
    '{"title":"CFO sync","status":"open","program":"opportunity","due_date":"2026-08-10"}'::jsonb) is not null,
  't_owner_can_create_standalone_entry');

select is(
  (select count(*)::int from vstudio.notes
     where opportunity_id is null and tenant_id = tests.uid('tenant_a')),
  1, 't_standalone_entry_anchored_by_tenant');

-- An opportunity-linked entry derives its tenant from the opportunity.
select ok(
  vstudio.create_opportunity(tests.uid('tenant_a'), 'Notebook host opportunity', '{}'::jsonb) is not null,
  't_setup_opportunity');

select ok(
  vstudio.create_notebook_entry(tests.uid('tenant_a'), 'research_request', 'Investigate market X',
    jsonb_build_object(
      'opportunity_id', (select id from vstudio.opportunities order by created_at desc limit 1)::text,
      'status', 'open')) is not null,
  't_owner_can_create_linked_entry');

-- Task status can be moved.
select lives_ok(
  $$ select vstudio.set_notebook_entry_status(
       (select id from vstudio.notes where note_type = 'personal_task' order by created_at desc limit 1),
       'done') $$,
  't_owner_can_set_status');

select is(
  (select status::text from vstudio.notes where note_type = 'personal_task' order by created_at desc limit 1),
  'done', 't_status_updated');

-- The original opportunity-scoped add_note still works (backward compatible).
select ok(
  vstudio.add_note(
    (select id from vstudio.opportunities order by created_at desc limit 1),
    'a plain note', '{"note_type":"observation"}'::jsonb) is not null,
  't_add_note_backward_compatible');

select tests.logout();

-- A tenant-only user without vstudio.opportunity.manage cannot create an entry.
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select vstudio.create_notebook_entry(tests.uid('tenant_a'), 'personal_task', 'x', '{}'::jsonb) $$,
  '42501', null, 't_non_privileged_cannot_create_entry');
select tests.logout();

-- Anonymous is denied at the table-grant level (no SELECT privilege for anon).
select tests.login_as_anon();
select throws_ok(
  'select count(*) from vstudio.notes',
  '42501', null, 't_anon_cannot_read_notes');
select tests.logout();

select * from finish();
rollback;
