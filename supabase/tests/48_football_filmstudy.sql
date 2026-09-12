\ir _fixtures.sql.inc

-- ===========================================================================
-- Football FilmStudy AI, Phase 1 — migration 0048.
--
-- Two things are under test here, and the second is the reason this file is
-- long.
--
-- 1. The brief's section 54 vertical slice, end to end in SQL: team, roster,
--    game, film, a manually segmented play, tags, participation, a grade, a
--    coaching note, a clip, an assignment, and the athlete marking it
--    reviewed. If any link in that chain is broken the product does not work.
--
-- 2. The access boundaries, attacked rather than assumed. This product holds
--    film and evaluations of minors. So the tests try to do the wrong thing --
--    read opponent scouting as an athlete, read another family's grades as a
--    guardian, mark an athlete's film reviewed as a coach, write a row
--    directly instead of through a permission-checked function, reach into
--    another tenant entirely -- and assert that each one fails.
-- ===========================================================================
begin;
select plan(100);
select tests.seed();

-- Named lookups: psql meta-commands are unavailable inside the test runner and
-- this suite runs under two different runners, so rows are found by name.
create or replace function tests.fs_team() returns uuid language sql stable security definer as $$
  select id from filmstudy.teams where name = 'West Seneca Wolves' limit 1 $$;
create or replace function tests.fs_player(p_num smallint) returns uuid language sql stable security definer as $$
  select id from filmstudy.players where team_id = tests.fs_team() and jersey_number = p_num limit 1 $$;
create or replace function tests.fs_film(p_title text) returns uuid language sql stable security definer as $$
  select id from filmstudy.film_assets where team_id = tests.fs_team() and title = p_title limit 1 $$;
create or replace function tests.fs_play(p_n integer) returns uuid language sql stable security definer as $$
  select id from filmstudy.plays
   where film_asset_id = tests.fs_film('Week 3 vs Orchard Park') and play_number = p_n limit 1 $$;

-- ===========================================================================
-- Part 1 — the vertical slice
-- ===========================================================================

-- --- A team, its season, an opponent and a game ----------------------------
select tests.login_as(tests.uid('owner_a'));
select ok(filmstudy.create_team(tests.uid('tenant_a'), 'West Seneca Wolves', 'high_school', 'Wolves')
          is not null, 't_head_coach_creates_a_team');

-- Creating a team makes the creator its org_admin. Without this the creator
-- would immediately lose access to what they just made.
select is(filmstudy.my_role(tests.fs_team())::text, 'org_admin',
  't_team_creator_is_org_admin');

-- Four default grading categories, or nothing can be graded at all.
select is((select count(*)::int from filmstudy.grade_categories where team_id = tests.fs_team()),
  4, 't_team_starts_with_four_grade_categories');

select ok(filmstudy.upsert_season(tests.fs_team(), 2026, '2026 Season', true) is not null,
  't_season_created');
select ok(filmstudy.upsert_opponent(tests.fs_team(), 'Orchard Park', 'Quakers') is not null,
  't_opponent_created');
select ok(filmstudy.upsert_game(
    tests.fs_team(),
    (select id from filmstudy.opponents where team_id = tests.fs_team() and name = 'Orchard Park'),
    (select id from filmstudy.seasons where team_id = tests.fs_team() and year = 2026),
    now() - interval '2 days', 'home', 'West Seneca HS', 3::smallint) is not null,
  't_game_created');

-- An unplayed game has no score. A 0 here would render as a 0-0 loss.
select is((select team_score from filmstudy.games where team_id = tests.fs_team()), null,
  't_unplayed_game_has_no_score_not_zero');

-- --- Roster ----------------------------------------------------------------
select ok(filmstudy.upsert_player(tests.fs_team(), 'Dominic', 'Reyes', 24::smallint, 'OLB', 'defense')
          is not null, 't_player_24_added');
select ok(filmstudy.upsert_player(tests.fs_team(), 'Ty', 'Callahan', 7::smallint, 'QB', 'offense')
          is not null, 't_player_7_added');

-- Two players may share a jersey number -- most real rosters do.
select lives_ok(
  $$ select filmstudy.upsert_player(tests.fs_team(), 'Sam', 'Doyle', 24::smallint, 'WR', 'offense') $$,
  't_two_players_may_share_a_number');

-- --- Film upload -----------------------------------------------------------
select ok((filmstudy.register_film(tests.fs_team(), 'Week 3 vs Orchard Park', 'game',
    'week3.mp4', 'video/mp4', 4294967296,
    (select id from filmstudy.games where team_id = tests.fs_team()))).id is not null,
  't_film_registered');

-- The object path is computed, never accepted from the caller, and always
-- under the tenant's own prefix.
select ok((select object_path like tests.uid('tenant_a')::text || '/%'
           from filmstudy.film_assets where id = tests.fs_film('Week 3 vs Orchard Park')),
  't_film_object_path_is_tenant_scoped');

-- A registered film is not yet playable.
select is((select status::text from filmstudy.film_assets where id = tests.fs_film('Week 3 vs Orchard Park')),
  'registered', 't_registered_film_is_not_ready');

select throws_ok(
  $$ select filmstudy.register_film(tests.fs_team(), 'Bad container', 'game',
       'week3.avi', 'video/x-msvideo', 1000000) $$,
  '23514', null, 't_unsupported_container_rejected');
select throws_ok(
  $$ select filmstudy.register_film(tests.fs_team(), 'Not a video', 'game',
       'notes.mp4', 'application/pdf', 1000000) $$,
  '23514', null, 't_non_video_mime_rejected');
select throws_ok(
  $$ select filmstudy.register_film(tests.fs_team(), 'Too big', 'game',
       'huge.mp4', 'video/mp4', 20000000000) $$,
  '23514', null, 't_film_over_16GiB_rejected');

select lives_ok(
  $$ select filmstudy.confirm_film_upload(tests.fs_film('Week 3 vs Orchard Park'), 4294967296, 2880.0) $$,
  't_upload_confirmed');
select is((select status::text from filmstudy.film_assets where id = tests.fs_film('Week 3 vs Orchard Park')),
  'ready', 't_confirmed_film_is_ready');

-- --- Manual play segmentation ----------------------------------------------
select ok(filmstudy.create_play(tests.fs_film('Week 3 vs Orchard Park'), 12.0, 21.5, 15.0) is not null,
  't_play_1_segmented');
select is((select play_number from filmstudy.plays
            where film_asset_id = tests.fs_film('Week 3 vs Orchard Park')), 1,
  't_play_number_allocated_server_side');

-- The play number is allocated by the database, so two coaches tagging the
-- same film cannot collide on it.
select ok(filmstudy.create_play(tests.fs_film('Week 3 vs Orchard Park'), 44.0, 53.0) is not null,
  't_play_2_segmented');
select is((select max(play_number) from filmstudy.plays
            where film_asset_id = tests.fs_film('Week 3 vs Orchard Park')), 2,
  't_second_play_gets_number_2');

-- A play window has to be a window, and a snap has to be inside it.
select throws_ok(
  $$ select filmstudy.create_play(tests.fs_film('Week 3 vs Orchard Park'), 90.0, 80.0) $$,
  '23514', null, 't_backwards_play_window_rejected');
select throws_ok(
  $$ select filmstudy.create_play(tests.fs_film('Week 3 vs Orchard Park'), 90.0, 99.0, 200.0) $$,
  '23514', null, 't_snap_outside_the_play_rejected');

-- --- Tagging ----------------------------------------------------------------
select lives_ok(
  $$ select filmstudy.tag_play(tests.fs_play(1),
       p_down := 1::smallint, p_distance := 10::smallint, p_yard_line := 25::smallint,
       p_possession := 'offense', p_personnel := '11', p_formation := 'Trips Right',
       p_family := 'run', p_concept := 'Inside Zone', p_direction := 'right',
       p_coverage := 'Cover 3', p_result := '+5 yards', p_yards := 5::smallint) $$,
  't_play_tagged');
select is((select formation::text from filmstudy.plays where id = tests.fs_play(1)), 'Trips Right',
  't_formation_stored');

-- Section 34: every confirmed field records that a human confirmed it.
select is((select count(*)::int from filmstudy.confirmations where play_id = tests.fs_play(1)), 8,
  't_one_confirmation_per_field_actually_set');
select is((select count(distinct confirmation_kind)::int from filmstudy.confirmations
            where play_id = tests.fs_play(1)), 1, 't_all_manual_confirmations');
select is((select confirmed_by from filmstudy.confirmations
            where play_id = tests.fs_play(1) limit 1), tests.uid('owner_a'),
  't_confirmation_names_the_coach');

-- Re-tagging with the same values must NOT invent new confirmations. Inflating
-- the record of human verification is the one thing this table cannot do.
select lives_ok(
  $$ select filmstudy.tag_play(tests.fs_play(1), p_formation := 'Trips Right') $$,
  't_retag_same_value_runs');
select is((select count(*)::int from filmstudy.confirmations where play_id = tests.fs_play(1)), 8,
  't_unchanged_field_adds_no_confirmation');
select lives_ok(
  $$ select filmstudy.tag_play(tests.fs_play(1), p_formation := 'Trips Left') $$,
  't_retag_new_value_runs');
select is((select count(*)::int from filmstudy.confirmations where play_id = tests.fs_play(1)), 9,
  't_changed_field_adds_a_confirmation');

-- --- Participation, grading, notes -----------------------------------------
select ok(filmstudy.set_participation(tests.fs_play(1), tests.fs_player(7::smallint), 'offense', 'QB',
    'Execute the call') is not null, 't_participation_recorded');

-- A grade is only meaningful for a player who was on the field.
select throws_ok(
  format($$ select filmstudy.set_grade(%L::uuid, %L::uuid, 'assignment', 'positive') $$,
         tests.fs_play(2), tests.fs_player(7::smallint)),
  '23503', null, 't_cannot_grade_a_player_who_did_not_play');

select ok(filmstudy.set_grade(tests.fs_play(1), tests.fs_player(7::smallint), 'assignment', 'positive')
          is not null, 't_grade_recorded');

-- The team grades on symbols, so a numeric grade is refused rather than
-- silently stored on the wrong scale.
select throws_ok(
  format($$ select filmstudy.set_grade(%L::uuid, %L::uuid, 'technique', null, 88::smallint) $$,
         tests.fs_play(1), tests.fs_player(7::smallint)),
  '23514', null, 't_numeric_grade_refused_on_a_symbol_scale_team');

select ok(filmstudy.add_note(tests.fs_player(7::smallint),
    'Good initial read. Maintain outside leverage longer.', tests.fs_play(1), 15.5, true)
    is not null, 't_coaching_note_written');

-- --- Clip and assignment ----------------------------------------------------
select ok(filmstudy.create_clip(tests.fs_film('Week 3 vs Orchard Park'),
    'Great leverage - #7', 13.0, 20.0, tests.fs_play(1), 'Great leverage')
    is not null, 't_clip_created');

select ok(filmstudy.create_assignment(tests.fs_player(7::smallint), 'review',
    'Watch your initial alignment and first two steps.') is not null,
  't_assignment_created');
select ok(filmstudy.add_assignment_item(
    (select id from filmstudy.film_assignments where player_id = tests.fs_player(7::smallint)),
    tests.fs_play(1)) is not null, 't_assignment_item_added');

-- The athlete's own account, and the link that makes them that athlete.
select ok(filmstudy.set_team_member(tests.fs_team(), tests.uid('viewer_a'), 'athlete') is not null,
  't_athlete_added_to_team');
select ok(filmstudy.link_player_user(tests.fs_team(), tests.fs_player(7::smallint),
    tests.uid('viewer_a'), 'self') is not null, 't_athlete_linked_to_their_player_row');

-- ===========================================================================
-- Part 2 — the athlete's side of the slice
-- ===========================================================================
select tests.login_as(tests.uid('viewer_a'));

select is(filmstudy.my_role(tests.fs_team())::text, 'athlete', 't_athlete_role_resolves');

-- The film was never opened to athletes, but a play from it was ASSIGNED to
-- them -- so they can see exactly that film and nothing else.
select is((select athlete_visible from filmstudy.film_assets
            where id = tests.fs_film('Week 3 vs Orchard Park')), false,
  't_film_is_not_open_to_athletes');
select is((select count(*)::int from filmstudy.film_assets), 1,
  't_athlete_sees_the_film_they_were_assigned');
select is((select count(*)::int from filmstudy.film_assignments), 1,
  't_athlete_sees_their_assignment');

-- The note the coach marked visible reaches them; nothing else does.
select is((select count(*)::int from filmstudy.player_notes), 1,
  't_athlete_sees_the_note_marked_visible');

-- Grades are closed by default. The athlete sees none.
select is((select count(*)::int from filmstudy.player_grades), 0,
  't_athlete_sees_no_grades_by_default');

-- Marking film reviewed is the athlete's own action, and it is evidence.
select ok(filmstudy.record_assignment_progress(
    (select id from filmstudy.film_assignments), 'completed', 'Watched it twice.')
    is not null, 't_athlete_marks_film_reviewed');
select is((select status::text from filmstudy.film_assignments), 'completed',
  't_assignment_status_advanced');

-- ===========================================================================
-- Part 3 — the boundaries, attacked
-- ===========================================================================

-- --- An athlete cannot reach opponent scouting -----------------------------
select tests.login_as(tests.uid('owner_a'));
select ok((filmstudy.register_film(tests.fs_team(), 'Orchard Park scout', 'opponent',
    'op.mp4', 'video/mp4', 1000000000)).id is not null, 't_opponent_film_registered');
select lives_ok(
  $$ select filmstudy.confirm_film_upload(tests.fs_film('Orchard Park scout'), 1000000000, 900.0) $$,
  't_opponent_film_ready');

-- Opening opponent film to athletes is refused by the write path...
select throws_ok(
  format($$ select filmstudy.set_film_visibility(%L::uuid, true) $$, tests.fs_film('Orchard Park scout')),
  '23514', null, 't_opponent_film_cannot_be_opened_to_athletes');
-- ...and by the schema itself, so no future code path can do it either.
select throws_ok(
  $$ update filmstudy.film_assets set athlete_visible = true
      where film_kind = 'opponent' $$,
  '42501', null, 't_no_direct_update_path_on_film_at_all');

select tests.login_as(tests.uid('viewer_a'));
select is((select count(*)::int from filmstudy.film_assets where film_kind = 'opponent'), 0,
  't_athlete_cannot_see_opponent_film');
select is((select count(*)::int from filmstudy.opponents), 0,
  't_athlete_cannot_see_the_opponent_list');

-- --- Grades open only when the PROGRAM opens them --------------------------
select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  $$ select filmstudy.update_team_settings(tests.fs_team(), null, true) $$,
  't_program_opens_grades_to_athletes');

select tests.login_as(tests.uid('viewer_a'));
select is((select count(*)::int from filmstudy.player_grades), 1,
  't_athlete_now_sees_their_own_grade');

-- Still only their own. Another athlete's grade is not theirs to read.
select tests.login_as(tests.uid('owner_a'));
select ok(filmstudy.set_participation(tests.fs_play(1), tests.fs_player(24::smallint), 'defense', 'OLB')
          is not null, 't_second_player_participates');
select ok(filmstudy.set_grade(tests.fs_play(1), tests.fs_player(24::smallint), 'assignment', 'negative')
          is not null, 't_second_player_graded');
select tests.login_as(tests.uid('viewer_a'));
select is((select count(*)::int from filmstudy.player_grades), 1,
  't_athlete_still_sees_only_their_own_grade');

-- --- A guardian gets in only when the program lets them in -----------------
select tests.login_as(tests.uid('owner_a'));
select ok(filmstudy.set_team_member(tests.fs_team(), tests.uid('staff_a'), 'parent') is not null,
  't_guardian_added_to_team');
select ok(filmstudy.link_player_user(tests.fs_team(), tests.fs_player(7::smallint),
    tests.uid('staff_a'), 'guardian') is not null, 't_guardian_linked_to_their_child');

select tests.login_as(tests.uid('staff_a'));
select is((select count(*)::int from filmstudy.teams), 0,
  't_guardian_sees_nothing_until_the_program_opens_guardian_access');

select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  $$ select filmstudy.update_team_settings(tests.fs_team(), null, null, true, false) $$,
  't_program_opens_guardian_access_without_grades');

select tests.login_as(tests.uid('staff_a'));
select is((select count(*)::int from filmstudy.teams), 1, 't_guardian_now_sees_the_team');
-- Guardian access and grade access are separate decisions, and this program
-- made only the first.
select is((select count(*)::int from filmstudy.player_grades), 0,
  't_guardian_sees_no_grades_even_with_access');
select is((select count(*)::int from filmstudy.film_assets where film_kind = 'opponent'), 0,
  't_guardian_cannot_see_opponent_film');

-- --- A coach cannot manufacture the film-review metric ---------------------
select tests.login_as(tests.uid('owner_a'));
select ok(filmstudy.create_assignment(tests.fs_player(24::smallint), 'correct', 'Leverage.')
          is not null, 't_second_assignment_created');
select throws_ok(
  format($$ select filmstudy.record_assignment_progress(%L::uuid, 'completed') $$,
    (select id from filmstudy.film_assignments where player_id = tests.fs_player(24::smallint))),
  '42501', null, 't_coach_cannot_mark_an_athlete_s_film_reviewed');

-- --- Nothing writes a prediction from a tenant session ---------------------
select is(has_function_privilege('authenticated',
  'filmstudy.record_prediction(uuid, extensions.citext, text, numeric, text, text)', 'execute'),
  false, 't_no_tenant_can_record_an_ai_prediction');

-- The trusted path can, and a coach then resolves it. Accepting writes the
-- value onto the play AND names the prediction in the confirmation.
select tests.logout();
select ok(filmstudy.record_prediction(tests.fs_play(2), 'coverage', 'Cover 3', 0.82,
    'test-model', 'v1') is not null, 't_service_path_records_a_prediction');

select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  format($$ select filmstudy.resolve_prediction(%L::uuid, 'coach_confirmed') $$,
    (select id from filmstudy.predictions where play_id = tests.fs_play(2))),
  't_coach_accepts_the_suggestion');
select is((select coverage::text from filmstudy.plays where id = tests.fs_play(2)), 'Cover 3',
  't_accepted_suggestion_becomes_confirmed_data');
select is((select confirmation_kind::text from filmstudy.confirmations
            where play_id = tests.fs_play(2) and field = 'coverage'), 'accepted_prediction',
  't_confirmation_records_that_it_came_from_a_prediction');
select isnt((select prediction_id from filmstudy.confirmations
              where play_id = tests.fs_play(2) and field = 'coverage'), null,
  't_confirmation_names_the_prediction_it_came_from');

-- A rejected suggestion changes nothing about the play.
select tests.logout();
select ok(filmstudy.record_prediction(tests.fs_play(2), 'formation', 'Empty', 0.44,
    'test-model', 'v1') is not null, 't_second_prediction_recorded');
select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  format($$ select filmstudy.resolve_prediction(%L::uuid, 'rejected') $$,
    (select id from filmstudy.predictions where play_id = tests.fs_play(2)
      and prediction_type = 'formation')),
  't_coach_rejects_the_suggestion');
select is((select formation from filmstudy.plays where id = tests.fs_play(2)), null,
  't_rejected_suggestion_writes_nothing_to_the_play');
select is((select count(*)::int from filmstudy.confirmations
            where play_id = tests.fs_play(2) and field = 'formation'), 0,
  't_rejected_suggestion_writes_no_confirmation');

-- --- No direct write path exists anywhere in the schema --------------------
select is((select count(*)::int
           from information_schema.role_table_grants
          where table_schema = 'filmstudy'
            and grantee in ('authenticated','anon')
            and privilege_type in ('INSERT','UPDATE','DELETE')),
  0, 't_no_insert_update_or_delete_grant_on_any_filmstudy_table');

select is((select count(*)::int
           from information_schema.role_table_grants
          where table_schema = 'filmstudy' and grantee = 'anon'),
  0, 't_anon_holds_nothing_at_all');

-- Every table has RLS enabled AND forced; a table missing either is a hole.
select is((select count(*)::int from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'filmstudy' and c.relkind = 'r'
             and (not c.relrowsecurity or not c.relforcerowsecurity)),
  0, 't_every_table_has_rls_enabled_and_forced');

-- search_path pinning: the SEC-3 defect class, guarded the same way
-- migration 0047 guards the social schema.
select is((select count(*)::int from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'filmstudy'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'))
                                    as cfg where cfg like 'search_path=%')),
  0, 't_every_filmstudy_function_pins_its_search_path');

-- --- Tenant isolation -------------------------------------------------------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from filmstudy.teams), 0, 't_other_tenant_sees_no_teams');
select is((select count(*)::int from filmstudy.plays), 0, 't_other_tenant_sees_no_plays');
select is((select count(*)::int from filmstudy.player_grades), 0, 't_other_tenant_sees_no_grades');
select throws_ok(
  format($$ select filmstudy.create_play(%L::uuid, 1.0, 2.0) $$, tests.fs_film('Week 3 vs Orchard Park')),
  '42501', null, 't_other_tenant_cannot_segment_our_film');

-- --- Permission without a team is still nothing ----------------------------
-- manager_a holds filmstudy.film.read in tenant A but is on no team's staff.
select tests.login_as(tests.uid('manager_a'));
select ok(identity.has_permission(tests.uid('tenant_a'), 'filmstudy.film.read'),
  't_manager_holds_the_tenant_permission');
select is((select count(*)::int from filmstudy.film_assets), 0,
  't_but_holds_no_film_without_a_team_role');

-- ===========================================================================
-- Part 4 — the demo program cannot pretend to be real film
-- ===========================================================================
select tests.login_as(tests.uid('owner_b'));
select ok(filmstudy.seed_demo_program(tests.uid('tenant_b')) is not null, 't_demo_program_seeds');
select is((select count(*)::int from filmstudy.plays
            where team_id = (select id from filmstudy.teams where tenant_id = tests.uid('tenant_b'))),
  25, 't_demo_has_25_plays');

-- The demo film has no bytes and does not claim to be playable.
select is((select status::text from filmstudy.film_assets
            where team_id = (select id from filmstudy.teams where tenant_id = tests.uid('tenant_b'))),
  'demo_no_video', 't_demo_film_is_not_ready_it_has_no_video');
select is((select object_path from filmstudy.film_assets
            where team_id = (select id from filmstudy.teams where tenant_id = tests.uid('tenant_b'))),
  null, 't_demo_film_has_no_object_behind_it');
select ok((select is_demo from filmstudy.teams where tenant_id = tests.uid('tenant_b')),
  't_demo_team_is_marked_demo');

-- Demo AI suggestions are real prediction rows, unresolved, attributed to a
-- model that does not exist. They are never confirmed data.
select is((select count(*)::int from filmstudy.predictions
            where team_id = (select id from filmstudy.teams where tenant_id = tests.uid('tenant_b'))
              and state = 'ai_suggested'), 50,
  't_demo_ai_suggestions_are_unresolved_predictions');
select is((select distinct model from filmstudy.predictions
            where team_id = (select id from filmstudy.teams where tenant_id = tests.uid('tenant_b'))),
  'demo-seed', 't_demo_predictions_name_a_model_that_does_not_exist');

select throws_ok(
  $$ select filmstudy.seed_demo_program(tests.uid('tenant_b')) $$,
  '23505', null, 't_demo_program_refuses_to_seed_twice');

select is(filmstudy.remove_demo_program(tests.uid('tenant_b')), 1,
  't_demo_program_can_be_removed');

select tests.logout();
select * from finish();
rollback;
