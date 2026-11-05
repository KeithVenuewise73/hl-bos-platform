-- Team galleries (0053 + 0054): the refusals, probed on the live database.
-- Everything runs inside one block that ends by RAISING, so the whole thing
-- is rolled back and nothing is left behind; the result is the message of
-- that final exception. Expected:
--   PROBE anon_reads=refused web_runs=refused foreign_path=refused
--         foreign_cover=refused takeover=refused bad_fingerprint=refused
--         rows_left=2
-- (rows_left counts the probe's own two galleries INSIDE the block; afterwards
-- `select count(*) from gallery.galleries where brand = 'probe'` must be 0.)
do $probe$
declare
  r text := 'PROBE';
  g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid();
  gm uuid := gen_random_uuid(); p1 uuid := gen_random_uuid();
  ok boolean;
begin
  perform gallery.publish_gallery(jsonb_build_object('id', g1, 'slug', 'probe-a-' || left(g1::text, 8),
    'link_token', 'ProbeLinkToken' || left(replace(g1::text, '-', ''), 10), 'password_hash', 'scrypt$c2FsdA==$aGFzaA==',
    'brand', 'probe', 'name', 'A'));
  perform gallery.publish_gallery(jsonb_build_object('id', g2, 'slug', 'probe-b-' || left(g2::text, 8),
    'link_token', 'ProbeLinkToken' || left(replace(g2::text, '-', ''), 10), 'password_hash', 'scrypt$c2FsdA==$aGFzaA==',
    'brand', 'probe', 'name', 'B'));
  perform gallery.publish_game(g1, jsonb_build_object('id', gm, 'slug', 'g', 'title', 'g', 'event_date', '2026-10-24'),
    jsonb_build_array(jsonb_build_object('id', p1, 'filename', 'a.jpg', 'web_bytes', 1)));

  -- The web roles see nothing.
  begin
    set local role anon;
    perform 1 from gallery.galleries limit 1;
    r := r || ' anon_reads=ALLOWED';
  exception when insufficient_privilege then r := r || ' anon_reads=refused';
  end;
  reset role;
  begin
    set local role authenticated;
    perform gallery.public_listing();
    r := r || ' web_runs=ALLOWED';
  exception when insufficient_privilege then r := r || ' web_runs=refused';
  end;
  reset role;

  -- A photo row cannot point at another gallery's files.
  begin
    insert into gallery.photos (id, game_id, gallery_id, filename, web_bytes, web_path, thumb_path)
    values (gen_random_uuid(), gm, g1, 'x.jpg', 1, g2 || '/' || gm || '/x-web.jpg', g2 || '/' || gm || '/x-thumb.jpg');
    r := r || ' foreign_path=ALLOWED';
  exception when check_violation then r := r || ' foreign_path=refused';
  end;
  -- A cover must be one of the game's own photos.
  begin
    perform gallery.publish_game(g1, jsonb_build_object('id', gm, 'slug', 'g', 'title', 'g', 'event_date', '2026-10-24',
      'cover_photo_id', gen_random_uuid()), jsonb_build_array(jsonb_build_object('id', p1, 'filename', 'a.jpg', 'web_bytes', 1)));
    r := r || ' foreign_cover=ALLOWED';
  exception when invalid_parameter_value then r := r || ' foreign_cover=refused';
  end;
  -- One gallery cannot take over another's game.
  begin
    perform gallery.publish_game(g2, jsonb_build_object('id', gm, 'slug', 'g', 'title', 'g', 'event_date', '2026-10-24'), '[]'::jsonb);
    r := r || ' takeover=ALLOWED';
  exception when insufficient_privilege then r := r || ' takeover=refused';
  end;
  -- Only a fingerprint registers a publisher.
  begin
    perform gallery.register_publisher('not-a-fingerprint');
    r := r || ' bad_fingerprint=ALLOWED';
  exception when invalid_parameter_value then r := r || ' bad_fingerprint=refused';
  end;

  r := r || ' rows_left=' || (select count(*) from gallery.galleries where brand = 'probe');
  raise exception '%', r;  -- undoes everything above
end
$probe$;
