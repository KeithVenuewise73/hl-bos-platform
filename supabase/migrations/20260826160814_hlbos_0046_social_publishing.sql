-- ===========================================================================
-- v0_social_publishing — HL Social (Phase 1)
--
-- Publishes APPROVED content from HLVS to Herman Legacy-controlled channels.
-- Own channels only: no client onboarding, no third-party account connection,
-- no public product surface. First consumers: HomeHuddle "Morning Chaos"
-- (Venuewise) and HSCS consulting content.
--
-- Reuses the spine rather than rebuilding it: identity/permissions for access,
-- audit.emit() for the trail, events.emit() for observability, workflows for
-- the human approval gate, storage_meta.files for media bytes. No second
-- tenant model, no second approval engine, no second queue framework.
--
-- SECRETS (deliberate divergence from the Phase 1 brief, in the safer
-- direction): the brief proposed storing the access token and refresh token in
-- `social_credentials`. Every other credential in this platform -- ai,
-- billing, comms, integrations -- is a CHECK-enforced Vault reference, and
-- scripts/check-migrations.sh exists to keep it that way. social.credentials
-- therefore stores the vault REFERENCE plus the expiry METADATA the refresh
-- cron needs, never the token itself. The brief's real requirement -- that the
-- token is unreachable from anon or authenticated -- is met more strongly:
-- RLS is enabled AND forced with ZERO policies and ZERO grants, so the table
-- is unreadable through PostgREST by anyone, platform admin included.
--
-- ANTI-FABRICATION (Principle 10): a tenant can compose, schedule and approve.
-- A tenant can NEVER write external_post_id, published_at, or a success
-- status -- those come only from the trusted worker path, from a real provider
-- response. social.publish_attempts is append-only and trigger-enforced: an
-- attempt row, once written, is immutable evidence of what was actually sent
-- and what actually came back.
--
-- TIKTOK IS NOT PUBLISHING. Phase 1 TikTok is upload-to-inbox only. The video
-- lands in the account's TikTok inbox and a human opens the app and posts it.
-- Calling that "published" would be a lie, so it has its own terminal status,
-- `delivered_to_inbox`, and it is NOT counted as published in the post-level
-- rollup. No UI may claim a TikTok post is live.
--
-- rollback:
--   DROP SCHEMA IF EXISTS social CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'social.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'social.%';
--   DELETE FROM events.subscriptions      WHERE key            LIKE 'social.%';
--   (Additive migration: it creates a new schema and touches no existing
--    table, so dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists social;
comment on schema social is
  'HL-BOS: social publishing to Herman Legacy-owned channels. NOT exposed via PostgREST.';
revoke all on schema social from public, anon, authenticated;
grant usage on schema social to authenticated;
alter default privileges in schema social revoke all on tables from public;
alter default privileges in schema social revoke all on functions from public;

-- --- Types ------------------------------------------------------------------
-- Phase 1 surface only. X/Twitter, LinkedIn organization pages and TikTok
-- direct post are deliberately absent: adding a value here without an adapter
-- would create a target that can never publish.
do $$ begin create type social.platform as enum
  ('facebook_page','instagram','linkedin_member','tiktok_inbox');
  exception when duplicate_object then null; end $$;

do $$ begin create type social.account_status as enum
  ('pending','active','disabled','error');
  exception when duplicate_object then null; end $$;

do $$ begin create type social.credential_status as enum
  ('active','expiring','expired','revoked');
  exception when duplicate_object then null; end $$;

do $$ begin create type social.post_status as enum
  ('draft','pending_approval','approved','publishing','published',
   'partially_published','failed','cancelled');
  exception when duplicate_object then null; end $$;

-- `delivered_to_inbox` is TikTok's terminal success: handed to the account's
-- inbox, NOT live. `published` means the item is publicly visible.
do $$ begin create type social.target_status as enum
  ('pending','scheduled','claimed','published','delivered_to_inbox','failed','cancelled');
  exception when duplicate_object then null; end $$;

do $$ begin create type social.media_kind as enum ('image','video');
  exception when duplicate_object then null; end $$;

-- --- Accounts (the owned channels) ------------------------------------------
create table if not exists social.accounts (
  id                  uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id           uuid not null references platform.tenants(id) on delete cascade,
  platform            social.platform not null,
  external_account_id text not null,      -- FB Page id / IG user id / LI member URN / TikTok open id
  display_name        text not null,
  status              social.account_status not null default 'pending',
  config              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint accounts_external_unique unique (tenant_id, platform, external_account_id),
  constraint accounts_external_id_present check (length(btrim(external_account_id)) > 0),
  -- Instagram cannot publish from a personal account: the API requires a
  -- Professional (Business/Creator) account LINKED to a Facebook Page. That
  -- link is not decoration, it is the publish path, so it is required
  -- structurally rather than assumed. Blocking input #2 in the brief.
  constraint accounts_instagram_requires_linked_page check (
    platform <> 'instagram'
    or (config ? 'facebook_page_id' and length(btrim(config->>'facebook_page_id')) > 0)
  )
);
comment on table social.accounts is
  'Herman Legacy-owned publishing channels. Phase 1 does not onboard client accounts.';
comment on column social.accounts.config is
  'Platform-specific, non-secret settings. Instagram REQUIRES facebook_page_id -- a personal IG account cannot publish via API.';

create index if not exists accounts_tenant_idx on social.accounts (tenant_id, status);

-- --- Credentials (Vault reference + expiry metadata; NEVER a token) ---------
create table if not exists social.credentials (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  account_id        uuid not null unique references social.accounts(id) on delete cascade,
  credential_ref    extensions.citext not null,
  refresh_ref       extensions.citext,
  scopes            text[] not null default '{}',
  status            social.credential_status not null default 'active',
  expires_at        timestamptz,
  last_refreshed_at timestamptz,
  refresh_failed_at timestamptz,
  refresh_error     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Enforce-in-schema: a credential is a Vault reference, never a raw secret.
  constraint credentials_ref_is_vault_ref
    check (credential_ref ~ '^vault:[a-z0-9_./-]{1,120}$'),
  constraint credentials_refresh_is_vault_ref
    check (refresh_ref is null or refresh_ref ~ '^vault:[a-z0-9_./-]{1,120}$')
);
comment on table social.credentials is
  'Vault references + expiry metadata for each channel. NO RLS POLICY AND NO GRANT EXISTS ON THIS TABLE -- it is unreadable through PostgREST by anon, authenticated and platform admins alike. Only SECURITY DEFINER functions and the service-role worker touch it.';
comment on column social.credentials.expires_at is
  'When the access token expires. Meta and LinkedIn tokens run ~60 days; social-token-refresh reads this. NULL = unknown, which the refresh job treats as due.';

create index if not exists credentials_expiry_idx on social.credentials (expires_at)
  where status <> 'revoked';

-- --- Posts (the composed content) -------------------------------------------
create table if not exists social.posts (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  source_module        extensions.citext not null,        -- e.g. 'homehuddle', 'hscs'
  campaign_ref         extensions.citext,                 -- e.g. 'morning_chaos'
  body                 text not null,
  status               social.post_status not null default 'draft',
  scheduled_at         timestamptz,
  approval_instance_id uuid references workflows.instances(id) on delete set null,
  approved_by          uuid references auth.users(id) on delete set null,
  approved_at          timestamptz,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint posts_body_present check (length(btrim(body)) > 0),
  -- Approval is recorded as a pair or not at all: a timestamp with no approver
  -- reads as a human decision that never happened.
  constraint posts_approval_consistent check ((approved_by is null) = (approved_at is null))
);
comment on table social.posts is
  'One composed item, fanned out to one or more targets. Nothing publishes without a human approval decision.';

create index if not exists posts_tenant_idx   on social.posts (tenant_id, status);
create index if not exists posts_campaign_idx on social.posts (tenant_id, campaign_ref);

-- --- Targets (post x account fan-out; the unit of work) ---------------------
create table if not exists social.post_targets (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  post_id          uuid not null references social.posts(id) on delete cascade,
  account_id       uuid not null references social.accounts(id) on delete restrict,
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  caption_override text,
  status           social.target_status not null default 'pending',
  scheduled_at     timestamptz,
  external_post_id text,                 -- trusted worker path only
  permalink        text,                 -- trusted worker path only
  idempotency_key  extensions.citext not null,
  attempts         integer not null default 0,
  max_attempts     integer not null default 5,
  next_attempt_at  timestamptz not null default now(),
  claimed_at       timestamptz,
  claim_token      uuid,
  last_error       text,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint post_targets_unique unique (post_id, account_id),
  -- One retry can never become a second live post.
  constraint post_targets_idempotent unique (tenant_id, idempotency_key),
  constraint post_targets_attempts_sane check (attempts >= 0 and max_attempts >= 1),
  -- A terminal success must carry the provider's own id. Without this a target
  -- could read "published" with nothing to show for it.
  constraint post_targets_success_has_external_id check (
    status not in ('published','delivered_to_inbox') or external_post_id is not null
  ),
  constraint post_targets_published_at_consistent check (
    (published_at is null) = (status not in ('published','delivered_to_inbox'))
  )
);
comment on table social.post_targets is
  'Per-account fan-out. Each target succeeds or fails INDEPENDENTLY -- one platform failing never blocks the other three.';
comment on column social.post_targets.idempotency_key is
  'Stable per target. Replayed to the platform on retry so a duplicate request cannot become a duplicate live post.';

create index if not exists post_targets_due_idx on social.post_targets (next_attempt_at)
  where status in ('scheduled','pending');
create index if not exists post_targets_post_idx   on social.post_targets (post_id);
create index if not exists post_targets_tenant_idx on social.post_targets (tenant_id, status);

-- --- Publish attempts (append-only evidence) --------------------------------
create table if not exists social.publish_attempts (
  id           bigint generated always as identity primary key,
  target_id    uuid not null references social.post_targets(id) on delete cascade,
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  attempt_no   integer not null,
  phase        extensions.citext not null,   -- 'create_container' | 'poll' | 'publish' | 'upload'
  ok           boolean not null,
  http_status  integer,
  request      jsonb,                        -- redacted; never a token
  response     jsonb,                        -- as returned, verbatim
  error        text,
  started_at   timestamptz not null,
  finished_at  timestamptz not null default now(),
  constraint publish_attempts_attempt_no_positive check (attempt_no >= 1)
);
comment on table social.publish_attempts is
  'Append-only. Every request, response and error, success or failure. Rows are immutable -- see social.deny_attempt_mutation().';

create index if not exists publish_attempts_target_idx on social.publish_attempts (target_id, id desc);
create index if not exists publish_attempts_tenant_idx on social.publish_attempts (tenant_id, finished_at desc);

-- Append-only, enforced. The absence of an UPDATE/DELETE grant stops
-- `authenticated`; this stops the service-role worker and anything else that
-- bypasses RLS. Evidence that can be edited is not evidence.
create or replace function social.deny_attempt_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'social.publish_attempts is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end; $$;

drop trigger if exists publish_attempts_append_only on social.publish_attempts;
create trigger publish_attempts_append_only
  before update or delete on social.publish_attempts
  for each row execute function social.deny_attempt_mutation();

-- --- Media assets (Instagram needs a publicly reachable URL) -----------------
create table if not exists social.media_assets (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  post_id       uuid not null references social.posts(id) on delete cascade,
  file_id       uuid references storage_meta.files(id) on delete restrict,
  kind          social.media_kind not null,
  bucket        extensions.citext not null,
  object_path   text not null,
  public_url    text not null,
  mime_type     extensions.citext not null,
  size_bytes    bigint,
  width         integer,
  height        integer,
  duration_secs numeric(10,3),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint media_assets_position_unique unique (post_id, position),
  -- Instagram fetches the bytes itself over the public internet. An http:// or
  -- signed-and-expiring URL fails at container creation, so require https.
  constraint media_assets_public_url_is_https check (public_url ~ '^https://'),
  constraint media_assets_object_path_tenant_scoped
    check (object_path like tenant_id::text || '/%'),
  -- Instagram image publishing accepts JPEG only.
  constraint media_assets_image_is_jpeg check (
    kind <> 'image' or mime_type in ('image/jpeg','image/jpg')
  ),
  constraint media_assets_video_is_mp4 check (
    kind <> 'video' or mime_type in ('video/mp4','video/quicktime')
  )
);
comment on table social.media_assets is
  'Media for a post. public_url must be a durable https URL: Instagram fetches the bytes itself, so a private or expiring URL fails at container creation.';

create index if not exists media_assets_post_idx on social.media_assets (post_id, position);

-- --- Triggers ---------------------------------------------------------------
create trigger accounts_set_updated_at before update on social.accounts
  for each row execute function platform.set_updated_at();
create trigger credentials_set_updated_at before update on social.credentials
  for each row execute function platform.set_updated_at();
create trigger posts_set_updated_at before update on social.posts
  for each row execute function platform.set_updated_at();
create trigger post_targets_set_updated_at before update on social.post_targets
  for each row execute function platform.set_updated_at();

create trigger accounts_audit     after insert or update or delete on social.accounts
  for each row execute function audit.emit();
create trigger posts_audit        after insert or update or delete on social.posts
  for each row execute function audit.emit();
create trigger post_targets_audit after insert or update or delete on social.post_targets
  for each row execute function audit.emit();
-- social.credentials is deliberately NOT audit-emitting a row image: the audit
-- trail stores before/after jsonb, and while the ref is not a secret, the
-- security_event path below records refresh outcomes without copying the row.

-- --- RLS --------------------------------------------------------------------
alter table social.accounts         enable row level security;
alter table social.accounts         force  row level security;
alter table social.credentials      enable row level security;
alter table social.credentials      force  row level security;
alter table social.posts            enable row level security;
alter table social.posts            force  row level security;
alter table social.post_targets     enable row level security;
alter table social.post_targets     force  row level security;
alter table social.publish_attempts enable row level security;
alter table social.publish_attempts force  row level security;
alter table social.media_assets     enable row level security;
alter table social.media_assets     force  row level security;

-- social.credentials: NO POLICY. NOT A LINE OF ONE. Enabled + forced with zero
-- policies denies every row to every role that does not bypass RLS. There is
-- also no grant below. This is the brief's "service-role only, no anon or
-- authenticated policy at all", made absolute.

drop policy if exists accounts_select on social.accounts;
create policy accounts_select on social.accounts for select to authenticated
  using (identity.has_permission(tenant_id, 'social.post.read'));

drop policy if exists posts_select on social.posts;
create policy posts_select on social.posts for select to authenticated
  using (identity.has_permission(tenant_id, 'social.post.read')
         or identity.is_platform_admin());

drop policy if exists post_targets_select on social.post_targets;
create policy post_targets_select on social.post_targets for select to authenticated
  using (identity.has_permission(tenant_id, 'social.post.read')
         or identity.is_platform_admin());

drop policy if exists publish_attempts_select on social.publish_attempts;
create policy publish_attempts_select on social.publish_attempts for select to authenticated
  using (identity.has_permission(tenant_id, 'social.post.read')
         or identity.is_platform_admin());

drop policy if exists media_assets_select on social.media_assets;
create policy media_assets_select on social.media_assets for select to authenticated
  using (identity.has_permission(tenant_id, 'social.post.read'));

-- SELECT only. No INSERT/UPDATE/DELETE grant or policy anywhere in this schema:
-- every write goes through a SECURITY DEFINER function that checks a
-- permission. That is what makes "a tenant cannot fabricate a published post"
-- structural rather than a convention.
grant select on social.accounts, social.posts, social.post_targets,
                social.publish_attempts, social.media_assets to authenticated;

-- ===========================================================================
-- Tenant-facing write paths (permission-gated SECURITY DEFINER)
-- ===========================================================================

-- --- Channel registration ---------------------------------------------------
create or replace function social.upsert_account(
  p_tenant uuid, p_platform social.platform, p_external_id text,
  p_display_name text, p_config jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'social.account.manage') then
    raise exception 'insufficient privilege to manage a social account'
      using errcode = 'insufficient_privilege';
  end if;
  insert into social.accounts (tenant_id, platform, external_account_id, display_name, config, status)
  values (p_tenant, p_platform, p_external_id, p_display_name,
          coalesce(p_config, '{}'::jsonb), 'pending')
  on conflict (tenant_id, platform, external_account_id) do update
    set display_name = excluded.display_name,
        config       = excluded.config,
        updated_at   = now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function social.upsert_account(uuid, social.platform, text, text, jsonb) from public, anon;
grant execute on function social.upsert_account(uuid, social.platform, text, text, jsonb) to authenticated;

-- --- Compose ----------------------------------------------------------------
create or replace function social.create_post(
  p_tenant uuid, p_module extensions.citext, p_body text,
  p_campaign extensions.citext default null, p_scheduled_at timestamptz default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'social.post.create') then
    raise exception 'insufficient privilege to compose a social post'
      using errcode = 'insufficient_privilege';
  end if;
  insert into social.posts (tenant_id, source_module, campaign_ref, body, scheduled_at, created_by)
  values (p_tenant, p_module, p_campaign, p_body, p_scheduled_at, auth.uid())
  returning id into v_id;
  perform events.emit('social.post.created', p_tenant,
    jsonb_build_object('post', v_id, 'module', p_module, 'campaign', p_campaign));
  return v_id;
end; $$;
revoke all on function social.create_post(uuid, extensions.citext, text, extensions.citext, timestamptz) from public, anon;
grant execute on function social.create_post(uuid, extensions.citext, text, extensions.citext, timestamptz) to authenticated;

-- --- Fan out to a channel ---------------------------------------------------
-- The idempotency key is DERIVED, never supplied: a caller-chosen key could
-- collide by accident and suppress a real post, or be reused deliberately.
create or replace function social.add_target(
  p_post uuid, p_account uuid, p_caption text default null,
  p_scheduled_at timestamptz default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_post_status social.post_status; v_acct_tenant uuid;
        v_acct_status social.account_status; v_id uuid;
begin
  select tenant_id, status into v_tenant, v_post_status from social.posts where id = p_post;
  if not found then raise exception 'post % not found', p_post using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'social.post.create') then
    raise exception 'insufficient privilege to add a target'
      using errcode = 'insufficient_privilege';
  end if;
  -- Targets are fixed before the human approves. Adding a channel after the
  -- approval would publish to somewhere nobody signed off on.
  if v_post_status <> 'draft' then
    raise exception 'targets can only be added while the post is a draft (status is %)', v_post_status
      using errcode = 'check_violation';
  end if;

  select tenant_id, status into v_acct_tenant, v_acct_status from social.accounts where id = p_account;
  if not found then raise exception 'account % not found', p_account using errcode = 'no_data_found'; end if;
  -- Structural cross-tenant block: one tenant can never publish through
  -- another tenant's channel.
  if v_acct_tenant <> v_tenant then
    raise exception 'account belongs to a different tenant' using errcode = 'insufficient_privilege';
  end if;
  if v_acct_status = 'disabled' then
    raise exception 'account is disabled' using errcode = 'check_violation';
  end if;

  insert into social.post_targets (post_id, account_id, tenant_id, caption_override, scheduled_at, idempotency_key)
  values (p_post, p_account, v_tenant, p_caption,
          coalesce(p_scheduled_at, (select scheduled_at from social.posts where id = p_post)),
          ('post_' || p_post::text || '_acct_' || p_account::text)::extensions.citext)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function social.add_target(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function social.add_target(uuid, uuid, text, timestamptz) to authenticated;

-- --- Attach media -----------------------------------------------------------
create or replace function social.attach_media(
  p_post uuid, p_kind social.media_kind, p_bucket extensions.citext, p_object_path text,
  p_public_url text, p_mime extensions.citext, p_position integer default 0,
  p_file uuid default null, p_size_bytes bigint default null,
  p_width integer default null, p_height integer default null,
  p_duration_secs numeric default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status social.post_status; v_id uuid;
begin
  select tenant_id, status into v_tenant, v_status from social.posts where id = p_post;
  if not found then raise exception 'post % not found', p_post using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'social.post.create') then
    raise exception 'insufficient privilege to attach media'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'draft' then
    raise exception 'media can only be attached while the post is a draft (status is %)', v_status
      using errcode = 'check_violation';
  end if;
  insert into social.media_assets (tenant_id, post_id, file_id, kind, bucket, object_path,
    public_url, mime_type, size_bytes, width, height, duration_secs, position)
  values (v_tenant, p_post, p_file, p_kind, p_bucket, p_object_path, p_public_url, p_mime,
          p_size_bytes, p_width, p_height, p_duration_secs, p_position)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function social.attach_media(uuid, social.media_kind, extensions.citext, text, text, extensions.citext, integer, uuid, bigint, integer, integer, numeric) from public, anon;
grant execute on function social.attach_media(uuid, social.media_kind, extensions.citext, text, text, extensions.citext, integer, uuid, bigint, integer, integer, numeric) to authenticated;

-- --- The approval gate ------------------------------------------------------
create or replace function social.submit_for_approval(p_post uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status social.post_status; v_targets integer; v_instance uuid;
begin
  select tenant_id, status into v_tenant, v_status from social.posts where id = p_post;
  if not found then raise exception 'post % not found', p_post using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'social.post.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'draft' then
    raise exception 'only a draft can be submitted for approval (status is %)', v_status
      using errcode = 'check_violation';
  end if;
  select count(*) into v_targets from social.post_targets where post_id = p_post;
  if v_targets = 0 then
    raise exception 'a post with no target cannot be approved' using errcode = 'check_violation';
  end if;
  v_instance := workflows.request_approval(v_tenant, 'social.post.publish', 'social.post', p_post::text, 'tenant_admin');
  update social.posts set status = 'pending_approval', approval_instance_id = v_instance where id = p_post;
  perform events.emit('social.post.submitted', v_tenant, jsonb_build_object('post', p_post, 'targets', v_targets));
  return v_instance;
end; $$;
revoke all on function social.submit_for_approval(uuid) from public, anon;
grant execute on function social.submit_for_approval(uuid) to authenticated;

-- Approval is a HUMAN decision recorded in workflows. This function refuses to
-- act unless that decision already exists -- it cannot manufacture one.
create or replace function social.approve_post(p_post uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid; v_status social.post_status;
begin
  select tenant_id, approval_instance_id, status into v_tenant, v_instance, v_status
    from social.posts where id = p_post;
  if not found then raise exception 'post % not found', p_post using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'social.publication.manage') then
    raise exception 'insufficient privilege to approve a social post'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'pending_approval' then
    raise exception 'post is not awaiting approval (status is %)', v_status
      using errcode = 'check_violation';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'post is not approved by a human reviewer'
      using errcode = 'insufficient_privilege';
  end if;

  update social.posts
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_post;
  -- Only now do the targets become due work for the worker.
  update social.post_targets
     set status = 'scheduled',
         next_attempt_at = coalesce(scheduled_at, now())
   where post_id = p_post and status = 'pending';
  perform events.emit('social.post.approved', v_tenant, jsonb_build_object('post', p_post));
end; $$;
revoke all on function social.approve_post(uuid) from public, anon;
grant execute on function social.approve_post(uuid) to authenticated;

create or replace function social.cancel_post(p_post uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from social.posts where id = p_post;
  if not found then raise exception 'post % not found', p_post using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'social.publication.manage') then
    raise exception 'insufficient privilege to cancel a social post'
      using errcode = 'insufficient_privilege';
  end if;
  -- Already-live targets are NOT cancelled: this platform does not pretend it
  -- can un-publish something a provider has already made public.
  update social.post_targets set status = 'cancelled'
   where post_id = p_post and status in ('pending','scheduled');
  update social.posts set status = 'cancelled'
   where id = p_post and status in ('draft','pending_approval','approved');
  perform events.emit('social.post.cancelled', v_tenant, jsonb_build_object('post', p_post));
end; $$;
revoke all on function social.cancel_post(uuid) from public, anon;
grant execute on function social.cancel_post(uuid) to authenticated;

-- ===========================================================================
-- Trusted worker path
--
-- Authorization here is the EXECUTE grant itself: revoked from public, anon
-- and authenticated, granted to service_role only. This mirrors
-- events.claim_deliveries / events.complete_delivery (migration 0021). These
-- are not client-callable RPCs, and no permission check inside them could make
-- them safe to expose -- they are the only path that can write a success.
-- ===========================================================================

-- --- Claim due targets (concurrency-safe) -----------------------------------
-- FOR UPDATE SKIP LOCKED: two worker invocations overlapping cannot claim the
-- same target, so a minute cron that runs long never double-posts. A worker
-- that dies mid-flight leaves claimed_at set; social.release_stale_claims()
-- below returns it to the queue after a grace period rather than leaving it
-- stuck forever.
create or replace function social.claim_targets(p_limit integer default 10)
returns table (
  target_id uuid, post_id uuid, tenant_id uuid, platform social.platform,
  external_account_id text, account_config jsonb, credential_ref extensions.citext,
  body text, caption text, attempt_no integer, idempotency_key extensions.citext,
  media jsonb)
language plpgsql volatile security definer set search_path = '' as $$
begin
  return query
  with due as (
    select t.id
    from social.post_targets t
    join social.posts p    on p.id = t.post_id
    join social.accounts a on a.id = t.account_id
    join social.credentials c on c.account_id = a.id
    where t.status = 'scheduled'
      and t.claimed_at is null
      and t.next_attempt_at <= now()
      and t.attempts < t.max_attempts
      and p.status in ('approved','publishing')
      and a.status = 'active'
      and c.status <> 'revoked'
    order by t.next_attempt_at, t.id
    for update of t skip locked
    limit greatest(p_limit, 1)
  ),
  claimed as (
    update social.post_targets t
       set status      = 'claimed',
           claimed_at  = now(),
           claim_token = pg_catalog.gen_random_uuid(),
           attempts    = t.attempts + 1
      from due
     where t.id = due.id
     returning t.id, t.post_id, t.tenant_id, t.account_id, t.caption_override,
               t.attempts, t.idempotency_key
  )
  select cl.id, cl.post_id, cl.tenant_id, a.platform, a.external_account_id, a.config,
         cr.credential_ref, p.body, coalesce(cl.caption_override, p.body), cl.attempts,
         cl.idempotency_key,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'kind', m.kind, 'public_url', m.public_url,
                    'mime_type', m.mime_type, 'position', m.position)
                  order by m.position)
           from social.media_assets m where m.post_id = cl.post_id
         ), '[]'::jsonb)
  from claimed cl
  join social.posts p     on p.id = cl.post_id
  join social.accounts a  on a.id = cl.account_id
  join social.credentials cr on cr.account_id = a.id
  order by cl.id;
end; $$;
comment on function social.claim_targets(integer) is
  'Claims due targets with FOR UPDATE SKIP LOCKED and returns everything the worker needs, including the Vault REFERENCE (never the token). Marks the post publishing. service_role only.';
revoke all on function social.claim_targets(integer) from public, anon, authenticated;
grant execute on function social.claim_targets(integer) to service_role;

-- --- Append one attempt (immutable evidence) --------------------------------
create or replace function social.record_attempt(
  p_target uuid, p_phase extensions.citext, p_ok boolean, p_started_at timestamptz,
  p_http_status integer default null, p_request jsonb default null,
  p_response jsonb default null, p_error text default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_attempt integer; v_id bigint;
begin
  select tenant_id, attempts into v_tenant, v_attempt from social.post_targets where id = p_target;
  if not found then raise exception 'target % not found', p_target using errcode = 'no_data_found'; end if;
  insert into social.publish_attempts (target_id, tenant_id, attempt_no, phase, ok,
    http_status, request, response, error, started_at)
  values (p_target, v_tenant, greatest(v_attempt, 1), p_phase, p_ok,
          p_http_status, p_request, p_response, left(p_error, 4000), p_started_at)
  returning id into v_id;
  return v_id;
end; $$;
comment on function social.record_attempt(uuid, extensions.citext, boolean, timestamptz, integer, jsonb, jsonb, text) is
  'Appends one attempt row. The worker must redact credentials from p_request before calling -- the row is immutable afterwards.';
revoke all on function social.record_attempt(uuid, extensions.citext, boolean, timestamptz, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function social.record_attempt(uuid, extensions.citext, boolean, timestamptz, integer, jsonb, jsonb, text) to service_role;

-- --- Post-level rollup (internal) -------------------------------------------
-- Honest by construction: `published` requires that every counted target is
-- actually live. A TikTok inbox delivery is a SUCCESS but is NOT a publication,
-- so a post whose only successes are inbox deliveries never reads `published`.
create or replace function social.refresh_post_status(p_post uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_open integer; v_live integer; v_inbox integer; v_failed integer; v_tenant uuid;
begin
  select p.tenant_id into v_tenant from social.posts p where p.id = p_post;
  if not found then return; end if;

  select count(*) filter (where t.status in ('pending','scheduled','claimed')),
         count(*) filter (where t.status = 'published'),
         count(*) filter (where t.status = 'delivered_to_inbox'),
         count(*) filter (where t.status = 'failed')
    into v_open, v_live, v_inbox, v_failed
    from social.post_targets t where t.post_id = p_post;

  if v_open > 0 then
    update social.posts set status = 'publishing' where id = p_post and status in ('approved','publishing');
    return;
  end if;

  update social.posts
     set status = case
                    when v_live + v_inbox = 0 and v_failed > 0 then 'failed'
                    when v_failed > 0                          then 'partially_published'
                    when v_inbox > 0 and v_live = 0            then 'partially_published'
                    when v_live > 0 and v_inbox > 0            then 'partially_published'
                    when v_live > 0                            then 'published'
                    else status
                  end
   where id = p_post and status in ('approved','publishing');

  perform events.emit('social.post.settled', v_tenant, jsonb_build_object(
    'post', p_post, 'published', v_live, 'delivered_to_inbox', v_inbox, 'failed', v_failed));
end; $$;
revoke all on function social.refresh_post_status(uuid) from public, anon, authenticated;
grant execute on function social.refresh_post_status(uuid) to service_role;

-- --- Complete one target ----------------------------------------------------
-- Per-target and independent: this function touches exactly one target and
-- then recomputes the post's rollup. A failure on one platform can never
-- prevent, delay, or roll back another platform's success.
create or replace function social.complete_target(
  p_target uuid, p_status social.target_status,
  p_external_post_id text default null, p_permalink text default null,
  p_error text default null, p_terminal boolean default false)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_post uuid; v_attempts integer; v_max integer; v_platform social.platform;
begin
  select t.tenant_id, t.post_id, t.attempts, t.max_attempts, a.platform
    into v_tenant, v_post, v_attempts, v_max, v_platform
    from social.post_targets t join social.accounts a on a.id = t.account_id
   where t.id = p_target;
  if not found then raise exception 'target % not found', p_target using errcode = 'no_data_found'; end if;

  if p_status in ('published','delivered_to_inbox') then
    if p_external_post_id is null or length(btrim(p_external_post_id)) = 0 then
      raise exception 'a successful target must carry the provider''s own id'
        using errcode = 'check_violation';
    end if;
    -- Phase 1 TikTok is inbox-only. A tiktok_inbox target reporting `published`
    -- would be claiming a public post that upload-to-inbox never makes.
    if v_platform = 'tiktok_inbox' and p_status <> 'delivered_to_inbox' then
      raise exception 'a tiktok_inbox target cannot be published; it can only be delivered to the inbox'
        using errcode = 'check_violation';
    end if;
    if v_platform <> 'tiktok_inbox' and p_status = 'delivered_to_inbox' then
      raise exception 'delivered_to_inbox applies only to tiktok_inbox targets'
        using errcode = 'check_violation';
    end if;

    update social.post_targets
       set status = p_status, external_post_id = p_external_post_id, permalink = p_permalink,
           published_at = now(), claimed_at = null, claim_token = null, last_error = null
     where id = p_target;
    perform events.emit(('social.target.' || p_status::text)::extensions.citext, v_tenant,
      jsonb_build_object('target', p_target, 'post', v_post, 'platform', v_platform,
                         'external_post_id', p_external_post_id));

  elsif p_status = 'failed' then
    -- p_terminal is the AMBIGUOUS-OUTCOME safeguard. Facebook, Instagram,
    -- LinkedIn and TikTok have no idempotency header on these endpoints, so a
    -- request that times out mid-flight may or may not have created a live
    -- post. Retrying it is how one scheduled item becomes two live ones. The
    -- worker therefore ends such a target terminally and says so, and a human
    -- checks the channel. Failing visibly beats double-posting silently.
    if p_terminal or v_attempts >= v_max then
      update social.post_targets
         set status = 'failed', claimed_at = null, claim_token = null,
             last_error = left(coalesce(p_error, ''), 4000)
       where id = p_target;
      perform events.emit('social.target.failed', v_tenant,
        jsonb_build_object('target', p_target, 'post', v_post, 'platform', v_platform,
                           'attempts', v_attempts, 'terminal_early', p_terminal,
                           'error', left(coalesce(p_error,''), 500)));
    else
      -- Back to the queue with exponential backoff. Still 'scheduled', so the
      -- other targets of this post are entirely unaffected.
      update social.post_targets
         set status = 'scheduled', claimed_at = null, claim_token = null,
             last_error = left(coalesce(p_error, ''), 4000),
             next_attempt_at = now() + pg_catalog.make_interval(secs => 60 * pg_catalog.power(2, v_attempts - 1))
       where id = p_target;
    end if;

  elsif p_status = 'cancelled' then
    update social.post_targets
       set status = 'cancelled', claimed_at = null, claim_token = null,
           last_error = left(coalesce(p_error, ''), 4000)
     where id = p_target;
  else
    raise exception 'complete_target does not accept status %', p_status
      using errcode = 'check_violation';
  end if;

  perform social.refresh_post_status(v_post);
end; $$;
revoke all on function social.complete_target(uuid, social.target_status, text, text, text, boolean) from public, anon, authenticated;
grant execute on function social.complete_target(uuid, social.target_status, text, text, text, boolean) to service_role;

-- --- Release stale claims ---------------------------------------------------
-- A worker killed mid-publish leaves a claim behind. Without this the target
-- is stuck forever and nothing says so. The grace period is deliberately
-- longer than any single publish (Instagram container polling is the slowest).
create or replace function social.release_stale_claims(p_grace_minutes integer default 15)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  update social.post_targets
     set status = 'scheduled', claimed_at = null, claim_token = null,
         last_error = 'worker claim expired without an outcome',
         next_attempt_at = now()
   where status = 'claimed'
     and claimed_at < now() - pg_catalog.make_interval(mins => greatest(p_grace_minutes, 1));
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform audit.log_security_event('social.claim.expired', 'denied', 'warning',
      null, 'social.post_targets', null, jsonb_build_object('released', v_count));
  end if;
  return v_count;
end; $$;
revoke all on function social.release_stale_claims(integer) from public, anon, authenticated;
grant execute on function social.release_stale_claims(integer) to service_role;

-- ===========================================================================
-- Credential lifecycle — the failure this module is built around
--
-- Meta and LinkedIn access tokens run roughly 60 days. The most common
-- production failure in these integrations is an expired token that fails
-- SILENTLY: nothing errors loudly, posts simply stop, and the first person to
-- notice is the client. That is why the refresh path exists before a single
-- publish call, and why a refresh failure writes a security event rather than
-- a log line nobody reads.
-- ===========================================================================

-- Registers or rotates the Vault REFERENCE for a channel. The token itself is
-- put into Vault out of band; this records only where it lives and when it
-- dies. service_role only -- granting a credential is a trust decision, not a
-- tenant-user action.
create or replace function social.set_credential(
  p_account uuid, p_credential_ref extensions.citext, p_expires_at timestamptz default null,
  p_refresh_ref extensions.citext default null, p_scopes text[] default '{}')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from social.accounts where id = p_account) then
    raise exception 'account % not found', p_account using errcode = 'no_data_found';
  end if;
  insert into social.credentials (account_id, credential_ref, refresh_ref, scopes, expires_at,
                                  status, last_refreshed_at)
  values (p_account, p_credential_ref, p_refresh_ref, coalesce(p_scopes, '{}'), p_expires_at,
          'active', now())
  on conflict (account_id) do update
    set credential_ref    = excluded.credential_ref,
        refresh_ref       = excluded.refresh_ref,
        scopes            = excluded.scopes,
        expires_at        = excluded.expires_at,
        status            = 'active',
        last_refreshed_at = now(),
        refresh_failed_at = null,
        refresh_error     = null
  returning id into v_id;
  -- A channel is only publishable once it actually has a credential.
  update social.accounts set status = 'active' where id = p_account and status = 'pending';
  return v_id;
end; $$;
revoke all on function social.set_credential(uuid, extensions.citext, timestamptz, extensions.citext, text[]) from public, anon, authenticated;
grant execute on function social.set_credential(uuid, extensions.citext, timestamptz, extensions.citext, text[]) to service_role;

-- Everything expiring inside the window, plus anything whose expiry is
-- UNKNOWN. A null expires_at is treated as due precisely because "we don't
-- know" must not read as "we're fine".
create or replace function social.credentials_due_for_refresh(p_within_days integer default 14)
returns table (
  account_id uuid, tenant_id uuid, platform social.platform, display_name text,
  credential_ref extensions.citext, refresh_ref extensions.citext, expires_at timestamptz,
  days_remaining numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select a.id, a.tenant_id, a.platform, a.display_name, c.credential_ref, c.refresh_ref, c.expires_at,
         case when c.expires_at is null then null
              else round(extract(epoch from (c.expires_at - now())) / 86400.0, 2) end
  from social.credentials c
  join social.accounts a on a.id = c.account_id
  where c.status <> 'revoked'
    and a.status <> 'disabled'
    and (c.expires_at is null
         or c.expires_at <= now() + pg_catalog.make_interval(days => greatest(p_within_days, 1)))
  order by c.expires_at nulls first, a.id;
end; $$;
revoke all on function social.credentials_due_for_refresh(integer) from public, anon, authenticated;
grant execute on function social.credentials_due_for_refresh(integer) to service_role;

-- Records the OUTCOME of a refresh. Success moves expires_at forward; failure
-- is loud -- a security event at warning severity plus a platform event, and
-- the credential is marked expiring/expired so claim_targets stops handing it
-- to the worker once it is genuinely dead.
create or replace function social.record_credential_refresh(
  p_account uuid, p_ok boolean, p_expires_at timestamptz default null, p_error text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_platform social.platform; v_name text;
begin
  select a.tenant_id, a.platform, a.display_name into v_tenant, v_platform, v_name
    from social.accounts a where a.id = p_account;
  if not found then raise exception 'account % not found', p_account using errcode = 'no_data_found'; end if;

  if p_ok then
    update social.credentials
       set expires_at = coalesce(p_expires_at, expires_at), status = 'active',
           last_refreshed_at = now(), refresh_failed_at = null, refresh_error = null
     where account_id = p_account;
    perform events.emit('social.credential.refreshed', v_tenant,
      jsonb_build_object('account', p_account, 'platform', v_platform, 'expires_at', p_expires_at));
  else
    update social.credentials
       set status = (case when expires_at is not null and expires_at <= now() then 'expired'
                          else 'expiring' end)::social.credential_status,
           refresh_failed_at = now(), refresh_error = left(coalesce(p_error, ''), 2000)
     where account_id = p_account;
    -- Loud on purpose. A silent refresh failure is exactly the production
    -- failure this whole module was ordered around.
    perform audit.log_security_event('social.credential.refresh_failed', 'denied', 'warning',
      v_tenant, 'social.accounts', p_account::text,
      jsonb_build_object('platform', v_platform, 'account_name', v_name,
                         'error', left(coalesce(p_error, ''), 500)));
    perform events.emit('social.credential.refresh_failed', v_tenant,
      jsonb_build_object('account', p_account, 'platform', v_platform,
                         'error', left(coalesce(p_error, ''), 500)));
  end if;
end; $$;
revoke all on function social.record_credential_refresh(uuid, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function social.record_credential_refresh(uuid, boolean, timestamptz, text) to service_role;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('social.post.read',      'Read a tenant''s social posts, targets and publish history.', 'tenant'),
  ('social.post.create',    'Compose social posts and choose their target channels.', 'tenant'),
  ('social.publication.manage', 'Approve or cancel a social post before it publishes.', 'tenant'),
  ('social.account.manage', 'Register and configure the tenant''s owned social channels.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','social.post.read'),   ('tenant_owner','social.post.create'),
  ('tenant_owner','social.publication.manage'),('tenant_owner','social.account.manage'),
  ('tenant_admin','social.post.read'),   ('tenant_admin','social.post.create'),
  ('tenant_admin','social.publication.manage'),('tenant_admin','social.account.manage'),
  ('manager','social.post.read'),        ('manager','social.post.create'),
  ('staff','social.post.read'),
  ('viewer','social.post.read')
on conflict do nothing;
-- Deliberate: `manager` may compose but NOT approve, and `staff`/`viewer` may
-- only read. Publishing to an owned Herman Legacy channel is a brand decision.
