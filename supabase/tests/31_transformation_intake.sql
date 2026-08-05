\ir _fixtures.sql.inc

-- Coverage for hlbos_0031_transformation_intake: the public BTDI store.
-- Proves the security boundary — anon can ONLY submit via the RPC, never read
-- or write the table; internal read/update is platform-admin only; RLS is
-- forced with no direct grants.
begin;
select plan(14);
select tests.seed();

-- A well-formed payload the submit RPC accepts.
create or replace function tests.btdi_payload(p_email text)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'contact', jsonb_build_object(
      'businessName', 'Acme Logistics',
      'primaryContact', 'Dana Lee',
      'email', p_email,
      'phone', '555-0100'),
    'summary', jsonb_build_object(
      'businessStage', '3-10 years',
      'mainChallenge', 'Manual scheduling',
      'ninetyDayGoal', 'Book 20 discovery calls'),
    'sections', jsonb_build_object(
      'company', jsonb_build_object('industry','Logistics'),
      'goals',   jsonb_build_object('growthPriority','Efficiency')),
    'consent', jsonb_build_object('privacy', true, 'contact', true, 'publicReview', true),
    'attribution', jsonb_build_object('utm_source','linkedin'),
    'source_page', '/business-transformation-intake'
  );
$$;

-- --- Structural guarantees --------------------------------------------------
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class where oid = 'intake.transformation_submissions'::regclass),
  't_rls_enabled_and_forced');

select is(
  (select count(*)::int from pg_policies
     where schemaname = 'intake' and tablename = 'transformation_submissions'),
  0, 't_zero_policies: table fails closed by design');

select is(
  (select count(*)::int
     from information_schema.role_table_grants
     where table_schema = 'intake'
       and table_name = 'transformation_submissions'
       and grantee in ('anon','authenticated')),
  0, 't_no_direct_table_grants_to_anon_or_authenticated');

-- --- Anonymous: can ONLY submit via the RPC --------------------------------
select tests.login_as_anon();

select throws_ok(
  $$ select * from intake.transformation_submissions $$,
  '42501', NULL,
  't_anon_cannot_select_table');

select throws_ok(
  $$ insert into intake.transformation_submissions
       (business_name, primary_contact, contact_email, consent_privacy, consent_contact)
     values ('x','y','z@x.io', true, true) $$,
  '42501', NULL,
  't_anon_cannot_insert_directly');

select ok(
  public.submit_business_transformation_intake(tests.btdi_payload('anon-ok@acme.test')) like 'HLD-BT-%',
  't_anon_can_submit_via_rpc_and_gets_reference');

-- Missing required contact field is rejected.
select throws_ok(
  $$ select public.submit_business_transformation_intake(
       jsonb_build_object('contact', jsonb_build_object('businessName',''),
                          'consent', jsonb_build_object('privacy',true,'contact',true))) $$,
  '23514', NULL,
  't_rpc_rejects_missing_required');

-- Invalid email is rejected.
select throws_ok(
  $$ select public.submit_business_transformation_intake(
       (tests.btdi_payload('not-an-email')::jsonb)) $$,
  '23514', NULL,
  't_rpc_rejects_invalid_email');

-- Missing consent is rejected.
select throws_ok(
  $$ select public.submit_business_transformation_intake(
       jsonb_set(tests.btdi_payload('noconsent@acme.test'),
                 '{consent}', jsonb_build_object('privacy',false,'contact',false))) $$,
  '23514', NULL,
  't_rpc_rejects_missing_consent');

-- Duplicate rapid submission (same email within 60s) is rejected.
select lives_ok(
  $$ select public.submit_business_transformation_intake(tests.btdi_payload('dupe@acme.test')) $$,
  't_first_submission_lives');
select throws_ok(
  $$ select public.submit_business_transformation_intake(tests.btdi_payload('dupe@acme.test')) $$,
  '23514', NULL,
  't_duplicate_rapid_submission_rejected');

-- Anonymous cannot read the internal queue.
select throws_ok(
  $$ select public.list_transformation_intake(NULL, 100) $$,
  '42501', NULL,
  't_anon_cannot_list_queue');

select tests.logout();

-- --- Authenticated non-admin cannot read the queue -------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select public.list_transformation_intake(NULL, 100) $$,
  '42501', NULL,
  't_tenant_user_cannot_list_queue');
select tests.logout();

-- --- Platform admin CAN read the queue and sees submitted rows -------------
select tests.login_as(tests.uid('padmin'));
select cmp_ok(
  jsonb_array_length(public.list_transformation_intake(NULL, 500)),
  '>=', 2,
  't_platform_admin_reads_queue');
select tests.logout();

select * from finish();
rollback;
