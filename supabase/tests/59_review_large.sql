-- ===========================================================================
-- Review large — migration 0059: a large copy of each photo, offered as a download.
--
--   1. The functions are service-role only.
--   2. A large copy is only recorded when its file really is in the bucket, and its path is pinned.
--   3. A photo can be downloaded large only when the switch is ON, the photo is on a public
--      page, and a large copy exists.
--   4. The public team page says which photos have a large copy and whether downloads are on.
-- ===========================================================================
begin;
select plan(22);

select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname in ('large_needed','attach_large','large_settings','set_large_downloads','public_large')
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_run_none_of_the_large_functions');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname in ('large_needed','attach_large','large_settings','set_large_downloads','public_large')
            and not has_function_privilege('service_role', p.oid, 'execute')), 0, 't_service_role_runs_them_all');
select ok((select enabled from review.large_settings()), 't_large_downloads_start_switched_on');

-- fixture: one game with 3 photos, the first two approved and public, the third waiting
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
insert into ctx select 'b', batch_id::text from review.create_batch('Game one', 'Hockey', '2026-10-24', 'x', 3, 0,
  array[repeat('1', 64), repeat('2', 64), repeat('3', 64)]);
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b') || '/' || repeat(n::text, 64) || '-' || kind || '.jpg'
  from generate_series(1, 3) n, (values ('web'), ('thumb')) k(kind);
select review.commit_photos((select v from ctx where k = 'b')::uuid, jsonb_build_array(
  jsonb_build_object('hash', repeat('1', 64), 'filename', 'IMG_1.JPG', 'taken_at', '2026-10-24T10:00:00', 'web_bytes', 10),
  jsonb_build_object('hash', repeat('2', 64), 'filename', 'IMG_2.JPG', 'taken_at', '2026-10-24T10:01:00', 'web_bytes', 10),
  jsonb_build_object('hash', repeat('3', 64), 'filename', 'IMG_3.JPG', 'taken_at', '2026-10-24T10:02:00', 'web_bytes', 10)));
create temp table pid as select filename f, id from review.photos;
grant all on pid to public;
select review.set_folder_team((select id from review.folders where name = 'Game one'), (select id from review.teams where slug = 'cazenovia-chiefs'));
select review.decide(array(select id from pid where f in ('IMG_1.JPG', 'IMG_2.JPG')), 'approved', null, null);
select review.mark_public(array(select id from pid where f in ('IMG_1.JPG', 'IMG_2.JPG')));

-- 2. Recording a large copy
select is((select count(*)::int from review.large_needed(array[repeat('1', 64), repeat('2', 64), repeat('3', 64)])), 3,
  't_every_photo_starts_without_a_large_copy');
select is(review.attach_large(repeat('1', 64), 2500000), false, 't_a_large_copy_is_not_recorded_while_its_file_is_missing');
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b') || '/' || repeat(n::text, 64) || '-large.jpg' from generate_series(1, 3) n;
select is(review.attach_large(repeat('1', 64), 2500000), true, 't_it_is_recorded_once_the_file_is_there');
select is((select large_path from review.photos where file_hash = repeat('1', 64)),
  (select v from ctx where k = 'b') || '/' || repeat('1', 64) || '-large.jpg', 't_at_the_pinned_path');
select is(review.attach_large(repeat('9', 64), 100), false, 't_an_unknown_photo_is_not_recorded');
select throws_ok($$select review.attach_large('nope', 100)$$, '22023', null, 't_a_malformed_fingerprint_is_refused');
select throws_ok($$select review.attach_large(repeat('1', 64), 0)$$, '22023', null, 't_a_zero_size_is_refused');
select throws_ok($$update review.photos set large_path = 'elsewhere/x.jpg' where file_hash = repeat('2', 64)$$,
  '23514', null, 't_the_path_cannot_be_pointed_anywhere_else');
select is((select count(*)::int from review.large_needed(array[repeat('1', 64), repeat('2', 64)])), 1, 't_only_the_photo_without_one_is_still_needed');
select review.attach_large(repeat('2', 64), 2400000);
select review.attach_large(repeat('3', 64), 2300000);

-- 3. Who may download
select is((select large_path from review.public_large((select id from pid where f = 'IMG_1.JPG'))),
  (select v from ctx where k = 'b') || '/' || repeat('1', 64) || '-large.jpg', 't_a_public_photo_with_a_large_copy_can_be_downloaded');
select is((select large_path from review.public_large((select id from pid where f = 'IMG_3.JPG'))), null,
  't_a_photo_that_is_not_public_cannot_even_with_a_large_copy');
select is((select count(*)::int from review.public_large('00000000-0000-0000-0000-000000000000')), 0, 't_an_unknown_photo_gives_nothing');
select review.set_large_downloads(false);
select is((select large_path from review.public_large((select id from pid where f = 'IMG_1.JPG'))), null,
  't_with_the_switch_off_nothing_can_be_downloaded');
select is((select enabled from review.public_large((select id from pid where f = 'IMG_1.JPG'))), false, 't_and_it_says_the_switch_is_off');
select review.set_large_downloads(true);
select review.set_team_visibility((select id from review.teams where slug = 'cazenovia-chiefs'), 'private');
select is((select large_path from review.public_large((select id from pid where f = 'IMG_1.JPG'))), null,
  't_a_private_team_blocks_large_downloads_even_before_the_photo_comes_down');
select review.set_team_visibility((select id from review.teams where slug = 'cazenovia-chiefs'), 'public');
select throws_ok($$select review.set_large_downloads(null)$$, '22023', null, 't_the_switch_needs_on_or_off');

-- 4. The public page
select is((review.public_team('cazenovia-chiefs') -> 'albums' -> 0 -> 'photos' -> 0 ->> 'large'), 'true', 't_the_team_page_says_which_photos_have_a_large_copy');
select is((review.public_team('cazenovia-chiefs') ->> 'large_downloads'), 'true', 't_and_that_downloads_are_on');
select ok(not (review.public_team('cazenovia-chiefs')::text like '%large_path%'), 't_and_never_shows_where_the_large_file_is');

select * from finish();
rollback;
