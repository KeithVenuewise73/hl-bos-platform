-- ===========================================================================
-- Review delete folder — migration 0058: only an EMPTY folder can be deleted.
--
--   1. The function is service-role only.
--   2. An empty folder is deleted (and its send records with it).
--   3. A folder with any photo in it, in any state, is refused, and nothing is lost.
--   4. An unknown folder is a plain refusal.
-- ===========================================================================
begin;
select plan(10);

select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname = 'delete_empty_folder'
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_cannot_delete_folders');
select ok(has_function_privilege('service_role', 'review.delete_empty_folder(uuid)', 'execute'),
  't_the_service_role_can');

-- fixture: a folder with two photos, and an empty duplicate of it
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
insert into ctx select 'b', batch_id::text from review.create_batch('Varsity vs Wheatfield', 'Hockey', '2026-10-24', 'x', 2, 0,
  array[repeat('1', 64), repeat('2', 64)]);
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b') || '/' || repeat(n::text, 64) || '-' || kind || '.jpg'
  from generate_series(1, 2) n, (values ('web'), ('thumb')) k(kind);
select review.commit_photos((select v from ctx where k = 'b')::uuid, jsonb_build_array(
  jsonb_build_object('hash', repeat('1', 64), 'filename', 'IMG_1.JPG', 'taken_at', '2026-10-24T10:00:00', 'web_bytes', 10),
  jsonb_build_object('hash', repeat('2', 64), 'filename', 'IMG_2.JPG', 'taken_at', '2026-10-24T10:05:00', 'web_bytes', 10)));
insert into ctx select 'full', id::text from review.folders where name = 'Varsity vs Wheatfield';
insert into review.folders (name, sport, event_date) values ('Varsity vs Wheatfield (copy)', 'Hockey', '2026-10-24');
insert into ctx select 'empty', id::text from review.folders where name = 'Varsity vs Wheatfield (copy)';
insert into review.batches (folder_id, source_folder, photo_count, video_count)
  values ((select v from ctx where k = 'empty')::uuid, 'x', 0, 0);

-- a folder with photos is refused, whatever state they are in
select throws_ok($$select review.delete_empty_folder((select v from ctx where k = 'full')::uuid)$$,
  '22023', null, 't_a_folder_with_photos_cannot_be_deleted');
select review.decide(array(select id from review.photos), 'rejected', 'blurry', null);
select throws_ok($$select review.delete_empty_folder((select v from ctx where k = 'full')::uuid)$$,
  '22023', null, 't_not_even_when_they_are_all_rejected');
select is((select count(*)::int from review.photos), 2, 't_and_no_photo_was_lost');
select ok(exists (select 1 from review.folders where id = (select v from ctx where k = 'full')::uuid), 't_the_folder_is_still_there');

-- the empty duplicate is deleted, with its send record
select lives_ok($$select review.delete_empty_folder((select v from ctx where k = 'empty')::uuid)$$, 't_an_empty_folder_is_deleted');
select ok(not exists (select 1 from review.folders where id = (select v from ctx where k = 'empty')::uuid), 't_it_is_gone');
select is((select count(*)::int from review.batches where folder_id = (select v from ctx where k = 'empty')::uuid), 0, 't_and_so_is_its_send_record');

-- an unknown folder
select throws_ok($$select review.delete_empty_folder('00000000-0000-0000-0000-000000000000')$$,
  '22023', null, 't_an_unknown_folder_is_refused');

select * from finish();
rollback;
