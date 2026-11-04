-- ===========================================================================
-- 0051_hype_video — 5-Star Hype Video (5-Star Sports Media)
--
-- Persistence for 5-Star Hype Video (packages/hype-video, apps/hype-video):
-- hype projects, the photos and clips uploaded to them, the seed templates,
-- the generated hype packages, user profiles, and placeholders for purchases
-- and subscriptions.
--
-- The app ships with a local JSON store whose records have this exact shape;
-- this schema is what that store becomes once it is approved and applied.
-- WRITTEN AND TESTED, NOT APPLIED to any project.
--
-- ASSEMBLED, NOT REBUILT. Identity and auth already exist in this platform and
-- are reused verbatim. No second identity model, no second permission system.
-- Purely additive: a new schema, no existing object is touched.
--
-- ---------------------------------------------------------------------------
-- WHOSE DATA THIS IS
-- ---------------------------------------------------------------------------
--
-- Photographs and video of young athletes, most of them minors, uploaded by a
-- parent, a coach or the athlete. Following the `ats` (0048) and `sceneflow`
-- (0050) schemas rather than the tenant-scoped modules:
--
--   * Every user table is owned by exactly one auth user via `owner_id`.
--   * RLS is ENABLED and FORCED on every table.
--   * Policies are per-command and always compare to auth.uid().
--   * No platform-admin read path, no cross-user visibility, no anon access.
--
-- ---------------------------------------------------------------------------
-- THE FIVE THINGS THIS SCHEMA REFUSES TO ALLOW
-- ---------------------------------------------------------------------------
--
-- 1. A PROJECT ABOUT A MINOR WITHOUT A NAMED GUARDIAN'S CONSENT.
--    `features_minor` defaults to TRUE — the safe assumption for a youth
--    sports product — and a minor's project must record guardian consent and
--    the guardian's name. This records what the user STATED. It verifies
--    nothing, and the product says so where it is collected.
--
-- 2. SHARING THAT NOBODY CHOSE.
--    `visibility` defaults to 'private'. Anything else requires `shared_at`
--    (an explicit act, not a default), media rights confirmed, and for a
--    minor, guardian consent. On the data, not the UI, because a UI is one
--    deploy away from being wrong.
--
-- 3. A USER FABRICATING A GENERATED PACKAGE.
--    `hype_outputs` has NO insert and NO update grant for `authenticated`.
--    Packages are written only by the trusted server path, after the
--    fabrication guard and content screen in @hl-bos/hype-video have run. A
--    user can read and delete their own; they cannot type one into existence.
--
-- 4. A STATUS THAT CLAIMS WHAT HAS NOT HAPPENED.
--    'generated' and 'exported' require a stored output. 'paid_download_pending'
--    requires a pending purchase row, and purchases are not user-writable — so
--    while payments are unconnected, nothing can reach that status at all.
--
-- 5. A FILE OR OUTPUT ATTACHED TO SOMEONE ELSE'S PROJECT.
--    Media and outputs must share their project's owner (trigger), and every
--    media object path is prefixed by owner and project, so a storage policy
--    keyed on the path prefix protects the bytes the same way RLS protects rows.
--
-- rollback:
--   DROP SCHEMA IF EXISTS hype CASCADE;
--   (Additive: creates a new schema and touches no existing object, so
--    dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists hype;
comment on schema hype is
  '5-Star Hype Video: hype projects, uploaded athlete media, templates, generated packages, profiles, purchases. Owner-scoped with forced RLS; generated packages are not user-writable.';

revoke all on schema hype from public, anon;
grant usage on schema hype to authenticated;
alter default privileges in schema hype revoke all on tables from public, anon;
alter default privileges in schema hype revoke all on functions from public, anon;

-- --- Types ------------------------------------------------------------------
-- Each mirrors a closed list in @hl-bos/hype-video (src/types.ts).

do $$ begin create type hype.project_status as enum
  ('draft','media_uploaded','details_complete','generated','exported','paid_download_pending');
  exception when duplicate_object then null; end $$;

do $$ begin create type hype.tone as enum
  ('cinematic','aggressive','inspirational','emotional','fun','professional');
  exception when duplicate_object then null; end $$;

do $$ begin create type hype.output_type as enum
  ('short_social_post','hype_script','voiceover_script','full_video_prompt','caption_package');
  exception when duplicate_object then null; end $$;

do $$ begin create type hype.accent as enum ('red','gold','blue');
  exception when duplicate_object then null; end $$;

do $$ begin create type hype.visibility as enum ('private','link','public');
  exception when duplicate_object then null; end $$;

do $$ begin create type hype.media_kind as enum ('image','video');
  exception when duplicate_object then null; end $$;

do $$ begin create type hype.creator_role as enum
  ('parent','athlete','coach','team','media','organizer');
  exception when duplicate_object then null; end $$;

do $$ begin create type hype.purchase_status as enum ('pending','paid','refunded','failed');
  exception when duplicate_object then null; end $$;

-- --- Templates (reference data) ---------------------------------------------

create table if not exists hype.hype_templates (
  key           text primary key,
  name          text not null,
  tagline       text not null,
  default_tone  hype.tone not null,
  subject       text not null,
  sort_order    smallint not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint hype_templates_subject check (subject in ('athlete','team')),
  constraint hype_templates_key_shape check (key ~ '^[a-z_]+$')
);
comment on table hype.hype_templates is
  'The template catalogue. Seeded here; the creative brief for each lives in @hl-bos/hype-video/src/templates.ts and the app''s tests hold the two lists to each other.';

insert into hype.hype_templates (key, name, tagline, default_tone, subject, sort_order) values
  ('game_day',           'Game Day Hype Video',     'Pre-game energy for the feed before kickoff, tip-off or first pitch.', 'aggressive',   'athlete', 1),
  ('senior_night',       'Senior Night Tribute',    'Honor a senior''s journey on their last home night.',                 'emotional',    'athlete', 2),
  ('athlete_spotlight',  'Athlete Spotlight',       'A profile piece: who they are on and off the field.',                 'cinematic',    'athlete', 3),
  ('recruiting_intro',   'Recruiting Intro',        'A clean, coach-ready introduction with the facts up front.',          'professional', 'athlete', 4),
  ('championship_recap', 'Championship Recap',      'Relive the title run while it is still loud.',                        'cinematic',    'athlete', 5),
  ('birthday_tribute',   'Birthday Sports Tribute', 'A birthday shout-out with a sports-media twist.',                     'fun',          'athlete', 6),
  ('team_intro',         'Team Intro Video',        'Introduce the whole squad for the new season.',                       'aggressive',   'team',    7),
  ('player_of_the_game', 'Player of the Game Post', 'Quick-turn recognition for last night''s standout.',                  'fun',          'athlete', 8)
on conflict (key) do nothing;

-- --- Profiles ---------------------------------------------------------------

create table if not exists hype.user_profiles (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  creator_role  hype.creator_role not null default 'parent',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --- Projects ---------------------------------------------------------------

create table if not exists hype.hype_projects (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null references auth.users(id) on delete cascade,
  name                        text not null,
  creator_role                hype.creator_role not null default 'parent',
  template_key                text not null references hype.hype_templates(key),
  tone                        hype.tone not null,
  output_types                hype.output_type[] not null default '{}',
  accent                      hype.accent not null default 'red',
  status                      hype.project_status not null default 'draft',

  -- Athlete details. The only facts any writer may state.
  athlete_name                text,
  sport                       text,
  team_or_school              text,
  jersey_number               text,
  position                    text,
  class_year_or_age_group     text,
  achievements                text[] not null default '{}',
  personality_notes           text,
  sponsor_name                text,
  extra_context               text,

  -- Consent, as stated by the person creating the project.
  media_rights_confirmed      boolean not null default false,
  features_minor              boolean not null default true,
  guardian_consent_confirmed  boolean not null default false,
  guardian_name               text,
  consent_confirmed_at        timestamptz,

  -- Sharing. Private always, unless someone explicitly chose otherwise.
  visibility                  hype.visibility not null default 'private',
  shared_at                   timestamptz,

  package_stale               boolean not null default false,
  exported_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint hype_projects_name_present check (length(btrim(name)) > 0 and length(name) <= 80),
  constraint hype_projects_jersey_shape check (jersey_number is null or jersey_number ~ '^\d{0,2}$'),
  constraint hype_projects_achievements_cap check (coalesce(array_length(achievements, 1), 0) <= 8),
  -- Refusal 1.
  constraint hype_projects_minor_needs_guardian check (
    not features_minor
    or not media_rights_confirmed
    or (guardian_consent_confirmed and guardian_name is not null and length(btrim(guardian_name)) > 0)
  ),
  constraint hype_projects_consent_is_recorded check (
    not media_rights_confirmed or consent_confirmed_at is not null
  ),
  -- Refusal 2.
  constraint hype_projects_sharing_is_chosen check (
    visibility = 'private'
    or (
      shared_at is not null
      and media_rights_confirmed
      and (not features_minor or guardian_consent_confirmed)
    )
  )
);
comment on column hype.hype_projects.features_minor is
  'Defaults to TRUE: in a youth sports product the safe assumption is that the athlete is a minor until someone says otherwise.';
comment on column hype.hype_projects.guardian_consent_confirmed is
  'What the creator STATED. Not verified, and nothing may describe it as verified.';

create index if not exists hype_projects_owner_idx on hype.hype_projects (owner_id, updated_at desc);

-- --- Media ------------------------------------------------------------------

create table if not exists hype.hype_project_media (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references hype.hype_projects(id) on delete cascade,
  kind            hype.media_kind not null,
  -- The type DETECTED from the file's bytes at upload, never the claimed one.
  mime_type       text not null,
  size_bytes      bigint not null,
  bucket          text not null default 'hype-media',
  object_path     text not null,
  original_name   text not null,
  created_at      timestamptz not null default now(),
  constraint hype_media_object_unique unique (bucket, object_path),
  -- Refusal 5: the path names its owner and project.
  constraint hype_media_path_scoped
    check (object_path like owner_id::text || '/' || project_id::text || '/%'),
  constraint hype_media_mime_matches_kind check (
    (kind = 'image' and mime_type in ('image/jpeg','image/png','image/webp','image/gif'))
    or (kind = 'video' and mime_type in ('video/mp4','video/quicktime','video/webm'))
  ),
  constraint hype_media_size_sane check (
    size_bytes > 0
    and size_bytes <= case kind when 'image' then 15 * 1024 * 1024 else 150 * 1024 * 1024 end
  )
);
create index if not exists hype_media_project_idx on hype.hype_project_media (project_id);

-- --- Generated packages -------------------------------------------------------

create table if not exists hype.hype_outputs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references hype.hype_projects(id) on delete cascade,
  -- 'template-writer' or 'claude:<model>'. Never blank: every package says
  -- what wrote it, so template output is never passed off as AI output.
  produced_by   text not null,
  fell_back     boolean not null default false,
  notes         text[] not null default '{}',
  title         text not null,
  package       jsonb not null,
  generated_at  timestamptz not null default now(),
  constraint hype_outputs_producer_known
    check (produced_by = 'template-writer' or produced_by ~ '^claude:[a-z0-9.-]+$'),
  constraint hype_outputs_package_complete check (
    package ?& array['title','script15','script30','voiceover','socialCaption','hashtags',
                     'onScreenText','videoPrompt','musicPrompt','sponsorCallout']
  )
);
comment on table hype.hype_outputs is
  'Generated hype packages, newest last. Written only by the trusted server path after the fabrication guard and content screen; no user write grant exists.';
create index if not exists hype_outputs_project_idx on hype.hype_outputs (project_id, generated_at desc);

-- --- Purchases and subscriptions (placeholders) -----------------------------

create table if not exists hype.purchases (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  project_id      uuid references hype.hype_projects(id) on delete set null,
  plan_key        text not null,
  amount_cents    integer not null,
  currency        text not null default 'usd',
  status          hype.purchase_status not null default 'pending',
  provider        text not null default 'stripe',
  provider_ref    text,
  created_at      timestamptz not null default now(),
  constraint purchases_plan_known check (plan_key in
    ('single_package','family_monthly','coach_team_monthly','team_package')),
  constraint purchases_amount_positive check (amount_cents > 0)
);
comment on table hype.purchases is
  'PLACEHOLDER. No payment provider is connected. Written only by a future payment webhook; no user write grant exists.';

create table if not exists hype.subscriptions (
  owner_id            uuid primary key references auth.users(id) on delete cascade,
  plan_key            text not null,
  status              text not null,
  current_period_end  timestamptz,
  provider            text not null default 'stripe',
  provider_ref        text,
  updated_at          timestamptz not null default now(),
  constraint subscriptions_plan_known check (plan_key in ('family_monthly','coach_team_monthly'))
);
comment on table hype.subscriptions is
  'PLACEHOLDER. No payment provider is connected. Written only by a future payment webhook; no user write grant exists.';

-- --- Integrity triggers -----------------------------------------------------

-- Refusal 5. A child row belongs to whoever owns its project.
create or replace function hype.assert_same_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  project_owner uuid;
begin
  select owner_id into project_owner from hype.hype_projects where id = new.project_id;
  if project_owner is distinct from new.owner_id then
    raise exception 'project % belongs to someone else', new.project_id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists hype_media_same_owner on hype.hype_project_media;
create trigger hype_media_same_owner
  before insert or update on hype.hype_project_media
  for each row execute function hype.assert_same_owner();

drop trigger if exists hype_outputs_same_owner on hype.hype_outputs;
create trigger hype_outputs_same_owner
  before insert or update on hype.hype_outputs
  for each row execute function hype.assert_same_owner();

-- Refusal 4. A status may not claim something that has not happened.
create or replace function hype.assert_status_truthful()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('generated','exported')
     and not exists (select 1 from hype.hype_outputs o where o.project_id = new.id) then
    raise exception 'project % has no generated package, so it cannot be %', new.id, new.status
      using errcode = 'check_violation';
  end if;
  if new.status = 'paid_download_pending'
     and not exists (select 1 from hype.purchases p
                      where p.project_id = new.id and p.status = 'pending') then
    raise exception 'project % has no pending purchase, so it cannot be awaiting payment', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists hype_projects_status_truthful on hype.hype_projects;
create trigger hype_projects_status_truthful
  before insert or update of status on hype.hype_projects
  for each row execute function hype.assert_status_truthful();

-- --- updated_at -------------------------------------------------------------

create or replace function hype.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_profiles_touch on hype.user_profiles;
create trigger user_profiles_touch before update on hype.user_profiles
  for each row execute function hype.touch_updated_at();
drop trigger if exists hype_projects_touch on hype.hype_projects;
create trigger hype_projects_touch before update on hype.hype_projects
  for each row execute function hype.touch_updated_at();

-- --- Row level security -----------------------------------------------------
--
-- Enabled AND forced on every table. Grant shapes:
--
--   OWNED     — the user's own working data. All four commands.
--   DERIVED   — produced by the trusted path. SELECT and DELETE only.
--   SEALED    — SELECT own only (purchases, subscriptions).
--   REFERENCE — templates: SELECT for any signed-in user, no writes.

do $$
declare
  t text;
begin
  foreach t in array array[
    'hype_templates','user_profiles','hype_projects','hype_project_media',
    'hype_outputs','purchases','subscriptions'
  ]
  loop
    execute format('alter table hype.%I enable row level security', t);
    execute format('alter table hype.%I force row level security', t);
  end loop;

  foreach t in array array['user_profiles','hype_projects','hype_project_media']
  loop
    execute format(
      'create policy %I on hype.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on hype.%I for insert to authenticated with check (owner_id = auth.uid())',
      t || '_insert_own', t);
    execute format(
      'create policy %I on hype.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update_own', t);
    execute format(
      'create policy %I on hype.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete_own', t);
    execute format('grant select, insert, update, delete on hype.%I to authenticated', t);
  end loop;

  create policy hype_outputs_select_own on hype.hype_outputs
    for select to authenticated using (owner_id = auth.uid());
  create policy hype_outputs_delete_own on hype.hype_outputs
    for delete to authenticated using (owner_id = auth.uid());
  grant select, delete on hype.hype_outputs to authenticated;

  foreach t in array array['purchases','subscriptions']
  loop
    execute format(
      'create policy %I on hype.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format('grant select on hype.%I to authenticated', t);
  end loop;

  create policy hype_templates_read on hype.hype_templates
    for select to authenticated using (is_active);
  grant select on hype.hype_templates to authenticated;
end $$;
