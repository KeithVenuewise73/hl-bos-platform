\ir _fixtures.sql.inc

-- ===========================================================================
-- HL-BTI (migration 0027) — browser-reachable public API + intake persistence.
-- Verifies the ONLY new surface a deployed customer app uses: the public.bti_*
-- SECURITY DEFINER wrappers. Checks tenant resolution, business creation with
-- intake fields, analysis persistence + reload, permission gating (read vs
-- manage), anon lockout, and cross-tenant isolation. Reuses identity/tenancy;
-- introduces no new auth path.
-- ===========================================================================
begin;
select plan(20);
select tests.seed();

-- --- the new objects exist --------------------------------------------------
select has_table('bti', 'analysis_snapshots', 't_snapshots_table_exists');
select has_column('bti', 'businesses', 'website', 't_intake_website_col');
select has_column('bti', 'businesses', 'goals', 't_intake_goals_col');
select has_column('bti', 'businesses', 'contact_email', 't_intake_email_col');
select ok(
  (select relforcerowsecurity from pg_class where oid = 'bti.analysis_snapshots'::regclass),
  't_snapshots_force_rls');

-- --- anon may not touch the API (revoked) -----------------------------------
select tests.login_as_anon();
select throws_ok(
  $$ select public.bti_my_tenants() $$,
  '42501', null, 't_anon_cannot_call_my_tenants');
select tests.logout();

-- --- the signed-in owner resolves exactly their tenant ----------------------
select tests.login_as(tests.uid('owner_a'));
select is(
  jsonb_array_length(public.bti_my_tenants()), 1, 't_owner_sees_one_tenant');
select is(
  (public.bti_my_tenants() -> 0 ->> 'can_manage')::boolean, true, 't_owner_can_manage');

-- --- create a business with the full intake payload -------------------------
select ok(
  public.bti_register_business(
    tests.uid('tenant_a'), 'Rivertown Logistics',
    'https://rivertown-logistics.example.com',
    'transportation'::extensions.citext, 'transportation'::extensions.citext,
    'Columbus, OH', 'Dana Rivers',
    'dana@rivertown.example'::extensions.citext, '+1-614-555-0100',
    'Grow freight 20%.', false) is not null,
  't_register_business_with_intake');

-- intake fields persisted verbatim
select is((select website from bti.businesses where name='Rivertown Logistics'),
  'https://rivertown-logistics.example.com', 't_website_persisted');
select is((select primary_contact from bti.businesses where name='Rivertown Logistics'),
  'Dana Rivers', 't_contact_persisted');
select is((select goals from bti.businesses where name='Rivertown Logistics'),
  'Grow freight 20%.', 't_goals_persisted');
select is((select contact_email::text from bti.businesses where name='Rivertown Logistics'),
  'dana@rivertown.example', 't_email_persisted');

-- --- save an analysis and read it back (the persistence DoD) ----------------
select ok(
  public.bti_save_analysis(
    (select id from bti.businesses where name='Rivertown Logistics'), 68,
    '{"findings":[{"label":"AI Search Optimization"}],"proposal":{"lines":[{"service":"VisibilityAI"}]}}'::jsonb
  ) is not null, 't_save_analysis');

select is(
  jsonb_array_length(public.bti_list_businesses(tests.uid('tenant_a'))), 1,
  't_list_returns_business');
select is(
  (public.bti_list_businesses(tests.uid('tenant_a')) -> 0 -> 'latest' ->> 'transformation_score')::int,
  68, 't_list_shows_latest_score');
select is(
  public.bti_latest_analysis((select id from bti.businesses where name='Rivertown Logistics'))
    -> 'findings' -> 0 ->> 'label',
  'AI Search Optimization', 't_latest_analysis_roundtrips');
select tests.logout();

-- --- a read-only viewer may read but not save -------------------------------
select tests.login_as(tests.uid('viewer_a'));
select is(
  jsonb_array_length(public.bti_list_businesses(tests.uid('tenant_a'))), 1,
  't_viewer_can_read');
select throws_ok(
  $$ select public.bti_save_analysis(
       (select id from bti.businesses where name='Rivertown Logistics'), 50, '{}'::jsonb) $$,
  '42501', null, 't_viewer_cannot_save');
select tests.logout();

-- --- cross-tenant isolation: tenant B's owner is denied tenant A ------------
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$ select public.bti_list_businesses(tests.uid('tenant_a')) $$,
  '42501', null, 't_cross_tenant_denied');
select tests.logout();

select finish();
rollback;
