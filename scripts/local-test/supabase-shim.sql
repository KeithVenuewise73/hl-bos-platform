-- ---------------------------------------------------------------------------
-- LOCAL TEST HARNESS ONLY. NOT A MIGRATION. NEVER APPLIED TO ANY SUPABASE
-- PROJECT.
--
-- Recreates the parts of a Supabase database that our migrations and tests
-- depend on, so pgTAP can run against a plain PostgreSQL 17.6 in environments
-- without Docker (CI uses `supabase start`, which provides these for real).
--
-- Everything here is emulation. If it drifts from real Supabase, CI catches it:
-- the same test files run against the real stack via `supabase test db`.
-- ---------------------------------------------------------------------------

-- Supabase roles. NOLOGIN; reached via SET ROLE, as PostgREST does.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then
    -- Matches production: verified rolbypassrls=true on the live project.
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant service_role to postgres;   -- mirrors production pg_auth_members
-- NOTE: postgres is NOT granted to service_role. Verified absent in production.
-- Test 48 depends on that asymmetry.

-- auth schema, as Supabase provisions it.
create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default pg_catalog.gen_random_uuid(),
  email               text,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  is_sso_user         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Mirrors real Supabase exactly. Verified against the live project:
--   CREATE UNIQUE INDEX users_email_partial_key
--     ON auth.users USING btree (email) WHERE (is_sso_user = false)
--
-- It is PARTIAL: an SSO user and a password user MAY share an address, which
-- is why bootstrap_first_platform_owner's "ambiguous user" branch is reachable
-- in production rather than merely defensive.
--
-- This index was missing from the shim, and that omission is what let a test
-- pass locally and fail in CI: the test created two non-SSO users with the same
-- email, which real Supabase rejects. The shim is emulation, and this is
-- precisely the drift it is capable of hiding.
create unique index if not exists users_email_partial_key
  on auth.users (email) where (is_sso_user = false);

-- Supabase's auth.uid(): the 'sub' claim of the request JWT.
-- Tests impersonate a user by setting request.jwt.claims, exactly as PostgREST
-- does per request.
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role() returns text
  language sql stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
