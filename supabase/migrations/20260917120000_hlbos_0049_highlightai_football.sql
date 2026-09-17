-- ===========================================================================
-- 0049_highlightai_football — HighlightAI Football V1
--
-- Upload a game, name an athlete, and get back the plays he was in and a
-- highlight reel of them. The `highlight` schema stores the football: games,
-- videos, plays, tracks, detections, events, involvement, clips, reels and
-- exports, plus the human corrections that outrank all of it.
--
-- ASSEMBLED, NOT REBUILT. Identity, tenancy, permissions, audit, events and
-- storage metadata already exist in this platform and are reused verbatim.
-- This migration adds no second tenant model, no second permission system and
-- no second audit trail.
--
-- ---------------------------------------------------------------------------
-- THE THREE THINGS THIS SCHEMA REFUSES TO ALLOW
-- ---------------------------------------------------------------------------
--
-- 1. A TENANT CANNOT FABRICATE AN AI RESULT.
--    Detections, tracks, jersey readings, team classifications, plays, ball
--    tracks, events and involvement scores have NO insert/update/delete grant
--    and NO write policy for `authenticated`. They are written only by the
--    trusted worker path. A parent cannot type a tackle into their child's
--    game, and neither can a coach, and neither can we through the UI.
--    Principle 10 (never invent AI results) is therefore structural here, not
--    a convention someone has to remember.
--
-- 2. A REEL CANNOT CLAIM TO BE READY WHEN IT IS NOT.
--    `reels.status = 'ready'` requires at least one clip and a rendered
--    output object. Enforced by trigger, because a "ready" reel with nothing
--    in it is exactly the kind of green light that destroys trust.
--
-- 3. DEMO OUTPUT CANNOT PASS AS REAL.
--    Every ai_job records `adapter_kind` ('real' or 'demo'). A video analysed
--    by demo adapters is marked `is_demo`, and a reel built from a demo video
--    is forced to `is_demo` by trigger. There is no path — including
--    service-role — that produces a reel claiming real analysis from
--    synthetic football.
--
-- ---------------------------------------------------------------------------
-- PRIVACY: THIS SCHEMA HOLDS VIDEO OF CHILDREN
-- ---------------------------------------------------------------------------
--
-- Visibility defaults to 'private' on every video, clip, reel and export.
-- Making anything shareable requires a row in highlight.sharing_consents, and
-- for a youth/middle-school/high-school game that row must name a guardian.
-- The constraint is on the DATA, not on the UI, because a UI is one deploy
-- away from being wrong and this is somebody's 12-year-old.
--
-- Uploaded footage is additionally marked `training_opt_in` (default FALSE).
-- Nothing in this platform may use a video for model training without that
-- flag being explicitly true.
--
-- ---------------------------------------------------------------------------
-- WHY VIDEOS DO NOT USE storage_meta.files
-- ---------------------------------------------------------------------------
--
-- storage_meta.files carries a 50 MiB CHECK. A high-school game file is 2-12
-- GB. Rather than weaken a constraint that protects every other module, the
-- video objects carry their own bucket/object_path with the SAME tenant-prefix
-- guarantee (`object_path like tenant_id || '/%'`), so the cross-tenant path
-- protection is preserved without raising anyone else's ceiling.
--
-- NO RAW FRAMES ARE STORED. Detections reference a frame NUMBER and a
-- timestamp. Section 29 of the brief is explicit and it is also the difference
-- between a table with millions of rows and a table with billions.
--
-- rollback:
--   DROP SCHEMA IF EXISTS highlight CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'highlight.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'highlight.%';
--   (Additive: creates a new schema and touches no existing table, so dropping
--    the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists highlight;
comment on schema highlight is
  'HighlightAI Football: game film, player tracking, play segmentation and highlight generation. NOT exposed via PostgREST for write; every mutation goes through a permission-gated function.';
revoke all on schema highlight from public, anon;
grant usage on schema highlight to authenticated;
alter default privileges in schema highlight revoke all on tables from public;
alter default privileges in schema highlight revoke all on functions from public;

-- --- Types ------------------------------------------------------------------

do $$ begin create type highlight.level as enum
  ('youth','middle_school','high_school','college','professional');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.camera_type as enum
  ('hudl','veo','sideline','end_zone','press_box','smartphone','broadcast','drone','unknown');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.position_code as enum
  ('QB','RB','FB','WR','TE','OL','DL','LB','CB','S','K','P','LS','RET');
  exception when duplicate_object then null; end $$;

-- Mirrors JOB_STATUSES in @hl-bos/highlight-football. The two are checked
-- against each other by the app's test suite; drift here silently breaks the
-- processing screen.
do $$ begin create type highlight.job_status as enum
  ('uploaded','transcoding','detecting_players','identifying_teams','reading_numbers',
   'tracking_player','segmenting_plays','detecting_ball','analyzing_actions',
   'generating_highlights','ready','failed');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.stage as enum
  ('upload','transcode','play_segmentation','player_detection','team_classification',
   'player_tracking','jersey_ocr','player_reidentification','field_mapping',
   'ball_detection','player_ball_interaction','event_detection','player_involvement',
   'highlight_scoring','clip_generation','overlay_generation','final_export');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.stage_status as enum
  ('pending','running','succeeded','failed','skipped');
  exception when duplicate_object then null; end $$;

-- 'demo' is synthetic football. It is carried on every job and propagated to
-- every artifact derived from it. See the header.
do $$ begin create type highlight.adapter_kind as enum ('real','demo');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.visibility as enum ('private','link','public');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.event_kind as enum
  ('snap','handoff','pass','catch','run','tackle','sack','interception','fumble',
   'recovery','kick','punt','return','touchdown','block','pass_breakup','pressure',
   'run_stop','forced_fumble','pancake');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.identity_source as enum
  ('user_lock','user_exclusion','jersey_number','team_and_reid','unresolved');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.correction_kind as enum
  ('confirm_player','reject_player','set_jersey_number','set_team_color',
   'accept_clip','reject_clip','adjust_clip_window');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.reel_mode as enum ('game','season');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.reel_status as enum
  ('draft','rendering','ready','failed');
  exception when duplicate_object then null; end $$;

do $$ begin create type highlight.aspect_ratio as enum ('16:9','9:16','1:1','4:5');
  exception when duplicate_object then null; end $$;

-- --- Teams, players, rosters ------------------------------------------------

create table if not exists highlight.teams (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  name           text not null,
  -- The uniform, as a human enters it. Named colours, not hex: a parent picks
  -- "Blue", and every comparison downstream has to survive a night game.
  jersey_color   extensions.citext not null,
  number_color   extensions.citext not null,
  helmet_color   extensions.citext,
  pants_color    extensions.citext,
  level          highlight.level not null default 'high_school',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint teams_name_present check (length(btrim(name)) > 0),
  constraint teams_name_unique  unique (tenant_id, name)
);
comment on table highlight.teams is 'A football team and the uniform it wears.';

create table if not exists highlight.players (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  team_id          uuid references highlight.teams(id) on delete set null,
  name             text not null,
  jersey_number    smallint not null,
  -- Football allows both "0" and "00", worn by different players in the same
  -- game. They are not the same jersey, so they are not the same row.
  double_zero      boolean not null default false,
  positions        highlight.position_code[] not null default '{}',
  graduation_year  smallint,
  height_inches    smallint,
  weight_pounds    smallint,
  school           text,
  profile_image_path text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint players_name_present check (length(btrim(name)) > 0),
  constraint players_number_range check (jersey_number between 0 and 99),
  constraint players_double_zero_is_zero check (not double_zero or jersey_number = 0),
  constraint players_grad_year_sane check (graduation_year is null or graduation_year between 1950 and 2100),
  constraint players_height_sane check (height_inches is null or height_inches between 36 and 96),
  constraint players_weight_sane check (weight_pounds is null or weight_pounds between 40 and 500),
  constraint players_image_tenant_scoped
    check (profile_image_path is null or profile_image_path like tenant_id::text || '/%'),
  constraint players_unique_number unique (tenant_id, team_id, jersey_number, double_zero)
);
comment on table highlight.players is
  'A persistent athlete profile. Games, tracks and highlights attach here so a season accumulates.';
comment on column highlight.players.double_zero is
  'TRUE only for a player wearing literal "00". "0" and "00" are different jerseys and may both be on the field.';

create table if not exists highlight.roster_entries (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  team_id     uuid not null references highlight.teams(id) on delete cascade,
  player_id   uuid not null references highlight.players(id) on delete cascade,
  season      extensions.citext not null,
  created_at  timestamptz not null default now(),
  constraint roster_unique unique (team_id, player_id, season)
);

-- --- Games and videos -------------------------------------------------------

create table if not exists highlight.games (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  team_id        uuid not null references highlight.teams(id) on delete restrict,
  name           text not null,
  opponent_name  text not null,
  played_on      date not null,
  level          highlight.level not null,
  camera_type    highlight.camera_type not null default 'unknown',
  season         extensions.citext not null,
  -- Detected, then correctable by the user. NULL until detection has run:
  -- a colour we have not measured is not a colour we get to display.
  detected_team_a_color extensions.citext,
  detected_team_b_color extensions.citext,
  colors_confirmed_by   uuid references auth.users(id) on delete set null,
  colors_confirmed_at   timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint games_name_present check (length(btrim(name)) > 0),
  constraint games_colors_confirmed_consistent
    check ((colors_confirmed_by is null) = (colors_confirmed_at is null))
);
comment on table highlight.games is 'One football game. Its film lives in highlight.videos.';

create table if not exists highlight.videos (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id         uuid not null references platform.tenants(id) on delete cascade,
  game_id           uuid not null references highlight.games(id) on delete cascade,
  bucket            extensions.citext not null default 'game-film',
  object_path       text not null,
  proxy_object_path text,
  original_filename text not null,
  mime_type         extensions.citext not null,
  size_bytes        bigint not null,
  duration_seconds  numeric(10,3),
  frame_rate        numeric(7,3),
  width             integer,
  height            integer,
  checksum_sha256   text,
  -- PRIVATE. Always. Changing it requires a consent row; see the trigger.
  visibility        highlight.visibility not null default 'private',
  -- Explicit, opt-in, and false by default. Nothing may train on a child's
  -- game film because someone forgot to set a flag.
  training_opt_in   boolean not null default false,
  is_demo           boolean not null default false,
  status            highlight.job_status not null default 'uploaded',
  uploaded_by       uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint videos_object_unique unique (bucket, object_path),
  constraint videos_size_positive check (size_bytes > 0),
  constraint videos_path_is_tenant_scoped check (object_path like tenant_id::text || '/%'),
  constraint videos_proxy_is_tenant_scoped
    check (proxy_object_path is null or proxy_object_path like tenant_id::text || '/%'),
  constraint videos_checksum_is_sha256
    check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint videos_mime_is_video check (mime_type like 'video/%'),
  constraint videos_frame_rate_sane check (frame_rate is null or (frame_rate > 0 and frame_rate <= 480)),
  constraint videos_duration_sane check (duration_seconds is null or duration_seconds > 0)
);
comment on table highlight.videos is
  'Game film. Private by default; see highlight.sharing_consents for what it takes to change that.';
comment on column highlight.videos.training_opt_in is
  'Explicit permission to use this footage for model training. FALSE by default and never set implicitly.';

create index if not exists videos_game_idx   on highlight.videos (game_id);
create index if not exists videos_tenant_idx on highlight.videos (tenant_id, status);

-- --- Consent (what it takes to share footage of a minor) --------------------

create table if not exists highlight.sharing_consents (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  video_id      uuid not null references highlight.videos(id) on delete cascade,
  player_id     uuid references highlight.players(id) on delete cascade,
  -- For a minor this must name the adult who gave permission. The schema
  -- cannot verify a guardianship, but it CAN refuse to record a youth consent
  -- that nobody put their name to.
  granted_by    uuid not null references auth.users(id) on delete restrict,
  guardian_name text,
  is_minor      boolean not null,
  scope         highlight.visibility not null,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  constraint consent_minor_requires_guardian
    check (not is_minor or (guardian_name is not null and length(btrim(guardian_name)) > 0)),
  constraint consent_scope_is_a_share check (scope in ('link','public'))
);
comment on table highlight.sharing_consents is
  'A named human permitted this footage to leave private. Required before any video, clip or reel becomes shareable.';

create index if not exists consents_video_idx on highlight.sharing_consents (video_id) where revoked_at is null;

-- --- AI jobs and stages -----------------------------------------------------

create table if not exists highlight.ai_jobs (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  video_id      uuid not null references highlight.videos(id) on delete cascade,
  player_id     uuid references highlight.players(id) on delete set null,
  status        highlight.job_status not null default 'uploaded',
  -- 'demo' means synthetic football. Carried here and propagated downward.
  adapter_kind  highlight.adapter_kind not null,
  -- Which model produced what, by stage. Free-form because the adapters are
  -- deliberately swappable; recorded because a result nobody can attribute to
  -- a model version cannot be reproduced or improved.
  adapters      jsonb not null default '{}'::jsonb,
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ai_jobs_failed_has_reason check (status <> 'failed' or error is not null),
  constraint ai_jobs_finished_after_started
    check (finished_at is null or started_at is null or finished_at >= started_at)
);
comment on table highlight.ai_jobs is
  'One analysis run over one video for one athlete. adapter_kind says whether the football was real or synthetic.';
comment on constraint ai_jobs_failed_has_reason on highlight.ai_jobs is
  'A failed job must say why. "Failed" with no reason is what forces a customer to ask an engineer.';

create index if not exists ai_jobs_video_idx  on highlight.ai_jobs (video_id, created_at desc);
create index if not exists ai_jobs_tenant_idx on highlight.ai_jobs (tenant_id, status);

create table if not exists highlight.job_stages (
  id           bigint generated always as identity primary key,
  job_id       uuid not null references highlight.ai_jobs(id) on delete cascade,
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  stage        highlight.stage not null,
  status       highlight.stage_status not null default 'pending',
  -- NULL is a legitimate value and means "this stage genuinely cannot estimate
  -- its remaining work". The UI shows an indeterminate bar rather than a
  -- number nobody computed.
  progress     numeric(4,3),
  error        text,
  started_at   timestamptz,
  finished_at  timestamptz,
  constraint job_stages_unique unique (job_id, stage),
  constraint job_stages_progress_range check (progress is null or (progress >= 0 and progress <= 1)),
  constraint job_stages_failed_has_reason check (status <> 'failed' or error is not null)
);

create index if not exists job_stages_job_idx on highlight.job_stages (job_id);

-- --- Vision output ----------------------------------------------------------
-- Everything below this line is written ONLY by the worker. No tenant grant.

create table if not exists highlight.team_classifications (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id       uuid not null references platform.tenants(id) on delete cascade,
  video_id        uuid not null references highlight.videos(id) on delete cascade,
  team_label      extensions.citext not null,        -- 'team_a' | 'team_b'
  jersey_rgb      integer[] not null,
  jersey_color_name extensions.citext,
  number_color_name extensions.citext,
  helmet_color_name extensions.citext,
  pants_color_name  extensions.citext,
  confidence      numeric(4,3) not null,
  sample_count    integer not null,
  corrected_by    uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint team_class_unique unique (video_id, team_label),
  constraint team_class_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint team_class_rgb_shape check (array_length(jersey_rgb, 1) = 3),
  constraint team_class_samples_positive check (sample_count > 0)
);
comment on table highlight.team_classifications is
  'The two uniform colours detected from the footage, with the confidence and the sample size behind them.';

create table if not exists highlight.plays (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  video_id     uuid not null references highlight.videos(id) on delete cascade,
  play_index   integer not null,
  start_frame  integer not null,
  start_seconds numeric(10,3) not null,
  -- NULL when no snap could be located. The clip falls back to the play start
  -- rather than the pipeline inventing a snap to anchor on.
  snap_frame   integer,
  snap_seconds numeric(10,3),
  snap_confidence numeric(4,3),
  end_frame    integer not null,
  end_seconds  numeric(10,3) not null,
  offense_team_label extensions.citext,
  defense_team_label extensions.citext,
  -- Scoreboard-derived. NULL unless a scoreboard was actually read; basic
  -- operation never requires one, so these are usually null and that is fine.
  quarter      smallint,
  down         smallint,
  distance     smallint,
  segmentation_confidence numeric(4,3) not null,
  created_at   timestamptz not null default now(),
  constraint plays_unique unique (video_id, play_index),
  constraint plays_frames_ordered check (end_frame >= start_frame),
  constraint plays_snap_within check (
    snap_frame is null or (snap_frame >= start_frame and snap_frame <= end_frame)),
  constraint plays_snap_consistent check (
    (snap_frame is null) = (snap_seconds is null)
    and (snap_frame is null) = (snap_confidence is null)),
  constraint plays_confidence_range check (segmentation_confidence >= 0 and segmentation_confidence <= 1),
  constraint plays_snap_confidence_range check (
    snap_confidence is null or (snap_confidence >= 0 and snap_confidence <= 1)),
  constraint plays_quarter_sane check (quarter is null or quarter between 1 and 6),
  constraint plays_down_sane check (down is null or down between 1 and 4),
  constraint plays_distance_sane check (distance is null or distance between 0 and 99)
);
comment on column highlight.plays.quarter is
  'From scoreboard OCR when available. NULL is the normal case: youth film rarely shows a scoreboard, and guessing a quarter is inventing a fact.';

create index if not exists plays_video_idx on highlight.plays (video_id, play_index);

create table if not exists highlight.player_tracks (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  video_id      uuid not null references highlight.videos(id) on delete cascade,
  track_label   extensions.citext not null,          -- the tracker's own id
  team_label    extensions.citext,
  team_confidence numeric(4,3),
  -- The temporal vote, not a single frame's reading. NULL when the number was
  -- never established, which is common and is not a failure.
  voted_jersey_number smallint,
  number_confidence   numeric(4,3),
  tracking_confidence numeric(4,3) not null,
  start_frame   integer not null,
  end_frame     integer not null,
  detection_count integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint tracks_unique unique (video_id, track_label),
  constraint tracks_frames_ordered check (end_frame >= start_frame),
  constraint tracks_number_range check (
    voted_jersey_number is null or voted_jersey_number between 0 and 99),
  constraint tracks_number_consistent check (
    (voted_jersey_number is null) = (number_confidence is null)),
  constraint tracks_confidences_range check (
    tracking_confidence between 0 and 1
    and (team_confidence is null or team_confidence between 0 and 1)
    and (number_confidence is null or number_confidence between 0 and 1))
);
comment on table highlight.player_tracks is
  'A run of frames the tracker believes is one person. Anonymous until identity resolution claims it.';

create index if not exists tracks_video_idx on highlight.player_tracks (video_id, start_frame);

create table if not exists highlight.player_detections (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  track_id      uuid not null references highlight.player_tracks(id) on delete cascade,
  frame         integer not null,
  seconds       numeric(10,3) not null,
  -- Normalised 0..1 of frame width/height, so a proxy transcode, a vertical
  -- crop and the original 4K master all speak the same coordinates.
  box_x         numeric(6,5) not null,
  box_y         numeric(6,5) not null,
  box_w         numeric(6,5) not null,
  box_h         numeric(6,5) not null,
  confidence    numeric(4,3) not null,
  jersey_rgb    integer[],
  helmet_rgb    integer[],
  pants_rgb     integer[],
  field_x       numeric(6,5),
  field_y       numeric(6,5),
  yard_line     smallint,
  field_confidence numeric(4,3),
  constraint detections_unique unique (track_id, frame),
  constraint detections_box_normalised check (
    box_x >= 0 and box_y >= 0 and box_w > 0 and box_h > 0
    and box_x + box_w <= 1.00001 and box_y + box_h <= 1.00001),
  constraint detections_confidence_range check (confidence between 0 and 1),
  constraint detections_rgb_shape check (
    (jersey_rgb is null or array_length(jersey_rgb, 1) = 3)
    and (helmet_rgb is null or array_length(helmet_rgb, 1) = 3)
    and (pants_rgb  is null or array_length(pants_rgb, 1)  = 3)),
  constraint detections_yard_line_sane check (yard_line is null or yard_line between 0 and 50),
  constraint detections_field_consistent check (
    (field_x is null) = (field_y is null)
    and (field_x is null or field_confidence is not null))
);
comment on table highlight.player_detections is
  'One box in one frame. Frame NUMBERS only — no raw frame is ever stored as a database image.';

create index if not exists detections_track_idx on highlight.player_detections (track_id, frame);

create table if not exists highlight.jersey_detections (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  track_id    uuid not null references highlight.player_tracks(id) on delete cascade,
  frame       integer not null,
  seconds     numeric(10,3) not null,
  -- NULL means the recogniser tried and could not read it. That abstention is
  -- recorded, because "readable in 9 of 61 frames" is information the UI shows
  -- and the metrics depend on. It is NOT stored as 0.
  jersey_number smallint,
  confidence    numeric(4,3),
  surface       extensions.citext not null default 'back',
  constraint jersey_det_unique unique (track_id, frame, surface),
  constraint jersey_det_number_range check (jersey_number is null or jersey_number between 0 and 99),
  constraint jersey_det_confidence_consistent check ((jersey_number is null) = (confidence is null)),
  constraint jersey_det_confidence_range check (confidence is null or confidence between 0 and 1),
  constraint jersey_det_surface_known check (surface in ('back','front','shoulder'))
);
comment on table highlight.jersey_detections is
  'Every attempt to read a number, successes and abstentions alike. jersey_number NULL = unreadable, never 0.';

create index if not exists jersey_det_track_idx on highlight.jersey_detections (track_id, frame);

create table if not exists highlight.ball_tracks (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  video_id     uuid not null references highlight.videos(id) on delete cascade,
  frame        integer not null,
  seconds      numeric(10,3) not null,
  box_x        numeric(6,5) not null,
  box_y        numeric(6,5) not null,
  box_w        numeric(6,5) not null,
  box_h        numeric(6,5) not null,
  -- Routinely low. The ball is small, brown and usually behind somebody.
  confidence   numeric(4,3) not null,
  carrier_track_id uuid references highlight.player_tracks(id) on delete set null,
  carrier_confidence numeric(4,3),
  constraint ball_unique unique (video_id, frame),
  constraint ball_confidence_range check (confidence between 0 and 1),
  constraint ball_carrier_consistent check (
    (carrier_track_id is null) = (carrier_confidence is null)),
  constraint ball_carrier_confidence_range check (
    carrier_confidence is null or carrier_confidence between 0 and 1)
);

create index if not exists ball_video_idx on highlight.ball_tracks (video_id, frame);

create table if not exists highlight.events (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  play_id     uuid not null references highlight.plays(id) on delete cascade,
  kind        highlight.event_kind not null,
  frame       integer not null,
  seconds     numeric(10,3) not null,
  -- NULL when the event happened but could not be attributed to anyone —
  -- which is the honest answer when the pile hid whoever made the tackle.
  track_id    uuid references highlight.player_tracks(id) on delete set null,
  confidence  numeric(4,3) not null,
  created_at  timestamptz not null default now(),
  constraint events_confidence_range check (confidence between 0 and 1)
);
comment on table highlight.events is
  'Football events, stored separately from clips so the football intelligence can improve without re-rendering video.';

create index if not exists events_play_idx  on highlight.events (play_id);
create index if not exists events_track_idx on highlight.events (track_id) where track_id is not null;

-- --- The selected athlete ---------------------------------------------------

create table if not exists highlight.player_identities (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  video_id      uuid not null references highlight.videos(id) on delete cascade,
  player_id     uuid not null references highlight.players(id) on delete cascade,
  track_id      uuid not null references highlight.player_tracks(id) on delete cascade,
  is_athlete    boolean not null,
  confidence    numeric(4,3) not null,
  source        highlight.identity_source not null,
  reasons       text[] not null default '{}',
  review_required boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint identities_unique unique (video_id, player_id, track_id),
  constraint identities_confidence_range check (confidence between 0 and 1),
  -- A decision the user cannot see the reasoning for is a decision they cannot
  -- correct, and correcting it is the entire recovery path.
  constraint identities_has_reasons check (array_length(reasons, 1) >= 1)
);

create index if not exists identities_video_idx on highlight.player_identities (video_id, player_id);

create table if not exists highlight.player_locks (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  video_id    uuid not null references highlight.videos(id) on delete cascade,
  player_id   uuid not null references highlight.players(id) on delete cascade,
  track_id    uuid not null references highlight.player_tracks(id) on delete cascade,
  from_frame  integer not null,
  to_frame    integer not null,
  -- TRUE is "this IS him"; FALSE is "this is NOT him". Both are human
  -- statements and both outrank every model output in their range.
  is_positive boolean not null,
  created_by  uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  constraint locks_frames_ordered check (to_frame >= from_frame),
  constraint locks_unique unique (video_id, player_id, track_id, from_frame, to_frame)
);
comment on table highlight.player_locks is
  'PLAYER LOCK (brief section 26). A human confirmed or rejected this track over this frame range. Nothing outranks it, and it becomes the anchor later re-identification is measured against.';

create table if not exists highlight.player_play_involvement (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  play_id       uuid not null references highlight.plays(id) on delete cascade,
  player_id     uuid not null references highlight.players(id) on delete cascade,
  player_present boolean not null,
  track_id      uuid references highlight.player_tracks(id) on delete set null,
  visibility_percentage numeric(4,3) not null,
  involvement   smallint not null,
  raw_score     numeric(4,2) not null,
  identity_confidence numeric(4,3) not null,
  reasons       text[] not null default '{}',
  events        highlight.event_kind[] not null default '{}',
  review_required boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint involvement_unique unique (play_id, player_id),
  constraint involvement_score_range check (involvement between 0 and 5),
  constraint involvement_raw_range check (raw_score >= 0 and raw_score <= 5),
  constraint involvement_visibility_range check (visibility_percentage between 0 and 1),
  constraint involvement_confidence_range check (identity_confidence between 0 and 1),
  -- Absent means absent. A score above "on the field" for a player who was not
  -- detected would be a number about nobody.
  constraint involvement_absent_scores_zero check (player_present or involvement = 0),
  constraint involvement_present_has_track check (not player_present or track_id is not null)
);
comment on table highlight.player_play_involvement is
  'What the engine concluded about the athlete on one play, with the reasons it concluded it.';

-- --- Highlights, clips, reels, exports --------------------------------------

create table if not exists highlight.highlight_candidates (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  play_id       uuid not null references highlight.plays(id) on delete cascade,
  player_id     uuid not null references highlight.players(id) on delete cascade,
  start_seconds numeric(10,3) not null,
  end_seconds   numeric(10,3) not null,
  involvement   smallint not null,
  score         numeric(3,1) not null,
  events        highlight.event_kind[] not null default '{}',
  reasons       text[] not null default '{}',
  review_required boolean not null default false,
  -- The human verdict. NULL = not yet reviewed, which is different from
  -- rejected and is counted differently in the acceptance metric.
  accepted      boolean,
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint candidates_unique unique (play_id, player_id),
  constraint candidates_window_ordered check (end_seconds > start_seconds),
  constraint candidates_score_range check (score >= 0 and score <= 5),
  constraint candidates_involvement_range check (involvement between 0 and 5),
  constraint candidates_review_consistent check ((reviewed_by is null) = (reviewed_at is null)),
  constraint candidates_verdict_has_reviewer check (accepted is null or reviewed_by is not null)
);

create index if not exists candidates_player_idx on highlight.highlight_candidates (player_id, score desc);

create table if not exists highlight.highlight_reels (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  player_id     uuid not null references highlight.players(id) on delete cascade,
  mode          highlight.reel_mode not null default 'game',
  title         text not null,
  season        extensions.citext not null,
  status        highlight.reel_status not null default 'draft',
  visibility    highlight.visibility not null default 'private',
  -- Set by trigger from the clips' videos. Not settable by hand.
  is_demo       boolean not null default false,
  spotlight_style extensions.citext not null default 'circle',
  aspect_ratio  highlight.aspect_ratio not null default '16:9',
  pre_snap_seconds  numeric(5,2) not null default 5,
  post_play_seconds numeric(5,2) not null default 8,
  include_opening_card boolean not null default true,
  include_closing_card boolean not null default true,
  output_object_path text,
  output_duration_seconds numeric(10,3),
  error         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint reels_title_present check (length(btrim(title)) > 0),
  constraint reels_padding_sane check (pre_snap_seconds >= 0 and pre_snap_seconds <= 30
                                       and post_play_seconds >= 0 and post_play_seconds <= 30),
  constraint reels_output_tenant_scoped
    check (output_object_path is null or output_object_path like tenant_id::text || '/%'),
  constraint reels_failed_has_reason check (status <> 'failed' or error is not null),
  -- A reel that says "ready" with no rendered file is a button that lies.
  constraint reels_ready_has_output
    check (status <> 'ready' or (output_object_path is not null and output_duration_seconds > 0))
);
comment on constraint reels_ready_has_output on highlight.highlight_reels is
  'READY means there is a watchable file. Without this, a render failure leaves a green reel the user cannot play.';

create table if not exists highlight.highlight_clips (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  reel_id        uuid not null references highlight.highlight_reels(id) on delete cascade,
  candidate_id   uuid references highlight.highlight_candidates(id) on delete set null,
  video_id       uuid not null references highlight.videos(id) on delete restrict,
  play_id        uuid references highlight.plays(id) on delete set null,
  position       integer not null,
  title          text not null,
  start_seconds  numeric(10,3) not null,
  end_seconds    numeric(10,3) not null,
  starred        boolean not null default false,
  spotlight_style extensions.citext not null default 'circle',
  clip_object_path text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint clips_position_unique unique (reel_id, position),
  constraint clips_window_ordered check (end_seconds > start_seconds),
  constraint clips_object_tenant_scoped
    check (clip_object_path is null or clip_object_path like tenant_id::text || '/%')
);

create index if not exists clips_reel_idx on highlight.highlight_clips (reel_id, position);

create table if not exists highlight.exports (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  reel_id       uuid not null references highlight.highlight_reels(id) on delete cascade,
  aspect_ratio  highlight.aspect_ratio not null,
  object_path   text,
  size_bytes    bigint,
  duration_seconds numeric(10,3),
  visibility    highlight.visibility not null default 'private',
  status        highlight.reel_status not null default 'draft',
  error         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint exports_object_tenant_scoped
    check (object_path is null or object_path like tenant_id::text || '/%'),
  constraint exports_ready_has_object
    check (status <> 'ready' or (object_path is not null and size_bytes > 0)),
  constraint exports_failed_has_reason check (status <> 'failed' or error is not null)
);

-- --- Corrections (the most valuable data in the system) ---------------------

create table if not exists highlight.user_corrections (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  video_id      uuid not null references highlight.videos(id) on delete cascade,
  player_id     uuid references highlight.players(id) on delete set null,
  track_id      uuid references highlight.player_tracks(id) on delete set null,
  play_id       uuid references highlight.plays(id) on delete set null,
  kind          highlight.correction_kind not null,
  -- What the model said, and what the human said instead. Both, always: a
  -- correction without the original is useless for improving the model.
  model_value   jsonb,
  corrected_value jsonb not null,
  corrected_by  uuid not null references auth.users(id) on delete restrict,
  created_at    timestamptz not null default now()
);
comment on table highlight.user_corrections is
  'Every time a human overruled the model, with what the model had said. Append-only: see highlight.deny_correction_mutation().';

create index if not exists corrections_video_idx on highlight.user_corrections (video_id, created_at desc);

-- Append-only, enforced for the worker too. A correction log that can be
-- rewritten is not a record of what happened, and these rows are the training
-- signal for every future improvement.
create or replace function highlight.deny_correction_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'highlight.user_corrections is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end; $$;

drop trigger if exists corrections_append_only on highlight.user_corrections;
create trigger corrections_append_only
  before update or delete on highlight.user_corrections
  for each row execute function highlight.deny_correction_mutation();

-- ===========================================================================
-- Guards
-- ===========================================================================

-- --- Nothing leaves private without a named human saying so -----------------
create or replace function highlight.enforce_video_sharing_consent()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.visibility = 'private' then return new; end if;
  if tg_op = 'UPDATE' and old.visibility = new.visibility then return new; end if;
  if not exists (
    select 1 from highlight.sharing_consents c
     where c.video_id = new.id and c.revoked_at is null and c.scope = new.visibility
  ) then
    raise exception 'video % cannot be made % without an active sharing consent', new.id, new.visibility
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists videos_require_consent on highlight.videos;
create trigger videos_require_consent
  before insert or update on highlight.videos
  for each row execute function highlight.enforce_video_sharing_consent();

-- --- Demo output cannot pass as real ----------------------------------------
-- A clip cut from a demo-analysed video forces its reel to is_demo. There is no
-- path, service-role included, that produces a reel claiming real analysis from
-- synthetic football.
create or replace function highlight.propagate_demo_flag()
returns trigger language plpgsql set search_path = '' as $$
declare v_demo boolean;
begin
  select v.is_demo into v_demo from highlight.videos v where v.id = new.video_id;
  if v_demo then
    update highlight.highlight_reels set is_demo = true, updated_at = now()
     where id = new.reel_id and is_demo = false;
  end if;
  return new;
end; $$;

drop trigger if exists clips_propagate_demo on highlight.highlight_clips;
create trigger clips_propagate_demo
  after insert or update of video_id on highlight.highlight_clips
  for each row execute function highlight.propagate_demo_flag();

-- --- A reel cannot be ready with nothing in it ------------------------------
create or replace function highlight.enforce_reel_ready()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'ready'
     and not exists (select 1 from highlight.highlight_clips c where c.reel_id = new.id) then
    raise exception 'reel % cannot be ready with no clips', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists reels_require_clips on highlight.highlight_reels;
create trigger reels_require_clips
  before insert or update on highlight.highlight_reels
  for each row execute function highlight.enforce_reel_ready();

-- --- A shared reel needs consent on every video it draws from ---------------
create or replace function highlight.enforce_reel_sharing_consent()
returns trigger language plpgsql set search_path = '' as $$
declare v_missing uuid;
begin
  if new.visibility = 'private' then return new; end if;
  if tg_op = 'UPDATE' and old.visibility = new.visibility then return new; end if;
  select c.video_id into v_missing
    from highlight.highlight_clips c
   where c.reel_id = new.id
     and not exists (
       select 1 from highlight.sharing_consents s
        where s.video_id = c.video_id and s.revoked_at is null and s.scope = new.visibility)
   limit 1;
  if v_missing is not null then
    raise exception 'reel % draws on video % which has no active % consent', new.id, v_missing, new.visibility
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists reels_require_consent on highlight.highlight_reels;
create trigger reels_require_consent
  before insert or update on highlight.highlight_reels
  for each row execute function highlight.enforce_reel_sharing_consent();

-- --- Triggers: housekeeping and audit ---------------------------------------
create trigger teams_set_updated_at   before update on highlight.teams
  for each row execute function platform.set_updated_at();
create trigger players_set_updated_at before update on highlight.players
  for each row execute function platform.set_updated_at();
create trigger games_set_updated_at   before update on highlight.games
  for each row execute function platform.set_updated_at();
create trigger videos_set_updated_at  before update on highlight.videos
  for each row execute function platform.set_updated_at();
create trigger ai_jobs_set_updated_at before update on highlight.ai_jobs
  for each row execute function platform.set_updated_at();
create trigger reels_set_updated_at   before update on highlight.highlight_reels
  for each row execute function platform.set_updated_at();
create trigger clips_set_updated_at   before update on highlight.highlight_clips
  for each row execute function platform.set_updated_at();

create trigger players_audit  after insert or update or delete on highlight.players
  for each row execute function audit.emit();
create trigger games_audit    after insert or update or delete on highlight.games
  for each row execute function audit.emit();
create trigger videos_audit   after insert or update or delete on highlight.videos
  for each row execute function audit.emit();
create trigger consents_audit after insert or update or delete on highlight.sharing_consents
  for each row execute function audit.emit();
create trigger locks_audit    after insert or update or delete on highlight.player_locks
  for each row execute function audit.emit();
create trigger reels_audit    after insert or update or delete on highlight.highlight_reels
  for each row execute function audit.emit();
create trigger exports_audit  after insert or update or delete on highlight.exports
  for each row execute function audit.emit();

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table highlight.teams                    enable row level security;
alter table highlight.teams                    force  row level security;
alter table highlight.players                  enable row level security;
alter table highlight.players                  force  row level security;
alter table highlight.roster_entries           enable row level security;
alter table highlight.roster_entries           force  row level security;
alter table highlight.games                    enable row level security;
alter table highlight.games                    force  row level security;
alter table highlight.videos                   enable row level security;
alter table highlight.videos                   force  row level security;
alter table highlight.sharing_consents         enable row level security;
alter table highlight.sharing_consents         force  row level security;
alter table highlight.ai_jobs                  enable row level security;
alter table highlight.ai_jobs                  force  row level security;
alter table highlight.job_stages               enable row level security;
alter table highlight.job_stages               force  row level security;
alter table highlight.team_classifications     enable row level security;
alter table highlight.team_classifications     force  row level security;
alter table highlight.plays                    enable row level security;
alter table highlight.plays                    force  row level security;
alter table highlight.player_tracks            enable row level security;
alter table highlight.player_tracks            force  row level security;
alter table highlight.player_detections        enable row level security;
alter table highlight.player_detections        force  row level security;
alter table highlight.jersey_detections        enable row level security;
alter table highlight.jersey_detections        force  row level security;
alter table highlight.ball_tracks              enable row level security;
alter table highlight.ball_tracks              force  row level security;
alter table highlight.events                   enable row level security;
alter table highlight.events                   force  row level security;
alter table highlight.player_identities        enable row level security;
alter table highlight.player_identities        force  row level security;
alter table highlight.player_locks             enable row level security;
alter table highlight.player_locks             force  row level security;
alter table highlight.player_play_involvement  enable row level security;
alter table highlight.player_play_involvement  force  row level security;
alter table highlight.highlight_candidates     enable row level security;
alter table highlight.highlight_candidates     force  row level security;
alter table highlight.highlight_reels          enable row level security;
alter table highlight.highlight_reels          force  row level security;
alter table highlight.highlight_clips          enable row level security;
alter table highlight.highlight_clips          force  row level security;
alter table highlight.exports                  enable row level security;
alter table highlight.exports                  force  row level security;
alter table highlight.user_corrections         enable row level security;
alter table highlight.user_corrections         force  row level security;

-- SELECT policies. Read is tenant-scoped and permission-gated; there are no
-- INSERT/UPDATE/DELETE policies anywhere in this schema.
do $$
declare t text;
begin
  foreach t in array array[
    'teams','players','roster_entries','games','videos','sharing_consents','ai_jobs',
    'job_stages','team_classifications','plays','player_tracks','player_detections',
    'jersey_detections','ball_tracks','events','player_identities','player_locks',
    'player_play_involvement','highlight_candidates','highlight_reels',
    'highlight_clips','exports','user_corrections']
  loop
    execute format('drop policy if exists %I_select on highlight.%I', t, t);
    execute format(
      'create policy %I_select on highlight.%I for select to authenticated '
      || 'using (identity.has_permission(tenant_id, ''highlight.film.read'') '
      || 'or identity.is_platform_admin())', t, t);
    execute format('grant select on highlight.%I to authenticated', t);
  end loop;
end $$;

-- ===========================================================================
-- Tenant-facing write paths (permission-gated SECURITY DEFINER)
--
-- Note what is NOT here: there is no function a tenant can call to write a
-- detection, a track, a jersey reading, a play, an event or an involvement
-- score. Those have no tenant write path at all, by design.
-- ===========================================================================

create or replace function highlight.create_team(
  p_tenant uuid, p_name text, p_jersey extensions.citext, p_number_color extensions.citext,
  p_helmet extensions.citext default null, p_pants extensions.citext default null,
  p_level highlight.level default 'high_school')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'highlight.team.manage') then
    raise exception 'insufficient privilege to manage a team' using errcode = 'insufficient_privilege';
  end if;
  insert into highlight.teams (tenant_id, name, jersey_color, number_color, helmet_color, pants_color, level)
  values (p_tenant, p_name, p_jersey, p_number_color, p_helmet, p_pants, p_level)
  on conflict (tenant_id, name) do update
    set jersey_color = excluded.jersey_color, number_color = excluded.number_color,
        helmet_color = excluded.helmet_color, pants_color = excluded.pants_color,
        level = excluded.level, updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function highlight.create_team(uuid, text, extensions.citext, extensions.citext, extensions.citext, extensions.citext, highlight.level) from public, anon;
grant execute on function highlight.create_team(uuid, text, extensions.citext, extensions.citext, extensions.citext, extensions.citext, highlight.level) to authenticated;

create or replace function highlight.create_player(
  p_tenant uuid, p_team uuid, p_name text, p_number smallint,
  p_positions highlight.position_code[] default '{}', p_double_zero boolean default false,
  p_graduation_year smallint default null, p_school text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'highlight.player.manage') then
    raise exception 'insufficient privilege to manage a player' using errcode = 'insufficient_privilege';
  end if;
  insert into highlight.players (tenant_id, team_id, name, jersey_number, double_zero,
                                 positions, graduation_year, school)
  values (p_tenant, p_team, p_name, p_number, p_double_zero,
          coalesce(p_positions, '{}'), p_graduation_year, p_school)
  returning id into v_id;
  perform events.emit('highlight.player.created', p_tenant,
    jsonb_build_object('player', v_id, 'number', p_number));
  return v_id;
end; $$;
revoke all on function highlight.create_player(uuid, uuid, text, smallint, highlight.position_code[], boolean, smallint, text) from public, anon;
grant execute on function highlight.create_player(uuid, uuid, text, smallint, highlight.position_code[], boolean, smallint, text) to authenticated;

create or replace function highlight.create_game(
  p_tenant uuid, p_team uuid, p_name text, p_opponent text, p_played_on date,
  p_level highlight.level, p_camera highlight.camera_type, p_season extensions.citext)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'highlight.game.manage') then
    raise exception 'insufficient privilege to create a game' using errcode = 'insufficient_privilege';
  end if;
  insert into highlight.games (tenant_id, team_id, name, opponent_name, played_on,
                               level, camera_type, season, created_by)
  values (p_tenant, p_team, p_name, p_opponent, p_played_on, p_level, p_camera, p_season, auth.uid())
  returning id into v_id;
  perform events.emit('highlight.game.created', p_tenant, jsonb_build_object('game', v_id));
  return v_id;
end; $$;
revoke all on function highlight.create_game(uuid, uuid, text, text, date, highlight.level, highlight.camera_type, extensions.citext) from public, anon;
grant execute on function highlight.create_game(uuid, uuid, text, text, date, highlight.level, highlight.camera_type, extensions.citext) to authenticated;

-- Register an uploaded file. The bytes go straight to object storage; this
-- records where they landed. `status` starts at 'uploaded' and only the worker
-- moves it, so a tenant cannot mark their own video 'ready'.
create or replace function highlight.register_video(
  p_tenant uuid, p_game uuid, p_object_path text, p_filename text,
  p_mime extensions.citext, p_size bigint)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'highlight.video.create') then
    raise exception 'insufficient privilege to upload game film' using errcode = 'insufficient_privilege';
  end if;
  insert into highlight.videos (tenant_id, game_id, object_path, original_filename,
                                mime_type, size_bytes, uploaded_by)
  values (p_tenant, p_game, p_object_path, p_filename, p_mime, p_size, auth.uid())
  returning id into v_id;
  perform events.emit('highlight.video.uploaded', p_tenant,
    jsonb_build_object('video', v_id, 'game', p_game, 'bytes', p_size));
  return v_id;
end; $$;
revoke all on function highlight.register_video(uuid, uuid, text, text, extensions.citext, bigint) from public, anon;
grant execute on function highlight.register_video(uuid, uuid, text, text, extensions.citext, bigint) to authenticated;

-- PLAYER LOCK / "NOT MY PLAYER". The one place a human overrules the models.
create or replace function highlight.set_player_lock(
  p_video uuid, p_player uuid, p_track uuid, p_from integer, p_to integer, p_positive boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from highlight.videos where id = p_video;
  if not found then raise exception 'video % not found', p_video using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'highlight.identity.update') then
    raise exception 'insufficient privilege to confirm a player' using errcode = 'insufficient_privilege';
  end if;
  insert into highlight.player_locks (tenant_id, video_id, player_id, track_id,
                                      from_frame, to_frame, is_positive, created_by)
  values (v_tenant, p_video, p_player, p_track, p_from, p_to, p_positive, auth.uid())
  on conflict (video_id, player_id, track_id, from_frame, to_frame) do update
    set is_positive = excluded.is_positive
  returning id into v_id;

  insert into highlight.user_corrections (tenant_id, video_id, player_id, track_id, kind,
                                          corrected_value, corrected_by)
  values (v_tenant, p_video, p_player, p_track,
          case when p_positive then 'confirm_player' else 'reject_player' end::highlight.correction_kind,
          jsonb_build_object('from_frame', p_from, 'to_frame', p_to, 'is_positive', p_positive),
          auth.uid());

  perform events.emit('highlight.player.locked', v_tenant,
    jsonb_build_object('video', p_video, 'player', p_player, 'track', p_track, 'positive', p_positive));
  return v_id;
end; $$;
revoke all on function highlight.set_player_lock(uuid, uuid, uuid, integer, integer, boolean) from public, anon;
grant execute on function highlight.set_player_lock(uuid, uuid, uuid, integer, integer, boolean) to authenticated;

-- Accept or reject a proposed clip. This is the human verdict the acceptance
-- metric is computed from, so it records who and when, not just what.
create or replace function highlight.review_candidate(p_candidate uuid, p_accepted boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from highlight.highlight_candidates where id = p_candidate;
  if not found then raise exception 'candidate % not found', p_candidate using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'highlight.reel.update') then
    raise exception 'insufficient privilege to review a highlight' using errcode = 'insufficient_privilege';
  end if;
  update highlight.highlight_candidates
     set accepted = p_accepted, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_candidate;
  insert into highlight.user_corrections (tenant_id, video_id, play_id, kind, corrected_value, corrected_by)
  select v_tenant, p.video_id, c.play_id,
         case when p_accepted then 'accept_clip' else 'reject_clip' end::highlight.correction_kind,
         jsonb_build_object('accepted', p_accepted), auth.uid()
    from highlight.highlight_candidates c join highlight.plays p on p.id = c.play_id
   where c.id = p_candidate;
end; $$;
revoke all on function highlight.review_candidate(uuid, boolean) from public, anon;
grant execute on function highlight.review_candidate(uuid, boolean) to authenticated;

create or replace function highlight.create_reel(
  p_tenant uuid, p_player uuid, p_title text, p_season extensions.citext,
  p_mode highlight.reel_mode default 'game')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'highlight.reel.update') then
    raise exception 'insufficient privilege to build a reel' using errcode = 'insufficient_privilege';
  end if;
  insert into highlight.highlight_reels (tenant_id, player_id, title, season, mode, created_by)
  values (p_tenant, p_player, p_title, p_season, p_mode, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function highlight.create_reel(uuid, uuid, text, extensions.citext, highlight.reel_mode) from public, anon;
grant execute on function highlight.create_reel(uuid, uuid, text, extensions.citext, highlight.reel_mode) to authenticated;

create or replace function highlight.add_clip(
  p_reel uuid, p_candidate uuid, p_position integer, p_title text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_video uuid; v_play uuid; v_start numeric; v_end numeric; v_id uuid;
begin
  select tenant_id into v_tenant from highlight.highlight_reels where id = p_reel;
  if not found then raise exception 'reel % not found', p_reel using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'highlight.reel.update') then
    raise exception 'insufficient privilege to edit a reel' using errcode = 'insufficient_privilege';
  end if;
  -- The clip window comes from the CANDIDATE, which came from the engine.
  -- A caller cannot supply arbitrary in/out points here and thereby cut off the
  -- end of a play.
  select p.video_id, c.play_id, c.start_seconds, c.end_seconds
    into v_video, v_play, v_start, v_end
    from highlight.highlight_candidates c join highlight.plays p on p.id = c.play_id
   where c.id = p_candidate;
  if v_video is null then
    raise exception 'candidate % not found', p_candidate using errcode = 'no_data_found';
  end if;
  insert into highlight.highlight_clips (tenant_id, reel_id, candidate_id, video_id, play_id,
                                         position, title, start_seconds, end_seconds)
  values (v_tenant, p_reel, p_candidate, v_video, v_play, p_position,
          coalesce(p_title, 'Play'), v_start, v_end)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function highlight.add_clip(uuid, uuid, integer, text) from public, anon;
grant execute on function highlight.add_clip(uuid, uuid, integer, text) to authenticated;

create or replace function highlight.grant_sharing_consent(
  p_video uuid, p_scope highlight.visibility, p_is_minor boolean,
  p_guardian_name text default null, p_player uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from highlight.videos where id = p_video;
  if not found then raise exception 'video % not found', p_video using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'highlight.sharing.manage') then
    raise exception 'insufficient privilege to share athlete footage' using errcode = 'insufficient_privilege';
  end if;
  insert into highlight.sharing_consents (tenant_id, video_id, player_id, granted_by,
                                          guardian_name, is_minor, scope)
  values (v_tenant, p_video, p_player, auth.uid(), p_guardian_name, p_is_minor, p_scope)
  returning id into v_id;
  perform events.emit('highlight.sharing.consented', v_tenant,
    jsonb_build_object('video', p_video, 'scope', p_scope, 'minor', p_is_minor));
  return v_id;
end; $$;
revoke all on function highlight.grant_sharing_consent(uuid, highlight.visibility, boolean, text, uuid) from public, anon;
grant execute on function highlight.grant_sharing_consent(uuid, highlight.visibility, boolean, text, uuid) to authenticated;

-- ===========================================================================
-- Permissions
-- ===========================================================================

insert into identity.permissions (key, description, scope) values
  ('highlight.film.read',      'Read a tenant''s game film, plays, tracks and highlights.', 'tenant'),
  ('highlight.video.create',   'Upload game film.', 'tenant'),
  ('highlight.game.manage',    'Create and edit games.', 'tenant'),
  ('highlight.team.manage',    'Create and edit teams and their uniforms.', 'tenant'),
  ('highlight.player.manage',  'Create and edit athlete profiles.', 'tenant'),
  ('highlight.identity.update','Confirm or reject which tracked player is the athlete.', 'tenant'),
  ('highlight.reel.update',      'Review clips and build highlight reels.', 'tenant'),
  ('highlight.export.create',    'Export a finished highlight reel.', 'tenant'),
  ('highlight.sharing.manage', 'Grant consent for athlete footage to leave private.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','highlight.film.read'),      ('tenant_owner','highlight.video.create'),
  ('tenant_owner','highlight.game.manage'),    ('tenant_owner','highlight.team.manage'),
  ('tenant_owner','highlight.player.manage'),  ('tenant_owner','highlight.identity.update'),
  ('tenant_owner','highlight.reel.update'),      ('tenant_owner','highlight.export.create'),
  ('tenant_owner','highlight.sharing.manage'),
  ('tenant_admin','highlight.film.read'),      ('tenant_admin','highlight.video.create'),
  ('tenant_admin','highlight.game.manage'),    ('tenant_admin','highlight.team.manage'),
  ('tenant_admin','highlight.player.manage'),  ('tenant_admin','highlight.identity.update'),
  ('tenant_admin','highlight.reel.update'),      ('tenant_admin','highlight.export.create'),
  ('tenant_admin','highlight.sharing.manage'),
  -- A coach can do everything with the film except decide that a child's
  -- footage may leave private. That is a guardian's decision, not a staff one.
  ('manager','highlight.film.read'),           ('manager','highlight.video.create'),
  ('manager','highlight.game.manage'),         ('manager','highlight.player.manage'),
  ('manager','highlight.identity.update'),      ('manager','highlight.reel.update'),
  ('manager','highlight.export.create'),
  ('staff','highlight.film.read'),             ('staff','highlight.identity.update'),
  ('staff','highlight.reel.update'),
  ('viewer','highlight.film.read')
on conflict do nothing;

-- NOTE ON events.subscriptions: this module EMITS the three topics above via
-- events.emit(), but ships no consumer for them. events.subscriptions is a
-- catalog of consumers, and seeding a row there with nothing behind it would
-- create a delivery queue that nobody drains -- a control that does not
-- control anything. When a consumer exists, it registers itself.
