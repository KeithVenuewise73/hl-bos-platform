-- ===========================================================================
-- Review publish — migration 0057: approved photos on a team's public page.
--
--   1. The functions are service-role only; the public bucket is public, JPEG only.
--   2. A photo is wanted public only when approved, in a folder with a team, and that
--      team is public; and it comes down again when it stops qualifying.
--   3. Visitors see only photos that have actually been copied.
-- ===========================================================================
begin;
select plan(30);

-- --- 1. Locked down ---------------------------------------------------------
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname in ('public_wanted','public_unwanted','mark_public','clear_public','public_teams','public_team')
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_run_none_of_them');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname in ('public_wanted','public_unwanted','mark_public','clear_public','public_teams','public_team')
            and not has_function_privilege('service_role', p.oid, 'execute')),
  0, 't_service_role_runs_all_of_them');
select ok((select public from storage.buckets where id = 'review-public'), 't_the_public_bucket_is_public');
select ok((select allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'review-public'), 't_and_takes_only_jpeg');
select ok(not (select public from storage.buckets where id = 'review-photos'), 't_the_review_bucket_stays_private');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (qual ilike '%review-public%' or with_check ilike '%review-public%')), 0, 't_no_storage_policy_lets_anyone_write_the_public_bucket');

-- --- fixture: one folder, three photos --------------------------------------
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
insert into ctx select 'b', batch_id::text from review.create_batch('Varsity vs Wheatfield', 'Hockey', '2026-10-24', 'x', 3, 0,
  array[repeat('1', 64), repeat('2', 64), repeat('3', 64)]);
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b') || '/' || repeat(n::text, 64) || '-' || kind || '.jpg'
  from generate_series(1, 3) n, (values ('web'), ('thumb')) k(kind);
select review.commit_photos((select v from ctx where k = 'b')::uuid, jsonb_build_array(
  jsonb_build_object('hash', repeat('1', 64), 'filename', 'IMG_1.JPG', 'taken_at', '2026-10-24T10:00:00', 'width', 2400, 'height', 1600, 'web_bytes', 10),
  jsonb_build_object('hash', repeat('2', 64), 'filename', 'IMG_2.JPG', 'taken_at', '2026-10-24T10:05:00', 'web_bytes', 10),
  jsonb_build_object('hash', repeat('3', 64), 'filename', 'IMG_3.JPG', 'taken_at', '2026-10-24T10:09:00', 'web_bytes', 10)));
create temp table pid as select filename f, id from review.photos;
grant all on pid to public;

-- --- 2. What is wanted ------------------------------------------------------
select is((select count(*)::int from review.public_wanted()), 0, 't_nothing_waiting_is_public');
select review.decide(array[(select id from pid where f = 'IMG_1.JPG'), (select id from pid where f = 'IMG_2.JPG')], 'approved', null, null);
select is((select count(*)::int from review.public_wanted()), 0, 't_approved_but_no_team_is_still_private');
select review.set_folder_team((select id from review.folders limit 1), (select id from review.teams where slug = 'cazenovia-chiefs'));
select is((select count(*)::int from review.public_wanted()), 2, 't_approved_in_a_folder_with_a_public_team_is_wanted');
select is((select count(*)::int from review.public_wanted() w where w.id = (select id from pid where f = 'IMG_3.JPG')), 0,
  't_a_waiting_photo_is_never_wanted');
select is(review.mark_public(array[(select id from pid where f = 'IMG_3.JPG')]), 0, 't_a_photo_that_does_not_qualify_cannot_be_marked');
select is(review.mark_public(array(select id from review.public_wanted())), 2, 't_mark_the_two_copied');
select is((select count(*)::int from review.public_wanted()), 0, 't_marked_photos_are_no_longer_wanted');
select is((select count(*)::int from review.public_unwanted()), 0, 't_and_nothing_needs_to_come_down');

-- --- 3. What visitors see ---------------------------------------------------
select is((select photos from review.public_teams() where slug = 'cazenovia-chiefs'), 2::bigint, 't_the_team_page_counts_two_photos');
select is((select count(*)::int from review.public_teams()), 1, 't_only_a_team_with_public_photos_is_listed');
select is(jsonb_array_length(review.public_team('cazenovia-chiefs') -> 'albums'), 1, 't_one_album');
select is(jsonb_array_length(review.public_team('cazenovia-chiefs') -> 'albums' -> 0 -> 'photos'), 2, 't_with_its_two_photos');
select is(review.public_team('cazenovia-chiefs') -> 'albums' -> 0 -> 'photos' -> 0 ->> 'filename', 'IMG_1.JPG', 't_in_the_order_taken');
select ok((review.public_team('cazenovia-chiefs') -> 'albums' -> 0 -> 'photos' -> 0) ? 'web_path', 't_with_the_paths_to_copy_from');
select ok(not exists (select 1 from jsonb_array_elements(review.public_team('cazenovia-chiefs') -> 'albums' -> 0 -> 'photos') x
                       where x ->> 'filename' = 'IMG_3.JPG'), 't_the_waiting_photo_is_not_on_the_page');
select is(review.public_team('no-such-team'), null, 't_an_unknown_team_has_no_page');

-- --- it comes down again ----------------------------------------------------
select review.decide(array[(select id from pid where f = 'IMG_2.JPG')], 'rejected', 'blurry', null);
select is((select count(*)::int from review.public_unwanted()), 1, 't_a_rejected_photo_must_come_down');
select is(review.clear_public(array(select id from review.public_unwanted())), 1, 't_and_is_cleared');
select is(jsonb_array_length(review.public_team('cazenovia-chiefs') -> 'albums' -> 0 -> 'photos'), 1, 't_the_page_now_shows_one');
select review.set_team_visibility((select id from review.teams where slug = 'cazenovia-chiefs'), 'private');
select is((select count(*)::int from review.public_unwanted()), 1, 't_making_a_team_private_takes_its_photos_down');
select is(review.public_team('cazenovia-chiefs'), null, 't_a_private_team_has_no_public_page');
select is((select count(*)::int from review.public_teams()), 0, 't_and_is_not_listed');
select review.set_team_visibility((select id from review.teams where slug = 'cazenovia-chiefs'), 'public');
select is((select count(*)::int from review.public_unwanted()), 0, 't_public_again_and_the_approved_photo_still_qualifies');
-- moving a photo out of the team's folder takes it down (a moved photo is also back to waiting)
select review.move_photos(array[(select id from pid where f = 'IMG_1.JPG')], (select review.new_folder_from_photos(array[(select id from pid where f = 'IMG_3.JPG')], 'Other game', 'Lacrosse')));
select is((select count(*)::int from review.public_unwanted()), 1, 't_a_moved_photo_comes_down');

select * from finish();
rollback;
