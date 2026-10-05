\ir _fixtures.sql.inc

-- ===========================================================================
-- JerseySort AI — migration 0052.
--
-- The claims this suite makes structural rather than aspirational:
--
--   1. A member cannot fabricate an AI result: no AI detection insert, no
--      edit of a reading's number or confidence, no job-log writes.
--   2. A photo's status cannot claim what has not happened.
--   3. One jersey number, one athlete, per team + season — and only then.
--   4. No photo is public; objects are fenced by the tenant in their path.
--
-- Plus: one organization never sees or writes another's photos, a viewer
-- reads but cannot write, favorites are per person, and anon sees nothing.
-- ===========================================================================
begin;
select plan(74);
select tests.seed();

-- SECURITY INVOKER: each runs under the CALLER's policies and reports how
-- many rows it was actually allowed to change.
create or replace function tests.js_delete_event(p_id uuid) returns integer
language plpgsql as $$
declare n integer;
begin
  delete from jerseysort.events where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function tests.js_mark_unusable(p_id uuid) returns integer
language plpgsql as $$
declare n integer;
begin
  update jerseysort.photos set unusable = true where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;


-- ===========================================================================
-- Structure
-- ===========================================================================

select has_schema('jerseysort', 't_schema');

select has_table('jerseysort', t, 't_table_' || t)
  from unnest(array[
    'settings','teams','seasons','events','photos','photo_metadata','photo_detections',
    'players','player_numbers','photo_player_tags','albums','album_photos','favorites','ai_analysis_jobs'
  ]) as t;

select has_view('jerseysort', 'review_queue', 't_review_queue_is_a_view');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'jerseysort' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity),
  14, 't_rls_enabled_and_forced_on_all_14');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'jerseysort' and grantee in ('anon','public')),
  0, 't_no_anon_or_public_grants');

select is(has_schema_privilege('anon', 'jerseysort', 'usage'), false, 't_anon_no_schema_usage');

select results_eq(
  $$ select permission_key::text from identity.role_permissions where role_key = 'viewer' and permission_key like 'jerseysort.%' $$,
  $$ values ('jerseysort.photo.read') $$,
  't_viewer_may_only_read');

-- ===========================================================================
-- Refusal 1 (grants): members cannot write AI results
-- ===========================================================================

select is(has_table_privilege('authenticated', 'jerseysort.ai_analysis_jobs', 'insert'), false, 't_cannot_write_job_log');
select is(has_table_privilege('authenticated', 'jerseysort.ai_analysis_jobs', 'update'), false, 't_cannot_edit_job_log');
select is(has_column_privilege('authenticated', 'jerseysort.photo_detections', 'detected_value', 'update'), false, 't_cannot_edit_a_reading_number');
select is(has_column_privilege('authenticated', 'jerseysort.photo_detections', 'confidence', 'update'), false, 't_cannot_edit_a_reading_confidence');
select is(has_column_privilege('authenticated', 'jerseysort.photo_detections', 'status', 'update'), true, 't_can_confirm_or_reject');
select is(has_column_privilege('authenticated', 'jerseysort.photos', 'athletes_present', 'update'), false, 't_cannot_edit_analysis_output');

-- ===========================================================================
-- A world: tenant A's event and a photo the worker has analysed
-- ===========================================================================

insert into jerseysort.teams (id, tenant_id, name, sport) values
  (tests.uid('js_team_a'), tests.uid('tenant_a'), 'West Seneca', 'Football'),
  (tests.uid('js_team_b'), tests.uid('tenant_b'), 'Orchard Park', 'Football');
insert into jerseysort.seasons (id, tenant_id, name) values
  (tests.uid('js_2026_a'), tests.uid('tenant_a'), '2026'),
  (tests.uid('js_2027_a'), tests.uid('tenant_a'), '2027'),
  (tests.uid('js_2026_b'), tests.uid('tenant_b'), '2026');
insert into jerseysort.events (id, tenant_id, name, sport, team_id, season_id, event_date) values
  (tests.uid('js_event_a'), tests.uid('tenant_a'), 'West Seneca vs Orchard Park', 'Football', tests.uid('js_team_a'), tests.uid('js_2026_a'), '2026-10-03'),
  (tests.uid('js_event_b'), tests.uid('tenant_b'), 'Orchard Park vs Hamburg', 'Football', tests.uid('js_team_b'), tests.uid('js_2026_b'), '2026-10-03');

-- ===========================================================================
-- As tenant A's owner
-- ===========================================================================

select tests.login_as(tests.uid('owner_a'));

select lives_ok($$
  insert into jerseysort.photos (id, tenant_id, event_id, uploaded_by, original_filename, storage_path, captured_at,
    captured_at_source, mime_type, file_size, file_hash, status)
  values (tests.uid('js_photo_a'), tests.uid('tenant_a'), tests.uid('js_event_a'), tests.uid('owner_a'), 'IMG_4492.jpg',
    tests.uid('tenant_a')::text || '/e/p.jpg', '2026-10-03 19:31:05', 'exif', 'image/jpeg', 4000000, repeat('a', 64), 'queued')
$$, 't_member_uploads_a_photo');

select throws_ok($$
  insert into jerseysort.photos (tenant_id, event_id, uploaded_by, original_filename, storage_path, captured_at,
    captured_at_source, mime_type, file_size, file_hash, status)
  values (tests.uid('tenant_a'), tests.uid('js_event_a'), tests.uid('owner_a'), 'x.jpg',
    tests.uid('tenant_a')::text || '/e/x.jpg', '2026-10-03', 'exif', 'image/jpeg', 1, repeat('b', 64), 'completed')
$$, '23514', null, 't_new_photo_cannot_claim_completed');

select throws_ok($$
  insert into jerseysort.photos (tenant_id, event_id, uploaded_by, original_filename, storage_path, captured_at,
    captured_at_source, mime_type, file_size, file_hash)
  values (tests.uid('tenant_a'), tests.uid('js_event_a'), tests.uid('owner_a'), 'dup.jpg',
    tests.uid('tenant_a')::text || '/e/d.jpg', '2026-10-03', 'exif', 'image/jpeg', 1, repeat('a', 64))
$$, '23505', null, 't_duplicate_file_refused');

select throws_ok($$
  insert into jerseysort.photos (tenant_id, event_id, uploaded_by, original_filename, storage_path, captured_at,
    captured_at_source, mime_type, file_size, file_hash)
  values (tests.uid('tenant_a'), tests.uid('js_event_a'), tests.uid('owner_a'), 'x.jpg',
    'somewhere/else.jpg', '2026-10-03', 'exif', 'image/jpeg', 1, repeat('c', 64))
$$, '23514', null, 't_object_path_must_be_tenant_scoped');

select throws_ok($$
  insert into jerseysort.photos (tenant_id, event_id, uploaded_by, original_filename, storage_path, captured_at,
    captured_at_source, mime_type, file_size, file_hash)
  values (tests.uid('tenant_a'), tests.uid('js_event_a'), tests.uid('owner_b'), 'x.jpg',
    tests.uid('tenant_a')::text || '/e/y.jpg', '2026-10-03', 'exif', 'image/jpeg', 1, repeat('d', 64))
$$, '42501', null, 't_cannot_upload_in_someone_elses_name');

select throws_ok($$
  insert into jerseysort.photo_metadata (photo_id, tenant_id, exif)
  values (tests.uid('js_photo_a'), tests.uid('tenant_a'), '{"GPSLatitude": 42.8}')
$$, '23514', null, 't_gps_is_never_stored');

-- Refusal 1 (behaviour): an AI reading cannot be typed in by a member.
select throws_ok($$
  insert into jerseysort.photo_detections (tenant_id, photo_id, detected_value, confidence, method, provider, status, created_by)
  values (tests.uid('tenant_a'), tests.uid('js_photo_a'), '24', 0.99, 'vision_model', 'claude-vision', 'suggested', tests.uid('owner_a'))
$$, '42501', null, 't_member_cannot_insert_an_ai_detection');

select lives_ok($$
  insert into jerseysort.photo_detections (id, tenant_id, photo_id, detected_value, confidence, method, provider, status, created_by)
  values (tests.uid('js_manual'), tests.uid('tenant_a'), tests.uid('js_photo_a'), '7', 1, 'manual', 'person', 'confirmed', tests.uid('owner_a'))
$$, 't_member_adds_a_manual_number');

select throws_ok($$
  insert into jerseysort.photo_detections (tenant_id, photo_id, detected_value, confidence, method, provider, status, created_by)
  values (tests.uid('tenant_a'), tests.uid('js_photo_a'), '100', 1, 'manual', 'person', 'confirmed', tests.uid('owner_a'))
$$, '23514', null, 't_three_digit_number_refused');

select throws_ok($$
  insert into jerseysort.photo_detections (tenant_id, photo_id, detected_value, confidence, method, provider, status, created_by)
  values (tests.uid('tenant_a'), tests.uid('js_photo_a'), '8', 0.4, 'manual', 'person', 'confirmed', tests.uid('owner_a'))
$$, '23514', null, 't_manual_reading_is_a_decision_not_a_guess');

select throws_ok($$
  insert into jerseysort.ai_analysis_jobs (tenant_id, photo_id, provider, status) values
    (tests.uid('tenant_a'), tests.uid('js_photo_a'), 'claude-vision', 'running')
$$, '42501', null, 't_member_cannot_write_the_job_log');

-- Refusal 2: queued -> completed is the worker's, not a member's.
select throws_ok($$
  update jerseysort.photos set status = 'completed' where id = tests.uid('js_photo_a')
$$, '23514', null, 't_member_cannot_complete_an_unanalysed_photo');

select tests.logout();

-- The worker (service role) analyses it: one AI reading at 62%.
set local role service_role;
update jerseysort.photos set status = 'needs_review', athletes_present = true where id = tests.uid('js_photo_a');
insert into jerseysort.photo_detections (id, tenant_id, photo_id, detected_value, confidence, method, provider, provider_model, status)
values (tests.uid('js_ai'), tests.uid('tenant_a'), tests.uid('js_photo_a'), '18', 0.62, 'vision_model', 'claude-vision', 'claude-opus-5-5', 'suggested');
insert into jerseysort.ai_analysis_jobs (tenant_id, photo_id, provider, status, finished_at, result)
values (tests.uid('tenant_a'), tests.uid('js_photo_a'), 'claude-vision', 'succeeded', now(), '{}');
reset role;

select tests.login_as(tests.uid('owner_a'));

select throws_ok($$
  update jerseysort.photo_detections set status = 'suggested' where id = tests.uid('js_manual')
$$, '42501', null, 't_cannot_launder_a_decision_back_into_a_suggestion');

select lives_ok($$
  update jerseysort.photo_detections set status = 'confirmed' where id = tests.uid('js_ai')
$$, 't_member_confirms_ai_reading');

select is((select user_confirmed from jerseysort.photo_detections where id = tests.uid('js_ai')), true, 't_user_confirmed_follows_status');

-- On the now-CONFIRMED row, and on the exact error: so the column grant is the
-- only thing that can refuse these. (Asserted on a suggested row, the status
-- rule refused them too, and they passed even with the grant removed.)
select throws_ok($$
  update jerseysort.photo_detections set confidence = 0.99 where id = tests.uid('js_ai')
$$, '42501', 'permission denied for table photo_detections', 't_cannot_inflate_ai_confidence');

select throws_ok($$
  update jerseysort.photo_detections set detected_value = '24' where id = tests.uid('js_ai')
$$, '42501', 'permission denied for table photo_detections', 't_cannot_rewrite_ai_number');

select lives_ok($$
  update jerseysort.photos set status = 'completed', reviewed_at = now(), reviewed_by = tests.uid('owner_a')
   where id = tests.uid('js_photo_a')
$$, 't_review_sorts_an_analysed_photo');

select throws_ok($$
  update jerseysort.photos set status = 'processing' where id = tests.uid('js_photo_a')
$$, '23514', null, 't_member_cannot_claim_processing');

select throws_ok($$
  update jerseysort.photos set status = 'failed', error = 'x' where id = tests.uid('js_photo_a')
$$, '23514', null, 't_member_cannot_claim_failed');

select lives_ok($$
  update jerseysort.photos set status = 'queued' where id = tests.uid('js_photo_a')
$$, 't_member_can_requeue_for_reanalysis');

select is((select count(*)::int from jerseysort.ai_analysis_jobs), 1, 't_member_reads_the_job_log');

-- Refusal 3: one number, one athlete, per team + season.
select lives_ok($$
  insert into jerseysort.players (id, tenant_id, first_name, last_name, team_id, season_id, graduation_year)
  values (tests.uid('js_dominic'), tests.uid('tenant_a'), 'Dominic', 'Herman', tests.uid('js_team_a'), tests.uid('js_2026_a'), 2029),
         (tests.uid('js_other'),   tests.uid('tenant_a'), 'Other',   'Kid',    tests.uid('js_team_a'), tests.uid('js_2026_a'), 2028)
$$, 't_member_creates_players');

select lives_ok($$
  insert into jerseysort.player_numbers (tenant_id, player_id, team_id, season_id, jersey_number)
  values (tests.uid('tenant_a'), tests.uid('js_dominic'), tests.uid('js_team_a'), tests.uid('js_2026_a'), '24')
$$, 't_number_assigned_for_team_and_season');

select throws_ok($$
  insert into jerseysort.player_numbers (tenant_id, player_id, team_id, season_id, jersey_number)
  values (tests.uid('tenant_a'), tests.uid('js_other'), tests.uid('js_team_a'), tests.uid('js_2026_a'), '24')
$$, '23505', null, 't_same_number_same_season_refused');

select lives_ok($$
  insert into jerseysort.player_numbers (tenant_id, player_id, team_id, season_id, jersey_number)
  values (tests.uid('tenant_a'), tests.uid('js_other'), tests.uid('js_team_a'), tests.uid('js_2027_a'), '24')
$$, 't_number_free_again_next_season');

select throws_ok($$
  insert into jerseysort.player_numbers (tenant_id, player_id, team_id, season_id, jersey_number)
  values (tests.uid('tenant_a'), tests.uid('js_other'), tests.uid('js_team_b'), tests.uid('js_2026_a'), '9')
$$, '23503', null, 't_cannot_borrow_another_orgs_team');

select throws_ok($$
  insert into jerseysort.photo_player_tags (tenant_id, photo_id, player_id)
  values (tests.uid('tenant_a'), tests.uid('js_photo_a'), tests.uid('js_nonexistent'))
$$, '23503', null, 't_tag_needs_a_real_player');

-- A photo cannot be put in another organization's event, even naming our tenant.
select throws_ok($$
  insert into jerseysort.photos (tenant_id, event_id, uploaded_by, original_filename, storage_path, captured_at,
    captured_at_source, mime_type, file_size, file_hash)
  values (tests.uid('tenant_a'), tests.uid('js_event_b'), tests.uid('owner_a'), 'x.jpg',
    tests.uid('tenant_a')::text || '/e/z.jpg', '2026-10-03', 'exif', 'image/jpeg', 1, repeat('e', 64))
$$, '23503', null, 't_photo_cannot_join_another_orgs_event');

-- Albums and favorites.
select lives_ok($$
  insert into jerseysort.albums (id, tenant_id, name) values (tests.uid('js_album'), tests.uid('tenant_a'), 'Senior Night');
  insert into jerseysort.album_photos (tenant_id, album_id, photo_id) values (tests.uid('tenant_a'), tests.uid('js_album'), tests.uid('js_photo_a'));
  insert into jerseysort.favorites (tenant_id, user_id, photo_id) values (tests.uid('tenant_a'), tests.uid('owner_a'), tests.uid('js_photo_a'))
$$, 't_albums_and_favorites');

select throws_ok($$
  insert into jerseysort.favorites (tenant_id, user_id, photo_id) values (tests.uid('tenant_a'), tests.uid('staff_a'), tests.uid('js_photo_a'))
$$, '42501', null, 't_cannot_favorite_for_someone_else');

-- Thresholds are validated on the data.
select throws_ok($$
  insert into jerseysort.settings (tenant_id, high_threshold, medium_threshold) values (tests.uid('tenant_a'), 0.5, 0.7)
$$, '23514', null, 't_impossible_thresholds_refused');

select tests.logout();

-- ===========================================================================
-- Roles within tenant A
-- ===========================================================================

select tests.login_as(tests.uid('viewer_a'));
select is((select count(*)::int from jerseysort.photos), 1, 't_viewer_sees_the_library');
select throws_ok($$
  insert into jerseysort.albums (tenant_id, name) values (tests.uid('tenant_a'), 'Nope')
$$, '42501', null, 't_viewer_cannot_write');
select is((select count(*)::int from jerseysort.favorites), 0, 't_favorites_are_per_person');
select tests.logout();

select tests.login_as(tests.uid('staff_a'));
select throws_ok($$
  insert into jerseysort.settings (tenant_id) values (tests.uid('tenant_a'))
$$, '42501', null, 't_staff_cannot_change_thresholds');
select is(tests.js_delete_event(tests.uid('js_event_a')), 0, 't_staff_cannot_delete_an_event');
select tests.logout();

-- ===========================================================================
-- Tenant B sees nothing of tenant A
-- ===========================================================================

select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from jerseysort.photos), 0, 't_other_org_sees_no_photos');
select is((select count(*)::int from jerseysort.photo_detections), 0, 't_other_org_sees_no_detections');
select is((select count(*)::int from jerseysort.players), 0, 't_other_org_sees_no_players');
select is((select count(*)::int from jerseysort.review_queue), 0, 't_review_queue_respects_rls');
select is(tests.js_mark_unusable(tests.uid('js_photo_a')), 0, 't_other_org_cannot_touch_our_photo');
select throws_ok($$
  insert into jerseysort.photo_player_tags (tenant_id, photo_id, player_id)
  values (tests.uid('tenant_a'), tests.uid('js_photo_a'), tests.uid('js_dominic'))
$$, '42501', null, 't_other_org_cannot_tag_our_photo');
select tests.logout();

-- ===========================================================================
-- Refusal 4: storage
-- ===========================================================================

select is(
  (select count(*)::int from storage.buckets where id like 'jerseysort-%' and public = false),
  3, 't_three_private_buckets');

select tests.login_as(tests.uid('owner_a'));
select lives_ok(format($$
  insert into storage.objects (bucket_id, name) values ('jerseysort-originals', '%s/e/p.jpg')
$$, tests.uid('tenant_a')), 't_member_uploads_into_own_folder');
select throws_ok(format($$
  insert into storage.objects (bucket_id, name) values ('jerseysort-originals', '%s/e/p.jpg')
$$, tests.uid('tenant_b')), '42501', null, 't_cannot_upload_into_another_orgs_folder');
select tests.logout();

select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from storage.objects where bucket_id = 'jerseysort-originals'), 0, 't_other_org_cannot_read_our_objects');
select tests.logout();

select tests.login_as_anon();
select throws_ok($$ select count(*) from jerseysort.photos $$, '42501', null, 't_anon_gets_nothing');
select tests.logout();

select * from finish();
rollback;
