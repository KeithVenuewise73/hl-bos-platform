-- ---------------------------------------------------------------------------
-- PlayTime Tracker (migration 0049, schema `playtime`).
--
-- This schema holds a record of named children: who they are, what team they
-- are on, and how much their coach played them. The isolation tests below are
-- not box-ticking. If any of them fails, one user can read another family's
-- children, and that is the end of the product.
--
-- The rebuild_sessions tests check the other thing that would quietly ruin
-- this product: arithmetic that disagrees with itself. The same scenarios are
-- asserted in packages/playtime-engine's TypeScript suite with the same
-- expected seconds, so the database and the device cannot drift apart without
-- one of the two suites going red.
-- ---------------------------------------------------------------------------
\ir _fixtures.sql.inc

begin;
select plan(35);

-- === Fixtures =============================================================
-- Inserted as the owner, deliberately: we are constructing a world, not
-- testing write paths. RLS applies from the first login_as below.

insert into auth.users (id, email, email_confirmed_at) values
  (tests.uid('coach_a'), 'coach-a@example.test', now()),
  (tests.uid('coach_b'), 'coach-b@example.test', now())
on conflict (id) do nothing;

insert into playtime.teams (id, owner_id, name, sport) values
  (tests.uid('team_a'), tests.uid('coach_a'), 'Orchard Park U12', 'football'),
  (tests.uid('team_b'), tests.uid('coach_b'), 'West Seneca U12',  'football');

insert into playtime.players (id, owner_id, team_id, first_name, last_name, jersey_number) values
  (tests.uid('p1'), tests.uid('coach_a'), tests.uid('team_a'), 'Dominic', 'Herman', '22'),
  (tests.uid('p2'), tests.uid('coach_a'), tests.uid('team_a'), 'Marcus',  'Reed',   '18'),
  (tests.uid('pb'), tests.uid('coach_b'), tests.uid('team_b'), 'Other',   'Player', '9');

insert into playtime.games
  (id, owner_id, team_id, opponent, game_date, period_count, period_seconds,
   minimum_kind, minimum_value) values
  (tests.uid('game_a'), tests.uid('coach_a'), tests.uid('team_a'), 'West Seneca',
   date '2026-09-12', 4, 720, 'percent', 25),
  (tests.uid('game_b'), tests.uid('coach_b'), tests.uid('team_b'), 'Orchard Park',
   date '2026-09-12', 4, 720, 'none', null);

-- A real game, timed from a fixed base so the expected seconds are exact.
--   runs: [+0,+720] in period 1, [+900,+1620] in period 2  = 1440s of clock
--   p1:   on the field the whole time                      = 1440s
--   p2:   [+0,+600] and [+900,+1620]                       = 1320s, 2 entries
-- The 180 seconds of halftime are wall-clock time that nobody played.
insert into playtime.game_events (id, owner_id, game_id, type, occurred_at, seq, player_id, period) values
  (tests.uid('e1'), tests.uid('coach_a'), tests.uid('game_a'), 'game_started',
   timestamptz '2026-09-12 18:00:00+00', 0, null, null),
  (tests.uid('e2'), tests.uid('coach_a'), tests.uid('game_a'), 'player_in',
   timestamptz '2026-09-12 18:00:00+00', 1, tests.uid('p1'), null),
  (tests.uid('e3'), tests.uid('coach_a'), tests.uid('game_a'), 'player_in',
   timestamptz '2026-09-12 18:00:00+00', 2, tests.uid('p2'), null),
  -- A duplicate check-in for p1, as a flaky sync or a double tap would produce.
  -- It must NOT open a second concurrent session.
  (tests.uid('e4'), tests.uid('coach_a'), tests.uid('game_a'), 'player_in',
   timestamptz '2026-09-12 18:05:00+00', 3, tests.uid('p1'), null),
  (tests.uid('e5'), tests.uid('coach_a'), tests.uid('game_a'), 'player_out',
   timestamptz '2026-09-12 18:10:00+00', 4, tests.uid('p2'), null),
  (tests.uid('e6'), tests.uid('coach_a'), tests.uid('game_a'), 'period_ended',
   timestamptz '2026-09-12 18:12:00+00', 5, null, 1),
  (tests.uid('e7'), tests.uid('coach_a'), tests.uid('game_a'), 'period_started',
   timestamptz '2026-09-12 18:15:00+00', 6, null, 2),
  (tests.uid('e8'), tests.uid('coach_a'), tests.uid('game_a'), 'player_in',
   timestamptz '2026-09-12 18:15:00+00', 7, tests.uid('p2'), null),
  (tests.uid('e9'), tests.uid('coach_a'), tests.uid('game_a'), 'game_ended',
   timestamptz '2026-09-12 18:27:00+00', 8, null, null);

-- === Row level security ===================================================

-- 1-6: coach A cannot see anything of coach B's.
select tests.login_as(tests.uid('coach_a'));
select is((select count(*)::int from playtime.teams where owner_id = tests.uid('coach_b')),
  0, 'a_cannot_read_b_teams');
select is((select count(*)::int from playtime.players where owner_id = tests.uid('coach_b')),
  0, 'a_cannot_read_b_players: no other family''s children are visible');
select is((select count(*)::int from playtime.games where owner_id = tests.uid('coach_b')),
  0, 'a_cannot_read_b_games');
select is((select count(*)::int from playtime.game_events where owner_id = tests.uid('coach_b')),
  0, 'a_cannot_read_b_events');
select is((select count(*)::int from playtime.teams), 1,
  'a_sees_only_own_teams');
select is((select count(*)::int from playtime.players), 2,
  'a_sees_only_own_players');

-- 7-9: nor write to them. A UUID is a filter, never proof of ownership.
with upd as (
  update playtime.teams set name = 'HIJACKED' where id = tests.uid('team_b') returning 1
) select is((select count(*)::int from upd), 0, 'a_cannot_update_b_team');

with del as (
  delete from playtime.players where id = tests.uid('pb') returning 1
) select is((select count(*)::int from del), 0, 'a_cannot_delete_b_player');

select throws_ok(
  format('insert into playtime.teams (owner_id, name, sport) values (%L, %L, %L)',
         tests.uid('coach_b'), 'Planted', 'football'),
  '42501',
  null,
  'a_cannot_insert_a_row_owned_by_b'
);
select tests.logout();

-- 10: the damage is genuinely absent, checked as owner.
select is((select name from playtime.teams where id = tests.uid('team_b')),
  'West Seneca U12', 'b_team_is_unchanged');

-- 11-12: an anonymous caller sees nothing at all.
select tests.login_as_anon();
select throws_ok(
  'select count(*) from playtime.teams', '42501', null,
  'anon_cannot_read_teams'
);
select throws_ok(
  'select count(*) from playtime.players', '42501', null,
  'anon_cannot_read_players'
);
select tests.logout();

-- 13-19: RLS is enabled AND forced everywhere. Forced is the one that matters:
-- without it the table owner bypasses its own policies.
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'playtime' and c.relkind = 'r'
      and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 'every_playtime_table_has_rls_enabled_and_forced');

select is((select count(*)::int from pg_policies where schemaname = 'playtime'
           and tablename = 'teams'), 4, 'teams_has_a_policy_per_command');
select is((select count(*)::int from pg_policies where schemaname = 'playtime'
           and tablename = 'players'), 4, 'players_has_a_policy_per_command');
select is((select count(*)::int from pg_policies where schemaname = 'playtime'
           and tablename = 'games'), 4, 'games_has_a_policy_per_command');
select is((select count(*)::int from pg_policies where schemaname = 'playtime'
           and tablename = 'game_events'), 4, 'game_events_has_a_policy_per_command');
select is((select count(*)::int from pg_policies where schemaname = 'playtime'
           and tablename = 'player_sessions'), 4, 'player_sessions_has_a_policy_per_command');
select is((select count(*)::int from pg_policies where schemaname = 'playtime'
           and tablename = 'profiles'), 4, 'profiles_has_a_policy_per_command');

-- === The event log ========================================================

-- 20: append-only. History is corrected by appending, never by editing.
select tests.login_as(tests.uid('coach_a'));
select throws_ok(
  format('update playtime.game_events set occurred_at = now() where id = %L', tests.uid('e1')),
  'P0001',
  'playtime.game_events is append-only: correct a game by appending events, not by editing history',
  'game_events_cannot_be_edited'
);

-- 21: the device-minted id is the idempotency key. A retried sync is a no-op.
select throws_ok(
  format($q$insert into playtime.game_events (id, owner_id, game_id, type, occurred_at, seq)
            values (%L, %L, %L, 'clock_paused', now(), 99)$q$,
         tests.uid('e1'), tests.uid('coach_a'), tests.uid('game_a')),
  '23505',
  null,
  'a_replayed_event_id_is_rejected_by_the_primary_key'
);

-- 22-23: an event must name what it is about.
select throws_ok(
  format($q$insert into playtime.game_events (id, owner_id, game_id, type, occurred_at)
            values (gen_random_uuid(), %L, %L, 'player_in', now())$q$,
         tests.uid('coach_a'), tests.uid('game_a')),
  '23514', null, 'a_player_event_must_name_a_player'
);
select throws_ok(
  format($q$insert into playtime.game_events (id, owner_id, game_id, type, occurred_at)
            values (gen_random_uuid(), %L, %L, 'period_ended', now())$q$,
         tests.uid('coach_a'), tests.uid('game_a')),
  '23514', null, 'a_period_event_must_name_a_period'
);

-- === Participation arithmetic =============================================
-- These expected values are the same ones asserted in the TypeScript engine.

select is(playtime.rebuild_sessions(tests.uid('game_a')), 3,
  'rebuild_produces_three_sessions');

-- 25: halftime is not playing time. p1 never left the field, but 180 seconds
-- of wall-clock halftime passed, and none of it counts.
select is(
  (select sum(duration_seconds)::int from playtime.player_sessions
    where game_id = tests.uid('game_a') and player_id = tests.uid('p1')),
  1440, 'p1_played_1440s_excluding_the_180s_halftime');

-- 26: the duplicate check-in did not open a second session.
select is(
  (select count(*)::int from playtime.player_sessions
    where game_id = tests.uid('game_a') and player_id = tests.uid('p1')),
  1, 'a_duplicate_player_in_does_not_double_a_session');

-- 27-28: two real entries, correctly summed.
select is(
  (select count(*)::int from playtime.player_sessions
    where game_id = tests.uid('game_a') and player_id = tests.uid('p2')),
  2, 'p2_has_two_entries');
select is(
  (select sum(duration_seconds)::int from playtime.player_sessions
    where game_id = tests.uid('game_a') and player_id = tests.uid('p2')),
  1320, 'p2_played_1320s');

-- 29: the final whistle checks out anyone still on the field.
select is(
  (select count(*)::int from playtime.player_sessions
    where game_id = tests.uid('game_a') and exited_at is null),
  0, 'the_final_whistle_closes_every_open_session');

-- 30: deterministic. Rebuilding twice must not produce a different report.
select is(playtime.rebuild_sessions(tests.uid('game_a')), 3,
  'rebuild_is_idempotent');

-- 31: sessions are attributed to the period they were played in.
select is(
  (select period_number from playtime.player_sessions
    where game_id = tests.uid('game_a') and player_id = tests.uid('p2')
    order by entered_at desc limit 1),
  2, 'the_second_half_session_is_recorded_in_period_2');

-- 32: SECURITY INVOKER means another coach's game is simply not there.
select is(playtime.rebuild_sessions(tests.uid('game_b')), 0,
  'rebuild_cannot_reach_another_coaches_game');
select tests.logout();

-- === Configuration integrity ==============================================

-- 33: a target that says "none" cannot secretly carry a number.
select throws_ok(
  format($q$insert into playtime.games
            (owner_id, team_id, opponent, game_date, period_count, period_seconds,
             minimum_kind, minimum_value)
            values (%L, %L, 'X', current_date, 4, 720, 'none', 25)$q$,
         tests.uid('coach_a'), tests.uid('team_a')),
  '23514', null, 'a_none_target_cannot_carry_a_value'
);

-- === Account deletion =====================================================

-- 34-35: one call removes the caller's account and cascades away every child
-- record. Coach B is untouched.
select tests.login_as(tests.uid('coach_a'));
select playtime.delete_my_account();
select tests.logout();

select is(
  (select count(*)::int from playtime.teams          where owner_id = tests.uid('coach_a'))
  + (select count(*)::int from playtime.players       where owner_id = tests.uid('coach_a'))
  + (select count(*)::int from playtime.games         where owner_id = tests.uid('coach_a'))
  + (select count(*)::int from playtime.game_events   where owner_id = tests.uid('coach_a'))
  + (select count(*)::int from playtime.player_sessions where owner_id = tests.uid('coach_a'))
  + (select count(*)::int from auth.users             where id = tests.uid('coach_a')),
  0, 'deleting_an_account_removes_the_user_and_every_record_it_owned');

select is(
  (select count(*)::int from playtime.teams where owner_id = tests.uid('coach_b')),
  1, 'deleting_one_account_does_not_touch_another');

select * from finish();
rollback;
