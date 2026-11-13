-- ===========================================================================
-- 0055_media_review — a private review area for photos before they go public
--
-- DateSort sends a date's photos here ("Send for review"). They wait, private,
-- until the OWNER approves them: quality checked, each photo under the right
-- folder. Approving only marks a photo approved; what visitors see is a later
-- step. WRITTEN AND TESTED, NOT APPLIED to any project.
--
-- The photos are of athletes, most of them minors, so the lock-down is the same
-- as the team galleries (0053):
--
--   * NOTHING here is reachable from the web directly. The schema is not
--     API-exposed, anon and authenticated have no privilege on it, RLS is
--     enabled AND forced on every table with no policy, and every function is
--     executable by the service role only. The one door is the media-review
--     Edge Function, which checks who is asking.
--   * Files live in a PRIVATE bucket (review-photos). A photo row's storage
--     paths are pinned by CHECK to <batch>/<fingerprint>-web.jpg and -thumb.jpg,
--     and a photo can only be recorded once both files really exist.
--   * The photos carry no camera details and no GPS location: DateSort strips
--     them before sending, and nothing here stores them.
--   * Who may review is decided in the Edge Function (the owner's sign-in), not
--     here. No email address is stored in this migration.
--
-- A photo is never stored twice: its fingerprint (SHA-256 of the original) is
-- unique, so sending the same date again adds only what is new.
--
-- The publisher is the photographer's DateSort. It makes a key on his computer
-- and registers only the key's SHA-256 fingerprint, once, during a one-time
-- CONNECT WINDOW that applying this migration opens (24 hours), exactly as 0054
-- does for the team galleries. Videos are a later, separate table.
--
-- rollback:
--   delete from storage.objects where bucket_id = 'review-photos';
--   delete from storage.buckets where id = 'review-photos';
--   drop schema if exists review cascade;
-- ===========================================================================

create schema if not exists review;
comment on schema review is
  'HL-BOS: private photo review. NOT API-exposed; service role only, via the media-review Edge Function.';
revoke all on schema review from public, anon, authenticated;
grant usage on schema review to service_role;
alter default privileges in schema review revoke all on tables from public, anon, authenticated;
alter default privileges in schema review revoke all on functions from public, anon, authenticated;

-- --- Tables -----------------------------------------------------------------

-- The teams photos can be filed under. A team's page is PUBLIC, because this is
-- media coverage of the team: the photos are meant to be seen. The owner can
-- still make one team private (team password). Nothing reaches a public page
-- until the owner has approved it.
create table if not exists review.teams (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  name        text not null unique check (length(name) between 1 and 120),
  visibility  text not null default 'public' check (visibility in ('private', 'public')),
  created_at  timestamptz not null default now()
);

insert into review.teams (slug, name) values
  ('west-seneca-high-school',  'West Seneca High School'),
  ('west-seneca-club-hockey',  'West Seneca Club Hockey'),
  ('cazenovia-chiefs',         'Cazenovia Chiefs'),
  ('cheektowaga-warriors',     'Cheektowaga Warriors')
on conflict (slug) do nothing;

-- A folder: one game or event, as the owner names it. Renaming it here never
-- touches the folder on the photographer's computer.
create table if not exists review.folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 200),
  sport       text check (sport is null or length(sport) <= 60),
  event_date  date not null,
  team_id     uuid references review.teams(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists folders_date on review.folders (event_date desc, name);

-- One "Send for review": where it first arrived, and what the photographer's
-- folder was called.
create table if not exists review.batches (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid not null references review.folders(id) on delete cascade,
  source_folder text not null check (length(source_folder) <= 300),
  photo_count   integer not null check (photo_count >= 0),
  video_count   integer not null check (video_count >= 0),
  created_at    timestamptz not null default now()
);

create table if not exists review.photos (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references review.batches(id) on delete cascade,
  folder_id      uuid not null references review.folders(id) on delete restrict,
  file_hash      text not null unique check (file_hash ~ '^[0-9a-f]{64}$'),
  filename       text not null check (length(filename) between 1 and 200),
  -- Wall-clock time the camera wrote; no time zone, never converted.
  taken_at       timestamp without time zone,
  date_estimated boolean not null default false,
  width          integer check (width is null or width > 0),
  height         integer check (height is null or height > 0),
  sharpness      real,
  brightness     real,
  -- Hints for the reviewer, never decisions.
  flags          text[] not null default '{}'
                 check (flags <@ array['soft', 'dark', 'bright', 'small']),
  web_bytes      bigint not null check (web_bytes > 0),
  web_path       text not null,
  thumb_path     text not null,
  status         text not null default 'waiting' check (status in ('waiting', 'approved', 'rejected')),
  reason         text check (reason is null or length(reason) <= 200),
  decided_by     uuid,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (web_path   = batch_id::text || '/' || file_hash || '-web.jpg'),
  check (thumb_path = batch_id::text || '/' || file_hash || '-thumb.jpg'),
  check ((status = 'waiting') = (decided_at is null))
);
create index if not exists photos_folder_status on review.photos (folder_id, status, taken_at);

-- One row: who the publisher is, and the connect window (as in 0054).
create table if not exists review.settings (
  id                     boolean primary key default true check (id),
  publisher_key_sha256   text check (publisher_key_sha256 is null
                                     or publisher_key_sha256 ~ '^[0-9a-f]{64}$'),
  publisher_connected_at timestamptz,
  connect_until          timestamptz
);
insert into review.settings (id, connect_until)
values (true, now() + interval '24 hours')
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['teams', 'folders', 'batches', 'photos', 'settings'] loop
    execute format('alter table review.%I enable row level security', t);
    execute format('alter table review.%I force row level security', t);
    execute format('revoke all on review.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on review.%I to service_role', t);
  end loop;
end $$;
-- No policies on purpose: RLS with no policy admits nobody but a role that
-- bypasses it (the service role, inside the Edge Function).

-- --- Connecting DateSort ----------------------------------------------------

create or replace function review.service_settings()
returns table (publisher_key_sha256 text)
language sql stable set search_path = '' as $$
  select s.publisher_key_sha256 from review.settings s where s.id
$$;

-- 'connected' (registered now, or already this fingerprint), 'taken' (another
-- computer), 'closed' (no connect window open).
create or replace function review.register_publisher(p_sha256 text)
returns text language plpgsql set search_path = '' as $$
declare s review.settings;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'a fingerprint is 64 hex characters' using errcode = '22023';
  end if;
  select * into s from review.settings where id for update;
  if s.publisher_key_sha256 = p_sha256 then
    return 'connected';
  elsif s.publisher_key_sha256 is not null then
    return 'taken';
  elsif s.connect_until is null or s.connect_until < now() then
    return 'closed';
  end if;
  update review.settings
     set publisher_key_sha256 = p_sha256, publisher_connected_at = now(), connect_until = null
   where id;
  return 'connected';
end $$;

-- Forget the registered publisher and open a new connect window. For the
-- approval-gated "reconnect DateSort" step, never the Edge Function.
create or replace function review.reset_publisher(p_hours integer default 24)
returns void language plpgsql set search_path = '' as $$
begin
  if p_hours is null or p_hours < 1 or p_hours > 72 then
    raise exception 'a connect window is 1 to 72 hours' using errcode = '22023';
  end if;
  update review.settings
     set publisher_key_sha256 = null, publisher_connected_at = null,
         connect_until = now() + make_interval(hours => p_hours)
   where id;
end $$;

-- --- Receiving photos (DateSort, through the Edge Function) ------------------

-- Start a send. The photos go into the folder with the same name, sport and
-- date if there is one (sending a day again adds to it), otherwise a new one.
-- Returns the batch and which of the fingerprints are already here.
create or replace function review.create_batch(
  p_name text, p_sport text, p_date date, p_source text,
  p_photos integer, p_videos integer, p_hashes text[])
returns table (batch_id uuid, known text[])
language plpgsql set search_path = '' as $$
declare f uuid; b uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 200 then
    raise exception 'a game name is 1 to 200 characters' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'a date is needed' using errcode = '22023';
  end if;
  if p_hashes is null or cardinality(p_hashes) > 20000 then
    raise exception 'too many photos in one send' using errcode = '22023';
  end if;
  select id into f from review.folders
   where lower(name) = lower(btrim(p_name)) and event_date = p_date
     and coalesce(lower(sport), '') = coalesce(lower(nullif(btrim(p_sport), '')), '')
   order by created_at limit 1;
  if f is null then
    insert into review.folders (name, sport, event_date)
    values (btrim(p_name), nullif(btrim(p_sport), ''), p_date) returning id into f;
  end if;
  insert into review.batches (folder_id, source_folder, photo_count, video_count)
  values (f, left(coalesce(p_source, ''), 300), greatest(coalesce(p_photos, 0), 0), greatest(coalesce(p_videos, 0), 0))
  returning id into b;
  return query
    select b, coalesce(array(select h.file_hash from review.photos h where h.file_hash = any (p_hashes)), '{}'::text[]);
end $$;

-- Record photos whose files have been uploaded. A photo is recorded only when
-- BOTH its files exist in the bucket; one already here (same fingerprint) is
-- left alone. Returns how many were recorded.
create or replace function review.commit_photos(p_batch uuid, p_photos jsonb)
returns integer language plpgsql set search_path = '' as $$
declare p jsonb; f uuid; n integer := 0; wp text; tp text; h text; added integer;
begin
  select folder_id into f from review.batches where id = p_batch;
  if f is null then
    raise exception 'that send was not found' using errcode = '22023';
  end if;
  for p in select * from jsonb_array_elements(p_photos) loop
    h := p->>'hash';
    wp := p_batch::text || '/' || h || '-web.jpg';
    tp := p_batch::text || '/' || h || '-thumb.jpg';
    if not exists (select 1 from storage.objects where bucket_id = 'review-photos' and name = wp)
       or not exists (select 1 from storage.objects where bucket_id = 'review-photos' and name = tp) then
      raise exception 'the files for % are not uploaded', left(coalesce(h, ''), 12) using errcode = '22023';
    end if;
    insert into review.photos
      (batch_id, folder_id, file_hash, filename, taken_at, date_estimated, width, height,
       sharpness, brightness, flags, web_bytes, web_path, thumb_path)
    values (
      p_batch, f, h, p->>'filename', nullif(p->>'taken_at', '')::timestamp,
      coalesce((p->>'date_estimated')::boolean, false),
      nullif(p->>'width', '')::integer, nullif(p->>'height', '')::integer,
      nullif(p->>'sharpness', '')::real, nullif(p->>'brightness', '')::real,
      coalesce(array(select jsonb_array_elements_text(p->'flags')), '{}'::text[]),
      (p->>'web_bytes')::bigint, wp, tp)
    on conflict (file_hash) do nothing;
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  return n;
end $$;

-- --- Reviewing (the owner, through the Edge Function) ------------------------

create or replace function review.folders_overview()
returns table (id uuid, name text, sport text, event_date date, team_id uuid, team_name text,
               waiting bigint, approved bigint, rejected bigint, same_day bigint)
language sql stable set search_path = '' as $$
  select f.id, f.name, f.sport, f.event_date, f.team_id, t.name,
         count(p.id) filter (where p.status = 'waiting'),
         count(p.id) filter (where p.status = 'approved'),
         count(p.id) filter (where p.status = 'rejected'),
         (select count(*) - 1 from review.folders o where o.event_date = f.event_date)
    from review.folders f
    left join review.teams t on t.id = f.team_id
    left join review.photos p on p.folder_id = f.id
   group by f.id, t.name
   order by f.event_date desc, f.name
$$;

-- p_status: waiting, approved, rejected or all. In the order the photos were taken.
create or replace function review.folder_photos(
  p_folder uuid, p_status text, p_limit integer default 60, p_offset integer default 0)
returns table (id uuid, filename text, taken_at timestamp, date_estimated boolean, width integer,
               height integer, flags text[], status text, reason text,
               web_path text, thumb_path text, total bigint)
language sql stable set search_path = '' as $$
  select p.id, p.filename, p.taken_at, p.date_estimated, p.width, p.height, p.flags,
         p.status, p.reason, p.web_path, p.thumb_path, count(*) over ()
    from review.photos p
   where p.folder_id = p_folder and (p_status = 'all' or p.status = p_status)
   order by p.taken_at nulls last, p.filename, p.id
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
$$;

-- Approve, reject, or send back to waiting. Returns how many changed.
create or replace function review.decide(p_ids uuid[], p_status text, p_reason text, p_by uuid)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_status not in ('waiting', 'approved', 'rejected') then
    raise exception 'a photo is waiting, approved or rejected' using errcode = '22023';
  end if;
  update review.photos
     set status = p_status,
         reason = case when p_status = 'rejected' then nullif(left(btrim(coalesce(p_reason, '')), 200), '') end,
         decided_by = case when p_status = 'waiting' then null else p_by end,
         decided_at = case when p_status = 'waiting' then null else now() end
   where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Approve everything still waiting in a folder. A rejection is never overridden.
create or replace function review.approve_waiting(p_folder uuid, p_by uuid)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  update review.photos set status = 'approved', reason = null, decided_by = p_by, decided_at = now()
   where folder_id = p_folder and status = 'waiting';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function review.rename_folder(p_folder uuid, p_name text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 200 then
    raise exception 'a folder name is 1 to 200 characters' using errcode = '22023';
  end if;
  update review.folders set name = btrim(p_name), updated_at = now() where id = p_folder;
  if not found then
    raise exception 'that folder was not found' using errcode = '22023';
  end if;
end $$;

create or replace function review.set_folder_team(p_folder uuid, p_team uuid)
returns void language plpgsql set search_path = '' as $$
begin
  update review.folders set team_id = p_team, updated_at = now() where id = p_folder;
  if not found then
    raise exception 'that folder was not found' using errcode = '22023';
  end if;
end $$;

-- Move photos to another folder. A moved photo goes back to waiting: a decision
-- made under the old folder no longer holds.
create or replace function review.move_photos(p_ids uuid[], p_to uuid)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  if not exists (select 1 from review.folders where id = p_to) then
    raise exception 'that folder was not found' using errcode = '22023';
  end if;
  update review.photos
     set folder_id = p_to, status = 'waiting', reason = null, decided_by = null, decided_at = null
   where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Start a new folder from photos that do not belong where they are, and move
-- them in. The date defaults to the day the earliest of them was taken.
create or replace function review.new_folder_from_photos(
  p_ids uuid[], p_name text, p_sport text, p_date date default null)
returns uuid language plpgsql set search_path = '' as $$
declare f uuid; d date;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'tick the photos first' using errcode = '22023';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 200 then
    raise exception 'a folder name is 1 to 200 characters' using errcode = '22023';
  end if;
  d := coalesce(p_date,
                (select min(taken_at)::date from review.photos where id = any (p_ids)),
                (select event_date from review.folders
                  where id = (select folder_id from review.photos where id = any (p_ids) limit 1)));
  if d is null then
    raise exception 'a date is needed' using errcode = '22023';
  end if;
  insert into review.folders (name, sport, event_date, team_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_sport, '')), ''), d,
          (select o.team_id from review.folders o
            where o.id = (select folder_id from review.photos where id = any (p_ids) limit 1)))
  returning id into f;
  perform review.move_photos(p_ids, f);
  return f;
end $$;

-- --- Teams (the owner, through the Edge Function) ---------------------------

-- A new client to shoot for: add a team. Its page starts public. The slug (the
-- page's web address) is made from the name; a clash gets -2, -3...
create or replace function review.create_team(p_name text)
returns uuid language plpgsql set search_path = '' as $$
declare base text; candidate text; n integer := 1; t uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 120 then
    raise exception 'a team name is 1 to 120 characters' using errcode = '22023';
  end if;
  if exists (select 1 from review.teams where lower(name) = lower(btrim(p_name))) then
    raise exception 'there is already a team with that name' using errcode = '23505';
  end if;
  base := regexp_replace(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g');
  base := left(base, 110);
  if base = '' then
    raise exception 'a team name needs letters or numbers' using errcode = '22023';
  end if;
  candidate := base;
  while exists (select 1 from review.teams where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  insert into review.teams (slug, name) values (candidate, btrim(p_name)) returning id into t;
  return t;
end $$;

create or replace function review.set_team_visibility(p_team uuid, p_visibility text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_visibility not in ('private', 'public') then
    raise exception 'a team page is private or public' using errcode = '22023';
  end if;
  update review.teams set visibility = p_visibility where id = p_team;
  if not found then
    raise exception 'that team was not found' using errcode = '22023';
  end if;
end $$;

create or replace function review.list_teams()
returns table (id uuid, slug text, name text, visibility text, folders bigint)
language sql stable set search_path = '' as $$
  select t.id, t.slug, t.name, t.visibility, count(f.id)
    from review.teams t left join review.folders f on f.team_id = t.id
   group by t.id order by t.name
$$;

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace = 'review'::regnamespace
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if f not like 'review.reset_publisher%' then
      execute format('grant execute on function %s to service_role', f);
    else
      execute format('revoke all on function %s from service_role', f);
    end if;
  end loop;
end $$;

-- --- Storage ----------------------------------------------------------------
--
--   review-photos  PRIVATE  <batch>/<fingerprint>-web.jpg (2400 px) and -thumb.jpg
--
-- No storage policy admits anon or authenticated: only the service role reads
-- or writes it, and the owner gets expiring signed links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('review-photos', 'review-photos', false, 15728640, array['image/jpeg'])
on conflict (id) do nothing;
