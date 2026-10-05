-- ===========================================================================
-- 0052_jersey_sort — JerseySort AI
--
-- Persistence for JerseySort AI (packages/jersey-sort, apps/jersey-sort):
-- events, photos and their EXIF, AI and manual jersey-number detections,
-- players and their numbers per team + season, hand tags, albums, favorites,
-- the analysis job log, the review queue, and three private storage buckets.
--
-- The app ships with a local SQLite store whose tables have this exact shape
-- (apps/jersey-sort/src/lib/db-core.ts); this schema is what that store
-- becomes once it is approved and applied.
-- WRITTEN AND TESTED, NOT APPLIED to any project.
--
-- ASSEMBLED, NOT REBUILT. The brief's `users` and `organizations` tables
-- already exist in this platform: users are auth.users, organizations are
-- platform.tenants, membership is identity.memberships, and authorization is
-- identity.has_permission(). Nothing here creates a second identity model or
-- a second permission system. Purely additive: a new schema, three storage
-- buckets and their policies, and new permission keys.
--
-- ---------------------------------------------------------------------------
-- WHOSE DATA THIS IS
-- ---------------------------------------------------------------------------
--
-- Photographs of athletes, most of them minors, uploaded by a team, school,
-- photographer or media company — an ORGANIZATION, so this module is
-- tenant-scoped (like `social`, 0046), not owner-scoped (like `hype`, 0051):
--
--   * Every row carries tenant_id. Every child row's tenant_id is pinned to
--     its parent's by a composite foreign key, so a photo cannot belong to
--     another organization's event, a tag cannot join one organization's
--     photo to another's player, and so on — on the data, not in the app.
--   * RLS is ENABLED and FORCED on every table. Policies are per-command and
--     go through identity.has_permission(). No anon access of any kind.
--   * Favorites are per PERSON: a member sees only their own.
--
-- ---------------------------------------------------------------------------
-- THE FOUR THINGS THIS SCHEMA REFUSES TO ALLOW
-- ---------------------------------------------------------------------------
--
-- 1. A PERSON FABRICATING AN AI RESULT (platform principle 10).
--    Members may insert only MANUAL detections, confirmed, in their own name.
--    AI detections (vision_model / ocr) and the analysis job log are written
--    only by the trusted analysis worker (service role). A member may change
--    a detection's STATUS (confirm / reject) and nothing else: its number,
--    confidence and provider are not updatable by them, so an AI reading of
--    #18 at 62% can never be edited into "the AI was 99% sure of #24".
--
-- 2. A STATUS THAT CLAIMS WHAT HAS NOT HAPPENED.
--    A member cannot move a photo to 'completed' or 'needs_review' unless it
--    has already been analysed (it is in one of those states already); the
--    only other move open to them is back to 'queued' (retry / re-analyse).
--    'processing' and 'failed' are the worker's alone.
--
-- 3. ONE NUMBER, TWO ATHLETES.
--    A jersey number belongs to one player per team + season (unique), and
--    only per team + season: next year's #24 may be someone else.
--
-- 4. A PUBLIC PHOTO.
--    All three buckets are private. Object paths begin with the tenant id,
--    and storage policies admit only that tenant's members. There is no
--    public URL to any image; sharing is a future, explicit feature.
--
-- rollback:
--   delete from storage.objects where bucket_id in
--     ('jerseysort-originals','jerseysort-thumbnails','jerseysort-exports');
--   delete from storage.buckets where id in
--     ('jerseysort-originals','jerseysort-thumbnails','jerseysort-exports');
--   drop policy if exists jerseysort_objects_select on storage.objects;
--   drop policy if exists jerseysort_objects_insert on storage.objects;
--   drop policy if exists jerseysort_objects_delete on storage.objects;
--   delete from identity.role_permissions where permission_key like 'jerseysort.%';
--   delete from identity.permissions where key like 'jerseysort.%';
--   drop function if exists jerseysort.storage_tenant(text);
--   drop schema if exists jerseysort cascade;
--   (Additive: nothing that existed before is altered.)
-- ===========================================================================

create schema if not exists jerseysort;
comment on schema jerseysort is
  'JerseySort AI: sports photos organized by jersey number, player, event and date. Tenant-scoped with forced RLS; AI detections are not member-writable.';

revoke all on schema jerseysort from public, anon;
grant usage on schema jerseysort to authenticated, service_role;
alter default privileges in schema jerseysort revoke all on tables from public, anon;
alter default privileges in schema jerseysort revoke all on functions from public, anon;

-- --- Types ------------------------------------------------------------------
-- Each mirrors a closed list in @hl-bos/jersey-sort (src/types.ts).

do $$ begin create type jerseysort.photo_status as enum
  ('uploaded','queued','processing','completed','needs_review','failed');
  exception when duplicate_object then null; end $$;

do $$ begin create type jerseysort.detection_status as enum ('suggested','confirmed','rejected');
  exception when duplicate_object then null; end $$;

do $$ begin create type jerseysort.detection_method as enum ('vision_model','ocr','manual');
  exception when duplicate_object then null; end $$;

do $$ begin create type jerseysort.job_status as enum ('running','succeeded','failed');
  exception when duplicate_object then null; end $$;

-- A jersey number as stored: '0'..'99' or '00'. Text, because 0 and 00 are
-- different jerseys and an integer cannot tell them apart.
do $$ begin create domain jerseysort.jersey_number as text
  check (value ~ '^([0-9]|[1-9][0-9]|00)$');
  exception when duplicate_object then null; end $$;

-- --- Permissions (reuse identity.has_permission) ----------------------------

insert into identity.permissions (key, description, scope) values
  ('jerseysort.photo.read',      'See the organization''s events, photos, players, albums and detections.', 'tenant'),
  ('jerseysort.photo.manage',     'Upload photos, create events and players, review and tag photos.',          'tenant'),
  ('jerseysort.settings.manage', 'Change confidence thresholds and the analysis provider; delete events.',   'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','jerseysort.photo.read'), ('tenant_owner','jerseysort.photo.manage'), ('tenant_owner','jerseysort.settings.manage'),
  ('tenant_admin','jerseysort.photo.read'), ('tenant_admin','jerseysort.photo.manage'), ('tenant_admin','jerseysort.settings.manage'),
  ('manager','jerseysort.photo.read'),      ('manager','jerseysort.photo.manage'),
  ('staff','jerseysort.photo.read'),        ('staff','jerseysort.photo.manage'),
  ('viewer','jerseysort.photo.read')
on conflict do nothing;
-- service_account gets nothing: the analysis worker runs as service_role,
-- which bypasses RLS by design and is never exposed to a browser.

-- --- Tables -----------------------------------------------------------------

create table if not exists jerseysort.settings (
  tenant_id         uuid primary key references platform.tenants(id) on delete cascade,
  high_threshold    numeric(4,3) not null default 0.850,
  medium_threshold  numeric(4,3) not null default 0.600,
  provider          text,
  updated_at        timestamptz not null default now(),
  constraint settings_thresholds_ordered
    check (medium_threshold > 0 and medium_threshold < high_threshold and high_threshold <= 1),
  constraint settings_provider_known check (provider is null or provider in ('claude','local-ocr','none'))
);

create table if not exists jerseysort.teams (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  name        extensions.citext not null,
  sport       text,
  created_at  timestamptz not null default now(),
  constraint teams_name_present check (length(btrim(name::text)) between 1 and 120),
  constraint teams_name_unique unique (tenant_id, name),
  constraint teams_id_tenant unique (id, tenant_id)
);

create table if not exists jerseysort.seasons (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  name        extensions.citext not null,
  created_at  timestamptz not null default now(),
  constraint seasons_name_present check (length(btrim(name::text)) between 1 and 40),
  constraint seasons_name_unique unique (tenant_id, name),
  constraint seasons_id_tenant unique (id, tenant_id)
);

create table if not exists jerseysort.events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  name        text not null,
  sport       text not null,
  team_id     uuid not null,
  season_id   uuid not null,
  opponent    text,
  event_date  date not null,
  location    text,
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_name_present check (length(btrim(name)) between 1 and 160),
  constraint events_team_same_tenant foreign key (team_id, tenant_id) references jerseysort.teams(id, tenant_id),
  constraint events_season_same_tenant foreign key (season_id, tenant_id) references jerseysort.seasons(id, tenant_id),
  constraint events_id_tenant unique (id, tenant_id)
);
create index if not exists events_tenant_date_idx on jerseysort.events (tenant_id, event_date desc);
create index if not exists events_team_season_idx on jerseysort.events (team_id, season_id);

create table if not exists jerseysort.photos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references platform.tenants(id) on delete cascade,
  event_id            uuid not null,
  uploaded_by         uuid references auth.users(id) on delete set null,
  original_filename   text not null,
  storage_path        text not null,
  thumbnail_path      text,
  preview_path        text,
  captured_at         timestamp not null,   -- the camera's wall clock; cameras record no zone
  captured_at_source  text not null,
  uploaded_at         timestamptz not null default now(),
  width               integer,
  height              integer,
  mime_type           text not null,
  file_size           bigint not null,
  file_hash           text not null,
  status              jerseysort.photo_status not null default 'uploaded',
  error               text,
  attempts            integer not null default 0,
  athletes_present    boolean,
  athlete_count       integer,
  analysis_notes      text,
  no_jersey_visible   boolean not null default false,
  unusable            boolean not null default false,
  reviewed_at         timestamptz,
  reviewed_by         uuid references auth.users(id) on delete set null,
  skipped_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint photos_event_same_tenant foreign key (event_id, tenant_id)
    references jerseysort.events(id, tenant_id) on delete cascade,
  constraint photos_id_tenant unique (id, tenant_id),
  -- Duplicate detection: one copy of a file per organization.
  constraint photos_hash_unique unique (tenant_id, file_hash),
  constraint photos_hash_shape check (file_hash ~ '^[0-9a-f]{64}$'),
  constraint photos_date_source check (captured_at_source in ('exif','upload')),
  constraint photos_mime_known check (mime_type in ('image/jpeg','image/png','image/heic')),
  constraint photos_size_sane check (file_size > 0 and file_size <= 60 * 1024 * 1024),
  -- Every object lives under its organization's folder, so the storage
  -- policies below protect the bytes exactly as RLS protects the rows.
  constraint photos_paths_scoped check (
    storage_path like tenant_id::text || '/%'
    and (thumbnail_path is null or thumbnail_path like tenant_id::text || '/%')
    and (preview_path is null or preview_path like tenant_id::text || '/%')
  ),
  constraint photos_failed_says_why check (status <> 'failed' or error is not null)
);
create index if not exists photos_event_idx on jerseysort.photos (event_id, captured_at);
create index if not exists photos_tenant_status_idx on jerseysort.photos (tenant_id, status);
create index if not exists photos_tenant_captured_idx on jerseysort.photos (tenant_id, captured_at);
create index if not exists photos_tenant_uploaded_idx on jerseysort.photos (tenant_id, uploaded_at desc);
create index if not exists photos_queue_idx on jerseysort.photos (uploaded_at) where status = 'queued';

create table if not exists jerseysort.photo_metadata (
  photo_id       uuid primary key,
  tenant_id      uuid not null,
  camera_make    text,
  camera_model   text,
  lens           text,
  iso            integer,
  exposure_time  double precision,
  f_number       double precision,
  focal_length   double precision,
  orientation    smallint,
  exif           jsonb not null default '{}'::jsonb,
  constraint metadata_photo_same_tenant foreign key (photo_id, tenant_id)
    references jerseysort.photos(id, tenant_id) on delete cascade,
  -- Location is deliberately not kept: a photo of a child carries no GPS here.
  constraint metadata_no_gps check (not (exif ?| array['GPSLatitude','GPSLongitude','latitude','longitude']))
);
comment on table jerseysort.photo_metadata is
  'EXIF read at upload. GPS is never stored (constraint metadata_no_gps).';

create table if not exists jerseysort.photo_detections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  photo_id        uuid not null,
  detection_type  text not null default 'jersey_number',
  detected_value  jerseysort.jersey_number not null,
  confidence      numeric(4,3) not null,
  bounding_box    jsonb,
  location        text,
  method          jerseysort.detection_method not null,
  provider        text not null,
  provider_model  text,
  status          jerseysort.detection_status not null default 'suggested',
  user_confirmed  boolean generated always as (status = 'confirmed') stored,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint detections_photo_same_tenant foreign key (photo_id, tenant_id)
    references jerseysort.photos(id, tenant_id) on delete cascade,
  constraint detections_type_known check (detection_type = 'jersey_number'),
  constraint detections_confidence_range check (confidence >= 0 and confidence <= 1),
  -- A person's reading is a decision, not a guess.
  constraint detections_manual_is_confirmed check (
    method <> 'manual' or (confidence = 1 and status <> 'suggested' and provider = 'person')
  ),
  constraint detections_box_shape check (
    bounding_box is null or (bounding_box ?& array['x','y','width','height'])
  )
);
comment on column jerseysort.photo_detections.status is
  'suggested = the AI''s reading, untouched; confirmed / rejected = a person decided. The only column a member may update.';
create index if not exists detections_photo_idx on jerseysort.photo_detections (photo_id, detected_value);
create index if not exists detections_tenant_value_idx on jerseysort.photo_detections (tenant_id, detected_value, status);

create table if not exists jerseysort.players (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references platform.tenants(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  team_id           uuid not null,
  season_id         uuid not null,
  sport             text,
  position          text,
  graduation_year   integer,
  profile_photo_id  uuid,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint players_names_present check (length(btrim(first_name)) between 1 and 60 and length(btrim(last_name)) between 1 and 60),
  constraint players_grad_year_sane check (graduation_year is null or graduation_year between 1990 and 2100),
  constraint players_team_same_tenant foreign key (team_id, tenant_id) references jerseysort.teams(id, tenant_id),
  constraint players_season_same_tenant foreign key (season_id, tenant_id) references jerseysort.seasons(id, tenant_id),
  constraint players_profile_same_tenant foreign key (profile_photo_id, tenant_id)
    references jerseysort.photos(id, tenant_id) on delete set null (profile_photo_id),
  constraint players_id_tenant unique (id, tenant_id)
);
create index if not exists players_tenant_name_idx on jerseysort.players (tenant_id, last_name, first_name);

-- Refusal 3: a number belongs to ONE player per team + season, and only then.
create table if not exists jerseysort.player_numbers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  player_id      uuid not null,
  team_id        uuid not null,
  season_id      uuid not null,
  jersey_number  jerseysort.jersey_number not null,
  created_at     timestamptz not null default now(),
  constraint player_numbers_player_same_tenant foreign key (player_id, tenant_id)
    references jerseysort.players(id, tenant_id) on delete cascade,
  constraint player_numbers_team_same_tenant foreign key (team_id, tenant_id) references jerseysort.teams(id, tenant_id),
  constraint player_numbers_season_same_tenant foreign key (season_id, tenant_id) references jerseysort.seasons(id, tenant_id),
  constraint player_numbers_one_athlete unique (tenant_id, team_id, season_id, jersey_number)
);
create index if not exists player_numbers_player_idx on jerseysort.player_numbers (player_id);

create table if not exists jerseysort.photo_player_tags (
  tenant_id   uuid not null,
  photo_id    uuid not null,
  player_id   uuid not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (photo_id, player_id),
  constraint tags_photo_same_tenant foreign key (photo_id, tenant_id)
    references jerseysort.photos(id, tenant_id) on delete cascade,
  constraint tags_player_same_tenant foreign key (player_id, tenant_id)
    references jerseysort.players(id, tenant_id) on delete cascade
);
create index if not exists tags_player_idx on jerseysort.photo_player_tags (player_id);

create table if not exists jerseysort.albums (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  name         text not null,
  description  text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint albums_name_present check (length(btrim(name)) between 1 and 120),
  constraint albums_id_tenant unique (id, tenant_id)
);

create table if not exists jerseysort.album_photos (
  tenant_id  uuid not null,
  album_id   uuid not null,
  photo_id   uuid not null,
  added_at   timestamptz not null default now(),
  primary key (album_id, photo_id),
  constraint album_photos_album_same_tenant foreign key (album_id, tenant_id)
    references jerseysort.albums(id, tenant_id) on delete cascade,
  constraint album_photos_photo_same_tenant foreign key (photo_id, tenant_id)
    references jerseysort.photos(id, tenant_id) on delete cascade
);

create table if not exists jerseysort.favorites (
  tenant_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  photo_id    uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, photo_id),
  constraint favorites_photo_same_tenant foreign key (photo_id, tenant_id)
    references jerseysort.photos(id, tenant_id) on delete cascade
);
create index if not exists favorites_photo_idx on jerseysort.favorites (photo_id);

create table if not exists jerseysort.ai_analysis_jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  photo_id        uuid not null,
  provider        text not null,
  provider_model  text,
  status          jerseysort.job_status not null,
  error           text,
  result          jsonb,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint jobs_photo_same_tenant foreign key (photo_id, tenant_id)
    references jerseysort.photos(id, tenant_id) on delete cascade,
  constraint jobs_finished_when_done check ((status = 'running') = (finished_at is null)),
  constraint jobs_failed_says_why check (status <> 'failed' or error is not null)
);
comment on table jerseysort.ai_analysis_jobs is
  'Every analysis attempt, with provider, result or error. Written only by the analysis worker (service role); members can read, never write.';
create index if not exists jobs_photo_idx on jerseysort.ai_analysis_jobs (photo_id, started_at desc);

-- The review queue is a VIEW over photos, so it cannot drift from them.
-- security_invoker: it is subject to the CALLER's RLS on photos.
create or replace view jerseysort.review_queue with (security_invoker = true) as
  select id as photo_id, tenant_id, event_id, skipped_at, uploaded_at
    from jerseysort.photos
   where status = 'needs_review';

-- --- Refusal 2: what a member may do to a photo's status ---------------------

create or replace function jerseysort.guard_photo_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and current_user = 'authenticated' then
    if new.status = 'queued' and old.status in ('failed','completed','needs_review') then
      return new;  -- retry / re-analyse
    end if;
    if new.status in ('completed','needs_review') and old.status in ('completed','needs_review') then
      return new;  -- a review decision re-sorts an analysed photo
    end if;
    raise exception 'jerseysort: a member cannot move a photo from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists photos_guard_status on jerseysort.photos;
create trigger photos_guard_status before update on jerseysort.photos
  for each row execute function jerseysort.guard_photo_status();

-- New uploads start at the beginning of the pipeline.
create or replace function jerseysort.guard_photo_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.status not in ('uploaded','queued') then
    raise exception 'jerseysort: a new photo starts as uploaded or queued, not %', new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists photos_guard_insert on jerseysort.photos;
create trigger photos_guard_insert before insert on jerseysort.photos
  for each row execute function jerseysort.guard_photo_insert();

-- --- RLS --------------------------------------------------------------------
-- auth.uid() is always written (select auth.uid()) so Postgres evaluates it
-- once per statement, not once per row (Supabase advisor auth_rls_initplan;
-- the lesson from 0051's follow-up).

do $$
declare t text;
begin
  foreach t in array array['settings','teams','seasons','events','photos','photo_metadata','photo_detections',
                           'players','player_numbers','photo_player_tags','albums','album_photos','favorites',
                           'ai_analysis_jobs']
  loop
    execute format('alter table jerseysort.%I enable row level security', t);
    execute format('alter table jerseysort.%I force row level security', t);
    execute format('revoke all on jerseysort.%I from public, anon, authenticated', t);
    execute format('grant all on jerseysort.%I to service_role', t);
  end loop;
end $$;

-- Read: every member with jerseysort.photo.read sees their organization's
-- rows (favorites excepted: those are per person).
do $$
declare t text;
begin
  foreach t in array array['settings','teams','seasons','events','photos','photo_metadata','photo_detections',
                           'players','player_numbers','photo_player_tags','albums','album_photos','ai_analysis_jobs']
  loop
    execute format('grant select on jerseysort.%I to authenticated', t);
    execute format('drop policy if exists %I on jerseysort.%I', t || '_select', t);
    execute format(
      'create policy %I on jerseysort.%I for select to authenticated using (identity.has_permission(tenant_id, %L))',
      t || '_select', t, 'jerseysort.photo.read');
  end loop;
end $$;
grant select on jerseysort.review_queue to authenticated;

-- Write: members with jerseysort.photo.manage create and edit their
-- organization's library. Each table gets exactly the commands it needs.
do $$
declare t text;
begin
  foreach t in array array['teams','seasons','events','players','player_numbers','photo_player_tags','albums','album_photos']
  loop
    execute format('grant insert, delete on jerseysort.%I to authenticated', t);
    execute format('drop policy if exists %I on jerseysort.%I', t || '_insert', t);
    execute format(
      'create policy %I on jerseysort.%I for insert to authenticated with check (identity.has_permission(tenant_id, %L))',
      t || '_insert', t, 'jerseysort.photo.manage');
    execute format('drop policy if exists %I on jerseysort.%I', t || '_delete', t);
    execute format(
      'create policy %I on jerseysort.%I for delete to authenticated using (identity.has_permission(tenant_id, %L))',
      t || '_delete', t, 'jerseysort.photo.manage');
  end loop;
end $$;

grant update (name, sport, team_id, season_id, opponent, event_date, location, notes, updated_at) on jerseysort.events to authenticated;
grant update (first_name, last_name, team_id, season_id, sport, position, graduation_year, profile_photo_id) on jerseysort.players to authenticated;
grant update (name, description) on jerseysort.albums to authenticated;
do $$
declare t text;
begin
  foreach t in array array['events','players','albums']
  loop
    execute format('drop policy if exists %I on jerseysort.%I', t || '_update', t);
    execute format(
      'create policy %I on jerseysort.%I for update to authenticated using (identity.has_permission(tenant_id, %L)) with check (identity.has_permission(tenant_id, %L))',
      t || '_update', t, 'jerseysort.photo.manage', 'jerseysort.photo.manage');
  end loop;
end $$;

-- Deleting an event deletes its photos: an organization decision.
drop policy if exists events_delete on jerseysort.events;
create policy events_delete on jerseysort.events for delete to authenticated
  using (identity.has_permission(tenant_id, 'jerseysort.settings.manage'));

-- Photos: upload in your own name; the review flags are the only columns a
-- member edits (status additionally guarded by the trigger above).
grant insert on jerseysort.photos to authenticated;
grant update (status, error, no_jersey_visible, unusable, reviewed_at, reviewed_by, skipped_at, updated_at)
  on jerseysort.photos to authenticated;
grant delete on jerseysort.photos to authenticated;
drop policy if exists photos_insert on jerseysort.photos;
create policy photos_insert on jerseysort.photos for insert to authenticated
  with check (identity.has_permission(tenant_id, 'jerseysort.photo.manage') and uploaded_by = (select auth.uid()));
drop policy if exists photos_update on jerseysort.photos;
create policy photos_update on jerseysort.photos for update to authenticated
  using (identity.has_permission(tenant_id, 'jerseysort.photo.manage'))
  with check (identity.has_permission(tenant_id, 'jerseysort.photo.manage')
              and (reviewed_by is null or reviewed_by = (select auth.uid())));
drop policy if exists photos_delete on jerseysort.photos;
create policy photos_delete on jerseysort.photos for delete to authenticated
  using (identity.has_permission(tenant_id, 'jerseysort.settings.manage'));

grant insert on jerseysort.photo_metadata to authenticated;
drop policy if exists photo_metadata_insert on jerseysort.photo_metadata;
create policy photo_metadata_insert on jerseysort.photo_metadata for insert to authenticated
  with check (identity.has_permission(tenant_id, 'jerseysort.photo.manage'));

-- Refusal 1: members add MANUAL detections only, and change STATUS only.
grant insert on jerseysort.photo_detections to authenticated;
grant update (status, updated_at) on jerseysort.photo_detections to authenticated;
drop policy if exists photo_detections_insert on jerseysort.photo_detections;
create policy photo_detections_insert on jerseysort.photo_detections for insert to authenticated
  with check (identity.has_permission(tenant_id, 'jerseysort.photo.manage')
              and method = 'manual' and status = 'confirmed' and created_by = (select auth.uid()));
drop policy if exists photo_detections_update on jerseysort.photo_detections;
create policy photo_detections_update on jerseysort.photo_detections for update to authenticated
  using (identity.has_permission(tenant_id, 'jerseysort.photo.manage'))
  with check (identity.has_permission(tenant_id, 'jerseysort.photo.manage') and status <> 'suggested');

-- Settings: thresholds and provider are an organization decision.
grant insert, update (high_threshold, medium_threshold, provider, updated_at) on jerseysort.settings to authenticated;
drop policy if exists settings_insert on jerseysort.settings;
create policy settings_insert on jerseysort.settings for insert to authenticated
  with check (identity.has_permission(tenant_id, 'jerseysort.settings.manage'));
drop policy if exists settings_update on jerseysort.settings;
create policy settings_update on jerseysort.settings for update to authenticated
  using (identity.has_permission(tenant_id, 'jerseysort.settings.manage'))
  with check (identity.has_permission(tenant_id, 'jerseysort.settings.manage'));

-- Favorites: your own, within an organization you can read.
grant select, insert, delete on jerseysort.favorites to authenticated;
drop policy if exists favorites_select on jerseysort.favorites;
create policy favorites_select on jerseysort.favorites for select to authenticated
  using (user_id = (select auth.uid()) and identity.has_permission(tenant_id, 'jerseysort.photo.read'));
drop policy if exists favorites_insert on jerseysort.favorites;
create policy favorites_insert on jerseysort.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and identity.has_permission(tenant_id, 'jerseysort.photo.read'));
drop policy if exists favorites_delete on jerseysort.favorites;
create policy favorites_delete on jerseysort.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- ai_analysis_jobs: SELECT only (granted above). No insert, update or delete
-- grant exists for members: the job log is the worker's record.

-- --- Storage: three private buckets, tenant-prefixed paths -------------------
--
--   jerseysort-originals   untouched uploads            <tenant>/<event>/<photo>.<ext>
--   jerseysort-thumbnails  480 px thumbs + 1600 px previews
--   jerseysort-exports     ZIP downloads (short-lived)
--
-- No bucket is public. Members of the tenant named by the first path segment
-- may read; writers may upload; deleting objects is the worker's or an
-- organization manager's.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('jerseysort-originals',  'jerseysort-originals',  false, 62914560,  array['image/jpeg','image/png','image/heic']),
  ('jerseysort-thumbnails', 'jerseysort-thumbnails', false, 10485760,  array['image/jpeg','image/webp']),
  ('jerseysort-exports',    'jerseysort-exports',    false, null,      array['application/zip'])
on conflict (id) do nothing;

-- The tenant an object belongs to: its first path segment, if it is a uuid.
create or replace function jerseysort.storage_tenant(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function jerseysort.storage_tenant(text) to authenticated;

drop policy if exists jerseysort_objects_select on storage.objects;
create policy jerseysort_objects_select on storage.objects for select to authenticated
  using (bucket_id in ('jerseysort-originals','jerseysort-thumbnails','jerseysort-exports')
         and identity.has_permission(jerseysort.storage_tenant(name), 'jerseysort.photo.read'));
drop policy if exists jerseysort_objects_insert on storage.objects;
create policy jerseysort_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('jerseysort-originals','jerseysort-thumbnails')
              and identity.has_permission(jerseysort.storage_tenant(name), 'jerseysort.photo.manage'));
drop policy if exists jerseysort_objects_delete on storage.objects;
create policy jerseysort_objects_delete on storage.objects for delete to authenticated
  using (bucket_id in ('jerseysort-originals','jerseysort-thumbnails','jerseysort-exports')
         and identity.has_permission(jerseysort.storage_tenant(name), 'jerseysort.settings.manage'));
-- No UPDATE policy: an original, once stored, is never overwritten.
