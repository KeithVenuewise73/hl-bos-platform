-- ===========================================================================
-- Review social posting — migration 0058: post approved photos to Instagram / Facebook.
--
--   1. Locked down; no column can hold a login token.
--   2. An Instagram account needs its linked Facebook Page.
--   3. A post: only approved photos already on the public page, one game, 1-10 photos,
--      a caption, an account; Instagram's picture shapes are checked in words.
--   4. A target is 'published' only with the platform's own id; the post's status follows.
--   5. A request that never answered is failed with a warning, never retried.
-- ===========================================================================
begin;
select plan(35);

-- --- 1. Locked down ---------------------------------------------------------
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname like 'social\_%'
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_run_none_of_the_social_functions');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'review'::regnamespace
            and p.proname like 'social\_%' and not has_function_privilege('service_role', p.oid, 'execute')),
  0, 't_service_role_runs_all_of_them');
select is((select count(*)::int from pg_class c where c.relnamespace = 'review'::regnamespace
            and c.relname like 'social\_%' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity), 5,
  't_all_five_tables_have_row_level_security_forced');
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'review' and table_name like 'social\_%' and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0, 't_clients_have_no_privilege_on_them');
select is((select count(*)::int from information_schema.columns
            where table_schema = 'review' and table_name like 'social\_%'
              and (column_name ilike '%token%' and column_name <> 'token_secret_name' or column_name ilike '%secret%' and column_name <> 'token_secret_name')),
  0, 't_no_column_can_hold_a_login_token_only_the_name_of_the_secret');

-- --- 2. Accounts ------------------------------------------------------------
select throws_ok($$insert into review.social_accounts (platform, external_account_id, display_name, token_secret_name)
                   values ('instagram', '17841400000000001', '5Star IG', 'META_TOKEN')$$,
  '23514', null, 't_an_instagram_account_needs_its_linked_facebook_page');
select throws_ok($$insert into review.social_accounts (platform, external_account_id, display_name, token_secret_name)
                   values ('facebook_page', '100000000000001', 'FB', 'not a secret name')$$,
  '23514', null, 't_the_token_field_only_takes_a_secret_name');
insert into review.social_accounts (platform, external_account_id, display_name, facebook_page_id, token_secret_name)
values ('facebook_page', '100000000000001', '5Star Facebook', null, 'META_PAGE_TOKEN'),
       ('instagram', '17841400000000001', '5Star Instagram', '100000000000001', 'META_PAGE_TOKEN');
create temp table acc as select platform p, id from review.social_accounts;
grant all on acc to public;

-- --- fixture: two games, 4 photos in game 1 (3 approved+public, 1 waiting), 1 in game 2 --
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
insert into ctx select 'b1', batch_id::text from review.create_batch('Game one', 'Hockey', '2026-10-24', 'x', 4, 0,
  array[repeat('1', 64), repeat('2', 64), repeat('3', 64), repeat('4', 64)]);
insert into ctx select 'b2', batch_id::text from review.create_batch('Game two', 'Hockey', '2026-10-25', 'x', 1, 0, array[repeat('5', 64)]);
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b1') || '/' || repeat(n::text, 64) || '-' || kind || '.jpg'
  from generate_series(1, 4) n, (values ('web'), ('thumb')) k(kind);
insert into storage.objects (bucket_id, name)
select 'review-photos', (select v from ctx where k = 'b2') || '/' || repeat('5', 64) || '-' || kind || '.jpg'
  from (values ('web'), ('thumb')) k(kind);
select review.commit_photos((select v from ctx where k = 'b1')::uuid, jsonb_build_array(
  jsonb_build_object('hash', repeat('1', 64), 'filename', 'IMG_1.JPG', 'taken_at', '2026-10-24T10:00:00', 'width', 2400, 'height', 1600, 'web_bytes', 10),
  jsonb_build_object('hash', repeat('2', 64), 'filename', 'IMG_2.JPG', 'taken_at', '2026-10-24T10:01:00', 'width', 2400, 'height', 1600, 'web_bytes', 10),
  jsonb_build_object('hash', repeat('3', 64), 'filename', 'TALL_3.JPG', 'taken_at', '2026-10-24T10:02:00', 'width', 1000, 'height', 2400, 'web_bytes', 10),
  jsonb_build_object('hash', repeat('4', 64), 'filename', 'WAIT_4.JPG', 'taken_at', '2026-10-24T10:03:00', 'width', 2400, 'height', 1600, 'web_bytes', 10)));
select review.commit_photos((select v from ctx where k = 'b2')::uuid, jsonb_build_array(
  jsonb_build_object('hash', repeat('5', 64), 'filename', 'G2_5.JPG', 'taken_at', '2026-10-25T10:00:00', 'width', 2400, 'height', 1600, 'web_bytes', 10)));
create temp table pid as select filename f, id from review.photos;
grant all on pid to public;
select review.set_folder_team((select id from review.folders where name = 'Game one'), (select id from review.teams where slug = 'cazenovia-chiefs'));
select review.set_folder_team((select id from review.folders where name = 'Game two'), (select id from review.teams where slug = 'cazenovia-chiefs'));
select review.decide(array(select id from pid where f in ('IMG_1.JPG', 'IMG_2.JPG', 'TALL_3.JPG', 'G2_5.JPG')), 'approved', null, null);
select review.mark_public(array(select id from pid where f in ('IMG_1.JPG', 'IMG_2.JPG', 'TALL_3.JPG', 'G2_5.JPG')));

-- --- 3. Making a post -------------------------------------------------------
select lives_ok($$select review.social_create_post(
    array[(select id from pid where f = 'IMG_2.JPG'), (select id from pid where f = 'IMG_1.JPG')],
    '  Game one photos  ', array[(select id from acc where p = 'instagram'), (select id from acc where p = 'facebook_page')],
    '00000000-0000-0000-0000-000000000001')$$, 't_a_post_with_two_photos_and_two_accounts_is_recorded');
create temp table post as select id from review.social_posts;
grant all on post to public;
select is((select status from review.social_posts), 'approved', 't_it_is_approved_by_the_press_of_post_and_nothing_else');
select is((select caption from review.social_posts), 'Game one photos', 't_the_caption_is_trimmed');
select is((select string_agg(filename, ',' order by position) from review.social_post_photos), 'IMG_2.JPG,IMG_1.JPG', 't_the_photos_keep_the_order_the_owner_chose');
select is((select count(*)::int from review.social_targets where status = 'pending'), 2, 't_one_pending_target_per_account');
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'WAIT_4.JPG')], 'x', array[(select id from acc where p = 'facebook_page')], null)$$,
  '22023', 'only approved photos that are already on the public page can be posted', 't_a_waiting_photo_cannot_be_posted');
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'IMG_1.JPG'), (select id from pid where f = 'G2_5.JPG')], 'x', array[(select id from acc where p = 'facebook_page')], null)$$,
  '22023', 'post photos from one game at a time', 't_photos_from_two_games_cannot_be_mixed');
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'IMG_1.JPG'), (select id from pid where f = 'IMG_1.JPG')], 'x', array[(select id from acc where p = 'facebook_page')], null)$$,
  '22023', 'a photo can only be in a post once', 't_a_photo_cannot_be_in_a_post_twice');
select throws_ok($$select review.social_create_post(array[]::uuid[], 'x', array[(select id from acc where p = 'facebook_page')], null)$$,
  '22023', 'a post has 1 to 10 photos', 't_a_post_needs_a_photo');
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'IMG_1.JPG')], '   ', array[(select id from acc where p = 'facebook_page')], null)$$,
  '22023', 'a caption is 1 to 2,200 characters', 't_a_post_needs_a_caption');
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'IMG_1.JPG')], repeat('x', 2201), array[(select id from acc where p = 'facebook_page')], null)$$,
  '22023', 'a caption is 1 to 2,200 characters', 't_and_not_a_very_long_one');
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'IMG_1.JPG')], 'x', array[]::uuid[], null)$$,
  '22023', 'choose where to post', 't_a_post_needs_somewhere_to_go');
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'TALL_3.JPG')], 'x', array[(select id from acc where p = 'instagram')], null)$$,
  '22023', null, 't_instagram_refuses_a_too_tall_picture_in_words_before_anything_is_sent');
select lives_ok($$select review.social_create_post(array[(select id from pid where f = 'TALL_3.JPG')], 'x', array[(select id from acc where p = 'facebook_page')], '00000000-0000-0000-0000-000000000001')$$,
  't_but_facebook_takes_the_tall_one');
update review.social_accounts set status = 'disabled' where platform = 'facebook_page';
select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'IMG_1.JPG')], 'x', array[(select id from acc where p = 'facebook_page')], null)$$,
  '22023', 'one of those accounts is not set up or is switched off', 't_a_switched_off_account_cannot_be_used');
update review.social_accounts set status = 'active' where platform = 'facebook_page';

select throws_ok($$select review.social_create_post(array[(select id from pid where f = 'IMG_1.JPG')], 'x', array[(select id from acc where p = 'facebook_page')], null)$$,
  '23502', null, 't_a_post_with_no_approver_is_refused');

-- --- 4. Working through the targets ------------------------------------------
select is((select count(*)::int from review.social_claim_target((select id from post))), 1, 't_one_target_is_claimed_at_a_time');
select is((select count(*)::int from review.social_targets where post_id = (select id from post) and status = 'publishing'), 1, 't_and_is_now_publishing');
select is((select token_secret_name from review.social_claim_target((select id from post))), 'META_PAGE_TOKEN', 't_the_claim_gives_the_name_of_the_secret_never_a_token');
select is((select count(*)::int from review.social_claim_target((select id from post))), 0, 't_when_none_is_pending_nothing_is_claimed');
select throws_ok($$select review.social_finish_target((select id from review.social_targets where post_id = (select id from post) order by id limit 1), true, null, null, null)$$,
  '23514', null, 't_a_published_target_without_the_platforms_id_is_refused');
select is(review.social_finish_target((select id from review.social_targets where post_id = (select id from post) and status = 'publishing' order by id limit 1), true, '12345_67890', 'https://www.facebook.com/12345_67890', null),
  'publishing', 't_one_done_and_one_still_publishing_so_the_post_is_still_publishing');
select is(review.social_finish_target((select id from review.social_targets where post_id = (select id from post) and status = 'publishing' order by id limit 1), false, null, null, 'http_400: bad'),
  'partly_published', 't_one_published_and_one_failed_is_partly_published');
select is((select count(*)::int from review.social_already_posted(array[(select id from pid where f = 'IMG_1.JPG')])), 1, 't_the_owner_can_see_a_photo_was_already_posted');
select is((review.social_post_status((select id from post)) ->> 'status'), 'partly_published', 't_the_status_the_page_shows_agrees');

-- --- 5. An unanswered request ------------------------------------------------
select lives_ok($$select review.social_create_post(array[(select id from pid where f = 'G2_5.JPG')], 'two', array[(select id from acc where p = 'facebook_page')], '00000000-0000-0000-0000-000000000001')$$, 't_a_second_post');
select review.social_claim_target((select id from review.social_posts where caption = 'two'));
update review.social_targets set started_at = now() - interval '30 minutes' where status = 'publishing';
select is(review.social_fail_stale((select id from review.social_posts where caption = 'two'), 10), 1, 't_a_request_that_never_answered_is_marked_failed');
select ok((select error from review.social_targets t join review.social_posts p on p.id = t.post_id where p.caption = 'two') like '%may or may not be live%', 't_with_the_warning_to_check_the_account_and_is_not_retried');

select * from finish();
rollback;
