-- ===========================================================================
-- hockey — HighlightAI Hockey
--
-- Persistence for HighlightAI Hockey (apps/highlightai-hockey, engine in
-- packages/hockey-highlights, vision service in services/hockey-vision).
-- Purely additive: a new schema, no existing object is touched.
--
-- NOT APPLIED ANYWHERE. Written, tested against a local PostgreSQL, and
-- committed. No migration is applied without explicit approval — not to
-- production, not anywhere. The app says on screen which store it is actually
-- using, so it never implies a database it does not have.
--
-- WHOSE DATA THIS IS. Video of a child, at a named rink, on a known date,
-- alongside their name, team and jersey number. That is more identifying than
-- most of what this platform stores, and it is about a minor. So:
--
--   * Every table is owned by exactly one auth user, via `owner_id`.
--   * RLS is ENABLED and FORCED on every table, including for the table owner.
--   * Policies are per-command and always compare to auth.uid().
--   * There is no service-role convenience, no platform-admin read path, and
--     no cross-user visibility of any kind. Nobody operating this platform has
--     a legitimate reason to watch a stranger's child play hockey.
--
-- WHY CONFIDENCE IS IN THE SCHEMA. `player_segments` stores the fused identity
-- confidence, the band, AND the evidence that produced them, because the
-- product's central claim -- "this is your player" -- has to be auditable after
-- the fact. Two CHECK constraints enforce the rule that matters most:
--
--   * A segment may only be `confirmed` if a jersey number was legibly read
--     more than once and agreed. Jersey colour is shared with four team-mates
--     on the ice; a hundred frames of it is not proof of identity.
--   * A clip may only carry a rendered file if a human accepted it. Nothing
--     reaches a reel that nobody approved.
--
-- Both are enforced in the engine as well (identity.ts `bandFor`, review.ts
-- and reel.ts). A clip of the wrong child, sent to a family, is worth more
-- than one control.
--
-- rollback:
--   DROP SCHEMA IF EXISTS hockey CASCADE;
--   (Additive migration: it creates a new schema and touches no existing
--    table, so dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists hockey;
comment on schema hockey is
  'HighlightAI Hockey: game projects, uploaded video, processing jobs, player tracking evidence, reviewable clips and finished reels. Every table is owned by a single auth user and forced RLS.';

revoke all on schema hockey from public, anon;
grant usage on schema hockey to authenticated;
alter default privileges in schema hockey revoke all on tables from public, anon;
alter default privileges in schema hockey revoke all on functions from public, anon;

-- --- Types ------------------------------------------------------------------

do $$ begin create type hockey.position as enum ('forward','defense','goalie');
  exception when duplicate_object then null; end $$;

-- Mirrors JobStatus in packages/hockey-highlights/src/jobs.ts. The order is the
-- pipeline order, so progress is derived from position rather than stored --
-- a stored percentage is a second source of truth and drifts from the first.
do $$ begin create type hockey.job_status as enum (
  'uploaded','preprocessing','player_detection','player_tracking',
  'event_detection','clip_generation','review_ready','rendering',
  'completed','failed');
  exception when duplicate_object then null; end $$;

do $$ begin create type hockey.media_role as enum ('original','proxy','clip','reel');
  exception when duplicate_object then null; end $$;

do $$ begin create type hockey.confidence_band as enum
  ('confirmed','likely','possible','uncertain');
  exception when duplicate_object then null; end $$;

-- Named for what the motion evidence supports, never for a result. The system
-- cannot see a puck, so it cannot see a goal, and an enum value called 'goal'
-- would be an invitation to claim one.
do $$ begin create type hockey.event_kind as enum
  ('burst','cut','sustained_presence','crease_action','manual');
  exception when duplicate_object then null; end $$;

do $$ begin create type hockey.review_decision as enum
  ('pending','accepted','rejected');
  exception when duplicate_object then null; end $$;

-- --- Projects ---------------------------------------------------------------

create table if not exists hockey.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(btrim(name)) > 0),
  game_date     date,
  team          text not null default '',
  opponent      text not null default '',
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists projects_owner_idx on hockey.projects (owner_id, created_at desc);
comment on table hockey.projects is
  'One game. The athlete it is about lives in hockey.athletes, one row per project.';

create table if not exists hockey.athletes (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references hockey.projects(id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  -- Text, not integer: "07" and "7" are the same player in the rink but
  -- different jerseys to a supplier, and the app normalises rather than
  -- destroying what the user typed.
  jersey_number   text not null check (length(btrim(jersey_number)) > 0),
  -- An id from the shared colour vocabulary (jersey.ts / jersey.py), not a hex
  -- value. A free-text colour cannot be matched against a hue range.
  jersey_color_id text not null check (length(btrim(jersey_color_id)) > 0),
  position        hockey.position not null,
  -- Optional in the product and optional here: the pipeline must produce a
  -- usable result without one.
  reference_photo_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id)
);

-- --- Media ------------------------------------------------------------------

create table if not exists hockey.media_assets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  project_id       uuid not null references hockey.projects(id) on delete cascade,
  role             hockey.media_role not null,
  storage_key      text not null check (length(btrim(storage_key)) > 0),
  filename         text not null default '',
  content_type     text not null default '',
  -- All nullable, and null means "not measured yet" rather than zero. A UI
  -- that shows 0:00 for an unprobed file is stating a duration it does not
  -- know.
  size_bytes       bigint check (size_bytes is null or size_bytes >= 0),
  duration_seconds numeric(12,3) check (duration_seconds is null or duration_seconds >= 0),
  width            integer check (width is null or width > 0),
  height           integer check (height is null or height > 0),
  frame_rate       numeric(8,3) check (frame_rate is null or frame_rate > 0),
  created_at       timestamptz not null default now(),
  unique (project_id, storage_key)
);
create index if not exists media_assets_project_idx on hockey.media_assets (project_id, role);
comment on column hockey.media_assets.role is
  'original is the upload and is never modified. proxy is the downscaled analysis copy and is never exported -- clips and reels are always cut from the original.';

-- --- Jobs -------------------------------------------------------------------

create table if not exists hockey.processing_jobs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references hockey.projects(id) on delete cascade,
  status        hockey.job_status not null default 'uploaded',
  attempt       integer not null default 0 check (attempt >= 0),
  -- The failure, structured. A log line is gone by the time a user comes back
  -- an hour later; this is what tells them which stage broke and whether
  -- trying again is worth anything.
  failure_stage hockey.job_status,
  failure_code  text,
  failure_detail text,
  failure_retryable boolean,
  failed_at     timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  -- A failed job must say why. A status of 'failed' with no code is a dead end
  -- for whoever has to explain it to the user.
  constraint failed_jobs_explain_themselves check (
    status <> 'failed' or (failure_code is not null and failure_stage is not null)
  ),
  unique (project_id)
);
create index if not exists processing_jobs_status_idx on hockey.processing_jobs (owner_id, status);

-- Every transition, oldest first. This is what makes a job auditable after the
-- fact rather than merely current.
create table if not exists hockey.job_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  job_id      uuid not null references hockey.processing_jobs(id) on delete cascade,
  status      hockey.job_status not null,
  note        text,
  at          timestamptz not null default now()
);
create index if not exists job_events_job_idx on hockey.job_events (job_id, at);

-- --- Tracking evidence ------------------------------------------------------

create table if not exists hockey.player_tracks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references hockey.projects(id) on delete cascade,
  -- The id the vision service assigned. A track is deliberately anonymous:
  -- it is "someone", not "the athlete".
  external_id   text not null,
  -- Which detector and tracker produced it, e.g. 'yolov8n+bytetrack'. Recorded
  -- so a result can always be traced to the thing that produced it -- and so a
  -- fixture-derived source (replay:*, fixture:*) is identifiable as such.
  detection_source text not null,
  start_time    numeric(12,3) not null check (start_time >= 0),
  end_time      numeric(12,3) not null,
  observation_count integer not null default 0 check (observation_count >= 0),
  -- Per-frame boxes and jersey reads. JSONB rather than a row per observation:
  -- a 90-minute game at 5Hz is 27,000 observations per player, they are only
  -- ever read as a whole track, and they are never queried by frame.
  observations  jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  constraint track_ends_after_it_starts check (end_time >= start_time),
  unique (project_id, external_id)
);
create index if not exists player_tracks_project_idx on hockey.player_tracks (project_id);

create table if not exists hockey.player_segments (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references hockey.projects(id) on delete cascade,
  track_id        uuid not null references hockey.player_tracks(id) on delete cascade,
  start_time      numeric(12,3) not null check (start_time >= 0),
  end_time        numeric(12,3) not null,
  confidence      numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  band            hockey.confidence_band not null,
  detection_source text not null,
  -- The figures that produced the confidence. Agreement and clarity are kept
  -- apart on purpose: agreement is "did the reads point the same way", clarity
  -- is "how legible were they". Ten barely-readable digits that happen to
  -- agree are not ten crisp ones, and one number cannot say both.
  color_agreement   numeric(4,3) not null default 0,
  color_clarity     numeric(4,3) not null default 0,
  number_agreement  numeric(4,3) not null default 0,
  number_clarity    numeric(4,3) not null default 0,
  number_read_count integer not null default 0 check (number_read_count >= 0),
  observation_count integer not null default 0 check (observation_count >= 0),
  -- Null means no reference photo was compared -- either none was supplied or
  -- the provider cannot compare them. Never defaulted to a number nobody
  -- measured.
  photo_similarity  numeric(4,3),
  created_at      timestamptz not null default now(),
  constraint segment_ends_after_it_starts check (end_time >= start_time),
  -- The guard that matters. Jersey colour is shared with four team-mates on
  -- the ice, so colour alone may never produce a claim of certainty, however
  -- many frames agree. Only a jersey number -- read legibly, more than once,
  -- and agreeing -- opens the top band.
  constraint confirmed_requires_a_legible_number check (
    band <> 'confirmed'
    or (number_read_count >= 2 and number_agreement >= 0.6 and number_clarity >= 0.5)
  )
);
create index if not exists player_segments_project_idx
  on hockey.player_segments (project_id, confidence desc);

-- --- Events and clips -------------------------------------------------------

create table if not exists hockey.candidate_events (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references hockey.projects(id) on delete cascade,
  segment_id    uuid not null references hockey.player_segments(id) on delete cascade,
  kind          hockey.event_kind not null,
  start_time    numeric(12,3) not null check (start_time >= 0),
  end_time      numeric(12,3) not null,
  peak_time     numeric(12,3) not null,
  strength      numeric(4,3) not null check (strength >= 0 and strength <= 1),
  -- Inherited from the segment, never blended into `strength`. "Sure it is your
  -- player, unsure it is interesting" and "unsure it is your player, sure it is
  -- interesting" are opposite situations that one combined number would render
  -- identical.
  identity_confidence numeric(4,3) not null check (identity_confidence between 0 and 1),
  rationale     text not null default '',
  created_at    timestamptz not null default now(),
  constraint event_ends_after_it_starts check (end_time >= start_time),
  constraint peak_is_inside_the_event check (peak_time between start_time and end_time)
);
create index if not exists candidate_events_project_idx
  on hockey.candidate_events (project_id, start_time);

create table if not exists hockey.clips (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references hockey.projects(id) on delete cascade,
  event_id        uuid references hockey.candidate_events(id) on delete set null,
  start_time      numeric(12,3) not null check (start_time >= 0),
  end_time        numeric(12,3) not null,
  decision        hockey.review_decision not null default 'pending',
  trimmed_start   numeric(12,3),
  trimmed_end     numeric(12,3),
  note            text,
  media_asset_id  uuid references hockey.media_assets(id) on delete set null,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clip_ends_after_it_starts check (end_time > start_time),
  -- A trim may only shorten what was detected. A reviewer dragging a handle
  -- inside a clip cannot mean to select footage outside it.
  constraint trim_stays_inside_the_clip check (
    (trimmed_start is null and trimmed_end is null)
    or (trimmed_start is not null and trimmed_end is not null
        and trimmed_start >= start_time and trimmed_end <= end_time
        and trimmed_end > trimmed_start)
  ),
  -- The second guard that matters. A rendered file may only exist for a clip a
  -- human accepted. Enforced in review.ts and again in reel.ts; a clip of the
  -- wrong child reaching a family is worth three independent controls.
  constraint only_accepted_clips_are_rendered check (
    media_asset_id is null or decision = 'accepted'
  )
);
create index if not exists clips_project_idx on hockey.clips (project_id, sort_order);

-- --- Reels ------------------------------------------------------------------

create table if not exists hockey.reels (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references hockey.projects(id) on delete cascade,
  title           text not null default '',
  subtitle        text not null default '',
  total_duration_seconds numeric(12,3) not null default 0 check (total_duration_seconds >= 0),
  -- Null until something has actually rendered. A non-null key with no file
  -- behind it is a download button that 404s.
  media_asset_id  uuid references hockey.media_assets(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists reels_project_idx on hockey.reels (project_id, created_at desc);

create table if not exists hockey.reel_entries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  reel_id       uuid not null references hockey.reels(id) on delete cascade,
  clip_id       uuid not null references hockey.clips(id) on delete cascade,
  start_time    numeric(12,3) not null check (start_time >= 0),
  end_time      numeric(12,3) not null,
  -- Where this clip begins within the finished reel.
  reel_offset   numeric(12,3) not null check (reel_offset >= 0),
  position      integer not null check (position >= 0),
  constraint entry_ends_after_it_starts check (end_time > start_time),
  unique (reel_id, position),
  unique (reel_id, clip_id)
);

-- --- Settings ---------------------------------------------------------------

create table if not exists hockey.user_settings (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  default_team  text not null default '',
  -- What the user last chose, so the next project starts from their team's
  -- colours rather than from the top of an alphabetical list.
  default_jersey_color_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --- Row-level security -----------------------------------------------------
--
-- Enabled AND forced, per command, on every table. "Enabled" alone leaves the
-- table owner exempt, which is what makes "we have RLS" a false statement in so
-- many projects. WITH CHECK on insert and update is what stops a user writing a
-- row owned by somebody else.

do $$
declare t text;
begin
  foreach t in array array[
    'projects','athletes','media_assets','processing_jobs','job_events',
    'player_tracks','player_segments','candidate_events','clips',
    'reels','reel_entries','user_settings'
  ]
  loop
    execute format('alter table hockey.%I enable row level security', t);
    execute format('alter table hockey.%I force row level security', t);

    -- Dropped first so re-applying this migration is safe. `create policy`
    -- has no IF NOT EXISTS, and a migration that cannot be run twice is a
    -- migration that fails the one time somebody needs to re-run it.
    execute format('drop policy if exists %I on hockey.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on hockey.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on hockey.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on hockey.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on hockey.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on hockey.%I for insert to authenticated with check (owner_id = auth.uid())',
      t || '_insert_own', t);
    execute format(
      'create policy %I on hockey.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update_own', t);
    execute format(
      'create policy %I on hockey.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete_own', t);

    execute format(
      'grant select, insert, update, delete on hockey.%I to authenticated', t);
  end loop;
end $$;

-- --- updated_at -------------------------------------------------------------

create or replace function hockey.touch_updated_at()
returns trigger
language plpgsql
-- search_path is pinned. Migration 0047 exists because a function shipped
-- without it; that lesson is applied here rather than relearned.
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','athletes','processing_jobs','clips','user_settings'
  ]
  loop
    execute format('drop trigger if exists %I on hockey.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on hockey.%I for each row execute function hockey.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;
