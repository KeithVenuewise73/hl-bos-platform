-- ===========================================================================
-- Team galleries online — migration 0053.
--
-- The claims this suite makes structural rather than aspirational:
--
--   1. Nothing is reachable from the web directly: anon and authenticated
--      have no privilege on the schema, its tables or its functions; RLS is
--      forced with no policy; the photo bucket is private.
--   2. A photo can never point at another gallery's files: its storage
--      paths are pinned to its own gallery and game, and its (game, gallery)
--      pair is a foreign key.
--   3. The public cover is one of the game's own photos, or nothing.
--   4. Publishing is exact: a republished game holds exactly the photos
--      sent, and the files of the ones dropped are handed back for deletion.
--   5. A switched-off gallery opens nothing and is listed nowhere.
-- ===========================================================================
begin;
select plan(43);

-- ---------------------------------------------------------------------------
-- 1. Nobody but the service role
-- ---------------------------------------------------------------------------

select has_schema('gallery', 't_schema');
select has_table('gallery', t, 't_table_' || t)
  from unnest(array['galleries','games','photos','unlock_failures']) t;
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'gallery' and c.relkind = 'r'
      and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 't_rls_enabled_and_forced_on_every_table');
select is(
  (select count(*)::int from pg_policies where schemaname = 'gallery'),
  0, 't_no_policy_admits_anyone');
select ok(not has_schema_privilege('anon', 'gallery', 'usage'), 't_anon_no_schema');
select ok(not has_schema_privilege('authenticated', 'gallery', 'usage'), 't_authenticated_no_schema');
select ok(has_schema_privilege('service_role', 'gallery', 'usage'), 't_service_role_schema');
select is(
  (select count(*)::int from unnest(array['galleries','games','photos','unlock_failures']) t,
          unnest(array['anon','authenticated']) r
    where has_table_privilege(r, 'gallery.' || t, 'select')
       or has_table_privilege(r, 'gallery.' || t, 'insert')
       or has_table_privilege(r, 'gallery.' || t, 'update')
       or has_table_privilege(r, 'gallery.' || t, 'delete')),
  0, 't_anon_and_authenticated_touch_no_table');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'gallery'
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_run_no_function');
-- Except reset_publisher (0054): only the approval-gated workflow may reset
-- who publishes, never the Edge Function.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'gallery' and p.proname <> 'reset_publisher'
      and not has_function_privilege('service_role', p.oid, 'execute')),
  0, 't_service_role_runs_every_function');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'gallery' and p.prosecdef),
  0, 't_no_security_definer_function');
select ok(not (select public from storage.buckets where id = 'gallery-photos'),
  't_photo_bucket_private');
select ok((select public from storage.buckets where id = 'gallery-covers'),
  't_cover_bucket_public');

-- ---------------------------------------------------------------------------
-- Publish a Varsity gallery with one game and two photos (A is the cover)
-- ---------------------------------------------------------------------------

select lives_ok($$ select gallery.publish_gallery(jsonb_build_object(
  'id', '11111111-1111-1111-1111-111111111111', 'slug', 'cazenovia-hockey-varsity',
  'link_token', 'VarsityLinkToken0001', 'password_hash', 'scrypt$c2FsdA==$aGFzaA==',
  'brand', '5 Star Sports Media', 'group_name', 'Cazenovia Hockey', 'name', 'Varsity')) $$,
  't_publish_gallery');
select lives_ok($$ select gallery.publish_game('11111111-1111-1111-1111-111111111111',
  jsonb_build_object('id', '22222222-2222-2222-2222-222222222222',
    'slug', '2026-10-24-varsity-vs-wheatfield', 'title', 'Varsity vs Wheatfield',
    'sport', 'Hockey', 'opponent', 'Wheatfield', 'event_date', '2026-10-24',
    'cover_photo_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  jsonb_build_array(
    jsonb_build_object('id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'filename', 'IMG_0001.JPG',
                       'web_bytes', 812000, 'width', 2400, 'height', 1600),
    jsonb_build_object('id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'filename', 'IMG_0002.JPG',
                       'web_bytes', 790000))) $$,
  't_publish_game_with_two_photos');

select is((select photo_count from gallery.games where id = '22222222-2222-2222-2222-222222222222'),
  2, 't_photo_count_kept');
select is((select cover_path from gallery.games where id = '22222222-2222-2222-2222-222222222222'),
  '22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
  't_cover_path_is_the_chosen_photo');
select is((select web_path from gallery.photos where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-web.jpg',
  't_photo_paths_built_from_its_own_ids');

-- ---------------------------------------------------------------------------
-- 2. A photo cannot point at another gallery's files
-- ---------------------------------------------------------------------------

select gallery.publish_gallery(jsonb_build_object(
  'id', '33333333-3333-3333-3333-333333333333', 'slug', 'cazenovia-hockey-jv',
  'link_token', 'JvLinkToken000000001', 'password_hash', 'scrypt$c2FsdA==$aGFzaA==',
  'brand', '5 Star Sports Media', 'group_name', 'Cazenovia Hockey', 'name', 'JV'));

select throws_ok($$ insert into gallery.photos (id, game_id, gallery_id, filename, web_bytes, web_path, thumb_path)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333', 'x.jpg', 10,
          '33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/cccccccc-cccc-cccc-cccc-cccccccccccc-web.jpg',
          '33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/cccccccc-cccc-cccc-cccc-cccccccccccc-thumb.jpg') $$,
  '23503', null, 't_photo_cannot_join_a_game_of_another_gallery');
select throws_ok($$ insert into gallery.photos (id, game_id, gallery_id, filename, web_bytes, web_path, thumb_path)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111', 'x.jpg', 10,
          '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-web.jpg',
          '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/cccccccc-cccc-cccc-cccc-cccccccccccc-thumb.jpg') $$,
  '23514', null, 't_photo_cannot_point_at_another_photos_file');
select throws_ok($$ select gallery.publish_game('33333333-3333-3333-3333-333333333333',
  jsonb_build_object('id', '22222222-2222-2222-2222-222222222222', 'slug', 'x', 'title', 'x',
                     'event_date', '2026-10-24'), '[]'::jsonb) $$,
  '42501', null, 't_one_gallery_cannot_take_over_anothers_game');

-- ---------------------------------------------------------------------------
-- 3. The cover is one of the game's own photos, or nothing
-- ---------------------------------------------------------------------------

select throws_ok($$ select gallery.publish_game('11111111-1111-1111-1111-111111111111',
  jsonb_build_object('id', '22222222-2222-2222-2222-222222222222', 'slug', '2026-10-24-varsity-vs-wheatfield',
    'title', 'Varsity vs Wheatfield', 'event_date', '2026-10-24',
    'cover_photo_id', 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'filename', 'IMG_0001.JPG', 'web_bytes', 812000))) $$,
  '22023', null, 't_cover_must_be_one_of_the_games_photos');
select throws_ok($$ update gallery.games set cover_path = '99999999-9999-9999-9999-999999999999/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'
  where id = '22222222-2222-2222-2222-222222222222' $$,
  '23514', null, 't_cover_path_must_be_under_its_own_game');

-- ---------------------------------------------------------------------------
-- Visitors
-- ---------------------------------------------------------------------------

select is((select name from gallery.gallery_for_link('VarsityLinkToken0001')), 'Varsity',
  't_link_opens_its_gallery');
select is((select count(*)::int from gallery.gallery_for_link('not a link!')), 0,
  't_a_malformed_link_opens_nothing');
select is((select count(*)::int from gallery.gallery_for_link('NoSuchLinkToken00001')), 0,
  't_an_unknown_link_opens_nothing');
select is((select count(*)::int from gallery.visitor_games('11111111-1111-1111-1111-111111111111')), 1,
  't_visitor_sees_the_one_game');
select is((select count(*)::int from gallery.visitor_games('33333333-3333-3333-3333-333333333333')), 0,
  't_jv_sees_none_of_varsitys_games');
select is((select count(*)::int from gallery.visitor_photos('33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222')), 0, 't_jv_cannot_list_varsitys_photos_by_id');
select is((select array_agg(filename order by filename) from gallery.visitor_photos(
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  array['IMG_0001.JPG','IMG_0002.JPG'], 't_visitor_sees_the_games_photos');
select is((select count(*)::int from gallery.public_listing() l where l.cover_path is not null), 1,
  't_listing_shows_the_chosen_cover');
select ok(not exists (select 1 from information_schema.routines r
                       join information_schema.parameters x on x.specific_name = r.specific_name
                      where r.routine_schema = 'gallery' and r.routine_name = 'public_listing'
                        and x.parameter_name in ('password_hash', 'web_path', 'thumb_path')),
  't_listing_carries_no_hash_and_no_private_paths');

-- ---------------------------------------------------------------------------
-- 4. Publishing is exact
-- ---------------------------------------------------------------------------

select is(gallery.publish_game('11111111-1111-1111-1111-111111111111',
  jsonb_build_object('id', '22222222-2222-2222-2222-222222222222',
    'slug', '2026-10-24-varsity-vs-wheatfield', 'title', 'Varsity vs Wheatfield',
    'event_date', '2026-10-24', 'cover_photo_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  jsonb_build_array(jsonb_build_object('id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'filename', 'IMG_0002.JPG', 'web_bytes', 790000))),
  array['11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-web.jpg',
        '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-thumb.jpg',
        'cover:22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'],
  't_republish_hands_back_the_dropped_photo_and_old_cover');
select is((select photo_count from gallery.games where id = '22222222-2222-2222-2222-222222222222'),
  1, 't_republished_game_holds_exactly_what_was_sent');
select is(cardinality(gallery.remove_games_except('11111111-1111-1111-1111-111111111111',
  array['22222222-2222-2222-2222-222222222222']::uuid[])), 0, 't_kept_games_are_kept');

-- ---------------------------------------------------------------------------
-- 5. Switched off: opens nothing, listed nowhere
-- ---------------------------------------------------------------------------

select gallery.publish_gallery(jsonb_build_object(
  'id', '11111111-1111-1111-1111-111111111111', 'slug', 'cazenovia-hockey-varsity',
  'link_token', 'VarsityLinkToken0001', 'password_hash', 'scrypt$c2FsdA==$aGFzaA==',
  'brand', '5 Star Sports Media', 'group_name', 'Cazenovia Hockey', 'name', 'Varsity',
  'active', false));
select is((select count(*)::int from gallery.gallery_for_link('VarsityLinkToken0001')), 0,
  't_switched_off_link_opens_nothing');
select is((select count(*)::int from gallery.visitor_photos('11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222')), 0, 't_switched_off_shows_no_photos');
select is((select count(*)::int from gallery.public_listing() l
            where l.gallery_slug = 'cazenovia-hockey-varsity'), 0, 't_switched_off_is_not_listed');

-- Throttle and removal.
select is((select gallery.record_unlock_failure('33333333-3333-3333-3333-333333333333')
             from generate_series(1, 3) order by 1 desc limit 1), 3, 't_failures_are_counted');
select is(cardinality(gallery.remove_gallery('11111111-1111-1111-1111-111111111111')), 3,
  't_removing_a_gallery_hands_back_every_file');

select * from finish();
rollback;
