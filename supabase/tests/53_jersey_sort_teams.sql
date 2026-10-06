\ir _fixtures.sql.inc

-- ===========================================================================
-- JerseySort AI — migration 0053: two teams per event, the jersey per number.
--
--   1. An event's away team is a real team of the SAME organization, never
--      the home team, and the two teams cannot wear the same shade.
--   2. A jersey is light or dark, nothing else.
--   3. Members set an event's teams and colors; a viewer cannot.
--   4. A member records the jersey on their OWN (manual) reading, but cannot
--      edit the jersey of an AI reading, as they cannot edit its number.
--   5. Events made before 0053 are untouched: one team, no colors.
-- ===========================================================================
begin;
select plan(23);
select tests.seed();

-- SECURITY INVOKER: runs under the CALLER's policies, reports rows changed.
create or replace function tests.js_set_colors(p_id uuid, p_home text, p_away text) returns integer
language plpgsql as $$
declare n integer;
begin
  update jerseysort.events set home_jersey = p_home, away_jersey = p_away where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===========================================================================
-- Structure and grants
-- ===========================================================================

select has_column('jerseysort', 'events', 'away_team_id', 't_events_away_team');
select has_column('jerseysort', 'events', 'home_jersey', 't_events_home_jersey');
select has_column('jerseysort', 'events', 'away_jersey', 't_events_away_jersey');
select has_column('jerseysort', 'photo_detections', 'jersey', 't_detections_jersey');
select has_index('jerseysort', 'events', 'events_away_team_idx', 't_away_team_fk_is_indexed');

select is(has_column_privilege('authenticated', 'jerseysort.events', 'away_team_id', 'update'), true, 't_member_may_set_away_team');
select is(has_column_privilege('authenticated', 'jerseysort.events', 'home_jersey', 'update'), true, 't_member_may_set_home_jersey');
select is(has_column_privilege('authenticated', 'jerseysort.events', 'away_jersey', 'update'), true, 't_member_may_set_away_jersey');
select is(has_column_privilege('authenticated', 'jerseysort.photo_detections', 'jersey', 'update'), false, 't_cannot_edit_a_readings_jersey_by_grant');

-- ===========================================================================
-- A world: Caz (home) vs Wheatfield, both tenant A's; a tenant-B team
-- ===========================================================================

insert into jerseysort.teams (id, tenant_id, name, sport) values
  (tests.uid('js_caz'), tests.uid('tenant_a'), 'Caz', 'Football'),
  (tests.uid('js_wheatfield'), tests.uid('tenant_a'), 'Wheatfield', 'Football'),
  (tests.uid('js_other_org_team'), tests.uid('tenant_b'), 'Hamburg', 'Football');
insert into jerseysort.seasons (id, tenant_id, name) values
  (tests.uid('js_season'), tests.uid('tenant_a'), '2026');
insert into jerseysort.events (id, tenant_id, name, sport, team_id, season_id, event_date) values
  (tests.uid('js_game'), tests.uid('tenant_a'), 'Caz vs Wheatfield', 'Football', tests.uid('js_caz'), tests.uid('js_season'), '2026-10-04'),
  (tests.uid('js_old'), tests.uid('tenant_a'), 'Made before 0053', 'Football', tests.uid('js_caz'), tests.uid('js_season'), '2026-09-01');

-- Refusal 5: an event made the old way has one team and no colors.
select results_eq(
  $$ select away_team_id is null and home_jersey is null and away_jersey is null
       from jerseysort.events where id = tests.uid('js_old') $$,
  $$ values (true) $$,
  't_events_made_before_0053_are_untouched');

-- ===========================================================================
-- As tenant A's owner
-- ===========================================================================

select tests.login_as(tests.uid('owner_a'));

select lives_ok($$
  update jerseysort.events set away_team_id = tests.uid('js_wheatfield'), home_jersey = 'dark', away_jersey = 'light'
   where id = tests.uid('js_game')
$$, 't_member_sets_both_teams_and_colors');

-- Refusal 1
select throws_ok($$
  update jerseysort.events set away_jersey = 'dark' where id = tests.uid('js_game')
$$, '23514', null, 't_two_teams_cannot_wear_the_same_shade');

select throws_ok($$
  update jerseysort.events set away_team_id = team_id where id = tests.uid('js_game')
$$, '23514', null, 't_a_team_cannot_play_itself');

select throws_ok($$
  update jerseysort.events set away_team_id = tests.uid('js_other_org_team') where id = tests.uid('js_game')
$$, '23503', null, 't_away_team_must_be_this_organizations');

-- Refusal 2
select throws_ok($$
  update jerseysort.events set home_jersey = 'grey' where id = tests.uid('js_game')
$$, '23514', null, 't_jersey_is_light_or_dark');

select lives_ok($$
  insert into jerseysort.photos (id, tenant_id, event_id, uploaded_by, original_filename, storage_path, captured_at,
    captured_at_source, mime_type, file_size, file_hash, status)
  values (tests.uid('js_game_photo'), tests.uid('tenant_a'), tests.uid('js_game'), tests.uid('owner_a'), 'IMG_0001.JPG',
    tests.uid('tenant_a')::text || '/e/g.jpg', '2026-10-04 18:00:00', 'exif', 'image/jpeg', 4000000, repeat('e', 64), 'queued')
$$, 't_photo_in_the_game');

-- Refusal 4: the jersey on a member's own reading, and only there.
select lives_ok($$
  insert into jerseysort.photo_detections (id, tenant_id, photo_id, detected_value, confidence, method, provider, status, created_by, jersey)
  values (tests.uid('js_manual_22'), tests.uid('tenant_a'), tests.uid('js_game_photo'), '22', 1, 'manual', 'person', 'confirmed', tests.uid('owner_a'), 'dark')
$$, 't_member_says_this_is_the_dark_22');

select throws_ok($$
  insert into jerseysort.photo_detections (tenant_id, photo_id, detected_value, confidence, method, provider, status, created_by, jersey)
  values (tests.uid('tenant_a'), tests.uid('js_game_photo'), '23', 1, 'manual', 'person', 'confirmed', tests.uid('owner_a'), 'grey')
$$, '23514', null, 't_reading_jersey_is_light_or_dark');

select throws_ok($$
  insert into jerseysort.photo_detections (tenant_id, photo_id, detected_value, confidence, method, provider, status, created_by, jersey)
  values (tests.uid('tenant_a'), tests.uid('js_game_photo'), '22', 0.9, 'vision_model', 'claude-vision', 'suggested', tests.uid('owner_a'), 'light')
$$, '42501', null, 't_member_cannot_type_in_an_ai_reading_with_a_jersey');

select tests.logout();

-- The worker records what the AI saw.
set local role service_role;
insert into jerseysort.photo_detections (id, tenant_id, photo_id, detected_value, confidence, method, provider, provider_model, status, jersey)
values (tests.uid('js_ai_22'), tests.uid('tenant_a'), tests.uid('js_game_photo'), '22', 0.91, 'vision_model', 'claude-vision', 'claude-opus-5-5', 'suggested', 'light');
reset role;

select tests.login_as(tests.uid('owner_a'));

select throws_ok($$
  update jerseysort.photo_detections set jersey = 'dark' where id = tests.uid('js_ai_22')
$$, '42501', null, 't_member_cannot_recolor_an_ai_reading');

select is(
  (select jersey from jerseysort.photo_detections where id = tests.uid('js_ai_22')),
  'light', 't_the_ai_reading_is_as_the_ai_said');

select tests.logout();

-- Refusal 3: a viewer reads the colors but cannot change them.
select tests.login_as(tests.uid('viewer_a'));
select is(tests.js_set_colors(tests.uid('js_game'), 'light', 'dark'), 0, 't_viewer_cannot_change_colors');
select tests.logout();

select results_eq(
  $$ select home_jersey, away_jersey from jerseysort.events where id = tests.uid('js_game') $$,
  $$ values ('dark'::text, 'light'::text) $$,
  't_colors_are_as_the_member_set_them');

select * from finish();
rollback;
