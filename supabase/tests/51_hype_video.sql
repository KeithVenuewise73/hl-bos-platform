\ir _fixtures.sql.inc

-- ===========================================================================
-- 5-Star Hype Video — migration 0051.
--
-- The claims this suite makes structural rather than aspirational:
--
--   1. A project about a minor cannot record consent without a named guardian.
--   2. Nothing is shared unless someone explicitly chose to share it.
--   3. A user cannot fabricate a generated package.
--   4. A status cannot claim what has not happened.
--   5. Media and packages cannot be attached to someone else's project.
--
-- Plus: one user never sees another's projects or photos, and anon sees
-- nothing at all.
-- ===========================================================================
begin;
select plan(50);
select tests.seed();

-- SECURITY INVOKER, so the delete is subject to the caller's policies.
create or replace function tests.hv_delete_all_projects() returns integer
language plpgsql as $$
declare n integer;
begin
  delete from hype.hype_projects;
  get diagnostics n = row_count;
  return n;
end $$;

-- Captured once, while A is logged in. A lookup function would run under the
-- CALLER's RLS, so in B's section it would return NULL and the isolation
-- assertions would pass for the wrong reason (a not-null error, not RLS).
create or replace function tests.hv_project() returns uuid language sql stable as $$
  select nullif(current_setting('hv.project', true), '')::uuid $$;

-- ===========================================================================
-- Structure
-- ===========================================================================

select has_schema('hype', 't_schema');

select has_table('hype', t, 't_table_' || t)
  from unnest(array[
    'hype_templates','user_profiles','hype_projects','hype_project_media',
    'hype_outputs','purchases','subscriptions'
  ]) as t;

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'hype' and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity),
  7, 't_rls_enabled_and_forced_on_all_7');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'hype' and grantee in ('anon','public')),
  0, 't_no_anon_or_public_grants');

select is(has_schema_privilege('anon', 'hype', 'usage'), false, 't_anon_no_schema_usage');

select is((select count(*)::int from hype.hype_templates), 8, 't_eight_seed_templates');
select results_eq(
  $$ select key from hype.hype_templates order by sort_order $$,
  $$ values ('game_day'),('senior_night'),('athlete_spotlight'),('recruiting_intro'),
            ('championship_recap'),('birthday_tribute'),('team_intro'),('player_of_the_game') $$,
  't_template_keys_match_the_engine');

-- ===========================================================================
-- Refusal 3: generated packages and payments are not user-writable
-- ===========================================================================

select is(has_table_privilege('authenticated', 'hype.hype_outputs', 'insert'), false, 't_cannot_insert_a_package');
select is(has_table_privilege('authenticated', 'hype.hype_outputs', 'update'), false, 't_cannot_edit_a_package');
select is(has_table_privilege('authenticated', 'hype.hype_outputs', 'delete'), true,  't_can_delete_own_package');
select is(has_table_privilege('authenticated', 'hype.purchases', 'insert'), false, 't_cannot_record_a_purchase');
select is(has_table_privilege('authenticated', 'hype.subscriptions', 'insert'), false, 't_cannot_grant_self_a_plan');
select is(has_table_privilege('authenticated', 'hype.subscriptions', 'update'), false, 't_cannot_upgrade_self');
select is(has_table_privilege('authenticated', 'hype.hype_templates', 'insert'), false, 't_cannot_add_a_template');

-- ===========================================================================
-- Refusal 1: consent
-- ===========================================================================

select tests.login_as(tests.uid('owner_a'));

select lives_ok($$
  insert into hype.hype_projects (owner_id, name, template_key, tone)
  values (tests.uid('owner_a'), 'Draft only', 'game_day', 'aggressive')
$$, 't_draft_without_consent_is_fine');

select is(
  (select features_minor from hype.hype_projects where name = 'Draft only'),
  true, 't_minor_is_the_default_assumption');

select throws_ok($$
  insert into hype.hype_projects
    (owner_id, name, template_key, tone, media_rights_confirmed, consent_confirmed_at)
  values (tests.uid('owner_a'), 'No guardian', 'game_day', 'aggressive', true, now())
$$, '23514', null, 't_minor_needs_guardian_consent');

select throws_ok($$
  insert into hype.hype_projects
    (owner_id, name, template_key, tone, media_rights_confirmed, consent_confirmed_at,
     guardian_consent_confirmed, guardian_name)
  values (tests.uid('owner_a'), 'Nameless guardian', 'game_day', 'aggressive', true, now(), true, '  ')
$$, '23514', null, 't_guardian_must_be_named');

select throws_ok($$
  insert into hype.hype_projects (owner_id, name, template_key, tone, media_rights_confirmed)
  values (tests.uid('owner_a'), 'Unrecorded', 'game_day', 'aggressive', true)
$$, '23514', null, 't_consent_needs_a_timestamp');

select lives_ok($$
  insert into hype.hype_projects
    (owner_id, name, template_key, tone, media_rights_confirmed, consent_confirmed_at,
     guardian_consent_confirmed, guardian_name)
  values (tests.uid('owner_a'), 'Jordan Game Day', 'game_day', 'aggressive', true, now(), true, 'Maria Reyes')
$$, 't_consented_minor_project');
select set_config('hv.project',
  (select id::text from hype.hype_projects where name = 'Jordan Game Day'), true);

select lives_ok($$
  insert into hype.hype_projects
    (owner_id, name, template_key, tone, media_rights_confirmed, consent_confirmed_at, features_minor)
  values (tests.uid('owner_a'), 'Adult athlete', 'recruiting_intro', 'professional', true, now(), false)
$$, 't_adult_needs_no_guardian');

select throws_ok($$
  insert into hype.hype_projects (owner_id, name, template_key, tone)
  values (tests.uid('owner_a'), 'Bad template', 'not_a_template', 'fun')
$$, '23503', null, 't_template_must_exist');

-- ===========================================================================
-- Refusal 2: sharing is chosen, never defaulted
-- ===========================================================================

select is(
  (select visibility::text from hype.hype_projects where id = tests.hv_project()),
  'private', 't_private_by_default');

select throws_ok($$
  update hype.hype_projects set visibility = 'public' where id = tests.hv_project()
$$, '23514', null, 't_cannot_share_without_choosing_to');

select throws_ok($$
  update hype.hype_projects set visibility = 'link', shared_at = now() where name = 'Draft only'
$$, '23514', null, 't_cannot_share_without_consent');

select lives_ok($$
  update hype.hype_projects set visibility = 'link', shared_at = now() where id = tests.hv_project()
$$, 't_explicit_consented_share_allowed');

-- ===========================================================================
-- Refusal 4: status is truthful
-- ===========================================================================

select throws_ok($$
  update hype.hype_projects set status = 'generated' where id = tests.hv_project()
$$, '23514', null, 't_not_generated_without_a_package');

select throws_ok($$
  update hype.hype_projects set status = 'exported' where id = tests.hv_project()
$$, '23514', null, 't_not_exported_without_a_package');

select throws_ok($$
  update hype.hype_projects set status = 'paid_download_pending' where id = tests.hv_project()
$$, '23514', null, 't_not_awaiting_payment_without_a_purchase');

select lives_ok($$
  update hype.hype_projects set status = 'details_complete' where id = tests.hv_project()
$$, 't_ordinary_progress_allowed');

-- The trusted path writes a package (as the owner role, bypassing grants the
-- way the server does), and only then may the status say so.
select tests.logout();
insert into hype.hype_outputs (owner_id, project_id, produced_by, title, package)
values (
  tests.uid('owner_a'), tests.hv_project(), 'template-writer', 'Game Day: Jordan',
  '{"title":"Game Day: Jordan","script15":"","script30":"","voiceover":"","socialCaption":"",
    "hashtags":[],"onScreenText":[],"videoPrompt":"","musicPrompt":"","sponsorCallout":null}'::jsonb
);
select tests.login_as(tests.uid('owner_a'));

select lives_ok($$
  update hype.hype_projects set status = 'generated' where id = tests.hv_project()
$$, 't_generated_once_a_package_exists');

select tests.logout();
select throws_ok($$
  insert into hype.hype_outputs (owner_id, project_id, produced_by, title, package)
  values (tests.uid('owner_a'), tests.hv_project(), '', 'x', '{"title":"x"}'::jsonb)
$$, '23514', null, 't_package_must_say_what_wrote_it');
select throws_ok($$
  insert into hype.hype_outputs (owner_id, project_id, produced_by, title, package)
  values (tests.uid('owner_a'), tests.hv_project(), 'template-writer', 'x', '{"title":"x"}'::jsonb)
$$, '23514', null, 't_package_must_be_complete');

-- ===========================================================================
-- Media
-- ===========================================================================

select tests.login_as(tests.uid('owner_a'));

select lives_ok(format($$
  insert into hype.hype_project_media
    (owner_id, project_id, kind, mime_type, size_bytes, object_path, original_name)
  values (%L, %L, 'image', 'image/jpeg', 120000, %L, 'jordan.jpg')
$$, tests.uid('owner_a'), tests.hv_project(),
    tests.uid('owner_a')::text || '/' || tests.hv_project()::text || '/a.jpg'),
  't_upload_own_photo');

select throws_ok(format($$
  insert into hype.hype_project_media
    (owner_id, project_id, kind, mime_type, size_bytes, object_path, original_name)
  values (%L, %L, 'image', 'image/jpeg', 120000, 'elsewhere/a.jpg', 'a.jpg')
$$, tests.uid('owner_a'), tests.hv_project()),
  '23514', null, 't_media_path_is_owner_and_project_scoped');

select throws_ok(format($$
  insert into hype.hype_project_media
    (owner_id, project_id, kind, mime_type, size_bytes, object_path, original_name)
  values (%L, %L, 'image', 'text/html', 100, %L, 'x.jpg')
$$, tests.uid('owner_a'), tests.hv_project(),
    tests.uid('owner_a')::text || '/' || tests.hv_project()::text || '/x.jpg'),
  '23514', null, 't_media_type_must_be_a_photo_or_video');

-- ===========================================================================
-- Isolation, and Refusal 5
-- ===========================================================================

select tests.login_as(tests.uid('owner_b'));

select is((select count(*)::int from hype.hype_projects), 0, 't_b_sees_no_projects');
select is((select count(*)::int from hype.hype_project_media), 0, 't_b_sees_no_photos');
select is((select count(*)::int from hype.hype_outputs), 0, 't_b_sees_no_packages');
select is((select count(*)::int from hype.hype_templates), 8, 't_b_can_read_templates');

select throws_ok($$
  insert into hype.hype_projects (owner_id, name, template_key, tone)
  values (tests.uid('owner_a'), 'Planted', 'game_day', 'fun')
$$, '42501', null, 't_b_cannot_write_as_a');

-- B owns this row and the path is B's, but the project is A's.
select throws_ok(format($$
  insert into hype.hype_project_media
    (owner_id, project_id, kind, mime_type, size_bytes, object_path, original_name)
  values (%L, %L, 'image', 'image/png', 100, %L, 'p.png')
$$, tests.uid('owner_b'), tests.hv_project(),
    tests.uid('owner_b')::text || '/' || tests.hv_project()::text || '/p.png'),
  '42501', null, 't_b_cannot_attach_media_to_as_project');

select is(tests.hv_delete_all_projects(), 0, 't_b_deletes_none_of_as_projects');

select tests.login_as_anon();
select throws_ok($$ select 1 from hype.hype_projects $$, '42501', null, 't_anon_is_locked_out');

select * from finish();
rollback;
