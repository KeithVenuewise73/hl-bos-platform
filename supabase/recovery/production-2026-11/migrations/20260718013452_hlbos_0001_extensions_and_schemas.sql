-- hlbos_0001_extensions_and_schemas
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;  -- digest()
create extension if not exists citext   with schema extensions;  -- case-insensitive email/slug/keys
create extension if not exists pgtap;                            -- in-database tests

create schema if not exists platform;   -- tenants, lifecycle
create schema if not exists identity;   -- profiles, memberships, roles, permissions
create schema if not exists audit;      -- append-only event log

comment on schema platform is 'HL-BOS: tenants and platform-level lifecycle. NOT exposed via PostgREST.';
comment on schema identity is 'HL-BOS: identity, membership, roles, permissions. NOT exposed via PostgREST.';
comment on schema audit    is 'HL-BOS: append-only audit and security events. NOT exposed via PostgREST.';

revoke all on schema platform, identity, audit from public;
revoke all on schema platform, identity, audit from anon;
revoke all on schema platform, identity, audit from authenticated;

grant usage on schema platform, identity, audit to authenticated;
grant usage on schema extensions to authenticated, anon;

alter default privileges in schema platform, identity, audit
  revoke all on tables from public;
alter default privileges in schema platform, identity, audit
  revoke all on functions from public;

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