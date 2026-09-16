\ir _fixtures.sql.inc

-- ===========================================================================
-- HighlightAI Football — migration 0048.
--
-- The claims this suite exists to make structural rather than aspirational:
--
--   1. A tenant cannot fabricate an AI result. Not a detection, not a jersey
--      reading, not a play, not an event, not an involvement score.
--   2. A reel cannot say READY when there is nothing to watch.
--   3. Demo output cannot pass as real.
--   4. Footage of a child does not leave private without a named human.
--   5. A human correction outranks the models, and is append-only evidence.
--
-- Plus the ordinary things: tenant isolation, permission gating, and the
-- constraints that stop a confidence of 3.7 or a jersey number of 147.
-- ===========================================================================
begin;
select plan(66);
select tests.seed();

-- Local helpers so the assertions read as prose.
create or replace function tests.hl_team() returns uuid language sql stable as $$
  select id from highlight.teams where name = 'West Seneca' limit 1 $$;
create or replace function tests.hl_player() returns uuid language sql stable as $$
  select id from highlight.players where name = 'Dominic Herman' limit 1 $$;
create or replace function tests.hl_game() returns uuid language sql stable as $$
  select id from highlight.games where name = 'West Seneca vs Orchard Park' limit 1 $$;
create or replace function tests.hl_video() returns uuid language sql stable as $$
  select id from highlight.videos where original_filename = 'week3.mp4' limit 1 $$;

-- ===========================================================================
-- Fixture: a team, an athlete, a game and an uploaded file
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));

select ok(highlight.create_team(tests.uid('tenant_a'), 'West Seneca', 'blue', 'white', 'navy', 'white')
          is not null, 't_create_team');
select ok(highlight.create_player(tests.uid('tenant_a'), tests.hl_team(), 'Dominic Herman',
          23::smallint, array['S','WR']::highlight.position_code[]) is not null, 't_create_player');
select ok(highlight.create_game(tests.uid('tenant_a'), tests.hl_team(),
          'West Seneca vs Orchard Park', 'Orchard Park', date '2026-09-11',
          'high_school', 'press_box', '2026') is not null, 't_create_game');
select ok(highlight.register_video(tests.uid('tenant_a'), tests.hl_game(),
          tests.uid('tenant_a')::text || '/film/week3.mp4', 'week3.mp4',
          'video/mp4', 4294967296::bigint) is not null, 't_register_video');

-- --- Football's own rules, enforced by the schema ---------------------------
select throws_ok(
  $$ select highlight.create_player(tests.uid('tenant_a'), tests.hl_team(), 'Impossible',
       147::smallint) $$,
  '23514', null, 't_jersey_number_over_99_rejected');

-- "00" and "0" are different jerseys and may both be on the field.
select ok(highlight.create_player(tests.uid('tenant_a'), tests.hl_team(), 'Zero',
          0::smallint, '{}'::highlight.position_code[], false) is not null, 't_number_zero_allowed');
select ok(highlight.create_player(tests.uid('tenant_a'), tests.hl_team(), 'Double Zero',
          0::smallint, '{}'::highlight.position_code[], true) is not null, 't_double_zero_is_a_different_jersey');
select throws_ok(
  $$ select highlight.create_player(tests.uid('tenant_a'), tests.hl_team(), 'Fake Double Zero',
       23::smallint, '{}'::highlight.position_code[], true) $$,
  '23514', null, 't_double_zero_must_be_number_zero');

-- --- Uploaded film is private, and not training data ------------------------
select is((select visibility from highlight.videos where id = tests.hl_video()),
  'private'::highlight.visibility, 't_uploaded_film_is_private_by_default');
select is((select training_opt_in from highlight.videos where id = tests.hl_video()),
  false, 't_film_is_not_training_data_by_default');
select is((select status from highlight.videos where id = tests.hl_video()),
  'uploaded'::highlight.job_status, 't_uploaded_film_starts_unanalysed');
select is((select is_demo from highlight.videos where id = tests.hl_video()),
  false, 't_real_upload_is_not_marked_demo');

select tests.logout();

-- ===========================================================================
-- 1. A TENANT CANNOT FABRICATE AN AI RESULT
--
-- Not via a function (there is none), and not via PostgREST (no grant, no
-- policy). Both halves are asserted: either one alone would leave a hole.
-- ===========================================================================
select is(has_table_privilege('authenticated', 'highlight.player_detections', 'insert'),
  false, 't_tenant_cannot_insert_a_detection');
select is(has_table_privilege('authenticated', 'highlight.player_tracks', 'insert'),
  false, 't_tenant_cannot_insert_a_track');
select is(has_table_privilege('authenticated', 'highlight.jersey_detections', 'insert'),
  false, 't_tenant_cannot_insert_a_jersey_reading');
select is(has_table_privilege('authenticated', 'highlight.plays', 'insert'),
  false, 't_tenant_cannot_insert_a_play');
select is(has_table_privilege('authenticated', 'highlight.events', 'insert'),
  false, 't_tenant_cannot_insert_a_football_event');
select is(has_table_privilege('authenticated', 'highlight.player_play_involvement', 'insert'),
  false, 't_tenant_cannot_insert_an_involvement_score');
select is(has_table_privilege('authenticated', 'highlight.highlight_candidates', 'insert'),
  false, 't_tenant_cannot_insert_a_highlight_candidate');
select is(has_table_privilege('authenticated', 'highlight.ball_tracks', 'insert'),
  false, 't_tenant_cannot_insert_a_ball_track');
select is(has_table_privilege('authenticated', 'highlight.team_classifications', 'insert'),
  false, 't_tenant_cannot_insert_a_team_classification');
select is(has_table_privilege('authenticated', 'highlight.videos', 'update'),
  false, 't_tenant_cannot_update_a_video_row_directly');

-- No write POLICY exists on any table in the schema either.
select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'highlight' and cmd <> 'SELECT'),
  0, 't_no_write_policy_anywhere_in_the_schema');

-- Every function pins its search_path. An unpinned SECURITY DEFINER function
-- is a privilege-escalation surface; 0047 exists because one slipped through.
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'highlight'
      and not coalesce(array_to_string(p.proconfig, ',') like '%search_path%', false)),
  0, 't_every_highlight_function_pins_its_search_path');

-- ===========================================================================
-- Worker path: write the analysis as the trusted worker does
-- ===========================================================================
insert into highlight.ai_jobs (tenant_id, video_id, player_id, status, adapter_kind, adapters)
values (tests.uid('tenant_a'), tests.hl_video(), tests.hl_player(), 'ready', 'real',
        jsonb_build_object('player_detector', 'yolo-v11-football@0.3.1'));

insert into highlight.player_tracks
  (tenant_id, video_id, track_label, team_label, team_confidence,
   voted_jersey_number, number_confidence, tracking_confidence, start_frame, end_frame, detection_count)
values
  (tests.uid('tenant_a'), tests.hl_video(), 'track-47', 'team_a', 0.96,
   23::smallint, 0.91, 0.93, 14300, 14520, 74),
  (tests.uid('tenant_a'), tests.hl_video(), 'track-51', 'team_a', 0.94,
   null, null, 0.88, 14620, 14790, 57);

insert into highlight.plays
  (tenant_id, video_id, play_index, start_frame, start_seconds, snap_frame, snap_seconds,
   snap_confidence, end_frame, end_seconds, segmentation_confidence)
values (tests.uid('tenant_a'), tests.hl_video(), 0, 14250, 475.0, 14300, 476.667,
        0.87, 14520, 484.0, 0.92);

-- --- Constraints that stop nonsense being written at all --------------------
select throws_ok(
  $$ insert into highlight.plays (tenant_id, video_id, play_index, start_frame, start_seconds,
       end_frame, end_seconds, segmentation_confidence)
     values (tests.uid('tenant_a'), tests.hl_video(), 99, 100, 3.3, 50, 1.6, 0.9) $$,
  '23514', null, 't_a_play_cannot_end_before_it_starts');

select throws_ok(
  $$ insert into highlight.plays (tenant_id, video_id, play_index, start_frame, start_seconds,
       end_frame, end_seconds, segmentation_confidence)
     values (tests.uid('tenant_a'), tests.hl_video(), 98, 100, 3.3, 200, 6.6, 3.7) $$,
  '23514', null, 't_confidence_above_one_is_rejected');

select throws_ok(
  $$ insert into highlight.plays (tenant_id, video_id, play_index, start_frame, start_seconds,
       snap_frame, snap_seconds, snap_confidence, end_frame, end_seconds, segmentation_confidence)
     values (tests.uid('tenant_a'), tests.hl_video(), 97, 100, 3.3, 9000, 300.0, 0.8, 200, 6.6, 0.9) $$,
  '23514', null, 't_a_snap_cannot_fall_outside_its_own_play');

select throws_ok(
  $$ insert into highlight.plays (tenant_id, video_id, play_index, start_frame, start_seconds,
       end_frame, end_seconds, segmentation_confidence, down)
     values (tests.uid('tenant_a'), tests.hl_video(), 96, 100, 3.3, 200, 6.6, 0.9, 7) $$,
  '23514', null, 't_there_is_no_seventh_down');

-- A detection box outside the frame is a coordinate-space bug, and it is
-- better caught here than after it has produced a crop of nothing.
select throws_ok(
  $$ insert into highlight.player_detections (tenant_id, track_id, frame, seconds,
       box_x, box_y, box_w, box_h, confidence)
     select tests.uid('tenant_a'), t.id, 14301, 476.7, 0.9, 0.5, 0.4, 0.2, 0.9
       from highlight.player_tracks t where t.track_label = 'track-47' $$,
  '23514', null, 't_a_detection_box_cannot_leave_the_frame');

-- --- Unreadable is NULL, and it is a first-class value ----------------------
insert into highlight.jersey_detections (tenant_id, track_id, frame, seconds, jersey_number, confidence)
select tests.uid('tenant_a'), t.id, 14300, 476.667, 23::smallint, 0.81
  from highlight.player_tracks t where t.track_label = 'track-47';
insert into highlight.jersey_detections (tenant_id, track_id, frame, seconds, jersey_number, confidence)
select tests.uid('tenant_a'), t.id, 14305, 476.833, null, null
  from highlight.player_tracks t where t.track_label = 'track-47';
insert into highlight.jersey_detections (tenant_id, track_id, frame, seconds, jersey_number, confidence)
select tests.uid('tenant_a'), t.id, 14310, 477.0, 23::smallint, 0.92
  from highlight.player_tracks t where t.track_label = 'track-47';

select is((select count(*)::integer from highlight.jersey_detections where jersey_number is null),
  1, 't_an_unreadable_frame_is_recorded_as_an_abstention');

select throws_ok(
  $$ insert into highlight.jersey_detections (tenant_id, track_id, frame, seconds,
       jersey_number, confidence)
     select tests.uid('tenant_a'), t.id, 14315, 477.2, null, 0.9
       from highlight.player_tracks t where t.track_label = 'track-47' $$,
  '23514', null, 't_an_unreadable_frame_cannot_carry_a_confidence');

-- --- An event nobody could be credited with stays uncredited ----------------
insert into highlight.events (tenant_id, play_id, kind, frame, seconds, track_id, confidence)
select tests.uid('tenant_a'), p.id, 'tackle', 14460, 482.0, null, 0.74
  from highlight.plays p where p.play_index = 0;
select is((select track_id from highlight.events where kind = 'tackle'), null,
  't_an_unattributable_event_is_stored_without_a_player');

-- --- Involvement cannot describe somebody who was not there -----------------
select throws_ok(
  $$ insert into highlight.player_play_involvement (tenant_id, play_id, player_id,
       player_present, visibility_percentage, involvement, raw_score, identity_confidence, reasons)
     select tests.uid('tenant_a'), p.id, tests.hl_player(), false, 0, 4, 4.2, 0.9, array['made it up']
       from highlight.plays p where p.play_index = 0 $$,
  '23514', null, 't_an_absent_player_cannot_score_above_zero');

insert into highlight.player_play_involvement
  (tenant_id, play_id, player_id, player_present, track_id, visibility_percentage,
   involvement, raw_score, identity_confidence, reasons, events)
select tests.uid('tenant_a'), p.id, tests.hl_player(), true, t.id, 0.84,
       4, 4.20, 0.94, array['Tackle detected (74% confidence).'], array['tackle']::highlight.event_kind[]
  from highlight.plays p, highlight.player_tracks t
 where p.play_index = 0 and t.track_label = 'track-47';

insert into highlight.highlight_candidates
  (tenant_id, play_id, player_id, start_seconds, end_seconds, involvement, score, events, reasons)
select tests.uid('tenant_a'), p.id, tests.hl_player(), 471.667, 492.0, 4, 4.3,
       array['tackle']::highlight.event_kind[], array['Tackle detected (74% confidence).']
  from highlight.plays p where p.play_index = 0;

-- The brief's worked example: snap at 476.667, play ends at 484.0, so the clip
-- runs 471.667 -> 492.0. The end of the play is inside the window.
select cmp_ok(
  (select end_seconds from highlight.highlight_candidates limit 1), '>=',
  (select end_seconds from highlight.plays where play_index = 0),
  't_the_clip_window_contains_the_end_of_the_play');

-- ===========================================================================
-- 2. A REEL CANNOT SAY READY WHEN THERE IS NOTHING TO WATCH
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));
select ok(highlight.create_reel(tests.uid('tenant_a'), tests.hl_player(),
          'Dominic Herman — Week 3', '2026') is not null, 't_create_reel');
select tests.logout();

select throws_ok(
  $$ update highlight.highlight_reels
        set status = 'ready', output_object_path = tests.uid('tenant_a')::text || '/reels/r.mp4',
            output_duration_seconds = 42
      where title like 'Dominic Herman%' $$,
  '23514', null, 't_an_empty_reel_cannot_be_ready');

select tests.login_as(tests.uid('owner_a'));
select ok(highlight.add_clip(
            (select id from highlight.highlight_reels where title like 'Dominic Herman%'),
            (select id from highlight.highlight_candidates limit 1), 1, 'Tackle')
          is not null, 't_add_clip');
select tests.logout();

-- The clip window came from the candidate, not from the caller.
select is((select end_seconds from highlight.highlight_clips limit 1), 492.000::numeric,
  't_a_clip_takes_its_window_from_the_engine_not_the_caller');

select throws_ok(
  $$ update highlight.highlight_reels set status = 'ready'
      where title like 'Dominic Herman%' $$,
  '23514', null, 't_a_reel_with_clips_but_no_rendered_file_still_cannot_be_ready');

select lives_ok(
  $$ update highlight.highlight_reels
        set status = 'ready', output_object_path = tests.uid('tenant_a')::text || '/reels/r.mp4',
            output_duration_seconds = 42
      where title like 'Dominic Herman%' $$,
  't_a_reel_with_clips_and_a_file_can_be_ready');

select throws_ok(
  $$ update highlight.highlight_reels set status = 'failed', error = null
      where title like 'Dominic Herman%' $$,
  '23514', null, 't_a_failed_reel_must_say_why');

-- ===========================================================================
-- 3. DEMO OUTPUT CANNOT PASS AS REAL
-- ===========================================================================
insert into highlight.videos (tenant_id, game_id, object_path, original_filename,
                              mime_type, size_bytes, is_demo)
values (tests.uid('tenant_a'), tests.hl_game(),
        tests.uid('tenant_a')::text || '/film/demo.mp4', 'demo.mp4', 'video/mp4', 1048576, true);

insert into highlight.highlight_clips (tenant_id, reel_id, video_id, position, title,
                                       start_seconds, end_seconds)
select tests.uid('tenant_a'),
       (select id from highlight.highlight_reels where title like 'Dominic Herman%'),
       v.id, 2, 'Demo clip', 10, 20
  from highlight.videos v where v.original_filename = 'demo.mp4';

-- The reel was real a moment ago. One demo clip and it is honest again,
-- without anybody remembering to set the flag.
select is((select is_demo from highlight.highlight_reels where title like 'Dominic Herman%'),
  true, 't_a_demo_clip_forces_its_reel_to_declare_itself_demo');

select throws_ok(
  $$ insert into highlight.ai_jobs (tenant_id, video_id, status, adapter_kind, error)
     values (tests.uid('tenant_a'), tests.hl_video(), 'failed', 'real', null) $$,
  '23514', null, 't_a_failed_job_must_say_why');

-- ===========================================================================
-- 4. FOOTAGE OF A CHILD DOES NOT LEAVE PRIVATE WITHOUT A NAMED HUMAN
-- ===========================================================================
select throws_ok(
  $$ update highlight.videos set visibility = 'public' where id = tests.hl_video() $$,
  '23514', null, 't_film_cannot_be_made_public_without_consent');

select throws_ok(
  $$ update highlight.videos set visibility = 'link' where id = tests.hl_video() $$,
  '23514', null, 't_film_cannot_even_be_link_shared_without_consent');

select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select highlight.grant_sharing_consent(tests.hl_video(), 'link', true, null) $$,
  '23514', null, 't_a_minors_consent_must_name_a_guardian');
select ok(highlight.grant_sharing_consent(tests.hl_video(), 'link', true, 'Keith Herman',
          tests.hl_player()) is not null, 't_guardian_can_consent_to_a_link_share');
select tests.logout();

select lives_ok(
  $$ update highlight.videos set visibility = 'link' where id = tests.hl_video() $$,
  't_with_consent_the_film_can_be_link_shared');

-- Consent is per-scope. Agreeing to a private link is not agreeing to publish.
select throws_ok(
  $$ update highlight.videos set visibility = 'public' where id = tests.hl_video() $$,
  '23514', null, 't_consent_to_a_link_is_not_consent_to_publish');

-- A reel is only as shareable as the film underneath it.
select throws_ok(
  $$ update highlight.highlight_reels set visibility = 'link'
      where title like 'Dominic Herman%' $$,
  '23514', null, 't_a_reel_cannot_be_shared_while_any_source_film_lacks_consent');

-- ===========================================================================
-- 5. A HUMAN CORRECTION OUTRANKS THE MODELS, AND IS PERMANENT
-- ===========================================================================
select tests.login_as(tests.uid('staff_a'));
select ok(highlight.set_player_lock(tests.hl_video(), tests.hl_player(),
          (select id from highlight.player_tracks where track_label = 'track-51'),
          14620, 14790, true) is not null, 't_staff_can_confirm_this_is_my_player');
select tests.logout();

select is((select is_positive from highlight.player_locks limit 1), true, 't_the_lock_was_recorded');
select is((select kind::text from highlight.user_corrections order by id desc limit 1),
  'confirm_player', 't_the_confirmation_was_logged_as_a_correction');

select throws_ok(
  $$ update highlight.user_corrections set corrected_value = '{"faked": true}'::jsonb $$,
  '42501', null, 't_a_correction_cannot_be_edited_after_the_fact');
select throws_ok(
  $$ delete from highlight.user_corrections $$,
  '42501', null, 't_a_correction_cannot_be_deleted');

-- ===========================================================================
-- Permissions and tenant isolation
-- ===========================================================================
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select highlight.register_video(tests.uid('tenant_a'), tests.hl_game(),
       tests.uid('tenant_a')::text || '/film/sneak.mp4', 'sneak.mp4', 'video/mp4', 1024) $$,
  '42501', null, 't_a_viewer_cannot_upload_film');
select throws_ok(
  $$ select highlight.create_game(tests.uid('tenant_a'), tests.hl_team(), 'Fake', 'Nobody',
       current_date, 'youth', 'unknown', '2026') $$,
  '42501', null, 't_a_viewer_cannot_create_a_game');
select cmp_ok((select count(*)::integer from highlight.videos), '>', 0,
  't_a_viewer_can_read_the_film');
select tests.logout();

-- A coach runs the film but does not decide that a child's footage may leave
-- private. That is a guardian's call, not a staff one.
select tests.login_as(tests.uid('manager_a'));
select ok(highlight.create_game(tests.uid('tenant_a'), tests.hl_team(), 'Week 4', 'Hamburg',
          current_date, 'high_school', 'sideline', '2026') is not null,
  't_a_coach_can_create_a_game');
select throws_ok(
  $$ select highlight.grant_sharing_consent(tests.hl_video(), 'public', true, 'Coach') $$,
  '42501', null, 't_a_coach_cannot_consent_to_sharing_a_childs_footage');
select tests.logout();

select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::integer from highlight.videos), 0,
  't_another_tenant_sees_no_film_at_all');
select is((select count(*)::integer from highlight.players), 0,
  't_another_tenant_sees_no_athletes');
select is((select count(*)::integer from highlight.player_detections), 0,
  't_another_tenant_sees_no_detections');
select throws_ok(
  $$ select highlight.register_video(tests.uid('tenant_a'), tests.hl_game(),
       tests.uid('tenant_a')::text || '/film/cross.mp4', 'cross.mp4', 'video/mp4', 1024) $$,
  '42501', null, 't_another_tenant_cannot_upload_into_this_tenant');
select tests.logout();

-- Anonymous is stopped a level earlier than RLS: `anon` has no USAGE on the
-- schema at all, so the film is not merely filtered, it is unreachable.
select tests.login_as_anon();
select throws_ok(
  $$ select count(*) from highlight.videos $$,
  '42501', null, 't_anonymous_cannot_reach_the_film_at_all');
select tests.logout();

-- A path outside the tenant's own prefix cannot be recorded at all, so one
-- tenant's row can never point at another tenant's bytes.
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select highlight.register_video(tests.uid('tenant_a'), tests.hl_game(),
       tests.uid('tenant_b')::text || '/film/steal.mp4', 'steal.mp4', 'video/mp4', 1024) $$,
  '23514', null, 't_a_video_path_cannot_point_outside_its_own_tenant');
select tests.logout();

select * from finish();
rollback;
