-- ===========================================================================
-- playtime — PlayTime Tracker
--
-- The persistence schema for PlayTime Tracker (apps/playtime-tracker, engine in
-- packages/playtime-engine). Purely additive: a new schema, no existing object
-- is touched.
--
-- This file makes no claim about where it has been applied. Deployment state
-- lives in .hlbos/canonical.json and the deployment log, which are the records
-- that are updated when it changes. A status comment inside the SQL goes stale
-- the moment it stops being true, and editing an applied migration to refresh
-- it is exactly the drift this lineage exists to govern. Migrations 0028 and
-- 0046 assert their status nowhere either.
--
-- WHOSE DATA THIS IS. This is a record of named children: who they are, what
-- team they are on, which games they attended, and how their coach chose to
-- use them. That is more sensitive than most business data, not less. So:
--
--   * Every table is owned by exactly one auth user, via `owner_id`.
--   * RLS is ENABLED and FORCED on every table, including for the table owner.
--   * Policies are written per-command and always compare to auth.uid().
--   * There is no "platform admin reads everything" escape hatch, no
--     service-role convenience path, and no cross-user visibility of any kind.
--     Nobody operating this platform has a legitimate reason to read a list of
--     twelve-year-olds and their playing time.
--   * Deleting the account deletes the children's records with it, by cascade,
--     in one transaction. See playtime.delete_my_account().
--
-- WHY THE EVENT LOG IS A TABLE AND MINUTES ARE NOT A COLUMN. `game_events` is
-- the authoritative record: an append-only log of timestamped taps, written on
-- the device the instant they happen and synced whenever a network exists. A
-- `seconds_played` column would be a number the client computed, which means a
-- number that can be wrong, disagree between devices, or be lost when the app
-- is killed mid-increment. `player_sessions` exists for reporting and season
-- aggregation, but it is a PROJECTION of the log, rebuildable at any time by
-- playtime.rebuild_sessions(). The log is what the product actually trusts.
--
-- WHY EVENT IDS COME FROM THE DEVICE. The primary key of `game_events` is a
-- UUID minted on the phone before any write is attempted. A sync retried
-- because a response was lost -- rather than because a write failed -- carries
-- the same id, and the primary key rejects the duplicate. That is what makes a
-- substitution impossible to record twice, which is the one corruption that
-- would silently inflate a child's minutes.
--
-- rollback:
--   DROP SCHEMA IF EXISTS playtime CASCADE;
--   (Additive migration: it creates a new schema and touches no existing
--    table, so dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists playtime;
comment on schema playtime is
  'PlayTime Tracker: one user''s teams, rosters, games and participation log. Every table is owned by a single auth user under forced RLS. No cross-user visibility exists.';

revoke all on schema playtime from public, anon;
grant usage on schema playtime to authenticated;
alter default privileges in schema playtime revoke all on tables from public, anon;
alter default privileges in schema playtime revoke all on functions from public, anon;

-- --- Types ------------------------------------------------------------------

do $$ begin create type playtime.sport as enum
  ('football','basketball','soccer','hockey','baseball','other');
  exception when duplicate_object then null; end $$;
comment on type playtime.sport is
  'Sports supported in V1. Adding one is a new enum value plus a label in the client -- the engine treats every sport identically.';

do $$ begin create type playtime.minimum_kind as enum ('none','percent','seconds');
  exception when duplicate_object then null; end $$;
comment on type playtime.minimum_kind is
  'How a participation target is expressed. Always the USER''S OWN target: this product makes no league-specific compliance claim and stores no league rules.';

do $$ begin create type playtime.game_event_type as enum
  ('game_started','period_started','period_ended','clock_paused','clock_resumed',
   'player_in','player_out','game_ended');
  exception when duplicate_object then null; end $$;

-- --- Profiles ---------------------------------------------------------------

create table if not exists playtime.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  -- Denormalised from auth.users so a report can name its author without the
  -- client needing to read the auth schema.
  email        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table playtime.profiles is
  'One row per PlayTime Tracker user, keyed by the auth user id. Deliberately thin: this product has no social surface, so it stores no bio, no photo and no contacts.';

-- --- Teams ------------------------------------------------------------------

create table if not exists playtime.teams (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  sport       playtime.sport not null default 'other',
  -- Archiving, not deletion, is the default for a team with games behind it.
  -- A season's history should not be destroyed to tidy up a list.
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists teams_owner_idx on playtime.teams (owner_id, archived_at);

-- --- Players ----------------------------------------------------------------

create table if not exists playtime.players (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  team_id       uuid not null references playtime.teams(id) on delete cascade,
  first_name    text not null default '',
  last_name     text not null default '',
  -- TEXT, not an integer. "00" and "07" are real jerseys and are not 0 and 7,
  -- and a number type would silently turn one into the other.
  jersey_number text not null default '',
  position      text,
  -- Deactivated athletes leave the roster and keep every minute already
  -- recorded. A child who left the team mid-season still played those games.
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint player_has_a_name
    check (length(btrim(first_name)) > 0 or length(btrim(last_name)) > 0
           or length(btrim(jersey_number)) > 0)
);
create index if not exists players_team_idx on playtime.players (team_id, active);

-- --- Games ------------------------------------------------------------------

create table if not exists playtime.games (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  team_id        uuid not null references playtime.teams(id) on delete cascade,
  opponent       text not null default '',
  game_date      date not null,
  period_count   integer not null check (period_count between 1 and 12),
  period_seconds integer not null check (period_seconds between 60 and 7200),
  minimum_kind   playtime.minimum_kind not null default 'none',
  -- Percent (1..100) or seconds, per minimum_kind. Null when there is no
  -- target -- never 0, which would be a different and false claim.
  minimum_value  integer,
  -- Scores are optional and stay null when not entered. A game with no score
  -- recorded must never render as 0-0.
  score_us       integer check (score_us >= 0),
  score_them     integer check (score_them >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint minimum_value_matches_kind check (
    (minimum_kind = 'none'    and minimum_value is null) or
    (minimum_kind = 'percent' and minimum_value between 1 and 100) or
    (minimum_kind = 'seconds' and minimum_value > 0)
  )
);
create index if not exists games_team_idx on playtime.games (team_id, game_date desc);
create index if not exists games_owner_idx on playtime.games (owner_id, game_date desc);

-- --- Game roster ------------------------------------------------------------

create table if not exists playtime.game_players (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  game_id    uuid not null references playtime.games(id) on delete cascade,
  player_id  uuid not null references playtime.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);
comment on table playtime.game_players is
  'Who was available for this game. Distinct from the team roster: an athlete who was absent should not appear in the report as having played zero minutes.';
create index if not exists game_players_game_idx on playtime.game_players (game_id);

-- --- The event log ----------------------------------------------------------

create table if not exists playtime.game_events (
  -- Generated on the device, before any write is attempted. THIS is the
  -- idempotency key that makes a retried sync safe.
  id         uuid primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  game_id    uuid not null references playtime.games(id) on delete cascade,
  type       playtime.game_event_type not null,
  -- The instant of the tap. Every duration in this product is derived by
  -- subtracting two of these. There is no counter anywhere.
  occurred_at timestamptz not null,
  -- Per-device monotonic counter, used ONLY to break ties inside a single
  -- millisecond so that replay order is a total order and therefore
  -- reproducible on any device. Never a source of duration.
  seq        integer not null default 0,
  player_id  uuid references playtime.players(id) on delete cascade,
  period     integer check (period between 1 and 12),
  created_at timestamptz not null default now(),
  constraint player_events_name_a_player check (
    (type in ('player_in','player_out')) = (player_id is not null)
  ),
  constraint period_events_name_a_period check (
    (type in ('period_started','period_ended')) = (period is not null)
  )
);
comment on table playtime.game_events is
  'Append-only log of every state change in a live game. AUTHORITATIVE: player_sessions is derived from this, never the other way round. Rows are never updated -- see the deny_mutation trigger below.';
create index if not exists game_events_game_idx
  on playtime.game_events (game_id, occurred_at, seq);

-- An append-only log that can be edited is not an append-only log. Deletion is
-- allowed only through the cascade from the game (or the account), so a coach
-- can still remove a game they created by mistake.
create or replace function playtime.deny_event_update()
returns trigger
language plpgsql
-- search_path is pinned. Migration 0047 exists because a function shipped
-- without this; that lesson is applied here rather than relearned.
set search_path = ''
as $$
begin
  raise exception
    'playtime.game_events is append-only: correct a game by appending events, not by editing history';
end $$;

drop trigger if exists game_events_are_append_only on playtime.game_events;
create trigger game_events_are_append_only
  before update on playtime.game_events
  for each row execute function playtime.deny_event_update();

-- --- Derived participation sessions -----------------------------------------

create table if not exists playtime.player_sessions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  game_id          uuid not null references playtime.games(id) on delete cascade,
  player_id        uuid not null references playtime.players(id) on delete cascade,
  entered_at       timestamptz not null,
  -- Null while the athlete is still on the field.
  exited_at        timestamptz,
  -- COUNTED seconds, not wall-clock seconds. Time while the clock was stopped
  -- (halftime, a timeout, an injury) is excluded: an athlete standing on the
  -- field during a stoppage is not playing, and a report that says they are is
  -- the last report that coach trusts.
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  period_number    integer not null default 1,
  created_at       timestamptz not null default now(),
  -- An athlete cannot enter play twice at the same instant. This is the
  -- database's half of the duplicate-session guard; the engine enforces the
  -- same rule when replaying the log.
  unique (game_id, player_id, entered_at),
  constraint exit_is_not_before_entry check (exited_at is null or exited_at >= entered_at)
);
comment on table playtime.player_sessions is
  'A PROJECTION of game_events, kept for reporting and season aggregation. Rebuildable at any time with playtime.rebuild_sessions(game_id); if it ever disagrees with the log, the log is right.';
create index if not exists player_sessions_game_idx on playtime.player_sessions (game_id);
create index if not exists player_sessions_player_idx on playtime.player_sessions (player_id);

-- --- Rebuilding the projection ----------------------------------------------
--
-- The same arithmetic as packages/playtime-engine, in SQL, so a season
-- aggregate can be computed from the log server-side without trusting a
-- client's totals. An athlete's playing time is the OVERLAP of "they were on
-- the field" and "the clock was running" -- never one alone.
--
-- SECURITY INVOKER, deliberately: it runs as the calling user and is therefore
-- bounded by exactly the same RLS policies as a direct query. A SECURITY
-- DEFINER here would be a way to read another user's game, which is precisely
-- what this schema exists to prevent.

create or replace function playtime.rebuild_sessions(p_game_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner        uuid;
  v_rows         integer := 0;
  e              record;
  v_phase        text := 'scheduled';
  v_period       integer := 0;
  v_run_open     timestamptz;
  v_run_period   integer := 0;
  v_runs         timestamptz[][] := array[]::timestamptz[][];
  v_final_at     timestamptz;
begin
  -- RLS decides visibility. A game belonging to somebody else simply is not
  -- visible here, so this returns 0 rather than leaking its existence.
  select owner_id into v_owner from playtime.games where id = p_game_id;
  if v_owner is null then
    return 0;
  end if;

  -- Dropped and recreated rather than reused: calling this twice in one
  -- transaction must produce the same rows, not accumulate them.
  drop table if exists _pt_runs;
  create temporary table _pt_runs (
    run_start timestamptz, run_end timestamptz, period integer
  ) on commit drop;

  drop table if exists _pt_spans;
  create temporary table _pt_spans (
    player_id uuid, span_start timestamptz, span_end timestamptz
  ) on commit drop;

  -- Pass 1: the clock.
  for e in
    select * from playtime.game_events
    where game_id = p_game_id
    order by occurred_at, seq, id
  loop
    if v_phase = 'final' then
      continue;
    end if;
    v_final_at := e.occurred_at;

    if e.type = 'game_started' and v_phase = 'scheduled' then
      v_period := 1; v_run_open := e.occurred_at; v_run_period := 1; v_phase := 'running';

    elsif e.type = 'period_started' and v_phase <> 'scheduled' then
      if v_run_open is not null then
        insert into _pt_runs values (v_run_open, greatest(v_run_open, e.occurred_at), v_run_period);
        v_run_open := null;
      end if;
      v_period := e.period; v_run_open := e.occurred_at; v_run_period := e.period; v_phase := 'running';

    elsif e.type = 'period_ended' and v_phase in ('running','paused') then
      if v_run_open is not null then
        insert into _pt_runs values (v_run_open, greatest(v_run_open, e.occurred_at), v_run_period);
        v_run_open := null;
      end if;
      v_phase := 'period_break';

    elsif e.type = 'clock_paused' and v_phase = 'running' then
      if v_run_open is not null then
        insert into _pt_runs values (v_run_open, greatest(v_run_open, e.occurred_at), v_run_period);
        v_run_open := null;
      end if;
      v_phase := 'paused';

    elsif e.type = 'clock_resumed' and v_phase = 'paused' then
      v_run_open := e.occurred_at; v_run_period := v_period; v_phase := 'running';

    elsif e.type = 'game_ended' then
      if v_run_open is not null then
        insert into _pt_runs values (v_run_open, greatest(v_run_open, e.occurred_at), v_run_period);
        v_run_open := null;
      end if;
      v_phase := 'final';
    end if;
  end loop;

  -- A game still in progress has an open run. Close it at the last recorded
  -- event rather than at now(): this function must be deterministic, so that
  -- rebuilding twice cannot produce two different reports.
  if v_run_open is not null then
    insert into _pt_runs values (v_run_open, greatest(v_run_open, v_final_at), v_run_period);
  end if;

  -- Pass 2: who was on the field.
  for e in
    select * from playtime.game_events
    where game_id = p_game_id and type in ('player_in','player_out','game_ended')
    order by occurred_at, seq, id
  loop
    exit when e.type = 'game_ended';
    if e.type = 'player_in' then
      -- Already on the field: a double tap, or the same tap synced twice.
      -- Ignoring it is what stops a duplicate becoming a second concurrent
      -- session and doubling the athlete's minutes.
      if exists (select 1 from _pt_spans s
                 where s.player_id = e.player_id and s.span_end is null) then
        continue;
      end if;
      insert into _pt_spans values (e.player_id, e.occurred_at, null);
    else
      update _pt_spans s
         set span_end = greatest(s.span_start, e.occurred_at)
       where s.player_id = e.player_id and s.span_end is null;
    end if;
  end loop;

  if v_phase = 'final' then
    update _pt_spans s
       set span_end = greatest(s.span_start, v_final_at)
     where s.span_end is null;
  end if;

  delete from playtime.player_sessions where game_id = p_game_id;

  insert into playtime.player_sessions
    (owner_id, game_id, player_id, entered_at, exited_at, duration_seconds, period_number)
  select
    v_owner,
    p_game_id,
    s.player_id,
    s.span_start,
    s.span_end,
    coalesce((
      select round(sum(
        extract(epoch from (
          least(coalesce(s.span_end, r.run_end), r.run_end)
          - greatest(s.span_start, r.run_start)
        ))
      ))::integer
      from _pt_runs r
      where least(coalesce(s.span_end, r.run_end), r.run_end)
          > greatest(s.span_start, r.run_start)
    ), 0),
    coalesce((
      select r.period from _pt_runs r
      where least(coalesce(s.span_end, r.run_end), r.run_end)
          > greatest(s.span_start, r.run_start)
      order by r.run_start
      limit 1
    ), 1)
  from _pt_spans s;

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

comment on function playtime.rebuild_sessions(uuid) is
  'Recompute player_sessions for one game from its event log. SECURITY INVOKER: bounded by the caller''s own RLS policies, so it can never read another user''s game. Deterministic -- rebuilding twice produces the same rows.';

-- --- Row level security -----------------------------------------------------
--
-- Enabled AND forced on every table. Forced matters: without it the table owner
-- role bypasses its own policies, which is exactly the hole that makes "we have
-- RLS" a false statement in so many projects.
--
-- One policy per command, all four commands, all comparing owner_id to
-- auth.uid(). WITH CHECK on insert and update is what stops a user writing a
-- row owned by somebody else.

do $$
declare
  t text;
begin
  foreach t in array array[
    'teams','players','games','game_players','game_events','player_sessions'
  ]
  loop
    execute format('alter table playtime.%I enable row level security', t);
    execute format('alter table playtime.%I force row level security', t);

    execute format(
      'create policy %I on playtime.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on playtime.%I for insert to authenticated with check (owner_id = auth.uid())',
      t || '_insert_own', t);
    execute format(
      'create policy %I on playtime.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update_own', t);
    execute format(
      'create policy %I on playtime.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete_own', t);

    execute format(
      'grant select, insert, update, delete on playtime.%I to authenticated', t);
  end loop;
end $$;

-- profiles is keyed by the auth user id itself, so its policies compare `id`.
alter table playtime.profiles enable row level security;
alter table playtime.profiles force row level security;
create policy profiles_select_own on playtime.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on playtime.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on playtime.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on playtime.profiles
  for delete to authenticated using (id = auth.uid());
grant select, insert, update, delete on playtime.profiles to authenticated;

grant execute on function playtime.rebuild_sessions(uuid) to authenticated;

-- --- Account deletion -------------------------------------------------------
--
-- Both stores require an in-app way to delete an account, and so does simple
-- decency: this data is about children. One call removes the auth user, and
-- every team, athlete, game, event and session cascades away with it, in one
-- transaction.
--
-- SECURITY DEFINER is required -- a normal user cannot delete from auth.users
-- -- and is therefore written to do exactly one thing to exactly one row, the
-- caller's own, chosen by auth.uid() and never by an argument. There is no
-- parameter an attacker could point at somebody else's account.

create or replace function playtime.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = v_uid;
end $$;

revoke all on function playtime.delete_my_account() from public, anon;
grant execute on function playtime.delete_my_account() to authenticated;

comment on function playtime.delete_my_account() is
  'Permanently delete the CALLING user''s account and, by cascade, every team, athlete, game, event and session they own. Takes no argument on purpose: the row is chosen by auth.uid(), so it cannot be pointed at another account.';

-- --- Profile bootstrap ------------------------------------------------------

create or replace function playtime.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into playtime.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists playtime_on_auth_user_created on auth.users;
create trigger playtime_on_auth_user_created
  after insert on auth.users
  for each row execute function playtime.handle_new_user();

-- --- updated_at -------------------------------------------------------------

create or replace function playtime.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles','teams','players','games']
  loop
    execute format(
      'create trigger %I before update on playtime.%I for each row execute function playtime.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;
