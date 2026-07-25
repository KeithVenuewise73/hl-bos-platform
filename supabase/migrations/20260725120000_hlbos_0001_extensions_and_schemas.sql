-- ===========================================================================
-- hlbos_0001_extensions_and_schemas
--
-- Extensions and the three Phase 2 schemas, plus the grant posture that every
-- later migration depends on.
--
-- Design: docs/operations/phase-2-migration-set.md section 3
--
-- rollback:
--   DROP SCHEMA IF EXISTS audit CASCADE;
--   DROP SCHEMA IF EXISTS identity CASCADE;
--   DROP SCHEMA IF EXISTS platform CASCADE;
--   -- extensions are left in place: pgcrypto/citext are harmless and may be
--   -- shared. Drop explicitly only if this project is being torn down:
--   --   DROP EXTENSION IF EXISTS pgtap;
--   --   DROP EXTENSION IF EXISTS citext;
--   --   DROP EXTENSION IF EXISTS pgcrypto;
-- ===========================================================================

-- --- Extensions ------------------------------------------------------------
-- Into `extensions`, never `public`. Supabase creates that schema; create it
-- defensively so this migration also applies to a bare PostgreSQL (local tests).
create schema if not exists extensions;

-- pgcrypto is needed for digest() (invitation verifier hashing) ONLY.
-- NOT for gen_random_uuid(): that moved into core in PostgreSQL 13 and now
-- lives in pg_catalog. `extensions.gen_random_uuid()` does not exist -- calling
-- it fails at DDL time. Column defaults use pg_catalog.gen_random_uuid().
create extension if not exists pgcrypto with schema extensions;  -- digest()
create extension if not exists citext   with schema extensions;  -- case-insensitive email/slug/keys
create extension if not exists pgtap;                            -- in-database tests

-- pg_cron / pg_net are deliberately NOT installed. Nothing in Phase 2 uses
-- them; they arrive with the workflow engine in Phase 4.

-- --- Schemas ---------------------------------------------------------------
-- 3 of the 11 target schemas. The rest arrive with the phase that gives them
-- a responsibility; an empty schema is the same anti-pattern as an empty package.
create schema if not exists platform;   -- tenants, lifecycle
create schema if not exists identity;   -- profiles, memberships, roles, permissions
create schema if not exists audit;      -- append-only event log

comment on schema platform is 'HL-BOS: tenants and platform-level lifecycle. NOT exposed via PostgREST.';
comment on schema identity is 'HL-BOS: identity, membership, roles, permissions. NOT exposed via PostgREST.';
comment on schema audit    is 'HL-BOS: append-only audit and security events. NOT exposed via PostgREST.';

-- --- Grants: the security spine -------------------------------------------
-- Deny first, then grant the minimum. `anon` receives USAGE on nothing, so it
-- has zero reach into HL-BOS at any point in this migration set.
revoke all on schema platform, identity, audit from public;
revoke all on schema platform, identity, audit from anon;
revoke all on schema platform, identity, audit from authenticated;

grant usage on schema platform, identity, audit to authenticated;
grant usage on schema extensions to authenticated, anon;

-- Future tables in these schemas are not readable by default. Every table's
-- access is granted explicitly, alongside its RLS policies.
alter default privileges in schema platform, identity, audit
  revoke all on tables from public;
alter default privileges in schema platform, identity, audit
  revoke all on functions from public;

-- Functions default to EXECUTE for PUBLIC. That default is why
-- bootstrap_first_platform_owner needs an explicit REVOKE FROM PUBLIC in 0006.
-- Setting it here means new functions in these schemas start closed.

-- --- Shared utility --------------------------------------------------------
create or replace function platform.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function platform.set_updated_at() is
  'Trigger: maintains updated_at. SECURITY INVOKER -- it needs no privileges of its own.';

revoke all on function platform.set_updated_at() from public;
