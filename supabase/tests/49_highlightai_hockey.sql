\ir _fixtures.sql.inc

-- ===========================================================================
-- HighlightAI Hockey — migration 0049.
--
-- What this suite is really testing is whether the product's two honesty
-- claims are STRUCTURAL or merely aspirational:
--
--   1. "We never say we are certain a track is your player unless we actually
--      read their number." Enforced in identity.ts, and here as a CHECK, so it
--      survives a bug in the application.
--   2. "Nothing reaches a reel that you did not approve." Enforced in
--      review.ts, again in reel.ts, and again here.
--
-- Plus the property the data most needs: this is video of somebody's child,
-- and one account must be completely invisible to another.
-- ===========================================================================
begin;
select plan(62);
select tests.seed();

-- Two unrelated parents. Not two members of one tenant: a family's game video
-- is owned by a person, not shared within an organisation.
create or replace function tests.parent_a() returns uuid language sql immutable as $$
  select tests.uid('owner_a') $$;
create or replace function tests.parent_b() returns uuid language sql immutable as $$
  select tests.uid('owner_b') $$;

create or replace function tests.project_a() returns uuid language sql stable as $$
  select id from hockey.projects where name = 'Squirt A vs Northstars' limit 1 $$;
create or replace function tests.segment_a() returns uuid language sql stable as $$
  select id from hockey.player_segments where project_id = tests.project_a() limit 1 $$;
create or replace function tests.track_a() returns uuid language sql stable as $$
  select id from hockey.player_tracks where project_id = tests.project_a() limit 1 $$;

-- --- The schema exists and is shaped as documented -------------------------

select has_schema('hockey', 't_schema_exists');
select has_table('hockey', 'projects', 't_projects_table');
select has_table('hockey', 'athletes', 't_athletes_table');
select has_table('hockey', 'media_assets', 't_media_assets_table');
select has_table('hockey', 'processing_jobs', 't_processing_jobs_table');
select has_table('hockey', 'job_events', 't_job_events_table');
select has_table('hockey', 'player_tracks', 't_player_tracks_table');
select has_table('hockey', 'player_segments', 't_player_segments_table');
select has_table('hockey', 'candidate_events', 't_candidate_events_table');
select has_table('hockey', 'clips', 't_clips_table');
select has_table('hockey', 'reels', 't_reels_table');
select has_table('hockey', 'reel_entries', 't_reel_entries_table');

-- The job statuses the engine's state machine uses. If these drift apart, a
-- job reaches a state the database cannot store.
select results_eq(
  $$ select unnest(enum_range(null::hockey.job_status))::text order by 1 $$,
  $$ values ('clip_generation'),('completed'),('event_detection'),('failed'),
            ('player_detection'),('player_tracking'),('preprocessing'),
            ('rendering'),('review_ready'),('uploaded') $$,
  't_job_statuses_match_the_engine');

-- No event kind names a RESULT. The system cannot see a puck, so it cannot see
-- a goal, and an enum value called 'goal' would be an invitation to claim one.
select is_empty(
  $$ select e::text from unnest(enum_range(null::hockey.event_kind)) e
      where e::text in ('goal','save','assist','shot','hit','penalty') $$,
  't_no_event_kind_claims_a_result');

-- --- RLS is on, forced, and complete ---------------------------------------

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'hockey' and c.relkind = 'r'
      and (not c.relrowsecurity or not c.relforcerowsecurity)),
  0,
  't_rls_enabled_and_forced_on_every_table');

-- Four commands, twelve tables. "Enabled" without a policy per command is how
-- a table ends up readable by nobody or writable by everybody.
select is(
  (select count(*)::int from pg_policies where schemaname = 'hockey'),
  48, 't_four_policies_per_table');

select is_empty(
  $$ select table_name::text from information_schema.role_table_grants
      where table_schema = 'hockey' and grantee in ('anon','public') $$,
  't_anonymous_users_are_granted_nothing');

-- --- A parent builds a project ---------------------------------------------

select tests.login_as(tests.parent_a());

insert into hockey.projects (owner_id, name, game_date, team, opponent)
values (tests.parent_a(), 'Squirt A vs Northstars', date '2026-02-14',
        'Riverside Squirt A', 'Northstars');
select ok(tests.project_a() is not null, 't_parent_can_create_a_project');

insert into hockey.athletes (owner_id, project_id, name, jersey_number,
                             jersey_color_id, position)
values (tests.parent_a(), tests.project_a(), 'Sam Herman', '17', 'navy', 'forward');
select is((select jersey_number from hockey.athletes where project_id = tests.project_a()),
  '17', 't_athlete_recorded');

-- "07" and "7" are the same player in the rink but different jerseys to a
-- supplier, so the column keeps what the user typed rather than coercing it.
select is((select pg_typeof(jersey_number)::text from hockey.athletes
            where project_id = tests.project_a()),
  'text', 't_jersey_number_is_text_not_an_integer');

select throws_ok(
  $$ insert into hockey.athletes (owner_id, project_id, name, jersey_number,
        jersey_color_id, position)
     values (tests.uid('owner_a'), tests.project_a(), 'Someone Else', '9',
             'red', 'defense') $$,
  '23505', null, 't_one_athlete_per_project');

select throws_ok(
  $$ insert into hockey.projects (owner_id, name) values (tests.parent_a(), '   ') $$,
  '23514', null, 't_a_project_must_have_a_name');

-- --- Media -----------------------------------------------------------------

insert into hockey.media_assets (owner_id, project_id, role, storage_key,
                                 filename, content_type)
values (tests.parent_a(), tests.project_a(), 'original', 'originals/game.mp4',
        'IMG_4417.MOV', 'video/quicktime');

-- Null means "not measured yet", and the UI says exactly that. A UI showing
-- 0:00 for an unprobed file is stating a duration it does not know.
select is((select duration_seconds from hockey.media_assets
            where storage_key = 'originals/game.mp4'),
  null, 't_unprobed_media_reports_unknown_not_zero');

update hockey.media_assets
   set duration_seconds = 3600, width = 1920, height = 1080, frame_rate = 29.97,
       size_bytes = 4200000000
 where storage_key = 'originals/game.mp4';
select is((select width from hockey.media_assets where storage_key = 'originals/game.mp4'),
  1920, 't_probe_results_stored');

select throws_ok(
  $$ update hockey.media_assets set duration_seconds = -5
      where storage_key = 'originals/game.mp4' $$,
  '23514', null, 't_negative_duration_refused');

-- --- Jobs survive the user leaving the page --------------------------------

insert into hockey.processing_jobs (owner_id, project_id) values
  (tests.parent_a(), tests.project_a());
select is((select status::text from hockey.processing_jobs where project_id = tests.project_a()),
  'uploaded', 't_a_new_job_starts_uploaded');

select is((select attempt from hockey.processing_jobs where project_id = tests.project_a()),
  0, 't_a_new_job_has_not_been_retried');

-- A status of 'failed' with no code is a dead end for whoever has to explain
-- it to the user.
select throws_ok(
  $$ update hockey.processing_jobs set status = 'failed'
      where project_id = tests.project_a() $$,
  '23514', null, 't_a_failed_job_must_say_why');

update hockey.processing_jobs
   set status = 'failed', failure_stage = 'preprocessing',
       failure_code = 'unreadable_video', failure_detail = 'moov atom not found',
       failure_retryable = false, failed_at = now()
 where project_id = tests.project_a();
select is((select failure_code from hockey.processing_jobs where project_id = tests.project_a()),
  'unreadable_video', 't_the_failure_is_recorded_not_just_logged');

select is((select failure_retryable from hockey.processing_jobs
            where project_id = tests.project_a()),
  false, 't_retryability_is_recorded_so_a_dead_button_is_not_offered');

-- updated_at is maintained by the database, not by the application
-- remembering to set it. Proven by writing a deliberately wrong value and
-- watching the trigger overrule it -- `updated_at > created_at` would be the
-- obvious assertion and is untestable here, because now() is frozen for the
-- whole transaction pgTAP wraps this file in, so the two are always equal.
update hockey.processing_jobs
   set status = 'preprocessing', updated_at = timestamptz '1999-01-01'
 where project_id = tests.project_a();
select is(
  (select updated_at from hockey.processing_jobs where project_id = tests.project_a()),
  now(),
  't_updated_at_is_maintained_by_the_database_not_the_caller');

update hockey.processing_jobs
   set status = 'player_detection', attempt = 1, failure_stage = null,
       failure_code = null, failure_detail = null, failure_retryable = null
 where project_id = tests.project_a();

insert into hockey.job_events (owner_id, job_id, status, note)
select tests.parent_a(), id, 'player_detection', 'Retry #1'
  from hockey.processing_jobs where project_id = tests.project_a();
select is((select count(*)::int from hockey.job_events), 1,
  't_every_transition_is_auditable_after_the_fact');

-- --- Tracking evidence -----------------------------------------------------

insert into hockey.player_tracks (owner_id, project_id, external_id,
       detection_source, start_time, end_time, observation_count)
values (tests.parent_a(), tests.project_a(), 'track-3',
        'ultralytics:yolov8n.pt+bytetrack', 600, 640, 200);
select ok(tests.track_a() is not null, 't_track_recorded');

select throws_ok(
  $$ insert into hockey.player_tracks (owner_id, project_id, external_id,
        detection_source, start_time, end_time)
     values (tests.parent_a(), tests.project_a(), 'backwards', 'x', 100, 50) $$,
  '23514', null, 't_a_track_cannot_end_before_it_starts');

-- THE GUARD THAT MATTERS MOST.
--
-- Jersey colour is shared with four team-mates on the ice. A hundred frames of
-- "navy" is one weak observation repeated, not proof of identity. So the
-- database refuses to store a claim of certainty that no legible jersey number
-- supports -- even if the application asks it to.
select throws_ok(
  $$ insert into hockey.player_segments (owner_id, project_id, track_id,
        start_time, end_time, confidence, band, detection_source,
        color_agreement, color_clarity, number_agreement, number_clarity,
        number_read_count, observation_count)
     values (tests.parent_a(), tests.project_a(), tests.track_a(),
             600, 640, 0.99, 'confirmed', 'yolo+bytetrack',
             1.0, 1.0, 0, 0, 0, 200) $$,
  '23514', null, 't_colour_alone_can_never_be_confirmed');

-- Two agreeing reads that were barely legible are not a confirmation either.
select throws_ok(
  $$ insert into hockey.player_segments (owner_id, project_id, track_id,
        start_time, end_time, confidence, band, detection_source,
        color_agreement, color_clarity, number_agreement, number_clarity,
        number_read_count, observation_count)
     values (tests.parent_a(), tests.project_a(), tests.track_a(),
             600, 640, 0.99, 'confirmed', 'yolo+bytetrack',
             1.0, 1.0, 1.0, 0.2, 6, 200) $$,
  '23514', null, 't_illegible_reads_cannot_confirm');

-- The same evidence, stored honestly as 'likely', is accepted.
insert into hockey.player_segments (owner_id, project_id, track_id,
       start_time, end_time, confidence, band, detection_source,
       color_agreement, color_clarity, number_agreement, number_clarity,
       number_read_count, observation_count)
values (tests.parent_a(), tests.project_a(), tests.track_a(),
        600, 640, 0.82, 'likely', 'ultralytics:yolov8n.pt+bytetrack',
        1.0, 0.95, 0, 0, 0, 200);
select is((select band::text from hockey.player_segments where project_id = tests.project_a()),
  'likely', 't_the_same_evidence_is_storable_as_likely');

-- A legibly read, agreeing number DOES open the top band.
insert into hockey.player_segments (owner_id, project_id, track_id,
       start_time, end_time, confidence, band, detection_source,
       color_agreement, color_clarity, number_agreement, number_clarity,
       number_read_count, observation_count)
values (tests.parent_a(), tests.project_a(), tests.track_a(),
        700, 720, 0.94, 'confirmed', 'ultralytics:yolov8n.pt+bytetrack',
        1.0, 0.95, 0.95, 0.88, 14, 120);
select is((select count(*)::int from hockey.player_segments where band = 'confirmed'),
  1, 't_a_legible_number_can_confirm');

-- Null, not 0.5. No photo compared is not the same as a photo that matched
-- nothing, and defaulting would make the difference invisible.
select is((select photo_similarity from hockey.player_segments
            where band = 'likely' limit 1),
  null, 't_an_uncompared_photo_is_null_not_a_made_up_number');

select throws_ok(
  $$ update hockey.player_segments set confidence = 1.5 where band = 'likely' $$,
  '23514', null, 't_confidence_stays_within_zero_and_one');

-- Which detector produced this, recorded so a result can always be traced --
-- and so fixture-derived data is identifiable as such.
select ok(
  (select detection_source like '%bytetrack%' from hockey.player_segments
    where band = 'likely' limit 1),
  't_every_segment_names_what_produced_it');

-- --- Events and clips ------------------------------------------------------

insert into hockey.candidate_events (owner_id, project_id, segment_id, kind,
       start_time, end_time, peak_time, strength, identity_confidence, rationale)
values (tests.parent_a(), tests.project_a(), tests.segment_a(), 'burst',
        610, 616, 613, 0.72, 0.82, 'Skating hard for 6.0s.');
select is((select count(*)::int from hockey.candidate_events), 1, 't_event_recorded');

select throws_ok(
  $$ insert into hockey.candidate_events (owner_id, project_id, segment_id, kind,
        start_time, end_time, peak_time, strength, identity_confidence)
     values (tests.parent_a(), tests.project_a(), tests.segment_a(), 'burst',
             610, 616, 999, 0.7, 0.8) $$,
  '23514', null, 't_the_peak_must_be_inside_the_event');

insert into hockey.clips (owner_id, project_id, event_id, start_time, end_time)
select tests.parent_a(), tests.project_a(), id, 607, 618.5
  from hockey.candidate_events limit 1;
select is((select decision::text from hockey.clips limit 1), 'pending',
  't_a_clip_starts_pending_because_nothing_is_approved_by_default');

-- A reviewer dragging a handle inside a clip cannot mean to select footage
-- outside it.
select throws_ok(
  $$ update hockey.clips set trimmed_start = 600, trimmed_end = 630 $$,
  '23514', null, 't_a_trim_can_only_shorten_the_clip');

select throws_ok(
  $$ update hockey.clips set trimmed_start = 615, trimmed_end = 610 $$,
  '23514', null, 't_a_trim_cannot_be_inverted');

update hockey.clips set trimmed_start = 609, trimmed_end = 617;
select is((select trimmed_end from hockey.clips limit 1), 617.000,
  't_a_valid_trim_is_accepted');

-- THE SECOND GUARD THAT MATTERS.
--
-- A rendered file may only exist for a clip a human accepted. Enforced in
-- review.ts, again in reel.ts, and here -- because a clip of the wrong child
-- reaching a family is worth three independent controls.
insert into hockey.media_assets (owner_id, project_id, role, storage_key)
values (tests.parent_a(), tests.project_a(), 'clip', 'clips/c1.mp4');

select throws_ok(
  $$ update hockey.clips
        set media_asset_id = (select id from hockey.media_assets
                               where storage_key = 'clips/c1.mp4') $$,
  '23514', null, 't_an_unapproved_clip_cannot_be_rendered');

update hockey.clips set decision = 'rejected';
select throws_ok(
  $$ update hockey.clips
        set media_asset_id = (select id from hockey.media_assets
                               where storage_key = 'clips/c1.mp4') $$,
  '23514', null, 't_a_rejected_clip_cannot_be_rendered');

update hockey.clips set decision = 'accepted';
update hockey.clips set media_asset_id = (select id from hockey.media_assets
                                           where storage_key = 'clips/c1.mp4');
select ok((select media_asset_id is not null from hockey.clips limit 1),
  't_an_approved_clip_can_be_rendered');

-- --- Reels -----------------------------------------------------------------

insert into hockey.reels (owner_id, project_id, title, subtitle,
                          total_duration_seconds)
values (tests.parent_a(), tests.project_a(), 'Sam Herman · #17',
        'Riverside Squirt A vs Northstars · February 14, 2026', 8);

-- Null until something has actually rendered. A non-null key with no file
-- behind it is a download button that 404s.
select is((select media_asset_id from hockey.reels limit 1), null,
  't_a_reel_has_no_file_until_one_is_rendered');

insert into hockey.reel_entries (owner_id, reel_id, clip_id, start_time,
                                 end_time, reel_offset, position)
select tests.parent_a(), r.id, c.id, 609, 617, 0, 0
  from hockey.reels r, hockey.clips c limit 1;
select is((select count(*)::int from hockey.reel_entries), 1, 't_reel_entry_recorded');

select throws_ok(
  $$ insert into hockey.reel_entries (owner_id, reel_id, clip_id, start_time,
        end_time, reel_offset, position)
     select tests.parent_a(), r.id, c.id, 620, 628, 8, 0
       from hockey.reels r, hockey.clips c limit 1 $$,
  '23505', null, 't_two_clips_cannot_occupy_one_position');

-- --- One parent cannot see another's child ---------------------------------

select tests.login_as(tests.parent_b());

select is((select count(*)::int from hockey.projects), 0,
  't_another_parent_sees_no_projects');
select is((select count(*)::int from hockey.media_assets), 0,
  't_another_parent_sees_no_video');
select is((select count(*)::int from hockey.player_segments), 0,
  't_another_parent_sees_no_tracking_of_a_child');
select is((select count(*)::int from hockey.clips), 0,
  't_another_parent_sees_no_clips');
select is((select count(*)::int from hockey.reels), 0,
  't_another_parent_sees_no_reels');

-- WITH CHECK is what stops a user writing a row owned by somebody else.
select throws_ok(
  $$ insert into hockey.projects (owner_id, name)
     values (tests.parent_a(), 'Stolen project') $$,
  '42501', null, 't_a_row_cannot_be_written_on_behalf_of_another_account');

-- Invisible AND unwritable. RLS that only filtered reads would still let a
-- stranger corrupt a row they cannot see, and an UPDATE matching no visible
-- row succeeds silently -- so the proof is not that the statement failed, it
-- is that the owner's data is unchanged afterwards.
update hockey.clips set decision = 'rejected';
update hockey.projects set name = 'Vandalised';

select tests.login_as(tests.parent_a());
select is((select decision::text from hockey.clips limit 1), 'accepted',
  't_another_parents_write_left_the_clip_untouched');
select is((select name from hockey.projects limit 1), 'Squirt A vs Northstars',
  't_another_parents_write_left_the_project_untouched');

-- --- Anonymous visitors ----------------------------------------------------

select tests.login_as_anon();
select throws_ok(
  $$ select count(*) from hockey.projects $$,
  '42501', null, 't_an_anonymous_visitor_is_refused_outright');

select * from finish();
rollback;
