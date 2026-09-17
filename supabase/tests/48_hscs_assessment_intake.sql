\ir _fixtures.sql.inc

-- Coverage for hlbos_0048_hscs_assessment_intake: the public HSCS Operations
-- Assessment store — the single primary conversion of the HSCS website.
--
-- Proves the security boundary (anon can ONLY submit via the RPC, never read or
-- write the table; the queue is platform-admin only; RLS is forced with no
-- direct grants), the validation that actually holds (the database's, not the
-- form's), and the honesty rule that a submitted row is a REQUEST -- it can
-- never arrive already looking like a completed assessment.
begin;
select plan(26);
select tests.seed();

-- A well-formed payload the submit RPC accepts.
create or replace function tests.oar_payload(p_email text)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'contact', jsonb_build_object(
      'companyName',  'Northbound Freight',
      'contactName',  'Dana Lee',
      'email',        p_email,
      'phone',        '555-0100',
      'role',         'VP Operations'),
    'operation', jsonb_build_object(
      'types', jsonb_build_array('middle-mile-logistics','warehousing-fulfillment'),
      'scale', '50-200 vehicles'),
    'priorities', jsonb_build_object(
      'primaryConcern', 'transportation-fleet'),
    'context', jsonb_build_object(
      'whatPrompted', 'Cost per stop climbed 18% and we cannot see why.'),
    'consent', jsonb_build_object('privacy', true, 'contact', true),
    'attribution', jsonb_build_object('utm_source','linkedin'),
    'sourcePage', '/request-an-assessment'
  );
$$;

-- --- Structural guarantees --------------------------------------------------
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class where oid = 'intake.operations_assessment_requests'::regclass),
  't_rls_enabled_and_forced');

select is(
  (select count(*)::int from pg_policies
     where schemaname = 'intake' and tablename = 'operations_assessment_requests'),
  0, 't_zero_policies: table fails closed by design');

select is(
  (select count(*)::int
     from information_schema.role_table_grants
     where table_schema = 'intake'
       and table_name = 'operations_assessment_requests'
       and grantee in ('anon','authenticated')),
  0, 't_no_direct_table_grants_to_anon_or_authenticated');

-- Every function this migration adds pins its search_path. Migration 0047 was a
-- forward-repair for exactly this defect being missed once; this guards against
-- a recurrence in the new schema rather than trusting it was remembered.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('submit_operations_assessment_request',
                        'list_operations_assessment_requests',
                        'get_operations_assessment_request',
                        'set_operations_assessment_request_status')
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
         where c like 'search_path=%')),
  0, 't_every_new_function_pins_its_search_path');

-- --- Anonymous: can ONLY submit via the RPC --------------------------------
select tests.login_as_anon();

select throws_ok(
  $$ select * from intake.operations_assessment_requests $$,
  '42501', NULL,
  't_anon_cannot_select_table');

select throws_ok(
  $$ insert into intake.operations_assessment_requests
       (reference, company_name, contact_name, contact_email, consent_privacy, consent_contact)
     values ('HSCS-OA-DEADBEEF','x','y','z@x.io', true, true) $$,
  '42501', NULL,
  't_anon_cannot_insert_directly');

select ok(
  public.submit_operations_assessment_request(tests.oar_payload('anon-ok@northbound.test'))
    ~ '^HSCS-OA-[0-9A-F]{8}$',
  't_anon_can_submit_via_rpc_and_gets_a_quotable_reference');

-- Required contact fields.
select throws_ok(
  $$ select public.submit_operations_assessment_request(
       jsonb_build_object('contact', jsonb_build_object('companyName',''),
                          'consent', jsonb_build_object('privacy',true,'contact',true))) $$,
  '23514', NULL,
  't_rpc_rejects_missing_required_contact');

-- A company name alone is not enough: the contact name is required too.
select throws_ok(
  $$ select public.submit_operations_assessment_request(
       jsonb_build_object('contact', jsonb_build_object('companyName','Acme','contactName','','email','a@b.co'),
                          'consent', jsonb_build_object('privacy',true,'contact',true))) $$,
  '23514', NULL,
  't_rpc_rejects_missing_contact_name');

select throws_ok(
  $$ select public.submit_operations_assessment_request(tests.oar_payload('not-an-email')) $$,
  '23514', NULL,
  't_rpc_rejects_invalid_email');

-- Consent is never assumed. Absent is a refusal, not a default.
select throws_ok(
  $$ select public.submit_operations_assessment_request(
       jsonb_set(tests.oar_payload('noconsent@northbound.test'),
                 '{consent}', jsonb_build_object('privacy',false,'contact',true))) $$,
  '23514', NULL,
  't_rpc_rejects_withheld_privacy_consent');

select throws_ok(
  $$ select public.submit_operations_assessment_request(
       tests.oar_payload('noconsentkey@northbound.test') - 'consent') $$,
  '23514', NULL,
  't_rpc_rejects_absent_consent_entirely');

-- An oversized payload is refused by the database, not just by the form.
select throws_ok(
  $$ select public.submit_operations_assessment_request(
       jsonb_set(tests.oar_payload('big@northbound.test'),
                 '{context,whatPrompted}', to_jsonb(repeat('x', 120000)))) $$,
  '23514', NULL,
  't_rpc_rejects_oversized_payload');

-- Duplicate rapid submission (same email within 60s).
select lives_ok(
  $$ select public.submit_operations_assessment_request(tests.oar_payload('dupe@northbound.test')) $$,
  't_first_submission_lives');
select throws_ok(
  $$ select public.submit_operations_assessment_request(tests.oar_payload('dupe@northbound.test')) $$,
  '23514', NULL,
  't_duplicate_rapid_submission_rejected');

select throws_ok(
  $$ select public.list_operations_assessment_requests(NULL, 100) $$,
  '42501', NULL,
  't_anon_cannot_list_queue');

select throws_ok(
  $$ select public.get_operations_assessment_request(pg_catalog.gen_random_uuid()) $$,
  '42501', NULL,
  't_anon_cannot_open_a_request');

select throws_ok(
  $$ select public.set_operations_assessment_request_status(
       pg_catalog.gen_random_uuid(), 'contacted', NULL) $$,
  '42501', NULL,
  't_anon_cannot_change_status');

select tests.logout();

-- --- Authenticated non-admin cannot read the queue -------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select public.list_operations_assessment_requests(NULL, 100) $$,
  '42501', NULL,
  't_tenant_user_cannot_list_queue');
select throws_ok(
  $$ select public.get_operations_assessment_request(pg_catalog.gen_random_uuid()) $$,
  '42501', NULL,
  't_tenant_user_cannot_open_a_request');
select tests.logout();

-- --- Platform admin CAN read the queue -------------------------------------
select tests.login_as(tests.uid('padmin'));

select cmp_ok(
  jsonb_array_length(public.list_operations_assessment_requests(NULL, 500)),
  '>=', 2,
  't_platform_admin_reads_queue');

-- Principle 10 on the way IN: a request arrives as a request. Nothing the
-- submitter sends can make a row look like work that has already happened.
select is(
  (select count(*)::int
     from jsonb_array_elements(public.list_operations_assessment_requests(NULL, 500)) e
    where e->>'status' <> 'new'),
  0, 't_every_submitted_row_is_new_never_a_finished_assessment');

-- Even the platform admin has no direct table access: the RPCs are the only
-- way in, for everybody. RLS is FORCED, so this holds for the owner too.
select throws_ok(
  $$ select * from intake.operations_assessment_requests $$,
  '42501', NULL,
  't_even_platform_admin_has_no_direct_table_access');

-- The triage facts land in columns, so the queue is searchable rather than
-- being one unreadable blob.
select is(
  (select e->>'primary_concern'
     from jsonb_array_elements(public.list_operations_assessment_requests(NULL, 500)) e
    where e->>'email' = 'anon-ok@northbound.test'),
  'transportation-fleet',
  't_triage_facts_are_denormalized_into_columns');

-- And the grouped section detail is READABLE BACK by the people entitled to it.
-- Without the get RPC this data would be write-only -- collected, stored, and
-- permanently unreadable. The suite caught that; this is the regression guard.
select is(
  (public.get_operations_assessment_request(
     ((select e->>'id'
         from jsonb_array_elements(public.list_operations_assessment_requests(NULL, 500)) e
        where e->>'email' = 'anon-ok@northbound.test'))::uuid
   )->'operation'->>'scale'),
  '50-200 vehicles',
  't_collected_detail_can_be_read_back_not_write_only');

select is(
  (public.get_operations_assessment_request(
     ((select e->>'id'
         from jsonb_array_elements(public.list_operations_assessment_requests(NULL, 500)) e
        where e->>'email' = 'anon-ok@northbound.test'))::uuid
   )->'operation'->'types'->>0),
  'middle-mile-logistics',
  't_multi_value_answers_survive_the_round_trip');

select tests.logout();

select * from finish();
rollback;
