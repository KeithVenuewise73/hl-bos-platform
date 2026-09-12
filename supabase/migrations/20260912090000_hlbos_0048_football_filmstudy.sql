-- ===========================================================================
-- hlbos_0048_football_filmstudy — Football FilmStudy AI, Phase 1
--
-- "Upload the film. Understand the game. Coach the next rep."
--
-- Herman Legacy Group -> Venuewise -> Football FilmStudy AI.
--
-- WHAT THIS MIGRATION IS
-- ----------------------
-- The Phase 1 "Film Operating System" from the build brief section 46: teams,
-- seasons, roster, opponents, games, film upload, MANUAL play segmentation,
-- play tagging, player participation, grading, coaching notes, clips,
-- playlists and film assignments. It is the complete data spine behind the
-- brief's section 54 vertical slice.
--
-- It is NOT Phase 3 computer vision. There is no play detector, no player
-- detector and no jersey-number recognition in this platform, so this
-- migration creates no table that pretends otherwise. `filmstudy.predictions`
-- exists because section 34 mandates that an AI guess is stored separately
-- from a coach's confirmed football data -- and the only writer of it today is
-- service_role plus the explicitly-labelled demo seed. No tenant user path can
-- write a prediction, and nothing in the product manufactures one.
--
-- WHAT IT REUSES RATHER THAN REBUILDS
-- -----------------------------------
--   platform.tenants        the football organization. No second tenant model.
--   identity.memberships    who the user is. No second user or password system.
--   identity.has_permission THE capability check. No second permission engine.
--   audit.emit()            the trail. Film access and grade changes are
--                           security-relevant, so they are audited here.
--   events.emit()           observability. No second queue.
--   platform.set_updated_at the timestamp trigger.
--
-- Two things are deliberately NOT reused:
--
--   storage_meta.files caps an object at 50 MiB (files_size_within_limit).
--   A single Friday-night game film is routinely 2-8 GiB. Registering film
--   through that table would fail at the CHECK constraint for every real
--   upload, so film bytes get their own record and their own private bucket
--   with a ceiling that matches the medium. Everything else about the pattern
--   -- tenant-prefixed object paths, pending -> stored lifecycle, no direct
--   tenant write path -- is copied exactly.
--
--   The five platform roles (tenant_owner .. viewer) describe organizational
--   authority, not football authority. A head coach and a parent can both be
--   `staff` in the tenant and must not see the same film. So authority is
--   TWO layers, and both must pass:
--     1. identity.has_permission(tenant, 'filmstudy.*')  -- may you do this?
--     2. filmstudy.team_members.football_role            -- on whose team, and
--                                                           as what?
--   Layer 2 is what stops an athlete reading opponent scouting film and a
--   parent reading coach-only grades. It is enforced in RLS, not in the UI.
--
-- ANTI-FABRICATION (Principle 10)
-- -------------------------------
-- Every football fact in `filmstudy.plays` is a COACH-CONFIRMED value. There
-- is no code path, in this migration or the application, that lets a model
-- write a play's formation, coverage or result. A prediction is offered to a
-- coach; the coach accepts, edits or rejects it; `filmstudy.confirmations`
-- records which of those happened, by whom and when. That is how we can always
-- answer "did a human verify this?" -- which is the whole point of section 34.
--
-- Demo data (brief section 47) is real rows, so it is fenced rather than
-- imagined: filmstudy.seed_demo_program() must be invoked deliberately, it
-- refuses to run twice, and every row it creates hangs off a team with
-- is_demo = true. The application badges those teams. Demo film has no video
-- object behind it and its status says so -- it is `demo_no_video`, never
-- `ready`, so no screen can imply a film exists that does not.
--
-- rollback:
--   DROP SCHEMA IF EXISTS filmstudy CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'filmstudy.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'filmstudy.%';
--   (Additive: creates a new schema and touches no existing table, so dropping
--    the schema plus those two DELETEs restores the prior state exactly.)
-- ===========================================================================

create schema if not exists filmstudy;
comment on schema filmstudy is
  'Football FilmStudy AI (Venuewise). Phase 1 film operating system. NOT exposed via PostgREST directly -- reads go through RLS-protected views in `public` is NOT used either; the app uses the schema via a PostgREST schema grant configured at deploy.';
revoke all on schema filmstudy from public, anon, authenticated;
grant usage on schema filmstudy to authenticated;
alter default privileges in schema filmstudy revoke all on tables from public;
alter default privileges in schema filmstudy revoke all on functions from public;

-- ===========================================================================
-- Types
-- ===========================================================================

-- Levels are ordered youngest to oldest so a future "this rule applies at
-- college and above" check is a comparison, not a list. Section 4 requires
-- that college/professional expansion stays cheap.
do $$ begin create type filmstudy.competition_level as enum
  ('youth','middle_school','high_school','college','semi_pro','professional');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.film_kind as enum
  ('game','practice','scrimmage','individual_workout','opponent');
  exception when duplicate_object then null; end $$;

-- `demo_no_video` is a terminal state that exists so demo film cannot lie.
-- A demo film asset has plays and tags but no bytes; calling it `ready` would
-- put a play button on screen that can never play anything.
do $$ begin create type filmstudy.film_status as enum
  ('registered','uploading','stored','ready','failed','demo_no_video');
  exception when duplicate_object then null; end $$;

-- Football authority, scoped to one team. `analyst` is staff without a unit.
do $$ begin create type filmstudy.football_role as enum
  ('org_admin','head_coach','coordinator','position_coach','analyst','athlete','parent');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.unit as enum ('offense','defense','special_teams');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.venue as enum ('home','away','neutral');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.hash_mark as enum ('left','middle','right');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.play_family as enum ('run','pass','special_teams','penalty_only');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.field_direction as enum ('left','middle','right');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.grade_scale as enum ('symbol','numeric');
  exception when duplicate_object then null; end $$;

-- The brief's default symbol ladder (section 15), named rather than punctuated
-- so it survives a CSV export and a JSON round-trip.
do $$ begin create type filmstudy.grade_symbol as enum
  ('exceptional','positive','neutral','negative','major_error');
  exception when duplicate_object then null; end $$;

-- Section 8: AI results are never presented as unquestionable facts.
do $$ begin create type filmstudy.prediction_state as enum
  ('ai_suggested','coach_confirmed','coach_corrected','rejected');
  exception when duplicate_object then null; end $$;

-- How a confirmed field on a play came to hold its value. `manual` means a
-- coach typed it with no model involved -- which is every field in Phase 1.
do $$ begin create type filmstudy.confirmation_kind as enum
  ('manual','accepted_prediction','corrected_prediction','imported');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.assignment_kind as enum
  ('review','correct','study','great_rep','technique','mental_error','opponent_tendency');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.assignment_status as enum
  ('assigned','viewed','acknowledged','completed');
  exception when duplicate_object then null; end $$;

do $$ begin create type filmstudy.player_link_kind as enum ('self','guardian');
  exception when duplicate_object then null; end $$;

-- ===========================================================================
-- Teams and people
-- ===========================================================================

create table if not exists filmstudy.teams (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id          uuid not null references platform.tenants(id) on delete cascade,
  name               text not null,
  level              filmstudy.competition_level not null default 'high_school',
  mascot             text,
  primary_color      text,
  secondary_color    text,
  grade_scale        filmstudy.grade_scale not null default 'symbol',
  -- Youth-athlete privacy (section 38) defaults to the closed position. A
  -- program opts IN to showing grades to athletes and to letting guardians in
  -- at all. Defaulting either of these to true would publish a 14-year-old's
  -- negative grades to their household on day one.
  athletes_see_grades   boolean not null default false,
  guardian_access       boolean not null default false,
  guardians_see_grades  boolean not null default false,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,

  constraint teams_name_not_blank check (length(btrim(name)) > 0),
  constraint teams_name_unique_per_tenant unique (tenant_id, name),
  -- Guardians cannot see grades unless guardians can see anything at all.
  constraint teams_guardian_grades_requires_access
    check (not guardians_see_grades or guardian_access),
  -- Referenced by every child table's composite FK. This is what makes a
  -- cross-tenant row structurally impossible rather than policy-dependent.
  constraint teams_id_tenant_unique unique (id, tenant_id)
);
comment on table filmstudy.teams is
  'A football team within a tenant organization. is_demo marks the brief section 47 demo program so no screen can mistake it for real film.';
comment on column filmstudy.teams.athletes_see_grades is
  'Closed by default. A coach grade is coaching information before it is athlete feedback; the program decides when it becomes the latter.';

create index if not exists teams_tenant_idx on filmstudy.teams (tenant_id);
create trigger teams_set_updated_at before update on filmstudy.teams
  for each row execute function platform.set_updated_at();

-- --- Seasons ---------------------------------------------------------------
create table if not exists filmstudy.seasons (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  team_id     uuid not null,
  tenant_id   uuid not null,
  year        integer not null,
  label       text not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint seasons_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint seasons_year_sane check (year between 1950 and 2200),
  constraint seasons_unique_per_team unique (team_id, year),
  constraint seasons_id_team_unique unique (id, team_id)
);
create unique index if not exists seasons_one_current_per_team_idx
  on filmstudy.seasons (team_id) where is_current;
create trigger seasons_set_updated_at before update on filmstudy.seasons
  for each row execute function platform.set_updated_at();

-- --- Team membership: football authority -----------------------------------
create table if not exists filmstudy.team_members (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  team_id        uuid not null,
  tenant_id      uuid not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  football_role  filmstudy.football_role not null,
  -- Which unit a coordinator runs, or which group a position coach owns.
  unit           filmstudy.unit,
  position_group extensions.citext,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint team_members_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint team_members_one_role_per_team unique (team_id, user_id)
);
comment on table filmstudy.team_members is
  'Football authority on ONE team. Layer 2 of the two-layer access model: identity.has_permission says whether you may grade at all, this says whose film you may grade.';

create index if not exists team_members_user_idx on filmstudy.team_members (user_id);
create index if not exists team_members_team_idx on filmstudy.team_members (team_id, football_role);
create trigger team_members_set_updated_at before update on filmstudy.team_members
  for each row execute function platform.set_updated_at();

-- --- Roster ----------------------------------------------------------------
create table if not exists filmstudy.players (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  team_id        uuid not null,
  tenant_id      uuid not null,
  jersey_number  smallint,
  first_name     text not null,
  last_name      text not null,
  position       extensions.citext,
  unit           filmstudy.unit,
  class_year     text,
  height_inches  smallint,
  weight_pounds  smallint,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint players_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint players_name_not_blank
    check (length(btrim(first_name)) > 0 and length(btrim(last_name)) > 0),
  constraint players_jersey_range check (jersey_number is null or jersey_number between 0 and 99),
  constraint players_height_sane check (height_inches is null or height_inches between 36 and 96),
  constraint players_weight_sane check (weight_pounds is null or weight_pounds between 50 and 500),
  constraint players_id_team_unique unique (id, team_id)
);
comment on column filmstudy.players.jersey_number is
  'Nullable and NOT unique. Two players share a number on most real rosters (one offense, one defense), and youth teams often have none at all. Making this unique would reject correct data.';

create index if not exists players_team_idx on filmstudy.players (team_id, active);
create index if not exists players_number_idx on filmstudy.players (team_id, jersey_number);
create trigger players_set_updated_at before update on filmstudy.players
  for each row execute function platform.set_updated_at();

-- --- Who a user IS, on the roster ------------------------------------------
-- An athlete user links to their own player row; a guardian links to a child's.
-- Separate from team_members because one guardian may have two children on the
-- same team, which a (team, user) unique key would forbid.
create table if not exists filmstudy.player_links (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  team_id      uuid not null,
  player_id    uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  link_kind    filmstudy.player_link_kind not null,
  created_at   timestamptz not null default now(),

  constraint player_links_player_fk foreign key (player_id, team_id)
    references filmstudy.players (id, team_id) on delete cascade,
  constraint player_links_unique unique (player_id, user_id)
);
create index if not exists player_links_user_idx on filmstudy.player_links (user_id);

-- --- Opponents and games ---------------------------------------------------
create table if not exists filmstudy.opponents (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  team_id     uuid not null,
  tenant_id   uuid not null,
  name        text not null,
  mascot      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint opponents_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint opponents_name_not_blank check (length(btrim(name)) > 0),
  constraint opponents_unique_per_team unique (team_id, name),
  constraint opponents_id_team_unique unique (id, team_id)
);
create trigger opponents_set_updated_at before update on filmstudy.opponents
  for each row execute function platform.set_updated_at();

create table if not exists filmstudy.games (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  team_id      uuid not null,
  tenant_id    uuid not null,
  season_id    uuid,
  opponent_id  uuid,
  kickoff_at   timestamptz,
  venue        filmstudy.venue not null default 'home',
  location     text,
  week         smallint,
  -- Scores are nullable because an upcoming game has none. A zero would read
  -- as a 0-0 result on the dashboard's NEXT GAME card.
  team_score      smallint,
  opponent_score  smallint,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint games_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint games_season_fk foreign key (season_id, team_id)
    references filmstudy.seasons (id, team_id) on delete set null,
  constraint games_opponent_fk foreign key (opponent_id, team_id)
    references filmstudy.opponents (id, team_id) on delete set null,
  constraint games_scores_sane check (
    (team_score is null or team_score between 0 and 200)
    and (opponent_score is null or opponent_score between 0 and 200)),
  constraint games_week_sane check (week is null or week between 0 and 25),
  constraint games_id_team_unique unique (id, team_id)
);
comment on column filmstudy.games.team_score is
  'NULL until the game is played. Never defaulted to 0 -- an unplayed game must not render as a 0-0 loss.';

create index if not exists games_team_kickoff_idx on filmstudy.games (team_id, kickoff_at desc);
create trigger games_set_updated_at before update on filmstudy.games
  for each row execute function platform.set_updated_at();

-- ===========================================================================
-- Film
-- ===========================================================================

create table if not exists filmstudy.film_assets (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  team_id           uuid not null,
  tenant_id         uuid not null,
  game_id           uuid,
  season_id         uuid,
  title             text not null,
  film_kind         filmstudy.film_kind not null,
  unit              filmstudy.unit,
  status            filmstudy.film_status not null default 'registered',
  bucket            extensions.citext not null default 'film-private',
  object_path       text,
  original_filename text,
  mime_type         extensions.citext,
  size_bytes        bigint,
  duration_seconds  numeric(10,3),
  recorded_on       date,
  notes             text,
  -- Section 3: an athlete sees assigned film. A coach may also open a whole
  -- film to the squad. Opponent film is never athlete-visible -- enforced
  -- below as a CHECK, not as a habit.
  athlete_visible   boolean not null default false,
  uploaded_by       uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint film_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint film_game_fk foreign key (game_id, team_id)
    references filmstudy.games (id, team_id) on delete set null,
  constraint film_season_fk foreign key (season_id, team_id)
    references filmstudy.seasons (id, team_id) on delete set null,
  constraint film_title_not_blank check (length(btrim(title)) > 0),
  -- Cross-tenant path prevention, structural (copied from storage_meta.files):
  -- an object cannot live outside its own tenant's prefix.
  constraint film_path_is_tenant_scoped
    check (object_path is null or object_path like tenant_id::text || '/%'),
  -- 16 GiB. A 4K 48-minute game film runs 6-10 GiB; the cap is the medium's,
  -- not an arbitrary 50 MiB inherited from document storage.
  constraint film_size_within_limit
    check (size_bytes is null or (size_bytes > 0 and size_bytes <= 17179869184)),
  constraint film_duration_positive
    check (duration_seconds is null or duration_seconds > 0),
  -- A film that claims to be playable must have bytes behind it.
  constraint film_ready_requires_object
    check (status <> 'ready' or (object_path is not null and size_bytes is not null)),
  -- ...and a demo film must NOT, so it can never be mistaken for playable.
  constraint film_demo_has_no_object
    check (status <> 'demo_no_video' or object_path is null),
  constraint film_opponent_never_athlete_visible
    check (not (film_kind = 'opponent' and athlete_visible)),
  constraint film_bucket_path_unique unique (bucket, object_path),
  constraint film_id_team_unique unique (id, team_id)
);
comment on table filmstudy.film_assets is
  'One uploaded film. Bytes live in a private Supabase Storage bucket; this is the record. Not storage_meta.files: that table caps an object at 50 MiB, which no real game film has ever been.';
comment on constraint film_opponent_never_athlete_visible on filmstudy.film_assets is
  'Opponent scouting film is coach-only (section 3). Enforced in the schema so no admin screen can toggle it open by mistake.';

create index if not exists film_team_idx on filmstudy.film_assets (team_id, created_at desc);
create index if not exists film_game_idx on filmstudy.film_assets (game_id);
create index if not exists film_kind_idx on filmstudy.film_assets (team_id, film_kind, status);
create trigger film_set_updated_at before update on filmstudy.film_assets
  for each row execute function platform.set_updated_at();
-- Film access is security-relevant: game film is proprietary (section 38).
create trigger film_audit after insert or update or delete on filmstudy.film_assets
  for each row execute function audit.emit();

-- ===========================================================================
-- Plays -- CONFIRMED football data only
-- ===========================================================================
--
-- Every column below holds what a coach entered or accepted. Nothing writes
-- here from a model. Section 34's separation is the reason this table has no
-- `confidence` column: a confidence score on a confirmed fact is a category
-- error. Confidence lives on filmstudy.predictions, which is a different
-- table with a different writer and a different meaning.
create table if not exists filmstudy.plays (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  team_id         uuid not null,
  tenant_id       uuid not null,
  film_asset_id   uuid not null,
  game_id         uuid,
  play_number     integer not null,

  -- Segmentation (Phase 1 is manual: a coach marks S and E).
  start_seconds   numeric(10,3) not null,
  end_seconds     numeric(10,3) not null,
  snap_seconds    numeric(10,3),

  -- Situation
  quarter         smallint,
  clock           text,
  down            smallint,
  distance        smallint,
  yard_line       smallint,          -- 0-100 from our own goal line
  hash            filmstudy.hash_mark,
  possession      filmstudy.unit,    -- which of OUR units was on the field
  team_score      smallint,
  opponent_score  smallint,

  -- Offense
  personnel       extensions.citext, -- '11', '12', '21' ...
  formation       extensions.citext,
  strength        filmstudy.field_direction,
  motion          extensions.citext,
  shift           extensions.citext,
  play_call       text,              -- the team's own words
  family          filmstudy.play_family,
  concept         extensions.citext,
  direction       filmstudy.field_direction,

  -- Defense
  defensive_front extensions.citext,
  box_count       smallint,
  coverage        extensions.citext,
  pressure        extensions.citext,

  -- Result
  result          text,
  yards           smallint,
  touchdown       boolean not null default false,
  first_down      boolean not null default false,
  turnover        boolean not null default false,
  penalty         boolean not null default false,
  penalty_detail  text,

  -- Situational flags. Derived by the application from the situation columns
  -- via the shared @hl-bos/football rules, then stored, so a query does not
  -- have to re-derive them and two products cannot disagree about what
  -- "explosive" means.
  explosive       boolean not null default false,
  red_zone        boolean not null default false,
  third_down      boolean not null default false,
  goal_line       boolean not null default false,

  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint plays_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint plays_film_fk foreign key (film_asset_id, team_id)
    references filmstudy.film_assets (id, team_id) on delete cascade,
  constraint plays_game_fk foreign key (game_id, team_id)
    references filmstudy.games (id, team_id) on delete set null,
  constraint plays_window_ordered check (end_seconds > start_seconds),
  constraint plays_window_starts_at_or_after_zero check (start_seconds >= 0),
  -- A snap, if marked, is inside the play it belongs to.
  constraint plays_snap_within_window
    check (snap_seconds is null or (snap_seconds >= start_seconds and snap_seconds <= end_seconds)),
  constraint plays_number_positive check (play_number > 0),
  constraint plays_quarter_sane check (quarter is null or quarter between 1 and 8),
  constraint plays_down_sane check (down is null or down between 1 and 4),
  constraint plays_distance_sane check (distance is null or distance between 0 and 99),
  constraint plays_yard_line_sane check (yard_line is null or yard_line between 0 and 100),
  constraint plays_box_sane check (box_count is null or box_count between 0 and 11),
  constraint plays_yards_sane check (yards is null or yards between -99 and 99),
  constraint plays_number_unique_per_film unique (film_asset_id, play_number),
  constraint plays_id_team_unique unique (id, team_id)
);
comment on table filmstudy.plays is
  'One play. CONFIRMED football data only -- every value here was entered or accepted by a coach. Model output lives in filmstudy.predictions and never merges into this table without a confirmation row.';

create index if not exists plays_film_idx on filmstudy.plays (film_asset_id, play_number);
create index if not exists plays_team_idx on filmstudy.plays (team_id, created_at desc);
create index if not exists plays_situation_idx on filmstudy.plays (team_id, down, distance);
create index if not exists plays_formation_idx on filmstudy.plays (team_id, formation);
create index if not exists plays_concept_idx on filmstudy.plays (team_id, concept);
create index if not exists plays_coverage_idx on filmstudy.plays (team_id, coverage);
create index if not exists plays_flags_idx on filmstudy.plays (team_id)
  where explosive or turnover or red_zone;
create trigger plays_set_updated_at before update on filmstudy.plays
  for each row execute function platform.set_updated_at();

-- --- How each confirmed field got its value (section 34) -------------------
create table if not exists filmstudy.confirmations (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  play_id           uuid not null,
  team_id           uuid not null,
  field             extensions.citext not null,
  value             text,
  confirmation_kind filmstudy.confirmation_kind not null,
  prediction_id     uuid,
  confirmed_by      uuid references auth.users(id) on delete set null,
  confirmed_at      timestamptz not null default now(),

  constraint confirmations_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete cascade,
  constraint confirmations_field_not_blank check (length(btrim(field::text)) > 0),
  -- A confirmation that claims to come from a prediction must name it.
  constraint confirmations_prediction_present_when_claimed check (
    (confirmation_kind in ('accepted_prediction','corrected_prediction')) = (prediction_id is not null))
);
comment on table filmstudy.confirmations is
  'The answer to "did a human verify this, and how?" -- one row per confirmed field per play. Append-only by construction: the write RPCs only insert.';

create index if not exists confirmations_play_idx on filmstudy.confirmations (play_id, confirmed_at desc);
create index if not exists confirmations_field_idx on filmstudy.confirmations (team_id, field);

-- --- RAW model output (section 34) -----------------------------------------
create table if not exists filmstudy.predictions (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  play_id         uuid not null,
  team_id         uuid not null,
  prediction_type extensions.citext not null,
  predicted_value text not null,
  confidence      numeric(4,3) not null,
  model           text not null,
  model_version   text not null,
  state           filmstudy.prediction_state not null default 'ai_suggested',
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),

  constraint predictions_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete cascade,
  constraint predictions_confidence_is_a_probability check (confidence >= 0 and confidence <= 1),
  constraint predictions_value_not_blank check (length(btrim(predicted_value)) > 0),
  constraint predictions_model_named check (length(btrim(model)) > 0 and length(btrim(model_version)) > 0),
  constraint predictions_resolution_consistent
    check ((state = 'ai_suggested') = (resolved_at is null)),
  constraint predictions_one_open_per_field unique (play_id, prediction_type, model_version)
);
comment on table filmstudy.predictions is
  'What a model GUESSED. Never authoritative. There is no tenant INSERT path -- Phase 1 has no vision pipeline, so the only writers are service_role and the labelled demo seed.';
comment on column filmstudy.predictions.confidence is
  'A probability in [0,1]. Displayed to coaches as a band, not a decimal, because 0.82 and 0.79 do not mean different things to a coach on a Saturday morning.';

create index if not exists predictions_play_idx on filmstudy.predictions (play_id, state);
create index if not exists predictions_open_idx on filmstudy.predictions (team_id, state)
  where state = 'ai_suggested';

-- ===========================================================================
-- Players on plays, grades, notes
-- ===========================================================================

create table if not exists filmstudy.play_participation (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  play_id       uuid not null,
  player_id     uuid not null,
  team_id       uuid not null,
  unit          filmstudy.unit not null,
  position      extensions.citext,
  assignment    text,                -- what they were supposed to do
  created_at    timestamptz not null default now(),

  constraint participation_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete cascade,
  constraint participation_player_fk foreign key (player_id, team_id)
    references filmstudy.players (id, team_id) on delete cascade,
  constraint participation_unique unique (play_id, player_id)
);
comment on table filmstudy.play_participation is
  'Which players were on the field for a play, and what they were assigned. The join that eventually lets one play connect film, snap count, grade, note and development goal (section 51).';

create index if not exists participation_player_idx on filmstudy.play_participation (player_id);
create index if not exists participation_play_idx on filmstudy.play_participation (play_id);

-- --- Grading categories (coach-customizable, section 15) -------------------
create table if not exists filmstudy.grade_categories (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  team_id     uuid not null,
  tenant_id   uuid not null,
  key         extensions.citext not null,
  label       text not null,
  sort_order  smallint not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint grade_categories_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint grade_categories_key_format check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  constraint grade_categories_unique unique (team_id, key),
  constraint grade_categories_id_team_unique unique (id, team_id)
);

create table if not exists filmstudy.player_grades (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  play_id        uuid not null,
  player_id      uuid not null,
  team_id        uuid not null,
  category_key   extensions.citext not null,
  symbol         filmstudy.grade_symbol,
  numeric_value  smallint,
  graded_by      uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint grades_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete cascade,
  constraint grades_player_fk foreign key (player_id, team_id)
    references filmstudy.players (id, team_id) on delete cascade,
  constraint grades_category_fk foreign key (team_id, category_key)
    references filmstudy.grade_categories (team_id, key) on delete restrict,
  constraint grades_numeric_range check (numeric_value is null or numeric_value between 0 and 100),
  -- Exactly one scale per grade. A row carrying both is ambiguous; a row
  -- carrying neither is not a grade.
  constraint grades_exactly_one_scale
    check ((symbol is null) <> (numeric_value is null)),
  constraint grades_unique unique (play_id, player_id, category_key)
);
comment on table filmstudy.player_grades is
  'One grade, one player, one play, one category. Coach-authored only -- section 16: the AI does not issue grades.';

create index if not exists grades_player_idx on filmstudy.player_grades (player_id, created_at desc);
create index if not exists grades_play_idx on filmstudy.player_grades (play_id);
create trigger grades_set_updated_at before update on filmstudy.player_grades
  for each row execute function platform.set_updated_at();
-- A changed grade is a changed evaluation of a person. Section 38 requires
-- knowing who changed one.
create trigger grades_audit after insert or update or delete on filmstudy.player_grades
  for each row execute function audit.emit();

create table if not exists filmstudy.player_notes (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  player_id        uuid not null,
  team_id          uuid not null,
  play_id          uuid,
  timestamp_seconds numeric(10,3),
  body             text not null,
  -- A coaching note is coach-to-coach until the coach says otherwise.
  visible_to_athlete boolean not null default false,
  -- Section 42: voice notes are transcribed. Phase 1 stores typed notes and
  -- records the source honestly so a later transcription path is not
  -- indistinguishable from something a coach wrote.
  source           extensions.citext not null default 'typed',
  author_id        uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint notes_player_fk foreign key (player_id, team_id)
    references filmstudy.players (id, team_id) on delete cascade,
  constraint notes_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete set null,
  constraint notes_body_not_blank check (length(btrim(body)) > 0),
  constraint notes_source_known check (source in ('typed','voice_transcribed','imported'))
);

create index if not exists notes_player_idx on filmstudy.player_notes (player_id, created_at desc);
create index if not exists notes_play_idx on filmstudy.player_notes (play_id);
create trigger notes_set_updated_at before update on filmstudy.player_notes
  for each row execute function platform.set_updated_at();

-- ===========================================================================
-- Clips, playlists, assignments
-- ===========================================================================

create table if not exists filmstudy.clips (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  team_id         uuid not null,
  tenant_id       uuid not null,
  film_asset_id   uuid not null,
  play_id         uuid,
  title           text not null,
  caption         text,
  start_seconds   numeric(10,3) not null,
  end_seconds     numeric(10,3) not null,
  playback_rate   numeric(3,2) not null default 1.00,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint clips_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint clips_film_fk foreign key (film_asset_id, team_id)
    references filmstudy.film_assets (id, team_id) on delete cascade,
  constraint clips_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete set null,
  constraint clips_title_not_blank check (length(btrim(title)) > 0),
  constraint clips_window_ordered check (end_seconds > start_seconds),
  constraint clips_window_from_zero check (start_seconds >= 0),
  constraint clips_rate_supported check (playback_rate in (0.25,0.50,0.75,1.00,1.50)),
  constraint clips_id_team_unique unique (id, team_id)
);

create index if not exists clips_team_idx on filmstudy.clips (team_id, created_at desc);
create index if not exists clips_play_idx on filmstudy.clips (play_id);
create trigger clips_set_updated_at before update on filmstudy.clips
  for each row execute function platform.set_updated_at();

create table if not exists filmstudy.playlists (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  team_id      uuid not null,
  tenant_id    uuid not null,
  name         text not null,
  description  text,
  -- Section 20: a coach approves an AI-generated collection before sharing.
  -- Phase 1 builds them by hand, so `generated_by` is 'coach' for every row
  -- the product can currently create. The column exists so that when a
  -- generated collection arrives it is distinguishable, not so that it can be
  -- back-filled with a claim.
  generated_by extensions.citext not null default 'coach',
  shared_with_athletes boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint playlists_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint playlists_name_not_blank check (length(btrim(name)) > 0),
  constraint playlists_generated_by_known check (generated_by in ('coach','filmstudy_ai')),
  constraint playlists_unique_per_team unique (team_id, name),
  constraint playlists_id_team_unique unique (id, team_id)
);
create trigger playlists_set_updated_at before update on filmstudy.playlists
  for each row execute function platform.set_updated_at();

create table if not exists filmstudy.playlist_items (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  playlist_id  uuid not null,
  team_id      uuid not null,
  play_id      uuid,
  clip_id      uuid,
  position     integer not null,
  note         text,
  created_at   timestamptz not null default now(),

  constraint playlist_items_playlist_fk foreign key (playlist_id, team_id)
    references filmstudy.playlists (id, team_id) on delete cascade,
  constraint playlist_items_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete cascade,
  constraint playlist_items_clip_fk foreign key (clip_id, team_id)
    references filmstudy.clips (id, team_id) on delete cascade,
  -- An item points at exactly one thing.
  constraint playlist_items_one_target check ((play_id is null) <> (clip_id is null)),
  constraint playlist_items_position_unique unique (playlist_id, position)
);
create index if not exists playlist_items_playlist_idx on filmstudy.playlist_items (playlist_id, position);

-- --- Film assignments (section 17) -----------------------------------------
create table if not exists filmstudy.film_assignments (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  team_id          uuid not null,
  tenant_id        uuid not null,
  player_id        uuid not null,
  assignment_kind  filmstudy.assignment_kind not null,
  message          text,
  due_on           date,
  status           filmstudy.assignment_status not null default 'assigned',
  assigned_by      uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint assignments_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint assignments_player_fk foreign key (player_id, team_id)
    references filmstudy.players (id, team_id) on delete cascade,
  constraint assignments_id_team_unique unique (id, team_id)
);
create index if not exists assignments_player_idx on filmstudy.film_assignments (player_id, status);
create index if not exists assignments_team_idx on filmstudy.film_assignments (team_id, created_at desc);
create trigger assignments_set_updated_at before update on filmstudy.film_assignments
  for each row execute function platform.set_updated_at();

create table if not exists filmstudy.assignment_items (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  assignment_id  uuid not null,
  team_id        uuid not null,
  play_id        uuid,
  clip_id        uuid,
  position       integer not null,

  constraint assignment_items_assignment_fk foreign key (assignment_id, team_id)
    references filmstudy.film_assignments (id, team_id) on delete cascade,
  constraint assignment_items_play_fk foreign key (play_id, team_id)
    references filmstudy.plays (id, team_id) on delete cascade,
  constraint assignment_items_clip_fk foreign key (clip_id, team_id)
    references filmstudy.clips (id, team_id) on delete cascade,
  constraint assignment_items_one_target check ((play_id is null) <> (clip_id is null)),
  constraint assignment_items_position_unique unique (assignment_id, position)
);
create index if not exists assignment_items_assignment_idx on filmstudy.assignment_items (assignment_id, position);

-- Review status is EVIDENCE that an athlete watched, so it is append-only and
-- written only by the athlete's own action. A coach cannot mark it for them --
-- that would make the "Players reviewed" dashboard number a fiction.
create table if not exists filmstudy.assignment_reviews (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  assignment_id  uuid not null,
  team_id        uuid not null,
  reviewer_id    uuid not null references auth.users(id) on delete cascade,
  status         filmstudy.assignment_status not null,
  comment        text,
  created_at     timestamptz not null default now(),

  constraint assignment_reviews_assignment_fk foreign key (assignment_id, team_id)
    references filmstudy.film_assignments (id, team_id) on delete cascade,
  constraint assignment_reviews_status_is_progress
    check (status in ('viewed','acknowledged','completed'))
);
create index if not exists assignment_reviews_assignment_idx
  on filmstudy.assignment_reviews (assignment_id, created_at desc);

-- --- Team terminology (section 44) -----------------------------------------
create table if not exists filmstudy.team_terminology (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  team_id        uuid not null,
  tenant_id      uuid not null,
  category       extensions.citext not null,
  canonical_term extensions.citext not null,
  team_term      text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint terminology_team_fk foreign key (team_id, tenant_id)
    references filmstudy.teams (id, tenant_id) on delete cascade,
  constraint terminology_category_known
    check (category in ('formation','personnel','run_concept','pass_concept',
                        'coverage','front','pressure','motion')),
  constraint terminology_term_not_blank check (length(btrim(team_term)) > 0),
  constraint terminology_unique unique (team_id, category, canonical_term)
);
comment on table filmstudy.team_terminology is
  'Maps a canonical football term to what this program actually calls it ("Outside Zone" -> "Stretch"). Read by the UI; nothing translates automatically yet.';
create trigger terminology_set_updated_at before update on filmstudy.team_terminology
  for each row execute function platform.set_updated_at();

-- ===========================================================================
-- Access helpers
--
-- These are the two-layer model made executable. Each is SECURITY DEFINER with
-- an empty search_path and lives in a non-API schema, so PostgREST never
-- publishes it as an RPC (the SEC-3 defect class the platform already fixed
-- once).
--
-- Read them as: layer 1 asks identity.has_permission "may this user do this
-- kind of thing in this tenant?"; layer 2 asks filmstudy.team_members "and on
-- whose team, wearing which hat?". A user who passes only one gets nothing.
-- ===========================================================================

create or replace function filmstudy.team_tenant(p_team uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select t.tenant_id from filmstudy.teams t where t.id = p_team;
$$;

create or replace function filmstudy.my_role(p_team uuid)
returns filmstudy.football_role language sql stable security definer set search_path = '' as $$
  select tm.football_role
  from filmstudy.team_members tm
  where tm.team_id = p_team and tm.user_id = auth.uid();
$$;
comment on function filmstudy.my_role(uuid) is
  'The caller''s football role on one team, or NULL. NULL is the common case and means no team-level access whatsoever.';

-- Staff = anyone who coaches or analyses. Athletes and guardians are not staff.
create or replace function filmstudy.is_staff(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select filmstudy.my_role(p_team)
           in ('org_admin','head_coach','coordinator','position_coach','analyst')
     and identity.has_permission(filmstudy.team_tenant(p_team), 'filmstudy.film.read');
$$;
comment on function filmstudy.is_staff(uuid) is
  'BOTH layers. A head coach whose tenant membership was suspended is not staff, because identity.has_permission already refuses a suspended membership and a suspended tenant.';

-- Any legitimate viewer of the team, staff or not. Guardians only count when
-- the program has opened guardian access at all.
create or replace function filmstudy.is_team_viewer(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case filmstudy.my_role(p_team)
           when 'athlete' then identity.has_permission(filmstudy.team_tenant(p_team), 'filmstudy.film.read')
           when 'parent'  then identity.has_permission(filmstudy.team_tenant(p_team), 'filmstudy.film.read')
                               and exists (select 1 from filmstudy.teams t
                                            where t.id = p_team and t.guardian_access)
           else filmstudy.is_staff(p_team)
         end;
$$;

-- The roster rows this caller is personally attached to: their own player row
-- as an athlete, or their children's as a guardian. Empty for staff, which is
-- correct -- a coach's access comes from being staff, not from being a player.
create or replace function filmstudy.my_player_ids(p_team uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select pl.player_id
  from filmstudy.player_links pl
  where pl.user_id = auth.uid() and pl.team_id = p_team;
$$;

-- May the caller see THIS player's evaluative information (grades, notes)?
-- Staff always. An athlete only their own, and only if the program shows
-- grades to athletes. A guardian only their child's, and only if the program
-- shows grades to guardians.
create or replace function filmstudy.can_see_player_grades(p_team uuid, p_player uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case filmstudy.my_role(p_team)
           when 'athlete' then
             exists (select 1 from filmstudy.teams t where t.id = p_team and t.athletes_see_grades)
             and p_player in (select filmstudy.my_player_ids(p_team))
           when 'parent' then
             exists (select 1 from filmstudy.teams t
                      where t.id = p_team and t.guardian_access and t.guardians_see_grades)
             and p_player in (select filmstudy.my_player_ids(p_team))
           else filmstudy.is_staff(p_team)
                and identity.has_permission(filmstudy.team_tenant(p_team), 'filmstudy.grade.read')
         end;
$$;
comment on function filmstudy.can_see_player_grades(uuid, uuid) is
  'Youth-athlete privacy, enforced in the database. Both athlete and guardian paths are closed unless the PROGRAM opened them, and even then only for that person''s own player.';

-- May the caller see this film? Staff see everything on their team. An athlete
-- or guardian sees a film only when it is non-opponent AND the coach opened it
-- to athletes, OR when a play from it was assigned to their player.
create or replace function filmstudy.can_see_film(p_film uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from filmstudy.film_assets f
    where f.id = p_film
      and (
        filmstudy.is_staff(f.team_id)
        or (
          filmstudy.is_team_viewer(f.team_id)
          and f.film_kind <> 'opponent'
          and (
            f.athlete_visible
            or exists (
              select 1
              from filmstudy.assignment_items ai
              join filmstudy.film_assignments fa on fa.id = ai.assignment_id
              left join filmstudy.plays pl on pl.id = ai.play_id
              left join filmstudy.clips cl on cl.id = ai.clip_id
              where fa.player_id in (select filmstudy.my_player_ids(f.team_id))
                and coalesce(pl.film_asset_id, cl.film_asset_id) = f.id
            )
          )
        )
      )
  );
$$;
comment on function filmstudy.can_see_film(uuid) is
  'Opponent scouting film is unreachable for athletes and guardians on every path here -- there is no branch that returns true for it.';

-- ===========================================================================
-- RLS
--
-- Enabled AND forced on every table. SELECT policies only; there is no
-- INSERT/UPDATE/DELETE grant or policy anywhere in this schema, so every write
-- goes through a permission-checking SECURITY DEFINER function below. That is
-- what makes "an athlete cannot mark their own film reviewed on someone else's
-- behalf", and "nothing can fabricate a prediction", structural rather than
-- conventional.
-- ===========================================================================

alter table filmstudy.teams               enable row level security;
alter table filmstudy.teams               force  row level security;
alter table filmstudy.seasons             enable row level security;
alter table filmstudy.seasons             force  row level security;
alter table filmstudy.team_members        enable row level security;
alter table filmstudy.team_members        force  row level security;
alter table filmstudy.players             enable row level security;
alter table filmstudy.players             force  row level security;
alter table filmstudy.player_links        enable row level security;
alter table filmstudy.player_links        force  row level security;
alter table filmstudy.opponents           enable row level security;
alter table filmstudy.opponents           force  row level security;
alter table filmstudy.games               enable row level security;
alter table filmstudy.games               force  row level security;
alter table filmstudy.film_assets         enable row level security;
alter table filmstudy.film_assets         force  row level security;
alter table filmstudy.plays               enable row level security;
alter table filmstudy.plays               force  row level security;
alter table filmstudy.confirmations       enable row level security;
alter table filmstudy.confirmations       force  row level security;
alter table filmstudy.predictions         enable row level security;
alter table filmstudy.predictions         force  row level security;
alter table filmstudy.play_participation  enable row level security;
alter table filmstudy.play_participation  force  row level security;
alter table filmstudy.grade_categories    enable row level security;
alter table filmstudy.grade_categories    force  row level security;
alter table filmstudy.player_grades       enable row level security;
alter table filmstudy.player_grades       force  row level security;
alter table filmstudy.player_notes        enable row level security;
alter table filmstudy.player_notes        force  row level security;
alter table filmstudy.clips               enable row level security;
alter table filmstudy.clips               force  row level security;
alter table filmstudy.playlists           enable row level security;
alter table filmstudy.playlists           force  row level security;
alter table filmstudy.playlist_items      enable row level security;
alter table filmstudy.playlist_items      force  row level security;
alter table filmstudy.film_assignments    enable row level security;
alter table filmstudy.film_assignments    force  row level security;
alter table filmstudy.assignment_items    enable row level security;
alter table filmstudy.assignment_items    force  row level security;
alter table filmstudy.assignment_reviews  enable row level security;
alter table filmstudy.assignment_reviews  force  row level security;
alter table filmstudy.team_terminology    enable row level security;
alter table filmstudy.team_terminology    force  row level security;

drop policy if exists teams_select on filmstudy.teams;
create policy teams_select on filmstudy.teams for select to authenticated
  using (filmstudy.is_team_viewer(id)
         or identity.has_permission(tenant_id, 'filmstudy.team.manage'));

drop policy if exists seasons_select on filmstudy.seasons;
create policy seasons_select on filmstudy.seasons for select to authenticated
  using (filmstudy.is_team_viewer(team_id));

-- A roster is not a directory of minors for anyone who happens to be on the
-- team: staff see the coaching staff list, an athlete or guardian sees only
-- their own row, so a guardian cannot enumerate other families' accounts.
drop policy if exists team_members_select on filmstudy.team_members;
create policy team_members_select on filmstudy.team_members for select to authenticated
  using (user_id = (select auth.uid()) or filmstudy.is_staff(team_id));

drop policy if exists players_select on filmstudy.players;
create policy players_select on filmstudy.players for select to authenticated
  using (filmstudy.is_staff(team_id)
         or (filmstudy.is_team_viewer(team_id)
             and id in (select filmstudy.my_player_ids(team_id))));

drop policy if exists player_links_select on filmstudy.player_links;
create policy player_links_select on filmstudy.player_links for select to authenticated
  using (user_id = (select auth.uid()) or filmstudy.is_staff(team_id));

-- Opponent records are scouting. Coach-only, like opponent film.
drop policy if exists opponents_select on filmstudy.opponents;
create policy opponents_select on filmstudy.opponents for select to authenticated
  using (filmstudy.is_staff(team_id));

drop policy if exists games_select on filmstudy.games;
create policy games_select on filmstudy.games for select to authenticated
  using (filmstudy.is_team_viewer(team_id));

drop policy if exists film_select on filmstudy.film_assets;
create policy film_select on filmstudy.film_assets for select to authenticated
  using (filmstudy.can_see_film(id));

drop policy if exists plays_select on filmstudy.plays;
create policy plays_select on filmstudy.plays for select to authenticated
  using (filmstudy.can_see_film(film_asset_id));

drop policy if exists confirmations_select on filmstudy.confirmations;
create policy confirmations_select on filmstudy.confirmations for select to authenticated
  using (filmstudy.is_staff(team_id));

drop policy if exists predictions_select on filmstudy.predictions;
create policy predictions_select on filmstudy.predictions for select to authenticated
  using (filmstudy.is_staff(team_id));

drop policy if exists participation_select on filmstudy.play_participation;
create policy participation_select on filmstudy.play_participation for select to authenticated
  using (filmstudy.is_staff(team_id)
         or (player_id in (select filmstudy.my_player_ids(team_id))
             and exists (select 1 from filmstudy.plays p
                          where p.id = play_id and filmstudy.can_see_film(p.film_asset_id))));

drop policy if exists grade_categories_select on filmstudy.grade_categories;
create policy grade_categories_select on filmstudy.grade_categories for select to authenticated
  using (filmstudy.is_team_viewer(team_id));

drop policy if exists grades_select on filmstudy.player_grades;
create policy grades_select on filmstudy.player_grades for select to authenticated
  using (filmstudy.can_see_player_grades(team_id, player_id));

-- A note reaches an athlete or guardian only when the coach marked THAT note
-- visible. Note visibility is deliberately independent of grade visibility: a
-- program may want to send teaching points home without sending grades.
drop policy if exists notes_select on filmstudy.player_notes;
create policy notes_select on filmstudy.player_notes for select to authenticated
  using (
    (filmstudy.is_staff(team_id)
     and identity.has_permission(filmstudy.team_tenant(team_id), 'filmstudy.grade.read'))
    or (visible_to_athlete
        and player_id in (select filmstudy.my_player_ids(team_id))
        and filmstudy.is_team_viewer(team_id))
  );

drop policy if exists clips_select on filmstudy.clips;
create policy clips_select on filmstudy.clips for select to authenticated
  using (filmstudy.can_see_film(film_asset_id));

drop policy if exists playlists_select on filmstudy.playlists;
create policy playlists_select on filmstudy.playlists for select to authenticated
  using (filmstudy.is_staff(team_id)
         or (shared_with_athletes and filmstudy.is_team_viewer(team_id)));

drop policy if exists playlist_items_select on filmstudy.playlist_items;
create policy playlist_items_select on filmstudy.playlist_items for select to authenticated
  using (exists (select 1 from filmstudy.playlists pl
                  where pl.id = playlist_id
                    and (filmstudy.is_staff(pl.team_id)
                         or (pl.shared_with_athletes and filmstudy.is_team_viewer(pl.team_id)))));

drop policy if exists assignments_select on filmstudy.film_assignments;
create policy assignments_select on filmstudy.film_assignments for select to authenticated
  using (filmstudy.is_staff(team_id)
         or player_id in (select filmstudy.my_player_ids(team_id)));

drop policy if exists assignment_items_select on filmstudy.assignment_items;
create policy assignment_items_select on filmstudy.assignment_items for select to authenticated
  using (exists (select 1 from filmstudy.film_assignments fa
                  where fa.id = assignment_id
                    and (filmstudy.is_staff(fa.team_id)
                         or fa.player_id in (select filmstudy.my_player_ids(fa.team_id)))));

drop policy if exists assignment_reviews_select on filmstudy.assignment_reviews;
create policy assignment_reviews_select on filmstudy.assignment_reviews for select to authenticated
  using (reviewer_id = (select auth.uid())
         or exists (select 1 from filmstudy.film_assignments fa
                     where fa.id = assignment_id and filmstudy.is_staff(fa.team_id)));

drop policy if exists terminology_select on filmstudy.team_terminology;
create policy terminology_select on filmstudy.team_terminology for select to authenticated
  using (filmstudy.is_team_viewer(team_id));

grant select on
  filmstudy.teams, filmstudy.seasons, filmstudy.team_members, filmstudy.players,
  filmstudy.player_links, filmstudy.opponents, filmstudy.games, filmstudy.film_assets,
  filmstudy.plays, filmstudy.confirmations, filmstudy.predictions,
  filmstudy.play_participation, filmstudy.grade_categories, filmstudy.player_grades,
  filmstudy.player_notes, filmstudy.clips, filmstudy.playlists, filmstudy.playlist_items,
  filmstudy.film_assignments, filmstudy.assignment_items, filmstudy.assignment_reviews,
  filmstudy.team_terminology
to authenticated;

-- ===========================================================================
-- Write paths
--
-- One rule, applied without exception: a write function establishes the team,
-- checks BOTH layers for the specific capability that write needs, and only
-- then touches a row. `raise exception ... using errcode = 'insufficient_privilege'`
-- is what the caller sees; it never leaks whether the row exists.
-- ===========================================================================

-- Internal guard. Not granted to anyone -- it is called by the functions below,
-- which are SECURITY DEFINER and therefore run as the owner.
create or replace function filmstudy.assert_staff_permission(p_team uuid, p_permission extensions.citext)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not filmstudy.is_staff(p_team) then
    raise exception 'no coaching access to this team' using errcode = 'insufficient_privilege';
  end if;
  if not identity.has_permission(filmstudy.team_tenant(p_team), p_permission) then
    raise exception 'missing permission %', p_permission using errcode = 'insufficient_privilege';
  end if;
end; $$;

-- --- Teams ------------------------------------------------------------------
-- Creating a team is the one write that cannot check team membership first --
-- the team does not exist yet -- so it checks the tenant permission and then
-- makes the creator the org_admin of what they just created.
create or replace function filmstudy.create_team(
  p_tenant uuid, p_name text, p_level filmstudy.competition_level default 'high_school',
  p_mascot text default null, p_is_demo boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid;
begin
  if not identity.has_permission(p_tenant, 'filmstudy.team.manage') then
    raise exception 'insufficient privilege to create a team' using errcode = 'insufficient_privilege';
  end if;
  insert into filmstudy.teams (tenant_id, name, level, mascot, is_demo, created_by)
  values (p_tenant, btrim(p_name), p_level, p_mascot, p_is_demo, auth.uid())
  returning id into v_team;

  insert into filmstudy.team_members (team_id, tenant_id, user_id, football_role)
  values (v_team, p_tenant, auth.uid(), 'org_admin');

  -- The brief's four default grading categories (section 15). A team with no
  -- categories cannot be graded at all, so this is setup, not decoration.
  insert into filmstudy.grade_categories (team_id, tenant_id, key, label, sort_order) values
    (v_team, p_tenant, 'assignment', 'Assignment', 1),
    (v_team, p_tenant, 'technique',  'Technique',  2),
    (v_team, p_tenant, 'effort',     'Effort',     3),
    (v_team, p_tenant, 'execution',  'Execution',  4);

  perform events.emit('filmstudy.team.created', p_tenant,
    jsonb_build_object('team', v_team, 'name', btrim(p_name), 'demo', p_is_demo));
  return v_team;
end; $$;
revoke all on function filmstudy.create_team(uuid, text, filmstudy.competition_level, text, boolean) from public, anon;
grant execute on function filmstudy.create_team(uuid, text, filmstudy.competition_level, text, boolean) to authenticated;

create or replace function filmstudy.update_team_settings(
  p_team uuid, p_grade_scale filmstudy.grade_scale default null,
  p_athletes_see_grades boolean default null, p_guardian_access boolean default null,
  p_guardians_see_grades boolean default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  update filmstudy.teams
     set grade_scale          = coalesce(p_grade_scale, grade_scale),
         athletes_see_grades  = coalesce(p_athletes_see_grades, athletes_see_grades),
         guardian_access      = coalesce(p_guardian_access, guardian_access),
         guardians_see_grades = coalesce(p_guardians_see_grades, guardians_see_grades)
   where id = p_team;
end; $$;
revoke all on function filmstudy.update_team_settings(uuid, filmstudy.grade_scale, boolean, boolean, boolean) from public, anon;
grant execute on function filmstudy.update_team_settings(uuid, filmstudy.grade_scale, boolean, boolean, boolean) to authenticated;

create or replace function filmstudy.upsert_season(
  p_team uuid, p_year integer, p_label text, p_is_current boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  v_tenant := filmstudy.team_tenant(p_team);
  if p_is_current then
    update filmstudy.seasons set is_current = false where team_id = p_team and is_current;
  end if;
  insert into filmstudy.seasons (team_id, tenant_id, year, label, is_current)
  values (p_team, v_tenant, p_year, p_label, p_is_current)
  on conflict (team_id, year) do update
    set label = excluded.label, is_current = excluded.is_current
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.upsert_season(uuid, integer, text, boolean) from public, anon;
grant execute on function filmstudy.upsert_season(uuid, integer, text, boolean) to authenticated;

-- --- Staff and roster -------------------------------------------------------
-- Granting football authority is itself an authority decision, so it needs
-- filmstudy.team.manage, not merely being staff.
create or replace function filmstudy.set_team_member(
  p_team uuid, p_user uuid, p_role filmstudy.football_role,
  p_unit filmstudy.unit default null, p_position_group extensions.citext default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  v_tenant := filmstudy.team_tenant(p_team);
  -- The user must already belong to the tenant. This function grants a FOOTBALL
  -- role on a team; it is not a second way into the organization.
  if not exists (select 1 from identity.memberships m
                  where m.tenant_id = v_tenant and m.user_id = p_user and m.status = 'active') then
    raise exception 'that user is not an active member of this organization'
      using errcode = 'foreign_key_violation';
  end if;
  insert into filmstudy.team_members (team_id, tenant_id, user_id, football_role, unit, position_group)
  values (p_team, v_tenant, p_user, p_role, p_unit, p_position_group)
  on conflict (team_id, user_id) do update
    set football_role = excluded.football_role, unit = excluded.unit,
        position_group = excluded.position_group
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.set_team_member(uuid, uuid, filmstudy.football_role, filmstudy.unit, extensions.citext) from public, anon;
grant execute on function filmstudy.set_team_member(uuid, uuid, filmstudy.football_role, filmstudy.unit, extensions.citext) to authenticated;

create or replace function filmstudy.upsert_player(
  p_team uuid, p_first_name text, p_last_name text,
  p_jersey_number smallint default null, p_position extensions.citext default null,
  p_unit filmstudy.unit default null, p_class_year text default null,
  p_height_inches smallint default null, p_weight_pounds smallint default null,
  p_player uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.roster.manage');
  v_tenant := filmstudy.team_tenant(p_team);
  if p_player is null then
    insert into filmstudy.players (team_id, tenant_id, first_name, last_name, jersey_number,
                                   position, unit, class_year, height_inches, weight_pounds)
    values (p_team, v_tenant, btrim(p_first_name), btrim(p_last_name), p_jersey_number,
            p_position, p_unit, p_class_year, p_height_inches, p_weight_pounds)
    returning id into v_id;
  else
    update filmstudy.players
       set first_name = btrim(p_first_name), last_name = btrim(p_last_name),
           jersey_number = p_jersey_number, position = p_position, unit = p_unit,
           class_year = p_class_year, height_inches = p_height_inches,
           weight_pounds = p_weight_pounds
     where id = p_player and team_id = p_team
    returning id into v_id;
    if v_id is null then
      raise exception 'no such player on this team' using errcode = 'no_data_found';
    end if;
  end if;
  return v_id;
end; $$;
revoke all on function filmstudy.upsert_player(uuid, text, text, smallint, extensions.citext, filmstudy.unit, text, smallint, smallint, uuid) from public, anon;
grant execute on function filmstudy.upsert_player(uuid, text, text, smallint, extensions.citext, filmstudy.unit, text, smallint, smallint, uuid) to authenticated;

-- Linking a real person to a roster row decides who may see a minor's film and
-- grades, so it is gated on team.manage rather than roster.manage.
create or replace function filmstudy.link_player_user(
  p_team uuid, p_player uuid, p_user uuid, p_kind filmstudy.player_link_kind)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  v_tenant := filmstudy.team_tenant(p_team);
  if not exists (select 1 from identity.memberships m
                  where m.tenant_id = v_tenant and m.user_id = p_user and m.status = 'active') then
    raise exception 'that user is not an active member of this organization'
      using errcode = 'foreign_key_violation';
  end if;
  insert into filmstudy.player_links (team_id, player_id, user_id, link_kind)
  values (p_team, p_player, p_user, p_kind)
  on conflict (player_id, user_id) do update set link_kind = excluded.link_kind
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.link_player_user(uuid, uuid, uuid, filmstudy.player_link_kind) from public, anon;
grant execute on function filmstudy.link_player_user(uuid, uuid, uuid, filmstudy.player_link_kind) to authenticated;

create or replace function filmstudy.upsert_grade_category(
  p_team uuid, p_key extensions.citext, p_label text,
  p_sort_order smallint default 0, p_active boolean default true)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  insert into filmstudy.grade_categories (team_id, tenant_id, key, label, sort_order, active)
  values (p_team, filmstudy.team_tenant(p_team), p_key, p_label, p_sort_order, p_active)
  on conflict (team_id, key) do update
    set label = excluded.label, sort_order = excluded.sort_order, active = excluded.active
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.upsert_grade_category(uuid, extensions.citext, text, smallint, boolean) from public, anon;
grant execute on function filmstudy.upsert_grade_category(uuid, extensions.citext, text, smallint, boolean) to authenticated;

-- --- Opponents and games ----------------------------------------------------
create or replace function filmstudy.upsert_opponent(p_team uuid, p_name text, p_mascot text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  insert into filmstudy.opponents (team_id, tenant_id, name, mascot)
  values (p_team, filmstudy.team_tenant(p_team), btrim(p_name), p_mascot)
  on conflict (team_id, name) do update set mascot = excluded.mascot
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.upsert_opponent(uuid, text, text) from public, anon;
grant execute on function filmstudy.upsert_opponent(uuid, text, text) to authenticated;

create or replace function filmstudy.upsert_game(
  p_team uuid, p_opponent uuid default null, p_season uuid default null,
  p_kickoff_at timestamptz default null, p_venue filmstudy.venue default 'home',
  p_location text default null, p_week smallint default null,
  p_team_score smallint default null, p_opponent_score smallint default null,
  p_notes text default null, p_game uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  if p_game is null then
    insert into filmstudy.games (team_id, tenant_id, opponent_id, season_id, kickoff_at, venue,
                                 location, week, team_score, opponent_score, notes)
    values (p_team, filmstudy.team_tenant(p_team), p_opponent, p_season, p_kickoff_at, p_venue,
            p_location, p_week, p_team_score, p_opponent_score, p_notes)
    returning id into v_id;
  else
    update filmstudy.games
       set opponent_id = p_opponent, season_id = p_season, kickoff_at = p_kickoff_at,
           venue = p_venue, location = p_location, week = p_week,
           team_score = p_team_score, opponent_score = p_opponent_score, notes = p_notes
     where id = p_game and team_id = p_team
    returning id into v_id;
    if v_id is null then raise exception 'no such game on this team' using errcode = 'no_data_found'; end if;
  end if;
  return v_id;
end; $$;
revoke all on function filmstudy.upsert_game(uuid, uuid, uuid, timestamptz, filmstudy.venue, text, smallint, smallint, smallint, text, uuid) from public, anon;
grant execute on function filmstudy.upsert_game(uuid, uuid, uuid, timestamptz, filmstudy.venue, text, smallint, smallint, smallint, text, uuid) to authenticated;

-- --- Film upload lifecycle --------------------------------------------------
-- register_film -> (client uploads to the signed URL) -> confirm_film_upload.
-- The object path is COMPUTED here, never accepted from the caller, so a
-- client cannot aim an upload at another tenant's prefix.
create or replace function filmstudy.register_film(
  p_team uuid, p_title text, p_kind filmstudy.film_kind,
  p_original_filename text, p_mime extensions.citext, p_size_bytes bigint,
  p_game uuid default null, p_season uuid default null,
  p_unit filmstudy.unit default null, p_recorded_on date default null,
  p_notes text default null, p_athlete_visible boolean default false)
returns filmstudy.film_assets language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_row filmstudy.film_assets; v_path text; v_ext text;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.film.create');
  v_tenant := filmstudy.team_tenant(p_team);

  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'a film upload must declare its size' using errcode = 'check_violation';
  end if;
  if p_size_bytes > 17179869184 then
    raise exception 'film exceeds the 16 GiB limit' using errcode = 'check_violation';
  end if;
  -- Container allow-list (section 7). Rejected here rather than after the bytes
  -- have already been paid for and stored.
  v_ext := lower(regexp_replace(p_original_filename, '^.*\.', ''));
  if v_ext not in ('mp4','mov','m4v') then
    raise exception 'unsupported film format .% -- MP4, MOV and M4V are supported', v_ext
      using errcode = 'check_violation';
  end if;
  if p_mime !~* '^video/' then
    raise exception 'film must be a video file (got %)', p_mime using errcode = 'check_violation';
  end if;

  v_path := v_tenant::text || '/' || p_team::text || '/'
            || pg_catalog.gen_random_uuid()::text || '.' || v_ext;

  insert into filmstudy.film_assets
    (team_id, tenant_id, game_id, season_id, title, film_kind, unit, status,
     object_path, original_filename, mime_type, size_bytes, recorded_on, notes,
     athlete_visible, uploaded_by)
  values
    (p_team, v_tenant, p_game, p_season, btrim(p_title), p_kind, p_unit, 'registered',
     v_path, p_original_filename, p_mime, p_size_bytes, p_recorded_on, p_notes,
     -- Opponent film can never be athlete-visible; forcing it false here means
     -- the CHECK constraint is a backstop, not the error message a coach sees.
     (p_athlete_visible and p_kind <> 'opponent'), auth.uid())
  returning * into v_row;

  perform events.emit('filmstudy.film.registered', v_tenant,
    jsonb_build_object('film', v_row.id, 'team', p_team, 'kind', p_kind::text));
  return v_row;
end; $$;
revoke all on function filmstudy.register_film(uuid, text, filmstudy.film_kind, text, extensions.citext, bigint, uuid, uuid, filmstudy.unit, date, text, boolean) from public, anon;
grant execute on function filmstudy.register_film(uuid, text, filmstudy.film_kind, text, extensions.citext, bigint, uuid, uuid, filmstudy.unit, date, text, boolean) to authenticated;

create or replace function filmstudy.confirm_film_upload(
  p_film uuid, p_size_bytes bigint default null, p_duration_seconds numeric default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_tenant uuid;
begin
  select team_id, tenant_id into v_team, v_tenant
    from filmstudy.film_assets where id = p_film;
  if not found then raise exception 'no such film' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.film.create');

  update filmstudy.film_assets
     set status = 'ready',
         size_bytes = coalesce(p_size_bytes, size_bytes),
         duration_seconds = coalesce(p_duration_seconds, duration_seconds)
   where id = p_film;

  perform events.emit('filmstudy.film.ready', v_tenant,
    jsonb_build_object('film', p_film, 'team', v_team));
end; $$;
revoke all on function filmstudy.confirm_film_upload(uuid, bigint, numeric) from public, anon;
grant execute on function filmstudy.confirm_film_upload(uuid, bigint, numeric) to authenticated;

create or replace function filmstudy.set_film_visibility(p_film uuid, p_athlete_visible boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_kind filmstudy.film_kind;
begin
  select team_id, film_kind into v_team, v_kind from filmstudy.film_assets where id = p_film;
  if not found then raise exception 'no such film' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.film.manage');
  if p_athlete_visible and v_kind = 'opponent' then
    raise exception 'opponent scouting film cannot be opened to athletes'
      using errcode = 'check_violation';
  end if;
  update filmstudy.film_assets set athlete_visible = p_athlete_visible where id = p_film;
end; $$;
revoke all on function filmstudy.set_film_visibility(uuid, boolean) from public, anon;
grant execute on function filmstudy.set_film_visibility(uuid, boolean) to authenticated;

-- --- Play segmentation and tagging ------------------------------------------
-- Phase 1 segmentation is a coach marking S and E on the timeline. The play
-- number is allocated here rather than sent by the client so two coaches
-- tagging the same film cannot collide on it.
create or replace function filmstudy.create_play(
  p_film uuid, p_start_seconds numeric, p_end_seconds numeric,
  p_snap_seconds numeric default null, p_play_number integer default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_tenant uuid; v_game uuid; v_number integer; v_id uuid;
begin
  select team_id, tenant_id, game_id into v_team, v_tenant, v_game
    from filmstudy.film_assets where id = p_film;
  if not found then raise exception 'no such film' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.play.create');

  v_number := coalesce(p_play_number,
    (select coalesce(max(play_number), 0) + 1 from filmstudy.plays where film_asset_id = p_film));

  insert into filmstudy.plays (team_id, tenant_id, film_asset_id, game_id, play_number,
                               start_seconds, end_seconds, snap_seconds, created_by)
  values (v_team, v_tenant, p_film, v_game, v_number,
          p_start_seconds, p_end_seconds, p_snap_seconds, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.create_play(uuid, numeric, numeric, numeric, integer) from public, anon;
grant execute on function filmstudy.create_play(uuid, numeric, numeric, numeric, integer) to authenticated;

create or replace function filmstudy.delete_play(p_play uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from filmstudy.plays where id = p_play;
  if not found then raise exception 'no such play' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.play.delete');
  delete from filmstudy.plays where id = p_play;
end; $$;
revoke all on function filmstudy.delete_play(uuid) from public, anon;
grant execute on function filmstudy.delete_play(uuid) to authenticated;

-- Tagging. Every non-null argument is a coach-confirmed football fact, so each
-- one that actually changes the row also writes a filmstudy.confirmations
-- record. That is section 34's requirement discharged on the write path rather
-- than hoped for afterwards.
--
-- The situational flags (explosive / red zone / third down / goal line) are
-- passed in, computed by the shared @hl-bos/football rules, so that the
-- product and any future service agree on the definitions by construction.
create or replace function filmstudy.tag_play(
  p_play uuid,
  p_quarter smallint default null, p_clock text default null,
  p_down smallint default null, p_distance smallint default null,
  p_yard_line smallint default null, p_hash filmstudy.hash_mark default null,
  p_possession filmstudy.unit default null,
  p_personnel extensions.citext default null, p_formation extensions.citext default null,
  p_strength filmstudy.field_direction default null, p_motion extensions.citext default null,
  p_play_call text default null, p_family filmstudy.play_family default null,
  p_concept extensions.citext default null, p_direction filmstudy.field_direction default null,
  p_defensive_front extensions.citext default null, p_box_count smallint default null,
  p_coverage extensions.citext default null, p_pressure extensions.citext default null,
  p_result text default null, p_yards smallint default null,
  p_touchdown boolean default null, p_first_down boolean default null,
  p_turnover boolean default null, p_penalty boolean default null,
  p_explosive boolean default null, p_red_zone boolean default null,
  p_third_down boolean default null, p_goal_line boolean default null,
  p_confirmation_kind filmstudy.confirmation_kind default 'manual',
  p_prediction uuid default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_before filmstudy.plays; v_after filmstudy.plays;
begin
  select * into v_before from filmstudy.plays where id = p_play;
  if not found then raise exception 'no such play' using errcode = 'no_data_found'; end if;
  v_team := v_before.team_id;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.play.update');

  update filmstudy.plays set
    quarter = coalesce(p_quarter, quarter),
    clock = coalesce(p_clock, clock),
    down = coalesce(p_down, down),
    distance = coalesce(p_distance, distance),
    yard_line = coalesce(p_yard_line, yard_line),
    hash = coalesce(p_hash, hash),
    possession = coalesce(p_possession, possession),
    personnel = coalesce(p_personnel, personnel),
    formation = coalesce(p_formation, formation),
    strength = coalesce(p_strength, strength),
    motion = coalesce(p_motion, motion),
    play_call = coalesce(p_play_call, play_call),
    family = coalesce(p_family, family),
    concept = coalesce(p_concept, concept),
    direction = coalesce(p_direction, direction),
    defensive_front = coalesce(p_defensive_front, defensive_front),
    box_count = coalesce(p_box_count, box_count),
    coverage = coalesce(p_coverage, coverage),
    pressure = coalesce(p_pressure, pressure),
    result = coalesce(p_result, result),
    yards = coalesce(p_yards, yards),
    touchdown = coalesce(p_touchdown, touchdown),
    first_down = coalesce(p_first_down, first_down),
    turnover = coalesce(p_turnover, turnover),
    penalty = coalesce(p_penalty, penalty),
    explosive = coalesce(p_explosive, explosive),
    red_zone = coalesce(p_red_zone, red_zone),
    third_down = coalesce(p_third_down, third_down),
    goal_line = coalesce(p_goal_line, goal_line)
  where id = p_play
  returning * into v_after;

  -- One confirmation row per field the coach actually set to a new value.
  -- Writing one for an unchanged field would inflate the record of human
  -- verification, which is the one thing this table exists to keep honest.
  insert into filmstudy.confirmations (play_id, team_id, field, value, confirmation_kind, prediction_id, confirmed_by)
  select p_play, v_team, f.field, f.val, p_confirmation_kind, p_prediction, auth.uid()
  from (values
    ('personnel',       p_personnel::text,       v_before.personnel::text),
    ('formation',       p_formation::text,       v_before.formation::text),
    ('strength',        p_strength::text,        v_before.strength::text),
    ('motion',          p_motion::text,          v_before.motion::text),
    ('play_call',       p_play_call,             v_before.play_call),
    ('family',          p_family::text,          v_before.family::text),
    ('concept',         p_concept::text,         v_before.concept::text),
    ('direction',       p_direction::text,       v_before.direction::text),
    ('defensive_front', p_defensive_front::text, v_before.defensive_front::text),
    ('coverage',        p_coverage::text,        v_before.coverage::text),
    ('pressure',        p_pressure::text,        v_before.pressure::text),
    ('result',          p_result,                v_before.result),
    ('yards',           p_yards::text,           v_before.yards::text)
  ) as f(field, val, prev)
  where f.val is not null and f.val is distinct from f.prev;
end; $$;
revoke all on function filmstudy.tag_play(uuid, smallint, text, smallint, smallint, smallint, filmstudy.hash_mark, filmstudy.unit, extensions.citext, extensions.citext, filmstudy.field_direction, extensions.citext, text, filmstudy.play_family, extensions.citext, filmstudy.field_direction, extensions.citext, smallint, extensions.citext, extensions.citext, text, smallint, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, filmstudy.confirmation_kind, uuid) from public, anon;
grant execute on function filmstudy.tag_play(uuid, smallint, text, smallint, smallint, smallint, filmstudy.hash_mark, filmstudy.unit, extensions.citext, extensions.citext, filmstudy.field_direction, extensions.citext, text, filmstudy.play_family, extensions.citext, filmstudy.field_direction, extensions.citext, smallint, extensions.citext, extensions.citext, text, smallint, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, filmstudy.confirmation_kind, uuid) to authenticated;

create or replace function filmstudy.set_play_window(
  p_play uuid, p_start_seconds numeric default null, p_end_seconds numeric default null,
  p_snap_seconds numeric default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from filmstudy.plays where id = p_play;
  if not found then raise exception 'no such play' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.play.update');
  update filmstudy.plays
     set start_seconds = coalesce(p_start_seconds, start_seconds),
         end_seconds   = coalesce(p_end_seconds, end_seconds),
         snap_seconds  = coalesce(p_snap_seconds, snap_seconds)
   where id = p_play;
end; $$;
revoke all on function filmstudy.set_play_window(uuid, numeric, numeric, numeric) from public, anon;
grant execute on function filmstudy.set_play_window(uuid, numeric, numeric, numeric) to authenticated;

-- --- Predictions: the model-facing path (service_role only) -----------------
-- There is no vision pipeline in Phase 1. This exists so that when one arrives
-- it has exactly one door, and so the demo seed has a legitimate way to create
-- clearly-labelled AI suggestions instead of the application inventing them.
create or replace function filmstudy.record_prediction(
  p_play uuid, p_type extensions.citext, p_value text,
  p_confidence numeric, p_model text, p_model_version text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_id uuid;
begin
  select team_id into v_team from filmstudy.plays where id = p_play;
  if not found then raise exception 'no such play' using errcode = 'no_data_found'; end if;
  insert into filmstudy.predictions (play_id, team_id, prediction_type, predicted_value,
                                     confidence, model, model_version)
  values (p_play, v_team, p_type, p_value, p_confidence, p_model, p_model_version)
  on conflict (play_id, prediction_type, model_version) do update
    set predicted_value = excluded.predicted_value, confidence = excluded.confidence
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.record_prediction(uuid, extensions.citext, text, numeric, text, text) from public, anon, authenticated;
grant execute on function filmstudy.record_prediction(uuid, extensions.citext, text, numeric, text, text) to service_role;

-- A coach resolving a suggestion. Accepting it writes the value onto the play
-- AND a confirmation naming the prediction; rejecting it writes nothing to the
-- play at all. There is no path where a suggestion becomes a fact untouched.
create or replace function filmstudy.resolve_prediction(
  p_prediction uuid, p_state filmstudy.prediction_state, p_corrected_value text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_play uuid; v_type extensions.citext; v_value text;
begin
  if p_state = 'ai_suggested' then
    raise exception 'resolving means confirmed, corrected or rejected' using errcode = 'check_violation';
  end if;
  select team_id, play_id, prediction_type, predicted_value
    into v_team, v_play, v_type, v_value
    from filmstudy.predictions where id = p_prediction;
  if not found then raise exception 'no such prediction' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.play.update');

  update filmstudy.predictions
     set state = p_state, resolved_by = auth.uid(), resolved_at = now()
   where id = p_prediction;

  if p_state = 'rejected' then
    return;
  end if;

  if p_state = 'coach_corrected' and (p_corrected_value is null or length(btrim(p_corrected_value)) = 0) then
    raise exception 'a correction must say what the correct value is' using errcode = 'check_violation';
  end if;

  -- Route the confirmed value onto the play's typed column. Only the fields a
  -- model could plausibly predict are routable; anything else is refused
  -- rather than silently dropped.
  v_value := case when p_state = 'coach_corrected' then btrim(p_corrected_value) else v_value end;
  case lower(v_type::text)
    when 'formation'       then update filmstudy.plays set formation = v_value::extensions.citext where id = v_play;
    when 'personnel'       then update filmstudy.plays set personnel = v_value::extensions.citext where id = v_play;
    when 'concept'         then update filmstudy.plays set concept = v_value::extensions.citext where id = v_play;
    when 'coverage'        then update filmstudy.plays set coverage = v_value::extensions.citext where id = v_play;
    when 'defensive_front' then update filmstudy.plays set defensive_front = v_value::extensions.citext where id = v_play;
    when 'pressure'        then update filmstudy.plays set pressure = v_value::extensions.citext where id = v_play;
    else raise exception 'prediction type % does not map to a play field', v_type
           using errcode = 'check_violation';
  end case;

  insert into filmstudy.confirmations (play_id, team_id, field, value, confirmation_kind,
                                       prediction_id, confirmed_by)
  values (v_play, v_team, v_type, v_value,
          (case when p_state = 'coach_confirmed' then 'accepted_prediction'
                else 'corrected_prediction' end)::filmstudy.confirmation_kind,
          p_prediction, auth.uid());
end; $$;
revoke all on function filmstudy.resolve_prediction(uuid, filmstudy.prediction_state, text) from public, anon;
grant execute on function filmstudy.resolve_prediction(uuid, filmstudy.prediction_state, text) to authenticated;

-- --- Participation, grades, notes -------------------------------------------
create or replace function filmstudy.set_participation(
  p_play uuid, p_player uuid, p_unit filmstudy.unit,
  p_position extensions.citext default null, p_assignment text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_id uuid;
begin
  select team_id into v_team from filmstudy.plays where id = p_play;
  if not found then raise exception 'no such play' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.play.update');
  insert into filmstudy.play_participation (play_id, player_id, team_id, unit, position, assignment)
  values (p_play, p_player, v_team, p_unit, p_position, p_assignment)
  on conflict (play_id, player_id) do update
    set unit = excluded.unit, position = excluded.position, assignment = excluded.assignment
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.set_participation(uuid, uuid, filmstudy.unit, extensions.citext, text) from public, anon;
grant execute on function filmstudy.set_participation(uuid, uuid, filmstudy.unit, extensions.citext, text) to authenticated;

create or replace function filmstudy.remove_participation(p_play uuid, p_player uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from filmstudy.plays where id = p_play;
  if not found then raise exception 'no such play' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.play.update');
  delete from filmstudy.play_participation where play_id = p_play and player_id = p_player;
end; $$;
revoke all on function filmstudy.remove_participation(uuid, uuid) from public, anon;
grant execute on function filmstudy.remove_participation(uuid, uuid) to authenticated;

-- A grade must match the team's chosen scale. Accepting a numeric grade on a
-- symbol-scale team would make a season summary uncomputable later.
create or replace function filmstudy.set_grade(
  p_play uuid, p_player uuid, p_category extensions.citext,
  p_symbol filmstudy.grade_symbol default null, p_numeric smallint default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_scale filmstudy.grade_scale; v_id uuid;
begin
  select team_id into v_team from filmstudy.plays where id = p_play;
  if not found then raise exception 'no such play' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.grade.create');

  select grade_scale into v_scale from filmstudy.teams where id = v_team;
  if v_scale = 'symbol' and p_symbol is null then
    raise exception 'this team grades on the symbol scale' using errcode = 'check_violation';
  end if;
  if v_scale = 'numeric' and p_numeric is null then
    raise exception 'this team grades on the 0-100 scale' using errcode = 'check_violation';
  end if;

  -- A grade is only meaningful for a player who was on the field for the play.
  if not exists (select 1 from filmstudy.play_participation pp
                  where pp.play_id = p_play and pp.player_id = p_player) then
    raise exception 'grade a player only on a play they are recorded as playing'
      using errcode = 'foreign_key_violation';
  end if;

  insert into filmstudy.player_grades (play_id, player_id, team_id, category_key,
                                       symbol, numeric_value, graded_by)
  values (p_play, p_player, v_team, p_category,
          case when v_scale = 'symbol' then p_symbol end,
          case when v_scale = 'numeric' then p_numeric end,
          auth.uid())
  on conflict (play_id, player_id, category_key) do update
    set symbol = excluded.symbol, numeric_value = excluded.numeric_value,
        graded_by = excluded.graded_by
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.set_grade(uuid, uuid, extensions.citext, filmstudy.grade_symbol, smallint) from public, anon;
grant execute on function filmstudy.set_grade(uuid, uuid, extensions.citext, filmstudy.grade_symbol, smallint) to authenticated;

create or replace function filmstudy.add_note(
  p_player uuid, p_body text, p_play uuid default null,
  p_timestamp_seconds numeric default null, p_visible_to_athlete boolean default false,
  p_source extensions.citext default 'typed')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_id uuid;
begin
  select team_id into v_team from filmstudy.players where id = p_player;
  if not found then raise exception 'no such player' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.grade.create');
  insert into filmstudy.player_notes (player_id, team_id, play_id, timestamp_seconds, body,
                                      visible_to_athlete, source, author_id)
  values (p_player, v_team, p_play, p_timestamp_seconds, btrim(p_body),
          p_visible_to_athlete, p_source, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.add_note(uuid, text, uuid, numeric, boolean, extensions.citext) from public, anon;
grant execute on function filmstudy.add_note(uuid, text, uuid, numeric, boolean, extensions.citext) to authenticated;

-- --- Clips, playlists -------------------------------------------------------
create or replace function filmstudy.create_clip(
  p_film uuid, p_title text, p_start_seconds numeric, p_end_seconds numeric,
  p_play uuid default null, p_caption text default null,
  p_playback_rate numeric default 1.00)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_tenant uuid; v_id uuid;
begin
  select team_id, tenant_id into v_team, v_tenant from filmstudy.film_assets where id = p_film;
  if not found then raise exception 'no such film' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.clip.manage');
  insert into filmstudy.clips (team_id, tenant_id, film_asset_id, play_id, title, caption,
                               start_seconds, end_seconds, playback_rate, created_by)
  values (v_team, v_tenant, p_film, p_play, btrim(p_title), p_caption,
          p_start_seconds, p_end_seconds, p_playback_rate, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.create_clip(uuid, text, numeric, numeric, uuid, text, numeric) from public, anon;
grant execute on function filmstudy.create_clip(uuid, text, numeric, numeric, uuid, text, numeric) to authenticated;

create or replace function filmstudy.create_playlist(
  p_team uuid, p_name text, p_description text default null,
  p_shared_with_athletes boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.clip.manage');
  insert into filmstudy.playlists (team_id, tenant_id, name, description, shared_with_athletes, created_by)
  values (p_team, filmstudy.team_tenant(p_team), btrim(p_name), p_description,
          p_shared_with_athletes, auth.uid())
  on conflict (team_id, name) do update
    set description = excluded.description, shared_with_athletes = excluded.shared_with_athletes
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.create_playlist(uuid, text, text, boolean) from public, anon;
grant execute on function filmstudy.create_playlist(uuid, text, text, boolean) to authenticated;

create or replace function filmstudy.add_playlist_item(
  p_playlist uuid, p_play uuid default null, p_clip uuid default null, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_pos integer; v_id uuid;
begin
  select team_id into v_team from filmstudy.playlists where id = p_playlist;
  if not found then raise exception 'no such playlist' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.clip.manage');
  select coalesce(max(position), 0) + 1 into v_pos
    from filmstudy.playlist_items where playlist_id = p_playlist;
  insert into filmstudy.playlist_items (playlist_id, team_id, play_id, clip_id, position, note)
  values (p_playlist, v_team, p_play, p_clip, v_pos, p_note)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.add_playlist_item(uuid, uuid, uuid, text) from public, anon;
grant execute on function filmstudy.add_playlist_item(uuid, uuid, uuid, text) to authenticated;

create or replace function filmstudy.remove_playlist_item(p_item uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from filmstudy.playlist_items where id = p_item;
  if not found then raise exception 'no such item' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.clip.manage');
  delete from filmstudy.playlist_items where id = p_item;
end; $$;
revoke all on function filmstudy.remove_playlist_item(uuid) from public, anon;
grant execute on function filmstudy.remove_playlist_item(uuid) to authenticated;

-- --- Assignments -------------------------------------------------------------
create or replace function filmstudy.create_assignment(
  p_player uuid, p_kind filmstudy.assignment_kind, p_message text default null,
  p_due_on date default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_tenant uuid; v_id uuid;
begin
  select team_id, tenant_id into v_team, v_tenant from filmstudy.players where id = p_player;
  if not found then raise exception 'no such player' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.assignment.manage');
  insert into filmstudy.film_assignments (team_id, tenant_id, player_id, assignment_kind,
                                          message, due_on, assigned_by)
  values (v_team, v_tenant, p_player, p_kind, p_message, p_due_on, auth.uid())
  returning id into v_id;
  perform events.emit('filmstudy.assignment.created', v_tenant,
    jsonb_build_object('assignment', v_id, 'player', p_player, 'team', v_team));
  return v_id;
end; $$;
revoke all on function filmstudy.create_assignment(uuid, filmstudy.assignment_kind, text, date) from public, anon;
grant execute on function filmstudy.create_assignment(uuid, filmstudy.assignment_kind, text, date) to authenticated;

create or replace function filmstudy.add_assignment_item(
  p_assignment uuid, p_play uuid default null, p_clip uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_pos integer; v_id uuid;
begin
  select team_id into v_team from filmstudy.film_assignments where id = p_assignment;
  if not found then raise exception 'no such assignment' using errcode = 'no_data_found'; end if;
  perform filmstudy.assert_staff_permission(v_team, 'filmstudy.assignment.manage');
  select coalesce(max(position), 0) + 1 into v_pos
    from filmstudy.assignment_items where assignment_id = p_assignment;
  insert into filmstudy.assignment_items (assignment_id, team_id, play_id, clip_id, position)
  values (p_assignment, v_team, p_play, p_clip, v_pos)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.add_assignment_item(uuid, uuid, uuid) from public, anon;
grant execute on function filmstudy.add_assignment_item(uuid, uuid, uuid) to authenticated;

-- The athlete's own action, and ONLY the athlete's own action. A coach calling
-- this would be manufacturing the film-review metric the dashboard reports, so
-- the function refuses anyone who is not linked to the player.
create or replace function filmstudy.record_assignment_progress(
  p_assignment uuid, p_status filmstudy.assignment_status, p_comment text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_team uuid; v_player uuid; v_id uuid;
begin
  if p_status = 'assigned' then
    raise exception 'progress is viewed, acknowledged or completed' using errcode = 'check_violation';
  end if;
  select team_id, player_id into v_team, v_player
    from filmstudy.film_assignments where id = p_assignment;
  if not found then raise exception 'no such assignment' using errcode = 'no_data_found'; end if;

  if v_player not in (select filmstudy.my_player_ids(v_team)) then
    raise exception 'only the athlete this film was assigned to can mark it reviewed'
      using errcode = 'insufficient_privilege';
  end if;
  if not filmstudy.is_team_viewer(v_team) then
    raise exception 'no access to this team' using errcode = 'insufficient_privilege';
  end if;

  insert into filmstudy.assignment_reviews (assignment_id, team_id, reviewer_id, status, comment)
  values (p_assignment, v_team, auth.uid(), p_status, p_comment)
  returning id into v_id;

  -- The assignment's own status only ever moves forward.
  update filmstudy.film_assignments
     set status = p_status
   where id = p_assignment
     and case p_status when 'viewed' then status = 'assigned'
                       when 'acknowledged' then status in ('assigned','viewed')
                       when 'completed' then status <> 'completed'
                       else false end;
  return v_id;
end; $$;
revoke all on function filmstudy.record_assignment_progress(uuid, filmstudy.assignment_status, text) from public, anon;
grant execute on function filmstudy.record_assignment_progress(uuid, filmstudy.assignment_status, text) to authenticated;

-- --- Terminology -------------------------------------------------------------
create or replace function filmstudy.set_terminology(
  p_team uuid, p_category extensions.citext, p_canonical extensions.citext, p_team_term text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform filmstudy.assert_staff_permission(p_team, 'filmstudy.team.manage');
  insert into filmstudy.team_terminology (team_id, tenant_id, category, canonical_term, team_term)
  values (p_team, filmstudy.team_tenant(p_team), p_category, p_canonical, btrim(p_team_term))
  on conflict (team_id, category, canonical_term) do update set team_term = excluded.team_term
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function filmstudy.set_terminology(uuid, extensions.citext, extensions.citext, text) from public, anon;
grant execute on function filmstudy.set_terminology(uuid, extensions.citext, extensions.citext, text) to authenticated;

-- ===========================================================================
-- Permissions
--
-- Layer 1 of the access model. These say what a KIND of user may do inside a
-- tenant; filmstudy.team_members says on whose team. The split matters most
-- where they disagree: `viewer` carries filmstudy.film.read, but a viewer who
-- is not on any team's roster still sees no film at all, because is_staff and
-- is_team_viewer both return false without a team_members row.
-- ===========================================================================

insert into identity.permissions (key, description, scope) values
  ('filmstudy.team.read',        'Read teams, seasons and games in this organization.',        'tenant'),
  ('filmstudy.team.manage',      'Create teams, set staff, roster links and program settings.','tenant'),
  ('filmstudy.roster.manage',    'Add and edit players on a roster.',                          'tenant'),
  ('filmstudy.film.read',        'Open film this organization holds.',                         'tenant'),
  ('filmstudy.film.create',      'Upload film and mark an upload complete.',                   'tenant'),
  ('filmstudy.film.manage',      'Change a film''s sharing and delete film.',                  'tenant'),
  ('filmstudy.play.create',      'Mark the start and end of a play on the timeline.',          'tenant'),
  ('filmstudy.play.update',      'Tag a play''s football data and correct its window.',        'tenant'),
  ('filmstudy.play.delete',      'Remove a play that was segmented in error.',                 'tenant'),
  ('filmstudy.grade.read',       'Read coach grades and coaching notes.',                      'tenant'),
  ('filmstudy.grade.create',      'Grade a player and write coaching notes.',                   'tenant'),
  ('filmstudy.clip.manage',      'Create clips and film collections.',                         'tenant'),
  ('filmstudy.assignment.manage','Assign film to athletes.',                                   'tenant'),
  ('filmstudy.scouting.read',    'Read opponent film and opponent tendencies.',                'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  -- tenant_owner and tenant_admin: the whole product. These are the program's
  -- athletic director and head coach in organizational terms.
  ('tenant_owner','filmstudy.team.read'),        ('tenant_owner','filmstudy.team.manage'),
  ('tenant_owner','filmstudy.roster.manage'),    ('tenant_owner','filmstudy.film.read'),
  ('tenant_owner','filmstudy.film.create'),      ('tenant_owner','filmstudy.film.manage'),
  ('tenant_owner','filmstudy.play.create'),
  ('tenant_owner','filmstudy.play.update'),  ('tenant_owner','filmstudy.play.delete'),         ('tenant_owner','filmstudy.grade.read'),
  ('tenant_owner','filmstudy.grade.create'),      ('tenant_owner','filmstudy.clip.manage'),
  ('tenant_owner','filmstudy.assignment.manage'),('tenant_owner','filmstudy.scouting.read'),
  ('tenant_admin','filmstudy.team.read'),        ('tenant_admin','filmstudy.team.manage'),
  ('tenant_admin','filmstudy.roster.manage'),    ('tenant_admin','filmstudy.film.read'),
  ('tenant_admin','filmstudy.film.create'),      ('tenant_admin','filmstudy.film.manage'),
  ('tenant_admin','filmstudy.play.create'),
  ('tenant_admin','filmstudy.play.update'),  ('tenant_admin','filmstudy.play.delete'),         ('tenant_admin','filmstudy.grade.read'),
  ('tenant_admin','filmstudy.grade.create'),      ('tenant_admin','filmstudy.clip.manage'),
  ('tenant_admin','filmstudy.assignment.manage'),('tenant_admin','filmstudy.scouting.read'),
  -- manager: a coordinator or position coach. Coaches film; does NOT restructure
  -- the program, and deliberately cannot edit the roster or reopen film to
  -- athletes -- those are program decisions about minors.
  ('manager','filmstudy.team.read'),         ('manager','filmstudy.film.read'),
  ('manager','filmstudy.film.create'),       ('manager','filmstudy.play.create'),
  ('manager','filmstudy.play.update'),  ('manager','filmstudy.play.delete'),
  ('manager','filmstudy.grade.read'),        ('manager','filmstudy.grade.create'),
  ('manager','filmstudy.clip.manage'),       ('manager','filmstudy.assignment.manage'),
  ('manager','filmstudy.scouting.read'),
  -- staff: a volunteer or student assistant who tags film. Can tag and clip,
  -- cannot grade a player and cannot read anyone's grades.
  ('staff','filmstudy.team.read'),  ('staff','filmstudy.film.read'),
  ('staff','filmstudy.film.create'),('staff','filmstudy.play.create'),
  ('staff','filmstudy.play.update'),  ('staff','filmstudy.play.delete'),
  ('staff','filmstudy.clip.manage'),
  -- viewer: an athlete or a guardian. Read film, read nothing evaluative. What
  -- they actually reach is then narrowed again by football role and by the
  -- program's own privacy settings.
  ('viewer','filmstudy.team.read'), ('viewer','filmstudy.film.read')
on conflict do nothing;
-- service_account gets nothing here on purpose. An integration credential is
-- the most likely thing to leak, and this product holds minors' film.

-- ===========================================================================
-- Demo program (brief section 47) -- FENCED, not fabricated
--
-- Real rows, clearly marked. The team carries is_demo = true, the film asset
-- has no object behind it and sits in `demo_no_video` so nothing can present a
-- play button that leads nowhere, and the AI suggestions are real
-- filmstudy.predictions rows attributed to the model `demo-seed`, which is not
-- a model that exists. A coach looking at any of it can tell in one glance
-- that no football was watched to produce it.
-- ===========================================================================
create or replace function filmstudy.seed_demo_program(p_tenant uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_team uuid; v_season uuid; v_opp uuid; v_game uuid; v_film uuid;
  v_p24 uuid; v_p7 uuid; v_p22 uuid; v_p55 uuid; v_p72 uuid;
  v_play uuid; v_start numeric; r record;
begin
  if not identity.has_permission(p_tenant, 'filmstudy.team.manage') then
    raise exception 'insufficient privilege to seed the demo program'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from filmstudy.teams where tenant_id = p_tenant and is_demo) then
    raise exception 'this organization already has the demo program'
      using errcode = 'unique_violation';
  end if;

  v_team := filmstudy.create_team(p_tenant, 'West Seneca Wolves (DEMO)', 'high_school', 'Wolves', true);
  v_season := filmstudy.upsert_season(v_team, 2026, '2026 Season', true);
  v_opp := filmstudy.upsert_opponent(v_team, 'Orchard Park', 'Quakers');
  v_game := filmstudy.upsert_game(v_team, v_opp, v_season, now() - interval '6 days',
                                  'home', 'West Seneca HS', 3::smallint, 21::smallint, 17::smallint,
                                  'Demo game. No film was recorded.');

  v_p24 := filmstudy.upsert_player(v_team, 'Dominic', 'Reyes',   24::smallint, 'OLB', 'defense', 'Junior',   73::smallint, 205::smallint);
  v_p7  := filmstudy.upsert_player(v_team, 'Ty',      'Callahan', 7::smallint, 'QB',  'offense', 'Senior',   74::smallint, 190::smallint);
  v_p22 := filmstudy.upsert_player(v_team, 'Marcus',  'Webb',    22::smallint, 'RB',  'offense', 'Junior',   70::smallint, 195::smallint);
  v_p55 := filmstudy.upsert_player(v_team, 'Owen',    'Brady',   55::smallint, 'MLB', 'defense', 'Senior',   72::smallint, 220::smallint);
  v_p72 := filmstudy.upsert_player(v_team, 'Isaiah',  'Ford',    72::smallint, 'OT',  'offense', 'Sophomore',76::smallint, 265::smallint);

  -- The film record exists so plays have somewhere to hang. It has no bytes,
  -- and its status says exactly that.
  insert into filmstudy.film_assets
    (team_id, tenant_id, game_id, season_id, title, film_kind, status, athlete_visible,
     recorded_on, notes, uploaded_by)
  values (v_team, p_tenant, v_game, v_season, 'Week 3 vs Orchard Park (DEMO — no video)',
          'game', 'demo_no_video', false, (now() - interval '6 days')::date,
          'Demo film. There is no video file behind this record.', auth.uid())
  returning id into v_film;

  -- 25 plays, laid out on a plausible drive chart. Every football value here
  -- is written through tag_play, so each one also produces a confirmation row
  -- attributed to the seeding user -- the demo is honest about being entered
  -- by a human, because it was.
  v_start := 0;
  for r in
    select * from (values
      (1,  1::smallint, 10::smallint, 25::smallint, 'offense'::text, '11', 'Trips Right',    'run'::text,  'Inside Zone',  'right'::text, '4-2-5', 'Cover 3', null::text,        5::smallint,  '+5 yards'),
      (2,  2::smallint,  5::smallint, 30::smallint, 'offense',       '11', 'Doubles',        'pass',       'Play Action',  'left',        '4-2-5', 'Cover 1', null,             12::smallint, '12-yard completion'),
      (3,  1::smallint, 10::smallint, 42::smallint, 'offense',       '12', 'I Formation',    'run',        'Power',        'right',       '4-3',   'Cover 3', null,              8::smallint,  '+8 yards'),
      (4,  2::smallint,  2::smallint, 50::smallint, 'offense',       '21', 'I Formation',    'run',        'Iso',          'middle',      'Bear',  'Cover 0', 'A-gap',           1::smallint,  '+1 yard'),
      (5,  3::smallint,  1::smallint, 51::smallint, 'offense',       '22', 'Tight',          'run',        'Duo',          'middle',      'Bear',  'Cover 0', 'A-gap',           3::smallint,  'first down'),
      (6,  1::smallint, 10::smallint, 46::smallint, 'offense',       '11', 'Empty',          'pass',       'Four Verticals','middle',     'Nickel','Cover 4', null,             -2::smallint,  'sack'),
      (7,  2::smallint, 12::smallint, 44::smallint, 'offense',       '11', 'Trips Right',    'pass',       'Mesh',         'right',       'Nickel','Cover 2', 'Edge',           16::smallint,  'explosive pass'),
      (8,  1::smallint, 10::smallint, 40::smallint, 'defense',       null, 'Trips Right',    'run',        'Outside Zone', 'right',       '4-2-5', 'Cover 3', null,              9::smallint,  'opponent +9'),
      (9,  2::smallint,  1::smallint, 31::smallint, 'defense',       null, 'Doubles',        'run',        'Counter',      'left',        '4-2-5', 'Cover 1', null,              2::smallint,  'opponent first down'),
      (10, 1::smallint, 10::smallint, 29::smallint, 'defense',       null, 'Trips Right',    'pass',       'Slant',        'right',       'Nickel','Cover 3', 'Edge',            6::smallint,  'completion'),
      (11, 2::smallint,  4::smallint, 23::smallint, 'defense',       null, 'Bunch',          'run',        'Sweep',        'left',        '4-2-5', 'Cover 1', null,             -1::smallint,  'TFL #24'),
      (12, 3::smallint,  5::smallint, 24::smallint, 'defense',       null, 'Empty',          'pass',       'Flood',        'right',       'Nickel','Cover 2', 'A-gap',           0::smallint,  'incomplete'),
      (13, 1::smallint, 10::smallint, 35::smallint, 'offense',       '11', 'Trips Right',    'run',        'Inside Zone',  'right',       '4-2-5', 'Cover 3', null,              4::smallint,  '+4 yards'),
      (14, 2::smallint,  6::smallint, 39::smallint, 'offense',       '11', 'Shotgun',        'pass',       'RPO',          'right',       'Nickel','Cover 3', null,              7::smallint,  'first down'),
      (15, 1::smallint, 10::smallint, 46::smallint, 'offense',       '12', 'Pistol',         'run',        'Counter',      'left',        '4-3',   'Cover 1', null,             11::smallint,  'explosive run'),
      (16, 1::smallint, 10::smallint, 43::smallint, 'offense',       '11', 'Doubles',        'pass',       'Dig',          'middle',      'Nickel','Cover 4', 'B-gap',          -7::smallint,  'sack'),
      (17, 2::smallint, 17::smallint, 36::smallint, 'offense',       '11', 'Empty',          'pass',       'Screens',      'left',        'Nickel','Cover 2', 'Blitz',           5::smallint,  '+5 yards'),
      (18, 3::smallint, 12::smallint, 41::smallint, 'offense',       '10', 'Empty',          'pass',       'Four Verticals','middle',     'Nickel','Cover 2', 'Blitz',           0::smallint,  'incomplete'),
      (19, 1::smallint, 10::smallint, 20::smallint, 'defense',       null, 'Trips Right',    'run',        'Outside Zone', 'right',       '4-2-5', 'Cover 3', null,             14::smallint,  'opponent explosive'),
      (20, 1::smallint, 10::smallint, 34::smallint, 'defense',       null, 'Trips Right',    'run',        'Outside Zone', 'right',       '4-2-5', 'Cover 3', null,              3::smallint,  'opponent +3'),
      (21, 2::smallint,  7::smallint, 37::smallint, 'defense',       null, 'Doubles',        'pass',       'Curl',         'left',        'Nickel','Cover 4', null,              8::smallint,  'completion'),
      (22, 1::smallint, 10::smallint, 45::smallint, 'defense',       null, 'Bunch',          'pass',       'Corner',       'right',       'Nickel','Cover 1', 'Edge',            0::smallint,  'interception'),
      (23, 1::smallint, 10::smallint, 12::smallint, 'offense',       '12', 'Tight',          'run',        'Power',        'right',       'Bear',  'Cover 0', 'A-gap',           6::smallint,  'red zone +6'),
      (24, 2::smallint,  4::smallint,  6::smallint, 'offense',       '22', 'Wing',           'run',        'Toss',         'left',        'Bear',  'Cover 0', null,              4::smallint,  'goal line'),
      (25, 1::smallint,  2::smallint,  2::smallint, 'offense',       '22', 'Tight',          'run',        'QB Run',       'middle',      'Bear',  'Cover 0', 'A-gap',           2::smallint,  'touchdown')
    ) as v(n, down, dist, yard, poss, pers, form, fam, concept, dir, front, cov, press, yards, result)
  loop
    -- 32 seconds per play: roughly a real snap-to-snap interval, so the
    -- timeline positions are plausible rather than arbitrary.
    v_play := filmstudy.create_play(v_film, v_start, v_start + 9, v_start + 3, r.n);
    perform filmstudy.tag_play(
      p_play := v_play,
      p_quarter := (1 + (r.n - 1) / 7)::smallint,
      p_down := r.down, p_distance := r.dist, p_yard_line := r.yard,
      p_possession := r.poss::filmstudy.unit,
      p_personnel := r.pers::extensions.citext,
      p_formation := r.form::extensions.citext,
      p_family := r.fam::filmstudy.play_family,
      p_concept := r.concept::extensions.citext,
      p_direction := r.dir::filmstudy.field_direction,
      p_defensive_front := r.front::extensions.citext,
      p_coverage := r.cov::extensions.citext,
      p_pressure := r.press::extensions.citext,
      p_result := r.result, p_yards := r.yards,
      p_touchdown := (r.result = 'touchdown'),
      p_first_down := (r.result like '%first down%'),
      p_turnover := (r.result = 'interception'),
      -- The brief's own thresholds: 12+ on a run, 16+ on a pass.
      p_explosive := (r.fam = 'run' and r.yards >= 12) or (r.fam = 'pass' and r.yards >= 16),
      p_red_zone := (r.poss = 'offense' and r.yard >= 80) or (r.poss = 'defense' and r.yard <= 20),
      p_third_down := (r.down = 3),
      p_goal_line := (r.poss = 'offense' and r.yard >= 95) or (r.poss = 'defense' and r.yard <= 5));

    -- Participation: the five demo players, on the side of the ball they play.
    if r.poss = 'offense' then
      perform filmstudy.set_participation(v_play, v_p7,  'offense', 'QB', 'Execute the call');
      perform filmstudy.set_participation(v_play, v_p22, 'offense', 'RB', 'Press the front side');
      perform filmstudy.set_participation(v_play, v_p72, 'offense', 'OT', 'Base block');
    else
      perform filmstudy.set_participation(v_play, v_p24, 'defense', 'OLB', 'Force / outside leverage');
      perform filmstudy.set_participation(v_play, v_p55, 'defense', 'MLB', 'Fill the front-side A gap');
    end if;

    -- AI suggestions, clearly attributed to a model that does not exist. They
    -- stay in `ai_suggested` -- unresolved, because in the demo no coach has
    -- looked at them yet, which is exactly what the review queue should show.
    perform filmstudy.record_prediction(v_play, 'formation', r.form,
      0.72 + ((r.n % 5) * 0.05), 'demo-seed', 'v0');
    perform filmstudy.record_prediction(v_play, 'coverage', r.cov,
      0.61 + ((r.n % 4) * 0.06), 'demo-seed', 'v0');

    v_start := v_start + 32;
  end loop;

  perform events.emit('filmstudy.demo.seeded', p_tenant,
    jsonb_build_object('team', v_team, 'film', v_film, 'plays', 25));
  return v_team;
end; $$;
comment on function filmstudy.seed_demo_program(uuid) is
  'Creates the brief section 47 demo program. Refuses to run twice. Everything it writes is marked demo, and the film has no video because there is none.';
revoke all on function filmstudy.seed_demo_program(uuid) from public, anon;
grant execute on function filmstudy.seed_demo_program(uuid) to authenticated;

-- Removing the demo program has to be possible, or a real program is stuck
-- with a fake team on its dashboard forever. It can ONLY remove a demo team.
create or replace function filmstudy.remove_demo_program(p_tenant uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  if not identity.has_permission(p_tenant, 'filmstudy.team.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  delete from filmstudy.teams where tenant_id = p_tenant and is_demo;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function filmstudy.remove_demo_program(uuid) from public, anon;
grant execute on function filmstudy.remove_demo_program(uuid) to authenticated;

-- --- Events this module publishes -------------------------------------------
-- filmstudy.team.created, filmstudy.film.registered, filmstudy.film.ready,
-- filmstudy.assignment.created and filmstudy.demo.seeded are emitted to
-- events.outbox above.
--
-- NO events.subscriptions rows are inserted. AthleteHuddle, PlayingTime and
-- HighlightAI do not exist yet, so a subscription registered for them now
-- would be a delivery route to nowhere -- a control that controls nothing.
-- The outbox is the integration seam (section 30: events, not tight
-- coupling); a consumer registers itself when it is built.
