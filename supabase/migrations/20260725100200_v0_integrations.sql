-- ===========================================================================
-- v0_integrations — the connector registry (reusable framework)
--
-- One shape for every external system: a catalog entry, a per-tenant
-- connection whose credential is a Vault reference (never a secret value), and
-- a logged sync run. Reused by ai (providers), comms, billing, visibility.
--
-- rollback:
--   DROP SCHEMA IF EXISTS integrations CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'integrations.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'integrations.%';
-- ===========================================================================

create schema if not exists integrations;
comment on schema integrations is 'HL-BOS: external-system connector registry. NOT exposed via PostgREST.';
revoke all on schema integrations from public, anon, authenticated;
grant usage on schema integrations to authenticated;
alter default privileges in schema integrations revoke all on tables from public;
alter default privileges in schema integrations revoke all on functions from public;

do $$ begin create type integrations.connection_status as enum ('pending','active','error'); exception when duplicate_object then null; end $$;
do $$ begin create type integrations.sync_status as enum ('running','succeeded','failed'); exception when duplicate_object then null; end $$;

create table if not exists integrations.connectors (
  key        extensions.citext primary key,
  name       text not null,
  kind       extensions.citext not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint connectors_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table integrations.connectors is 'Catalog of external systems. Seeded by migration.';

create table if not exists integrations.connections (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  connector_key  extensions.citext not null references integrations.connectors(key) on delete restrict,
  status         integrations.connection_status not null default 'pending',
  config         jsonb not null default '{}'::jsonb,
  credential_ref extensions.citext,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint connections_unique unique (tenant_id, connector_key),
  -- Enforce-in-schema: a credential is a Vault reference, never a raw secret.
  constraint connections_credential_is_vault_ref
    check (credential_ref is null or credential_ref ~ '^vault:[a-z0-9_./-]{1,120}$')
);
create index if not exists connections_tenant_idx on integrations.connections (tenant_id);

create table if not exists integrations.sync_runs (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  connector_key extensions.citext not null references integrations.connectors(key) on delete restrict,
  status        integrations.sync_status not null default 'running',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  stats         jsonb,
  error         text
);
create index if not exists sync_runs_tenant_idx on integrations.sync_runs (tenant_id, started_at desc);

create table if not exists integrations.webhooks (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  connector_key extensions.citext not null references integrations.connectors(key) on delete cascade,
  secret_ref    extensions.citext,
  endpoint      text not null,
  created_at    timestamptz not null default now(),
  constraint webhooks_secret_is_vault_ref
    check (secret_ref is null or secret_ref ~ '^vault:[a-z0-9_./-]{1,120}$')
);

create table if not exists integrations.webhook_events (
  id            bigint generated always as identity primary key,
  connector_key extensions.citext not null references integrations.connectors(key) on delete cascade,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

create trigger connections_set_updated_at before update on integrations.connections
  for each row execute function platform.set_updated_at();
create trigger connections_audit after insert or update or delete on integrations.connections
  for each row execute function audit.emit();

-- --- RLS --------------------------------------------------------------------
alter table integrations.connectors     enable row level security;
alter table integrations.connectors     force  row level security;
alter table integrations.connections    enable row level security;
alter table integrations.connections    force  row level security;
alter table integrations.sync_runs      enable row level security;
alter table integrations.sync_runs      force  row level security;
alter table integrations.webhooks        enable row level security;
alter table integrations.webhooks        force  row level security;
alter table integrations.webhook_events  enable row level security;
alter table integrations.webhook_events  force  row level security;

drop policy if exists connectors_select on integrations.connectors;
create policy connectors_select on integrations.connectors for select to authenticated using (true);
drop policy if exists connections_select on integrations.connections;
create policy connections_select on integrations.connections for select to authenticated
  using (identity.is_member(tenant_id));
drop policy if exists sync_runs_select on integrations.sync_runs;
create policy sync_runs_select on integrations.sync_runs for select to authenticated
  using (identity.is_member(tenant_id));
-- webhooks / webhook_events: platform-only (no member policy)
drop policy if exists webhooks_select on integrations.webhooks;
create policy webhooks_select on integrations.webhooks for select to authenticated
  using (identity.has_platform_permission('events.event.read'));

grant select on integrations.connectors, integrations.connections, integrations.sync_runs,
                integrations.webhooks to authenticated;

-- --- Connection management (tenant, permission-gated) -----------------------
create or replace function integrations.upsert_connection(
  p_tenant uuid, p_connector extensions.citext, p_config jsonb default '{}'::jsonb, p_credential_ref extensions.citext default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'integrations.connection.manage') then
    raise exception 'insufficient privilege to manage a connection' using errcode = 'insufficient_privilege';
  end if;
  insert into integrations.connections (tenant_id, connector_key, config, credential_ref, status)
  values (p_tenant, p_connector, coalesce(p_config,'{}'::jsonb), p_credential_ref, 'active')
  on conflict (tenant_id, connector_key)
    do update set config = excluded.config, credential_ref = excluded.credential_ref, status = 'active', updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function integrations.upsert_connection(uuid, extensions.citext, jsonb, extensions.citext) from public, anon;
grant execute on function integrations.upsert_connection(uuid, extensions.citext, jsonb, extensions.citext) to authenticated;

-- --- Sync-run lifecycle (honest instrumentation) ----------------------------
create or replace function integrations.begin_sync(p_tenant uuid, p_connector extensions.citext)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not identity.has_permission(p_tenant, 'integrations.connection.manage') then
    raise exception 'insufficient privilege to run a sync' using errcode = 'insufficient_privilege';
  end if;
  insert into integrations.sync_runs (tenant_id, connector_key, status) values (p_tenant, p_connector, 'running')
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function integrations.begin_sync(uuid, extensions.citext) from public, anon;
grant execute on function integrations.begin_sync(uuid, extensions.citext) to authenticated;

create or replace function integrations.finish_sync(p_run bigint, p_status integrations.sync_status, p_stats jsonb default null, p_error text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_connector extensions.citext;
begin
  update integrations.sync_runs set status = p_status, finished_at = now(), stats = p_stats, error = p_error
  where id = p_run returning tenant_id, connector_key into v_tenant, v_connector;
  if not found then raise exception 'sync run % not found', p_run using errcode = 'no_data_found'; end if;
  perform events.emit(('integrations.sync.' || p_status::text)::extensions.citext, v_tenant, jsonb_build_object('connector', v_connector, 'run', p_run));
end; $$;
revoke all on function integrations.finish_sync(bigint, integrations.sync_status, jsonb, text) from public, anon;
grant execute on function integrations.finish_sync(bigint, integrations.sync_status, jsonb, text) to authenticated;

-- --- Permissions + seed -----------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('integrations.connection.read',   'Read a tenant''s external connections and sync history.', 'tenant'),
  ('integrations.connection.manage', 'Create/configure connections and run syncs.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','integrations.connection.read'),('tenant_owner','integrations.connection.manage'),
  ('tenant_admin','integrations.connection.read'),('tenant_admin','integrations.connection.manage'),
  ('manager','integrations.connection.read')
on conflict do nothing;

-- Seed the connectors VisibilityAI will use (inactive credentials until granted).
insert into integrations.connectors (key, name, kind) values
  ('google_business',       'Google Business Profile', 'google'),
  ('google_search_console', 'Google Search Console',   'google'),
  ('pagespeed',             'PageSpeed Insights',      'google'),
  ('review_source',         'Review Source (aggregate)', 'reviews'),
  ('mock',                  'Mock connector (tests)',  'mock')
on conflict (key) do nothing;
