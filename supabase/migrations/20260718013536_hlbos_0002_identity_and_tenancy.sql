-- ===========================================================================
-- hlbos_0002_identity_and_tenancy
--
-- Tenants, profiles, memberships, invitations.
--
-- RLS IS ENABLED AND FORCED HERE, WITH ZERO POLICIES. That is deliberate and
-- is the resolution to a real circular dependency: these tables' policies need
-- identity.has_permission(), which needs the role tables in 0003, which need
-- platform.tenants from here.
--
-- In PostgreSQL, RLS enabled with no policy DENIES ALL ACCESS to non-owner,
-- non-BYPASSRLS roles. So the state between 0002 and 0003 fails CLOSED: these
-- tables exist and are completely unreachable by anon and authenticated.
-- 0003 then adds every policy at once against a complete permission model.
--
-- Design: docs/operations/phase-2-migration-set.md section 4
--
-- rollback:
--   DROP TABLE IF EXISTS identity.invitations CASCADE;
--   DROP TABLE IF EXISTS identity.memberships CASCADE;
--   DROP TABLE IF EXISTS identity.profiles CASCADE;
--   DROP TABLE IF EXISTS platform.tenants CASCADE;
--   DROP TYPE  IF EXISTS identity.invitation_status;
--   DROP TYPE  IF EXISTS identity.membership_status;
--   DROP TYPE  IF EXISTS platform.tenant_status;
-- ===========================================================================

-- --- Enums -----------------------------------------------------------------
do $$ begin
  create type platform.tenant_status as enum ('trial','active','suspended','deactivated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type identity.membership_status as enum ('invited','active','suspended','removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type identity.invitation_status as enum ('pending','accepted','revoked','expired');
exception when duplicate_object then null; end $$;

-- --- platform.tenants ------------------------------------------------------
create table if not exists platform.tenants (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  slug            extensions.citext not null,
  name            text not null,
  status          platform.tenant_status not null default 'trial',
  branding        jsonb not null default '{}'::jsonb,
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  deactivated_at  timestamptz,

  constraint tenants_slug_unique unique (slug),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  constraint tenants_name_not_blank check (length(btrim(name)) > 0),
  -- status and timestamp cannot disagree
  constraint tenants_deactivated_consistent
    check ((status = 'deactivated') = (deactivated_at is not null))
);

comment on table platform.tenants is
  'A customer organisation. Soft-deactivation only -- no DELETE policy exists for any role.';

create trigger tenants_set_updated_at
  before update on platform.tenants
  for each row execute function platform.set_updated_at();

-- --- identity.profiles -----------------------------------------------------
create table if not exists identity.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  display_name       text,
  avatar_url         text,
  default_tenant_id  uuid references platform.tenants(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table identity.profiles is
  'Profile data for an auth.users row. PK IS auth.users.id -- no second user table, no second password system.';
comment on column identity.profiles.default_tenant_id is
  'UI convenience: which tenant to land on. NOT an authorization input -- no policy reads this column.';

create trigger profiles_set_updated_at
  before update on identity.profiles
  for each row execute function platform.set_updated_at();

-- --- identity.memberships --------------------------------------------------
create table if not exists identity.memberships (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      identity.membership_status not null default 'invited',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,

  constraint memberships_tenant_user_unique unique (tenant_id, user_id)
);

comment on table identity.memberships is
  'Links an auth.users row to a tenant. One row per (tenant, user).';

-- Every RLS check on every table in the platform traverses this index.
create index if not exists memberships_active_by_user_idx
  on identity.memberships (user_id) where status = 'active';
create index if not exists memberships_tenant_idx
  on identity.memberships (tenant_id);

create trigger memberships_set_updated_at
  before update on identity.memberships
  for each row execute function platform.set_updated_at();

-- --- identity.invitations --------------------------------------------------
create table if not exists identity.invitations (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  email                extensions.citext not null,
  role_key             extensions.citext not null,   -- FK added in 0003 (identity.roles)
  token_selector       text not null,
  token_verifier_hash  text not null,
  status               identity.invitation_status not null default 'pending',
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  invited_by           uuid references auth.users(id) on delete set null,
  accepted_by          uuid references auth.users(id) on delete set null,
  accepted_at          timestamptz,

  constraint invitations_selector_unique unique (token_selector),
  constraint invitations_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint invitations_expiry_after_creation check (expires_at > created_at),
  constraint invitations_accepted_consistent check ((status = 'accepted') = (accepted_at is not null)),
  -- fixed-width sha256 hex. Load-bearing: identity.ct_eq compares equal-length
  -- inputs, so its length branch leaks nothing about the secret.
  constraint invitations_verifier_hash_is_sha256_hex
    check (token_verifier_hash ~ '^[0-9a-f]{64}$')
);

comment on table identity.invitations is
  'Pending invitations. The RAW TOKEN IS NEVER STORED. token_selector is a non-secret lookup key; token_verifier_hash is sha256 of the secret verifier. See accept_invitation() in 0006.';
comment on column identity.invitations.token_selector is
  'Non-secret. Indexed. Finding a row by this leaks no timing information about the secret.';
comment on column identity.invitations.token_verifier_hash is
  'sha256(verifier), hex. The verifier itself is never stored. Compared via identity.ct_eq (no early exit).';

-- One live invitation per address per tenant.
create unique index if not exists invitations_one_pending_per_email_idx
  on identity.invitations (tenant_id, email) where status = 'pending';
create index if not exists invitations_tenant_idx
  on identity.invitations (tenant_id);

create trigger invitations_set_updated_at
  before update on identity.invitations
  for each row execute function platform.set_updated_at();

-- --- RLS: enabled + FORCED, with NO policies -------------------------------
-- FORCE also subjects the table OWNER to RLS. Without it, an owner-context bug
-- would silently read across tenants. It does not (and cannot) constrain roles
-- with BYPASSRLS -- that is what the audit immutability trigger in 0004 is for.
alter table platform.tenants     enable row level security;
alter table platform.tenants     force  row level security;
alter table identity.profiles    enable row level security;
alter table identity.profiles    force  row level security;
alter table identity.memberships enable row level security;
alter table identity.memberships force  row level security;
alter table identity.invitations enable row level security;
alter table identity.invitations force  row level security;

-- No policies yet -> deny all. Intentional. 0003 adds them all at once.
