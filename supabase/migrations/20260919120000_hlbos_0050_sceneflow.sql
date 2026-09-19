-- ===========================================================================
-- 0050_sceneflow — SceneFlow AI
--
-- Persistence for the SceneFlow AI continuation engine (packages/sceneflow):
-- casts and the adults in them, reference photographs, stories, scenes, the
-- generation jobs that produce them, moderation events, credits and
-- subscriptions.
--
-- ASSEMBLED, NOT REBUILT. Identity and auth already exist in this platform and
-- are reused verbatim. This migration adds no second identity model and no
-- second permission system. Purely additive: a new schema, no existing object
-- is touched.
--
-- ---------------------------------------------------------------------------
-- WHOSE DATA THIS IS
-- ---------------------------------------------------------------------------
--
-- Photographs of somebody's partner, and romantic images generated from them.
-- There is no plausible operational reason for anyone running this platform to
-- look at them. So, following the `ats` schema (0048) rather than the
-- tenant-scoped modules:
--
--   * Every table is owned by exactly one auth user via `owner_id`.
--   * RLS is ENABLED and FORCED on every table, including for the owner role.
--   * Policies are per-command and always compare to auth.uid().
--   * There is no platform-admin read path, no cross-user visibility, and no
--     service-role convenience policy. None.
--
-- ---------------------------------------------------------------------------
-- THE FIVE THINGS THIS SCHEMA REFUSES TO ALLOW
-- ---------------------------------------------------------------------------
--
-- 1. A CAST CANNOT BECOME GENERATABLE WITHOUT BOTH ATTESTATIONS.
--    `casts.status = 'ready'` requires adult_confirmed AND permission_confirmed
--    AND a recorded consent-text version, AND at least two members. A cast that
--    is not 'ready' cannot be named by a generation job — enforced by trigger,
--    not by whichever screen happens to call the API.
--
--    This records what the user STATED. It verifies nothing. The product says
--    so where it is collected, and this comment says so here, because a column
--    called `permission_confirmed` is exactly the kind of thing that gets
--    described as consent later by someone reading the schema and not the UI.
--
-- 2. A USER CANNOT FABRICATE A GENERATED SCENE.
--    `scenes`, `generation_jobs`, `moderation_events`, `credit_ledger` and
--    `subscriptions` have NO insert grant and NO update grant for
--    `authenticated`. They are written only by the trusted server path. A user
--    can read their own rows and delete their own scenes; they cannot type an
--    image into existence, mint themselves credits, or award themselves an
--    entitlement. `scenes.favorite` is the single exception and is granted at
--    COLUMN level, because favouriting is a user action and nothing else on
--    that row is.
--
-- 3. A SCENE CANNOT CLAIM TO BE READY WITH NOTHING TO LOOK AT.
--    `scenes.status = 'ready'` requires an image_path. A ready scene with no
--    image is the storyboard equivalent of a green dashboard panel over no
--    data, and this platform does not ship those.
--
-- 4. A BLOCKED REQUEST CANNOT COST A CREDIT.
--    A job in status 'blocked' must have credit_cost = 0 (CHECK), and the
--    ledger refuses a debit against a blocked or failed job (trigger). Charging
--    someone for a request we declined to make is charging them for our policy.
--
-- 5. THE CREDIT LEDGER AND THE MODERATION LOG ARE APPEND-ONLY.
--    UPDATE and DELETE are refused by trigger, which also stops the
--    service-role worker and anything else that bypasses RLS. A refund is a
--    second row, never an edit of the first. Evidence that can be edited is not
--    evidence — the same reasoning as social.publish_attempts (0046).
--
-- ---------------------------------------------------------------------------
-- STORAGE
-- ---------------------------------------------------------------------------
--
-- Reference photographs and generated images live in PRIVATE buckets and are
-- served by signed URL only. Buckets are created out of band (as everywhere
-- else in this repository); what is enforced HERE is the path shape:
-- `<owner_id>/...` on every stored object, by CHECK constraint, so a row can
-- never point at another user's prefix even if application code is wrong.
--
-- These files are not registered in storage_meta.files: that table carries a
-- 50 MiB CHECK and a tenant_id, and this schema is user-owned rather than
-- tenant-owned. Rather than weaken a constraint that protects every other
-- module, the objects carry their own owner-prefixed path with the same
-- guarantee.
--
-- ---------------------------------------------------------------------------
-- ENUM VALUES MIRROR THE ENGINE
-- ---------------------------------------------------------------------------
--
-- generation_type and job_status carry the exact strings used by
-- @hl-bos/sceneflow (including the hyphens in 'story-3' / 'story-6'). A
-- translation layer between the engine's vocabulary and the database's is a
-- place for drift to hide, and drift here silently breaks credit settlement.
-- The package's test suite asserts the two lists against each other.
--
-- rollback:
--   DROP SCHEMA IF EXISTS sceneflow CASCADE;
--   (Additive migration: it creates a new schema and touches no existing
--    table, so dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists sceneflow;
comment on schema sceneflow is
  'SceneFlow AI: casts, reference photographs, stories, generated scenes, jobs, moderation, credits. Every table is owned by a single auth user with forced RLS; AI-produced rows are not user-writable.';

revoke all on schema sceneflow from public, anon;
grant usage on schema sceneflow to authenticated;
alter default privileges in schema sceneflow revoke all on tables from public, anon;
alter default privileges in schema sceneflow revoke all on functions from public, anon;

-- --- Types ------------------------------------------------------------------

-- Stable internal identifiers for recurring subjects. An enum, not free text:
-- the cast is capped at eight by the type itself, so "9 people in a cast" is
-- not a validation someone has to remember to write.
do $$ begin create type sceneflow.member_key as enum
  ('person_a','person_b','person_c','person_d','person_e','person_f','person_g','person_h');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.cast_status as enum
  ('draft','processing','ready','blocked','archived');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.story_status as enum
  ('draft','generating','complete','partial','failed','archived');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.scene_status as enum
  ('pending','generating','ready','failed','blocked');
  exception when duplicate_object then null; end $$;

-- Mirrors JOB STATUS in the brief and the pipeline's outcomes.
do $$ begin create type sceneflow.job_status as enum
  ('queued','validating','generating','moderating','complete','failed','blocked');
  exception when duplicate_object then null; end $$;

-- Mirrors GenerationType in @hl-bos/sceneflow. Hyphens included deliberately.
do $$ begin create type sceneflow.generation_type as enum
  ('single','story-3','story-6','variation','regenerate','continue','branch');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.intimacy_level as enum
  ('warm','romantic','passionate','private-romance');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.moderation_status as enum
  ('pending','approved','rejected');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.moderation_stage as enum
  ('reference_upload','request_text','request_policy','output_image');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.moderation_result as enum
  ('allowed','blocked','refused');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.entitlement as enum ('free','plus','story_pro');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.credit_event as enum
  ('grant','debit','refund','subscription-renewal','introductory-grant');
  exception when duplicate_object then null; end $$;

do $$ begin create type sceneflow.aspect_ratio as enum ('4:5','1:1','16:9');
  exception when duplicate_object then null; end $$;

-- --- Profiles ---------------------------------------------------------------

create table if not exists sceneflow.profiles (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_avatar_owner_scoped
    check (avatar_path is null or avatar_path like owner_id::text || '/%')
);

-- --- Casts ------------------------------------------------------------------

create table if not exists sceneflow.casts (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users(id) on delete cascade,
  name                 text not null default 'Untitled cast',
  adult_confirmed      boolean not null default false,
  permission_confirmed boolean not null default false,
  -- Which wording the user actually agreed to. Without it, "they consented"
  -- cannot be answered a year later when the wording has changed twice.
  consent_text_version text,
  consent_recorded_at  timestamptz,
  status               sceneflow.cast_status not null default 'draft',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint casts_name_present check (length(btrim(name)) > 0),
  -- An attestation without a recorded wording and timestamp is not a record of
  -- anything. Both boxes are ticked together or neither is.
  constraint casts_attestation_recorded check (
    (adult_confirmed = false and permission_confirmed = false)
    or (consent_text_version is not null
        and length(btrim(consent_text_version)) > 0
        and consent_recorded_at is not null)
  ),
  -- Refusal 1. A cast is only generatable once both boxes are ticked.
  constraint casts_ready_requires_attestation check (
    status <> 'ready' or (adult_confirmed and permission_confirmed)
  )
);
comment on column sceneflow.casts.permission_confirmed is
  'What the USER STATED, not what was verified. This is an application attestation and is not evidence of consent. Do not describe it as such anywhere.';

create index if not exists casts_owner_idx on sceneflow.casts (owner_id, created_at desc);

create table if not exists sceneflow.cast_members (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users(id) on delete cascade,
  cast_id              uuid not null references sceneflow.casts(id) on delete cascade,
  member_key           sceneflow.member_key not null,
  display_label        text not null,
  -- Non-identifying appearance notes only. Never a name, never an identity
  -- claim, never a guess at who this is in the real world.
  appearance_metadata  jsonb not null default '{}'::jsonb,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint cast_members_label_present check (length(btrim(display_label)) > 0),
  constraint cast_members_appearance_object
    check (jsonb_typeof(appearance_metadata) = 'object'),
  constraint cast_members_sort_order_sane check (sort_order between 0 and 7),
  constraint cast_members_key_unique unique (cast_id, member_key)
);
comment on table sceneflow.cast_members is
  'One recurring subject. member_key is stable for the life of the cast: removing Person B does NOT renumber Person C, because renumbering would repoint every stored scene at a different human being.';

create index if not exists cast_members_cast_idx on sceneflow.cast_members (cast_id, sort_order);

create table if not exists sceneflow.cast_references (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  cast_id           uuid not null references sceneflow.casts(id) on delete cascade,
  cast_member_id    uuid references sceneflow.cast_members(id) on delete set null,
  storage_path      text not null,
  sort_order        integer not null default 0,
  moderation_status sceneflow.moderation_status not null default 'pending',
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint cast_references_path_owner_scoped
    check (storage_path like owner_id::text || '/%'),
  constraint cast_references_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint cast_references_path_unique unique (owner_id, storage_path)
);
comment on table sceneflow.cast_references is
  'Uploaded photographs. Private bucket, signed URLs only. The path is forced under the owner prefix so a row cannot point at another user''s objects.';

create index if not exists cast_references_cast_idx
  on sceneflow.cast_references (cast_id, sort_order);

-- --- Stories and scenes -----------------------------------------------------

create table if not exists sceneflow.stories (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  cast_id          uuid not null references sceneflow.casts(id) on delete cascade,
  title            text not null default 'Untitled story',
  preset_slug      text,
  setting          jsonb not null default '{}'::jsonb,
  style            jsonb not null default '{}'::jsonb,
  intimacy_ceiling sceneflow.intimacy_level not null default 'romantic',
  aspect_ratio     sceneflow.aspect_ratio not null default '4:5',
  status           sceneflow.story_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint stories_title_present check (length(btrim(title)) > 0),
  constraint stories_setting_object check (jsonb_typeof(setting) = 'object'),
  constraint stories_style_object   check (jsonb_typeof(style) = 'object')
);

create index if not exists stories_owner_idx on sceneflow.stories (owner_id, created_at desc);

create table if not exists sceneflow.generation_jobs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  cast_id          uuid not null references sceneflow.casts(id) on delete cascade,
  story_id         uuid references sceneflow.stories(id) on delete set null,
  provider         text not null default 'unconfigured',
  provider_job_id  text,
  generation_type  sceneflow.generation_type not null,
  -- The STRUCTURED request: graph, locks, changes. Never a raw client prompt.
  request_payload  jsonb not null default '{}'::jsonb,
  status           sceneflow.job_status not null default 'queued',
  error_code       text,
  -- Safe to show a user. Never a stack trace, a key or a provider internal.
  error_message    text,
  credit_cost      integer not null default 0,
  -- Refusal against double submission (brief section 59).
  idempotency_key  text not null,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  constraint generation_jobs_payload_object
    check (jsonb_typeof(request_payload) = 'object'),
  constraint generation_jobs_cost_non_negative check (credit_cost >= 0),
  -- Refusal 4. A request we declined to make is free.
  constraint generation_jobs_blocked_is_free
    check (status <> 'blocked' or credit_cost = 0),
  constraint generation_jobs_idempotency_unique unique (owner_id, idempotency_key)
);

create index if not exists generation_jobs_owner_idx
  on sceneflow.generation_jobs (owner_id, created_at desc);
create index if not exists generation_jobs_story_idx
  on sceneflow.generation_jobs (story_id, created_at desc);

create table if not exists sceneflow.scenes (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  story_id            uuid not null references sceneflow.stories(id) on delete cascade,
  scene_number        integer not null,
  -- Branching (brief section 24). A child scene names its parent.
  parent_scene_id     uuid references sceneflow.scenes(id) on delete set null,
  generation_job_id   uuid references sceneflow.generation_jobs(id) on delete set null,
  title               text not null default 'Scene',
  scene_description   text not null default '',
  -- What was actually sent. Not shown to the user by default (section 52), but
  -- kept, because "why did it produce that" is unanswerable without it.
  prompt_snapshot     text,
  continuity_snapshot jsonb not null default '{}'::jsonb,
  spatial_map         jsonb not null default '{}'::jsonb,
  interaction_graph   jsonb not null default '[]'::jsonb,
  -- Member keys rather than the brief's uuid[]: a uuid[] cannot carry a foreign
  -- key, so it would be an unenforceable reference. These are validated against
  -- the story's cast by trigger, which an array of uuids could not be.
  focus_member_keys   sceneflow.member_key[] not null default '{}',
  image_path          text,
  thumbnail_path      text,
  favorite            boolean not null default false,
  status              sceneflow.scene_status not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint scenes_number_positive check (scene_number >= 1),
  constraint scenes_continuity_object check (jsonb_typeof(continuity_snapshot) = 'object'),
  constraint scenes_spatial_object    check (jsonb_typeof(spatial_map) = 'object'),
  constraint scenes_graph_array       check (jsonb_typeof(interaction_graph) = 'array'),
  constraint scenes_image_owner_scoped
    check (image_path is null or image_path like owner_id::text || '/%'),
  constraint scenes_thumbnail_owner_scoped
    check (thumbnail_path is null or thumbnail_path like owner_id::text || '/%'),
  -- Refusal 3. Ready means there is something to look at.
  constraint scenes_ready_has_image
    check (status <> 'ready' or image_path is not null),
  constraint scenes_not_own_parent check (parent_scene_id is null or parent_scene_id <> id)
  -- NO unique (story_id, scene_number). Branching (section 24) means a story
  -- legitimately holds two scene 4s: 4A and 4B, siblings under the same parent.
  -- A uniqueness constraint here would forbid the feature; one written as
  -- (story_id, scene_number, id) would constrain nothing at all, since id is
  -- already unique. Better no constraint than a decorative one.
);

create index if not exists scenes_story_idx on sceneflow.scenes (story_id, scene_number);
create index if not exists scenes_owner_idx on sceneflow.scenes (owner_id, created_at desc);
create index if not exists scenes_parent_idx on sceneflow.scenes (parent_scene_id);
create index if not exists scenes_favorite_idx
  on sceneflow.scenes (owner_id, created_at desc) where favorite;

-- --- Moderation, credits, subscriptions -------------------------------------

create table if not exists sceneflow.moderation_events (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  cast_id            uuid references sceneflow.casts(id) on delete set null,
  scene_id           uuid references sceneflow.scenes(id) on delete set null,
  generation_job_id  uuid references sceneflow.generation_jobs(id) on delete set null,
  moderation_stage   sceneflow.moderation_stage not null,
  result             sceneflow.moderation_result not null,
  reason_codes       text[] not null default '{}',
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  constraint moderation_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);
comment on table sceneflow.moderation_events is
  'Append-only. Deliberately has ZERO grants and ZERO policies for `authenticated`: section 57 forbids exposing internal moderation detail, and a user learns the outcome of their own request from the API response, not by reading this table.';

create index if not exists moderation_events_owner_idx
  on sceneflow.moderation_events (owner_id, created_at desc);

create table if not exists sceneflow.credit_ledger (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  -- Signed. A grant is positive, a debit negative, a refund positive.
  amount            integer not null,
  event_type        sceneflow.credit_event not null,
  generation_job_id uuid references sceneflow.generation_jobs(id) on delete set null,
  description       text not null default '',
  created_at        timestamptz not null default now(),
  constraint credit_ledger_amount_non_zero check (amount <> 0),
  constraint credit_ledger_debit_is_negative
    check (event_type <> 'debit' or amount < 0),
  constraint credit_ledger_credit_is_positive
    check (event_type = 'debit' or amount > 0)
);
comment on table sceneflow.credit_ledger is
  'Append-only and immutable. A refund is a SECOND row, never an edit of the first, so "what did this cost me" always has an auditable answer.';

create index if not exists credit_ledger_owner_idx
  on sceneflow.credit_ledger (owner_id, created_at desc);

create table if not exists sceneflow.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null unique references auth.users(id) on delete cascade,
  revenuecat_customer_id text,
  entitlement            sceneflow.entitlement not null default 'free',
  status                 text not null default 'inactive',
  expires_at             timestamptz,
  updated_at             timestamptz not null default now()
);
comment on table sceneflow.subscriptions is
  'Written only by the RevenueCat webhook on the trusted path. No user-facing write grant exists, so an entitlement cannot be self-awarded.';

-- --- Integrity triggers -----------------------------------------------------

-- Refusal 1, continued. A cast must have at least two members before it can go
-- 'ready', because a "cast" of one is not the product.
create or replace function sceneflow.assert_cast_ready()
returns trigger
language plpgsql
-- search_path is pinned. Migration 0047 exists because a function shipped
-- without it; that lesson is applied here rather than relearned.
set search_path = ''
as $$
declare
  member_count integer;
begin
  if new.status <> 'ready' then
    return new;
  end if;
  select count(*) into member_count
    from sceneflow.cast_members where cast_id = new.id;
  if member_count < 2 then
    raise exception 'a cast needs at least 2 adults before it is ready (has %)', member_count
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists casts_assert_ready on sceneflow.casts;
create trigger casts_assert_ready
  before insert or update on sceneflow.casts
  for each row execute function sceneflow.assert_cast_ready();

-- Refusal 1, continued. A job may not name a cast that is not generatable.
-- Checked here rather than in the edge function because the edge function is
-- one deploy away from being wrong.
create or replace function sceneflow.assert_job_cast_attested()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  select (c.adult_confirmed and c.permission_confirmed and c.status = 'ready')
    into ok
    from sceneflow.casts c where c.id = new.cast_id;
  if not coalesce(ok, false) then
    raise exception 'cast % is not attested and ready; no generation may be recorded against it', new.cast_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists generation_jobs_assert_attested on sceneflow.generation_jobs;
create trigger generation_jobs_assert_attested
  before insert on sceneflow.generation_jobs
  for each row execute function sceneflow.assert_job_cast_attested();

-- A branch must stay inside its own story, and the focus characters must
-- actually be in the cast the story is about. A stale focus key — from a branch
-- taken before someone was removed — would otherwise put a person back into an
-- intimate scene they had been taken out of.
create or replace function sceneflow.assert_scene_coherent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_story uuid;
  stray        sceneflow.member_key;
begin
  if new.parent_scene_id is not null then
    select story_id into parent_story from sceneflow.scenes where id = new.parent_scene_id;
    if parent_story is distinct from new.story_id then
      raise exception 'parent scene % belongs to a different story', new.parent_scene_id
        using errcode = 'check_violation';
    end if;
  end if;

  if array_length(new.focus_member_keys, 1) is not null then
    select k into stray
      from unnest(new.focus_member_keys) as k
     where not exists (
       select 1
         from sceneflow.cast_members m
         join sceneflow.stories s on s.cast_id = m.cast_id
        where s.id = new.story_id and m.member_key = k)
     limit 1;
    if stray is not null then
      raise exception 'focus character % is not in this story''s cast', stray
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists scenes_assert_coherent on sceneflow.scenes;
create trigger scenes_assert_coherent
  before insert or update on sceneflow.scenes
  for each row execute function sceneflow.assert_scene_coherent();

-- Refusal 4, continued. A blocked or failed job never produces a debit.
create or replace function sceneflow.assert_ledger_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  job_status sceneflow.job_status;
begin
  if new.event_type <> 'debit' or new.generation_job_id is null then
    return new;
  end if;
  select status into job_status
    from sceneflow.generation_jobs where id = new.generation_job_id;
  if job_status in ('blocked', 'failed') then
    raise exception 'job % is %; a request that produced nothing cannot be charged for',
      new.generation_job_id, job_status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists credit_ledger_assert_entry on sceneflow.credit_ledger;
create trigger credit_ledger_assert_entry
  before insert on sceneflow.credit_ledger
  for each row execute function sceneflow.assert_ledger_entry();

-- Refusal 5. Append-only, enforced. The absence of an UPDATE/DELETE grant stops
-- `authenticated`; this stops the service-role worker and anything else that
-- bypasses RLS.
create or replace function sceneflow.deny_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%.% is append-only (attempted %)', tg_table_schema, tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists credit_ledger_append_only on sceneflow.credit_ledger;
create trigger credit_ledger_append_only
  before update or delete on sceneflow.credit_ledger
  for each row execute function sceneflow.deny_mutation();

drop trigger if exists moderation_events_append_only on sceneflow.moderation_events;
create trigger moderation_events_append_only
  before update or delete on sceneflow.moderation_events
  for each row execute function sceneflow.deny_mutation();

-- --- updated_at -------------------------------------------------------------

create or replace function sceneflow.touch_updated_at()
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
  foreach t in array array[
    'profiles','casts','cast_members','stories','scenes'
  ]
  loop
    execute format(
      'create trigger %I before update on sceneflow.%I for each row execute function sceneflow.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- --- Row level security -----------------------------------------------------
--
-- Enabled AND forced on every table. Forced matters: without it the table owner
-- role bypasses its own policies, which is what makes "we have RLS" a false
-- statement in so many projects.
--
-- Three grant shapes, and the difference between them IS refusal 2:
--
--   OWNED   — the user's own working data. All four commands.
--   DERIVED — produced by the trusted path. SELECT and DELETE only, so a user
--             can see and destroy their own results but cannot forge one.
--   SEALED  — SELECT only, or nothing at all.

do $$
declare
  t text;
begin
  -- Every table gets RLS enabled and forced, including the sealed ones.
  foreach t in array array[
    'profiles','casts','cast_members','cast_references','stories','scenes',
    'generation_jobs','moderation_events','credit_ledger','subscriptions'
  ]
  loop
    execute format('alter table sceneflow.%I enable row level security', t);
    execute format('alter table sceneflow.%I force row level security', t);
  end loop;

  -- OWNED: the user creates, edits and deletes these.
  foreach t in array array[
    'profiles','casts','cast_members','cast_references','stories'
  ]
  loop
    execute format(
      'create policy %I on sceneflow.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on sceneflow.%I for insert to authenticated with check (owner_id = auth.uid())',
      t || '_insert_own', t);
    execute format(
      'create policy %I on sceneflow.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update_own', t);
    execute format(
      'create policy %I on sceneflow.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete_own', t);
    execute format('grant select, insert, update, delete on sceneflow.%I to authenticated', t);
  end loop;

  -- DERIVED: read and delete your own; never insert, never forge.
  -- `scenes` also carries an UPDATE policy, but the grant behind it is
  -- COLUMN-level and covers `favorite` alone (below). Without the policy the
  -- column grant would be unusable; without the column grant the policy would
  -- let a user rewrite an image path. Both are required, and neither is
  -- sufficient — which is the point.
  foreach t in array array['scenes','generation_jobs']
  loop
    execute format(
      'create policy %I on sceneflow.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on sceneflow.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete_own', t);
    execute format('grant select, delete on sceneflow.%I to authenticated', t);
  end loop;

  create policy scenes_update_favorite on sceneflow.scenes
    for update to authenticated
    using (owner_id = auth.uid()) with check (owner_id = auth.uid());

  -- SEALED (readable): a user must be able to see their own balance and
  -- entitlement, and nothing else about them.
  foreach t in array array['credit_ledger','subscriptions']
  loop
    execute format(
      'create policy %I on sceneflow.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select_own', t);
    execute format('grant select on sceneflow.%I to authenticated', t);
  end loop;
end $$;

-- Favouriting is a user action. Nothing else on a generated scene is, so the
-- UPDATE grant names exactly one column. A user cannot repoint image_path,
-- rewrite a prompt snapshot, or promote a failed scene to 'ready'.
grant update (favorite) on sceneflow.scenes to authenticated;

-- sceneflow.moderation_events deliberately receives NO grant and NO policy for
-- `authenticated`. RLS is enabled and forced above, so with no policy the table
-- is unreadable by any user. This is intentional and is the same shape as
-- social.credentials (0046): a table that exists for the trusted path only.
