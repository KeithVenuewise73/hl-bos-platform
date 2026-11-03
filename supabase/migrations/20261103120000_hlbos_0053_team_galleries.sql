-- ===========================================================================
-- 0053_team_galleries — team galleries, online
--
-- The ONLINE copy of JerseySort's team galleries: a private gallery per team
-- or group, opened with a link and a team password, showing only the games
-- the photographer assigned to it. JerseySort on the photographer's computer
-- stays the source of truth; "Publish online" sends this database a copy of
-- each gallery (its games, web-size photos and the one cover photo per game
-- the photographer picked), and the `team-gallery` Edge Function serves it to
-- visitors and to the 5starsportsmedia.com galleries pages.
-- WRITTEN AND TESTED, NOT APPLIED to any project.
--
-- ---------------------------------------------------------------------------
-- WHOSE DATA THIS IS
-- ---------------------------------------------------------------------------
--
-- Photographs of athletes, most of them minors. So:
--
--   * NOTHING here is reachable from the web directly. The schema is not
--     API-exposed (config.toml [api] schemas = ["public"]), anon and
--     authenticated have no privilege on it at all, RLS is enabled AND forced
--     on every table with no policy, and every function is executable by the
--     service role only. The only door is the team-gallery Edge Function,
--     which checks the team password before it hands out any photo, as a
--     signed URL that expires.
--   * Photo files live in a PRIVATE bucket. A photo row's storage paths are
--     pinned by CHECK to <gallery>/<game>/<photo>-web.jpg and -thumb.jpg, and
--     the photo's (game, gallery) pair is a composite foreign key, so a row
--     can never point at another gallery's files.
--   * The only public images are the per-game COVER photos the photographer
--     chose to show on the website (a public bucket), and a cover must be one
--     of that game's own photos.
--   * The team password is stored as the scrypt hash JerseySort made; the
--     password itself never leaves the photographer's computer.
--
-- Single publisher today (the photographer's JerseySort, authenticated to
-- the Edge Function by a publisher key held in Vault). When galleries are
-- offered to other organizations, a tenant_id joins these tables; that is a
-- later, separate migration.
--
-- rollback:
--   delete from storage.objects where bucket_id in ('gallery-photos','gallery-covers');
--   delete from storage.buckets where id in ('gallery-photos','gallery-covers');
--   drop schema if exists gallery cascade;
-- ===========================================================================

create schema if not exists gallery;
comment on schema gallery is
  'HL-BOS: team galleries (online copy). NOT API-exposed; service role only, via the team-gallery Edge Function.';
revoke all on schema gallery from public, anon, authenticated;
grant usage on schema gallery to service_role;
alter default privileges in schema gallery revoke all on tables from public, anon, authenticated;
alter default privileges in schema gallery revoke all on functions from public, anon, authenticated;

-- --- Tables -----------------------------------------------------------------

create table if not exists gallery.galleries (
  id            uuid primary key,
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  link_token    text not null unique check (link_token ~ '^[A-Za-z0-9_-]{16,64}$'),
  -- scrypt$<salt b64>$<hash b64>, exactly as JerseySort hashes it.
  password_hash text not null
                check (password_hash ~ '^scrypt\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$'),
  brand         text not null check (length(brand) between 1 and 120),
  group_name    text check (group_name is null or length(group_name) between 1 and 120),
  name          text not null check (length(name) between 1 and 120),
  active        boolean not null default true,
  published_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists gallery.games (
  id          uuid primary key,
  gallery_id  uuid not null references gallery.galleries(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 160),
  title       text not null check (length(title) between 1 and 200),
  sport       text check (sport is null or length(sport) <= 60),
  opponent    text check (opponent is null or length(opponent) <= 120),
  location    text check (location is null or length(location) <= 200),
  event_date  date not null,
  -- The public cover: <game>/<photo>.jpg in the gallery-covers bucket, and the
  -- photo must be one of this game's own (enforced by publish_game).
  cover_path  text check (cover_path is null
                          or cover_path = id::text || '/' || split_part(cover_path, '/', 2)
                             and split_part(cover_path, '/', 2) ~ '^[0-9a-f-]{36}\.jpg$'),
  photo_count integer not null default 0 check (photo_count >= 0),
  updated_at  timestamptz not null default now(),
  unique (gallery_id, slug),
  unique (id, gallery_id)
);
create index if not exists games_gallery_date on gallery.games (gallery_id, event_date desc);

create table if not exists gallery.photos (
  id          uuid primary key,
  game_id     uuid not null,
  gallery_id  uuid not null,
  filename    text not null check (length(filename) between 1 and 200),
  captured_at timestamptz,
  width       integer check (width is null or width > 0),
  height      integer check (height is null or height > 0),
  web_bytes   bigint not null check (web_bytes > 0),
  position    integer not null default 0,
  web_path    text not null,
  thumb_path  text not null,
  foreign key (game_id, gallery_id) references gallery.games (id, gallery_id) on delete cascade,
  check (web_path   = gallery_id::text || '/' || game_id::text || '/' || id::text || '-web.jpg'),
  check (thumb_path = gallery_id::text || '/' || game_id::text || '/' || id::text || '-thumb.jpg')
);
create index if not exists photos_game_position on gallery.photos (game_id, position, captured_at);

-- Wrong team passwords, for the guessing throttle (kept 1 day).
create table if not exists gallery.unlock_failures (
  id          bigint generated always as identity primary key,
  gallery_id  uuid not null references gallery.galleries(id) on delete cascade,
  at          timestamptz not null default now()
);
create index if not exists unlock_failures_gallery_at on gallery.unlock_failures (gallery_id, at);

do $$
declare t text;
begin
  foreach t in array array['galleries','games','photos','unlock_failures'] loop
    execute format('alter table gallery.%I enable row level security', t);
    execute format('alter table gallery.%I force row level security', t);
    execute format('revoke all on gallery.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on gallery.%I to service_role', t);
  end loop;
end $$;
-- No policies on purpose: RLS with no policy admits nobody but a role that
-- bypasses it (the service role, inside the Edge Function).

-- --- Publishing (the photographer's JerseySort, through the Edge Function) ---

-- Create or update a gallery. A new link token or password hash takes effect
-- at once: visitors' access tokens are bound to the hash (see the function).
create or replace function gallery.publish_gallery(p jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  insert into gallery.galleries as g
    (id, slug, link_token, password_hash, brand, group_name, name, active, updated_at)
  values (
    (p->>'id')::uuid, p->>'slug', p->>'link_token', p->>'password_hash', p->>'brand',
    nullif(p->>'group_name', ''), p->>'name', coalesce((p->>'active')::boolean, true), now())
  on conflict (id) do update set
    slug = excluded.slug, link_token = excluded.link_token,
    password_hash = excluded.password_hash, brand = excluded.brand,
    group_name = excluded.group_name, name = excluded.name, active = excluded.active,
    updated_at = now();
end $$;

-- Create or update one game and make its photos EXACTLY p_photos. Returns the
-- storage paths no longer referenced (photos dropped, an old cover), for the
-- Edge Function to delete. A cover must be one of the game's own photos.
create or replace function gallery.publish_game(p_gallery uuid, p jsonb, p_photos jsonb)
returns text[] language plpgsql set search_path = '' as $$
declare
  v_game  uuid := (p->>'id')::uuid;
  v_cover uuid := nullif(p->>'cover_photo_id', '')::uuid;
  v_old_cover text;
  v_removed text[] := '{}';
begin
  if not exists (select 1 from gallery.galleries where id = p_gallery) then
    raise exception 'gallery % is not published', p_gallery using errcode = 'P0002';
  end if;
  if exists (select 1 from gallery.games where id = v_game and gallery_id <> p_gallery) then
    raise exception 'game % belongs to another gallery', v_game using errcode = '42501';
  end if;
  if v_cover is not null and not exists (
       select 1 from jsonb_array_elements(p_photos) e where (e->>'id')::uuid = v_cover) then
    raise exception 'the cover must be one of this game''s photos' using errcode = '22023';
  end if;
  select cover_path into v_old_cover from gallery.games where id = v_game;

  insert into gallery.games as gm
    (id, gallery_id, slug, title, sport, opponent, location, event_date, cover_path, updated_at)
  values (v_game, p_gallery, p->>'slug', p->>'title', nullif(p->>'sport', ''),
          nullif(p->>'opponent', ''), nullif(p->>'location', ''), (p->>'event_date')::date,
          case when v_cover is null then null else v_game::text || '/' || v_cover::text || '.jpg' end,
          now())
  on conflict (id) do update set
    slug = excluded.slug, title = excluded.title, sport = excluded.sport,
    opponent = excluded.opponent, location = excluded.location,
    event_date = excluded.event_date, cover_path = excluded.cover_path, updated_at = now();

  select coalesce(array_agg(x), '{}') into v_removed from (
    select unnest(array[web_path, thumb_path]) as x from gallery.photos
     where game_id = v_game
       and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_photos) e)
  ) gone;
  delete from gallery.photos
   where game_id = v_game
     and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_photos) e);

  insert into gallery.photos
    (id, game_id, gallery_id, filename, captured_at, width, height, web_bytes, position,
     web_path, thumb_path)
  select (e.value->>'id')::uuid, v_game, p_gallery, e.value->>'filename',
         nullif(e.value->>'captured_at', '')::timestamptz,
         nullif(e.value->>'width', '')::integer, nullif(e.value->>'height', '')::integer,
         (e.value->>'web_bytes')::bigint, e.ord::integer,
         p_gallery::text || '/' || v_game::text || '/' || (e.value->>'id') || '-web.jpg',
         p_gallery::text || '/' || v_game::text || '/' || (e.value->>'id') || '-thumb.jpg'
    from jsonb_array_elements(p_photos) with ordinality as e(value, ord)
  on conflict (id) do update set
    filename = excluded.filename, captured_at = excluded.captured_at,
    width = excluded.width, height = excluded.height, web_bytes = excluded.web_bytes,
    position = excluded.position;

  update gallery.games
     set photo_count = (select count(*) from gallery.photos where game_id = v_game)
   where id = v_game;

  if v_old_cover is not null
     and v_old_cover is distinct from (select cover_path from gallery.games where id = v_game) then
    v_removed := v_removed || ('cover:' || v_old_cover);
  end if;
  return v_removed;
end $$;

-- Remove games no longer in the gallery (unticked). Returns every storage
-- path they held ('cover:' marks the public bucket), for deletion.
create or replace function gallery.remove_games_except(p_gallery uuid, p_keep uuid[])
returns text[] language plpgsql set search_path = '' as $$
declare v_paths text[];
begin
  select coalesce(array_agg(x), '{}') into v_paths from (
    select unnest(array[p.web_path, p.thumb_path]) as x
      from gallery.photos p join gallery.games g on g.id = p.game_id
     where g.gallery_id = p_gallery and not (g.id = any(coalesce(p_keep, '{}')))
    union all
    select 'cover:' || cover_path from gallery.games
     where gallery_id = p_gallery and cover_path is not null
       and not (id = any(coalesce(p_keep, '{}')))
  ) gone;
  delete from gallery.games where gallery_id = p_gallery and not (id = any(coalesce(p_keep, '{}')));
  return v_paths;
end $$;

-- Remove a whole gallery (deleted in JerseySort). Returns its storage paths.
create or replace function gallery.remove_gallery(p_gallery uuid)
returns text[] language plpgsql set search_path = '' as $$
declare v_paths text[];
begin
  v_paths := gallery.remove_games_except(p_gallery, '{}');
  delete from gallery.galleries where id = p_gallery;
  return v_paths;
end $$;

-- --- Visitors (through the Edge Function, after the password check) -----------

-- The ACTIVE gallery behind a link, with the hash to check the password
-- against. No row: no such link, or switched off.
create or replace function gallery.gallery_for_link(p_link text)
returns table (id uuid, slug text, brand text, group_name text, name text, password_hash text)
language sql stable set search_path = '' as $$
  select g.id, g.slug, g.brand, g.group_name, g.name, g.password_hash
    from gallery.galleries g
   where p_link ~ '^[A-Za-z0-9_-]{16,64}$' and g.link_token = p_link and g.active
$$;

create or replace function gallery.visitor_games(p_gallery uuid)
returns table (id uuid, slug text, title text, sport text, opponent text, location text,
               event_date date, photo_count integer, first_thumb text)
language sql stable set search_path = '' as $$
  select gm.id, gm.slug, gm.title, gm.sport, gm.opponent, gm.location, gm.event_date,
         gm.photo_count,
         (select p.thumb_path from gallery.photos p where p.game_id = gm.id
           order by p.position, p.captured_at limit 1)
    from gallery.games gm
    join gallery.galleries g on g.id = gm.gallery_id and g.active
   where gm.gallery_id = p_gallery
   order by gm.event_date desc, gm.title
$$;

create or replace function gallery.visitor_photos(p_gallery uuid, p_game uuid)
returns table (id uuid, filename text, captured_at timestamptz, width integer, height integer,
               web_path text, thumb_path text)
language sql stable set search_path = '' as $$
  select p.id, p.filename, p.captured_at, p.width, p.height, p.web_path, p.thumb_path
    from gallery.photos p
    join gallery.galleries g on g.id = p.gallery_id and g.active
   where p.gallery_id = p_gallery and p.game_id = p_game
   order by p.position, p.captured_at, p.filename
$$;

-- What the website may show publicly: active galleries' games, with the cover
-- the photographer chose (or none). No photo paths, no password hashes.
create or replace function gallery.public_listing()
returns table (gallery_slug text, brand text, group_name text, gallery_name text,
               link_token text, game_slug text, title text, sport text, opponent text,
               location text, event_date date, photo_count integer, cover_path text)
language sql stable set search_path = '' as $$
  select g.slug, g.brand, g.group_name, g.name, g.link_token, gm.slug, gm.title, gm.sport,
         gm.opponent, gm.location, gm.event_date, gm.photo_count, gm.cover_path
    from gallery.galleries g join gallery.games gm on gm.gallery_id = g.id
   where g.active
   order by g.group_name nulls last, g.name, gm.event_date desc
$$;

-- --- The guessing throttle ------------------------------------------------------

create or replace function gallery.record_unlock_failure(p_gallery uuid)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  delete from gallery.unlock_failures where at < now() - interval '1 day';
  insert into gallery.unlock_failures (gallery_id) values (p_gallery);
  select count(*) into n from gallery.unlock_failures
   where gallery_id = p_gallery and at > now() - interval '15 minutes';
  return n;
end $$;

create or replace function gallery.recent_unlock_failures(p_gallery uuid)
returns integer language sql stable set search_path = '' as $$
  select count(*)::integer from gallery.unlock_failures
   where gallery_id = p_gallery and at > now() - interval '15 minutes'
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'gallery.publish_gallery(jsonb)',
    'gallery.publish_game(uuid, jsonb, jsonb)',
    'gallery.remove_games_except(uuid, uuid[])',
    'gallery.remove_gallery(uuid)',
    'gallery.gallery_for_link(text)',
    'gallery.visitor_games(uuid)',
    'gallery.visitor_photos(uuid, uuid)',
    'gallery.public_listing()',
    'gallery.record_unlock_failure(uuid)',
    'gallery.recent_unlock_failures(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- --- Storage --------------------------------------------------------------------
--
--   gallery-photos  PRIVATE  <gallery>/<game>/<photo>-web.jpg (2400 px) and -thumb.jpg
--   gallery-covers  PUBLIC   <game>/<photo>.jpg — only the covers chosen for the website
--
-- No storage policy admits anon or authenticated to gallery-photos: only the
-- service role reads or writes it, and visitors get expiring signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('gallery-photos', 'gallery-photos', false, 15728640, array['image/jpeg']),
  ('gallery-covers', 'gallery-covers', true,  5242880,  array['image/jpeg'])
on conflict (id) do nothing;
