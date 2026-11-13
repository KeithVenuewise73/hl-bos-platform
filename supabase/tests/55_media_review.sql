-- ===========================================================================
-- Media review — migration 0055: a private review area for photos.
--
--   1. Nobody but the service role can touch any of it (no web access, RLS
--      forced, no policy, a private bucket).
--   2. Connecting DateSort: one computer, during the window only.
--   3. Receiving photos: a photo is recorded only when both its files exist;
--      the same photo is never stored twice; paths are pinned.
--   4. Reviewing: approve, reject, back to waiting; "approve the rest" never
--      overrides a rejection; hints and statuses are constrained.
--   5. Folders: rename, move (back to waiting), a new folder from photos.
--   6. Teams: the four, private to start; a new one gets its own address.
-- ===========================================================================
begin;
select plan(67);

-- --- 1. Locked down ---------------------------------------------------------
select is((select count(*)::int from pg_class c
             where c.relnamespace = 'review'::regnamespace and c.relkind = 'r'
               and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 't_rls_forced_on_every_table');
select is((select count(*)::int from pg_class c
             where c.relnamespace = 'review'::regnamespace and c.relkind = 'r'
               and (has_table_privilege('anon', c.oid, 'select')
                 or has_table_privilege('authenticated', c.oid, 'select'))),
  0, 't_anon_and_authenticated_read_nothing');
select is((select count(*)::int from pg_policies where schemaname = 'review'),
  0, 't_no_policy_admits_anyone');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_run_no_function');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname <> 'reset_publisher'
            and not has_function_privilege('service_role', p.oid, 'execute')),
  0, 't_service_role_runs_every_function');
select ok(not has_function_privilege('service_role', 'review.reset_publisher(integer)', 'execute'),
  't_the_service_cannot_reset_the_publisher');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace and p.prosecdef),
  0, 't_no_security_definer_function');
select ok(not (select public from storage.buckets where id = 'review-photos'), 't_bucket_is_private');
select ok((select allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'review-photos'),
  't_bucket_takes_only_jpeg');

-- --- 2. Connecting DateSort -------------------------------------------------
select ok((select connect_until > now() + interval '23 hours' from review.settings),
  't_applying_opens_a_24_hour_connect_window');
select throws_ok($$ select review.register_publisher('nope') $$, '22023', null, 't_a_fingerprint_is_64_hex');
select is(review.register_publisher(repeat('a', 64)), 'connected', 't_first_registration_connects');
select is(review.register_publisher(repeat('a', 64)), 'connected', 't_the_same_computer_again_is_fine');
select is(review.register_publisher(repeat('b', 64)), 'taken', 't_another_computer_is_refused');
select is((select publisher_key_sha256 from review.service_settings()), repeat('a', 64), 't_the_first_publisher_stays');
select review.reset_publisher(2);
update review.settings set publisher_key_sha256 = null, connect_until = now() - interval '1 minute';
select is(review.register_publisher(repeat('c', 64)), 'closed', 't_after_the_window_nobody_connects');

-- --- 6a. Teams: the four, private ------------------------------------------
select is((select count(*)::int from review.teams), 4, 't_four_teams_to_start');
select is((select count(*)::int from review.teams where visibility = 'private'), 4, 't_every_team_starts_private');
select ok(exists (select 1 from review.teams where slug = 'cazenovia-chiefs' and name = 'Cazenovia Chiefs'),
  't_team_names_and_addresses');

-- --- 3. Receiving photos ----------------------------------------------------
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
insert into ctx select 'b1', batch_id::text from review.create_batch(
  'Varsity vs Wheatfield', 'Hockey', '2026-10-24', '2026-10-24 - Hockey - Varsity vs Wheatfield', 4, 1,
  array[repeat('1', 64), repeat('2', 64), repeat('3', 64), repeat('4', 64)]);
select is((select count(*)::int from review.folders), 1, 't_a_send_makes_a_folder');
select is((select name || '|' || sport || '|' || event_date from review.folders),
  'Varsity vs Wheatfield|Hockey|2026-10-24', 't_the_folder_carries_game_sport_date');
select is((select photo_count || '/' || video_count from review.batches), '4/1', 't_the_send_counts_are_kept');

-- Files for photos 1-3 are uploaded; photo 4's thumbnail is not.
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b1') || '/' || repeat(n::text, 64) || '-' || kind || '.jpg'
  from generate_series(1, 3) n, (values ('web'), ('thumb')) k(kind);
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b1') || '/' || repeat('4', 64) || '-web.jpg';

select throws_ok($$ select review.commit_photos((select v from ctx where k = 'b1')::uuid, jsonb_build_array(
    jsonb_build_object('hash', repeat('4', 64), 'filename', 'IMG_4.JPG', 'web_bytes', 1000))) $$,
  '22023', null, 't_a_photo_is_recorded_only_when_both_files_exist');
select is((select count(*)::int from review.photos), 0, 't_nothing_recorded_by_the_refused_commit');

select is(review.commit_photos((select v from ctx where k = 'b1')::uuid, jsonb_build_array(
  jsonb_build_object('hash', repeat('1', 64), 'filename', 'IMG_1.JPG', 'taken_at', '2026-10-24T10:02:00',
                     'width', 2400, 'height', 1600, 'sharpness', 310.5, 'brightness', 118.2,
                     'flags', jsonb_build_array(), 'web_bytes', 800000),
  jsonb_build_object('hash', repeat('2', 64), 'filename', 'IMG_2.JPG', 'taken_at', '2026-10-24T10:05:00',
                     'flags', jsonb_build_array('soft', 'small'), 'web_bytes', 400000),
  jsonb_build_object('hash', repeat('3', 64), 'filename', 'IMG_3.JPG', 'taken_at', '2026-10-24T15:00:00',
                     'date_estimated', true, 'web_bytes', 500000))), 3, 't_three_photos_recorded');
select is((select count(*)::int from review.photos where status = 'waiting'), 3, 't_every_new_photo_waits');
select is((select flags::text from review.photos where filename = 'IMG_2.JPG'), '{soft,small}', 't_hints_are_kept');
select is((select taken_at::text from review.photos where filename = 'IMG_1.JPG'), '2026-10-24 10:02:00',
  't_the_wall_clock_time_is_not_converted');
select is(review.commit_photos((select v from ctx where k = 'b1')::uuid, jsonb_build_array(
  jsonb_build_object('hash', repeat('1', 64), 'filename', 'IMG_1.JPG', 'web_bytes', 800000))), 0,
  't_the_same_photo_is_never_stored_twice');
select throws_ok($$ insert into review.photos (batch_id, folder_id, file_hash, filename, web_bytes, web_path, thumb_path)
  select b.id, b.folder_id, repeat('9', 64), 'x.jpg', 1, 'wrong/path.jpg', 'wrong/thumb.jpg' from review.batches b $$,
  '23514', null, 't_storage_paths_are_pinned');
select throws_ok($$ update review.photos set flags = array['pretty'] where filename = 'IMG_1.JPG' $$,
  '23514', null, 't_only_the_known_hints_are_allowed');
select throws_ok($$ update review.photos set status = 'maybe' where filename = 'IMG_1.JPG' $$,
  '23514', null, 't_only_the_known_statuses_are_allowed');

-- A second send of the same day reuses the folder and learns what is already here.
insert into ctx select 'b2', batch_id::text from review.create_batch(
  'varsity vs wheatfield', 'hockey', '2026-10-24', 'again', 3, 0, array[repeat('1', 64), repeat('5', 64)]);
select is((select count(*)::int from review.folders), 1, 't_sending_the_day_again_reuses_the_folder');
select is((select known from review.create_batch('Varsity vs Wheatfield', 'Hockey', '2026-10-24', 'x', 1, 0,
            array[repeat('1', 64), repeat('5', 64)])), array[repeat('1', 64)], 't_the_send_learns_what_is_already_here');
select is((select count(*)::int from review.folders), 1, 't_still_one_folder');
select throws_ok($$ select review.create_batch('', 'Hockey', '2026-10-24', 'x', 1, 0, array[]::text[]) $$,
  '22023', null, 't_a_game_name_is_required');

-- --- 4. Reviewing -----------------------------------------------------------
select is(review.decide(array[(select id from review.photos where filename = 'IMG_1.JPG')], 'approved', null,
  '99999999-9999-9999-9999-999999999999'), 1, 't_approve_one');
select is(review.decide(array[(select id from review.photos where filename = 'IMG_2.JPG')], 'rejected', 'out of focus',
  '99999999-9999-9999-9999-999999999999'), 1, 't_reject_one_with_a_reason');
select is((select reason from review.photos where filename = 'IMG_2.JPG'), 'out of focus', 't_the_reason_is_kept');
select ok((select decided_at is not null and decided_by is not null from review.photos where filename = 'IMG_1.JPG'),
  't_who_and_when_are_recorded');
select is(review.approve_waiting((select id from review.folders limit 1), '99999999-9999-9999-9999-999999999999'), 1,
  't_approve_the_rest_takes_only_what_is_waiting');
select is((select status from review.photos where filename = 'IMG_2.JPG'), 'rejected', 't_a_rejection_is_never_overridden');
select review.decide(array[(select id from review.photos where filename = 'IMG_1.JPG')], 'waiting', null, null);
select ok((select decided_at is null and decided_by is null and reason is null from review.photos where filename = 'IMG_1.JPG'),
  't_back_to_waiting_clears_the_decision');
select throws_ok($$ select review.decide(array[]::uuid[], 'published', null, null) $$, '22023', null,
  't_publishing_is_not_a_decision_here');

-- --- 5. Folders -------------------------------------------------------------
select is((select count(*)::int from review.folder_photos((select id from review.folders limit 1), 'rejected')), 1,
  't_list_by_status');
select is((select string_agg(filename, ',' order by taken_at) from review.folder_photos((select id from review.folders limit 1), 'all')),
  'IMG_1.JPG,IMG_2.JPG,IMG_3.JPG', 't_photos_come_in_the_order_taken');
select is((select count(*)::int from review.folder_photos((select id from review.folders limit 1), 'all', 2, 0)), 2,
  't_paging');
select is((select max(total)::int from review.folder_photos((select id from review.folders limit 1), 'all', 2, 0)), 3,
  't_paging_knows_the_total');

select review.rename_folder((select id from review.folders limit 1), '  Varsity vs Wheatfield (Hockey)  ');
select is((select name from review.folders), 'Varsity vs Wheatfield (Hockey)', 't_rename_a_folder');
select throws_ok($$ select review.rename_folder('00000000-0000-0000-0000-000000000000', 'x') $$, '22023', null,
  't_rename_an_unknown_folder_is_refused');

-- The afternoon photo (IMG_3) belongs to another game: split it into a new folder.
select review.decide(array[(select id from review.photos where filename = 'IMG_3.JPG')], 'approved', null, null);
select lives_ok($$ insert into ctx select 'f2', review.new_folder_from_photos(
  array[(select id from review.photos where filename = 'IMG_3.JPG')], 'JV Lacrosse vs Lockport', 'Lacrosse')::text $$,
  't_a_new_folder_from_photos');
select is((select event_date::text from review.folders where name = 'JV Lacrosse vs Lockport'), '2026-10-24',
  't_the_new_folder_takes_the_day_the_photo_was_taken');
select is((select status from review.photos where filename = 'IMG_3.JPG'), 'waiting', 't_a_moved_photo_goes_back_to_waiting');
select is((select f.name from review.photos p join review.folders f on f.id = p.folder_id where p.filename = 'IMG_3.JPG'),
  'JV Lacrosse vs Lockport', 't_the_photo_is_in_the_new_folder');
select throws_ok($$ select review.move_photos(array[(select id from review.photos limit 1)], '00000000-0000-0000-0000-000000000000') $$,
  '22023', null, 't_moving_to_an_unknown_folder_is_refused');
select throws_ok($$ select review.new_folder_from_photos(array[]::uuid[], 'x', null) $$, '22023', null,
  't_a_new_folder_needs_photos');
select is((select count(*)::int from review.folders_overview() where same_day = 1), 2, 't_two_folders_on_one_day_are_flagged');
select is((select waiting || '/' || approved || '/' || rejected from review.folders_overview() where name = 'Varsity vs Wheatfield (Hockey)'),
  '1/0/1', 't_overview_counts');

-- --- 6b. Teams: a new client ------------------------------------------------
select lives_ok($$ insert into ctx select 't', review.create_team('  Orchard Park Quakers ')::text $$, 't_create_a_team');
select is((select slug || '|' || visibility from review.teams where name = 'Orchard Park Quakers'),
  'orchard-park-quakers|private', 't_the_new_team_gets_an_address_and_starts_private');
select throws_ok($$ select review.create_team('orchard park quakers') $$, '23505', null, 't_no_two_teams_with_one_name');
insert into ctx select 'clash', review.create_team('West Seneca High School!')::text;
select is((select slug from review.teams where id = (select v from ctx where k = 'clash')::uuid),
  'west-seneca-high-school-2', 't_two_names_that_make_one_address_get_a_number');
select throws_ok($$ select review.create_team('!!!') $$, '22023', null, 't_a_name_needs_letters_or_numbers');
select review.set_team_visibility((select v from ctx where k = 't')::uuid, 'public');
select is((select visibility from review.teams where name = 'Orchard Park Quakers'), 'public', 't_the_owner_can_make_a_team_public');
select throws_ok($$ select review.set_team_visibility((select id from review.teams limit 1), 'secret') $$, '22023', null,
  't_a_team_is_private_or_public');
select review.set_folder_team((select id from review.folders where name = 'Varsity vs Wheatfield (Hockey)'),
  (select id from review.teams where slug = 'west-seneca-club-hockey'));
select is((select team_name from review.folders_overview() where name = 'Varsity vs Wheatfield (Hockey)'),
  'West Seneca Club Hockey', 't_a_folder_is_filed_under_a_team');
select is((select count(*)::int from review.list_teams()), 6, 't_the_list_shows_every_team');

select * from finish();
rollback;
