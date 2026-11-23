-- ===========================================================================
-- Review video — migration 0060: short clips beside the photos of a game.
--
--   1. The new functions are service-role only; the buckets take MP4 clips.
--   2. A clip is recorded only when its poster, thumbnail AND clip really are in the bucket, and with its
--      size and length. Its clip path is pinned.
--   3. A clip is a review item like a photo: it lists in the folder, is approved the same way, and
--      reaches the public page only when approved and filed under a public team.
--   4. The public team page says which items are clips, and how long.
--   5. "N of M public photos have a large copy" does not count clips.
-- ===========================================================================
begin;
select plan(20);

select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname in ('folder_items','public_wanted_v2','public_unwanted_v2')
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_run_none_of_the_new_video_functions');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname in ('folder_items','public_wanted_v2','public_unwanted_v2','commit_photos','public_team','large_settings')
            and not has_function_privilege('service_role', p.oid, 'execute')), 0, 't_service_role_runs_them_all');
select ok((select file_size_limit >= 52428800 and 'video/mp4' = any (allowed_mime_types) and 'image/jpeg' = any (allowed_mime_types)
             from storage.buckets where id = 'review-photos'), 't_the_private_bucket_takes_mp4_up_to_50_mb');
select ok((select file_size_limit >= 52428800 and 'video/mp4' = any (allowed_mime_types)
             from storage.buckets where id = 'review-public'), 't_the_public_bucket_takes_mp4_up_to_50_mb');

-- fixture: one game, one photo and one clip sent together
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
insert into ctx select 'b', batch_id::text from review.create_batch('Game one', 'Hockey', '2026-10-24', 'x', 1, 1,
  array[repeat('1', 64), repeat('2', 64)]);
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b') || '/' || repeat(n::text, 64) || '-' || kind || '.jpg'
  from generate_series(1, 2) n, (values ('web'), ('thumb')) k(kind);

-- 2. A clip needs its file, its size and its length
select throws_ok($$select review.commit_photos((select v from ctx where k = 'b')::uuid, jsonb_build_array(
    jsonb_build_object('hash', repeat('2', 64), 'filename', 'C0001.MOV', 'kind', 'video',
                       'web_bytes', 10, 'video_bytes', 5000, 'duration', 12.5)))$$,
  '22023', null, 't_a_clip_is_refused_while_its_mp4_is_not_uploaded');
insert into storage.objects (bucket_id, name) values ('review-photos', (select v from ctx where k = 'b') || '/' || repeat('2', 64) || '-video.mp4');
select throws_ok($$select review.commit_photos((select v from ctx where k = 'b')::uuid, jsonb_build_array(
    jsonb_build_object('hash', repeat('2', 64), 'filename', 'C0001.MOV', 'kind', 'video', 'web_bytes', 10)))$$,
  '22023', null, 't_a_clip_is_refused_without_its_size_and_length');
select is(review.commit_photos((select v from ctx where k = 'b')::uuid, jsonb_build_array(
    jsonb_build_object('hash', repeat('1', 64), 'filename', 'IMG_1.JPG', 'taken_at', '2026-10-24T10:00:00', 'web_bytes', 10),
    jsonb_build_object('hash', repeat('2', 64), 'filename', 'C0001.MOV', 'kind', 'video', 'taken_at', '2026-10-24T10:05:00',
                       'width', 1920, 'height', 1080, 'web_bytes', 10, 'video_bytes', 5000, 'duration', 12.5))),
  2, 't_a_photo_and_a_clip_are_recorded_together');
select is((select video_path from review.photos where filename = 'C0001.MOV'),
  (select v from ctx where k = 'b') || '/' || repeat('2', 64) || '-video.mp4', 't_the_clip_path_is_pinned_to_its_batch_and_fingerprint');
select is((select (video_path is null and video_bytes is null and duration_seconds is null) from review.photos where filename = 'IMG_1.JPG'),
  true, 't_a_photo_has_no_clip_columns');
select throws_ok($$update review.photos set video_path = batch_id::text || '/' || file_hash || '-video.mp4'
                      where filename = 'IMG_1.JPG'$$, '23514', null, 't_a_clip_path_without_size_and_length_is_refused_by_the_table');
select is(review.commit_photos((select v from ctx where k = 'b')::uuid, jsonb_build_array(
    jsonb_build_object('hash', repeat('2', 64), 'filename', 'C0001.MOV', 'kind', 'video',
                       'web_bytes', 10, 'video_bytes', 5000, 'duration', 12.5))),
  0, 't_sending_the_same_clip_again_adds_nothing');

-- 3. In the folder, like a photo
select is((select count(*)::int from review.folder_items((select id from review.folders where name = 'Game one'), 'waiting')), 2,
  't_the_folder_lists_the_photo_and_the_clip');
select is((select video_path is not null from review.folder_items((select id from review.folders where name = 'Game one'), 'all')
            where filename = 'C0001.MOV'), true, 't_the_listing_gives_the_clip_its_file');
select is((select duration_seconds from review.folder_items((select id from review.folders where name = 'Game one'), 'all')
            where filename = 'C0001.MOV'), 12.50::numeric, 't_and_its_length');
select review.set_folder_team((select id from review.folders where name = 'Game one'), (select id from review.teams where slug = 'cazenovia-chiefs'));
select is((select count(*)::int from review.public_wanted_v2()), 0, 't_nothing_waiting_is_wanted_on_the_public_page');
select review.decide(array(select id from review.photos), 'approved', null, null);
select is((select count(*)::int from review.public_wanted_v2() where video_path is not null), 1,
  't_an_approved_clip_is_wanted_with_its_video_file');
select review.mark_public(array(select id from review.photos));

-- 4. The public page
select is((select jsonb_array_length(public_team->'albums'->0->'photos') from (select review.public_team('cazenovia-chiefs') as public_team) x), 2,
  't_the_public_page_lists_both');
select is((select (e->>'video')::boolean from jsonb_array_elements(review.public_team('cazenovia-chiefs')->'albums'->0->'photos') e
            where e->>'filename' = 'C0001.MOV') and (select (e->>'duration')::numeric = 12.5 from jsonb_array_elements(review.public_team('cazenovia-chiefs')->'albums'->0->'photos') e
            where e->>'filename' = 'C0001.MOV'), true, 't_and_marks_the_clip_with_its_length');

-- 5. Large copies
select is((select public_photos from review.large_settings()), 1::bigint, 't_the_large_count_does_not_include_the_clip');

-- Rejected later: comes down, clip file included
select review.decide(array(select id from review.photos where filename = 'C0001.MOV'), 'rejected', 'shaky', null);
select is((select video_path is not null from review.public_unwanted_v2() limit 1), true, 't_a_rejected_clip_must_come_down_with_its_video_file');

select * from finish();
rollback;
