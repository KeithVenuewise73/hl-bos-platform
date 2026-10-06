-- ===========================================================================
-- 0053_jersey_sort_teams — JerseySort AI: two teams per event, and the
-- jersey each number is printed on.
--
-- An athlete is TEAM + NUMBER, not a number. At Caz vs Wheatfield, Caz #22
-- and Wheatfield #22 are two people, and a photo of one must never land in
-- the other's gallery. V1 tells the teams apart the way a person at the game
-- does: one team wears light jerseys, the other dark.
--
--   events.team_id            the HOME team (before 0053: the event's one team)
--   events.away_team_id       the AWAY team, a team in jerseysort.teams so it
--                             can have a roster; null on events made before
--                             0053, whose opponent stays the text `opponent`
--   events.home_jersey        light | dark
--   events.away_jersey        light | dark, never the same as home_jersey
--   photo_detections.jersey   light | dark | null (the jersey was not seen)
--
-- The team a detection belongs to is DERIVED from its jersey and its event's
-- colors (DETECTION_TEAM in apps/jersey-sort/src/lib/repo/sql.ts, teamSideFor
-- in packages/jersey-sort/src/teams.ts), never stored on the detection, so
-- correcting an event's colors corrects every photo in it at once. A number
-- whose jersey was not seen, in a two-team event, belongs to no team until a
-- person says which.
--
-- The app's local store gains exactly these columns (db-core.ts, schema v2).
-- WRITTEN AND TESTED, NOT APPLIED to any project.
--
-- Purely additive: nullable columns, constraints that every existing row
-- already satisfies, one index, one column grant. Nothing is dropped,
-- renamed or rewritten, and an event made before 0053 behaves exactly as
-- before (one team; its numbers belong to it).
--
-- WHO MAY WRITE WHAT (unchanged rules, extended to the new columns):
--   * events: members with jerseysort.photo.manage may set the away team and
--     both jerseys, as they may set the rest of the event (column grant).
--   * photo_detections.jersey: written on insert only. The analysis worker
--     (service role) writes what the AI saw; a member writes it on a MANUAL
--     detection ("this #22 is the dark #22"). A member still cannot update
--     an AI reading's jersey, exactly as they cannot update its number: they
--     reject it and add their own, so what the AI said stays inspectable.
--
-- rollback:
--   revoke update (away_team_id, home_jersey, away_jersey) on jerseysort.events from authenticated;
--   drop index if exists jerseysort.events_away_team_idx;
--   alter table jerseysort.photo_detections drop constraint if exists detections_jersey_known,
--     drop column if exists jersey;
--   alter table jerseysort.events drop constraint if exists events_jerseys_differ,
--     drop constraint if exists events_jerseys_known,
--     drop constraint if exists events_away_not_home,
--     drop constraint if exists events_away_team_same_tenant,
--     drop column if exists away_jersey,
--     drop column if exists home_jersey,
--     drop column if exists away_team_id;
--   (Additive: dropping these loses only data written after 0053.)
-- ===========================================================================

alter table jerseysort.events
  add column away_team_id uuid,
  add column home_jersey text,
  add column away_jersey text;

alter table jerseysort.events
  -- The away team is a team of the SAME organization, as the home team is.
  add constraint events_away_team_same_tenant foreign key (away_team_id, tenant_id)
    references jerseysort.teams(id, tenant_id),
  add constraint events_away_not_home check (away_team_id is null or away_team_id <> team_id),
  add constraint events_jerseys_known check (
    (home_jersey is null or home_jersey in ('light','dark'))
    and (away_jersey is null or away_jersey in ('light','dark'))
  ),
  -- Two teams in one shade could not be told apart by it.
  add constraint events_jerseys_differ check (
    home_jersey is null or away_jersey is null or home_jersey <> away_jersey
  );

comment on column jerseysort.events.team_id is
  'The HOME team. Before 0053, the event''s one team.';
comment on column jerseysort.events.away_team_id is
  'The AWAY team (0053). Null on events made before 0053, whose opponent is the text column `opponent`.';

-- Covers the new foreign key (the advisor flags an unindexed one).
create index if not exists events_away_team_idx on jerseysort.events (away_team_id, tenant_id);

alter table jerseysort.photo_detections
  add column jersey text,
  add constraint detections_jersey_known check (jersey is null or jersey in ('light','dark'));

comment on column jerseysort.photo_detections.jersey is
  'Light or dark jersey the number is printed on; null when not seen. The team follows from this and the event''s colors (0053).';

-- Members set the teams and colors of an event as they set the rest of it.
-- photo_detections keeps its update grant at (status, updated_at): jersey,
-- like the number, is not editable on someone else's reading.
grant update (away_team_id, home_jersey, away_jersey) on jerseysort.events to authenticated;
