-- ===========================================================================
-- v0_events — the transactional outbox backbone (VisibilityAI V0)
--
-- A reusable shared primitive: a module writes a domain event to events.outbox
-- in the SAME transaction as its state change; a dispatcher fans it out to
-- subscriptions and records deliveries. At-least-once: outbox.published_at is
-- set only after deliveries are written, in one transaction, so a crashed
-- dispatcher redelivers rather than losing the event.
--
-- Built once, reused by every module. Not duplicated inside VisibilityAI.
--
-- NOTE: production wires events.dispatch_batch() to pg_cron at deploy time
-- (pg_cron verified available on HL-BOS Core, not installed). This migration
-- deliberately does NOT require pg_cron/pg_net so it applies and tests on a
-- bare PostgreSQL. Handler invocation (pg_net -> edge fn) is a deploy concern.
--
-- rollback:
--   DROP SCHEMA IF EXISTS events CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'events.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'events.%';
-- ===========================================================================

create schema if not exists events;
comment on schema events is 'HL-BOS: transactional outbox event bus. NOT exposed via PostgREST.';

revoke all on schema events from public, anon, authenticated;
grant usage on schema events to authenticated;
alter default privileges in schema events revoke all on tables from public;
alter default privileges in schema events revoke all on functions from public;

do $$ begin
  create type events.delivery_status as enum ('queued','delivered','failed','dead');
exception when duplicate_object then null; end $$;

-- --- outbox ----------------------------------------------------------------
create table if not exists events.outbox (
  id            bigint generated always as identity primary key,
  tenant_id     uuid references platform.tenants(id) on delete set null,   -- NULL = platform-level
  topic         extensions.citext not null,
  payload       jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  published_at  timestamptz,
  attempts      integer not null default 0,
  constraint outbox_topic_format check (topic ~ '^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$')
);
comment on table events.outbox is 'Append-only domain events. Written in the producer''s tx via events.emit(); published by events.dispatch_batch().';
create index if not exists outbox_unpublished_idx on events.outbox (id) where published_at is null;

create table if not exists events.subscriptions (
  key             extensions.citext primary key,
  topic           extensions.citext not null,
  consumer_module text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint subscriptions_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table events.subscriptions is 'Static catalog of who consumes which topic. Seeded by migration.';
create index if not exists subscriptions_topic_idx on events.subscriptions (topic) where active;

create table if not exists events.deliveries (
  id               bigint generated always as identity primary key,
  outbox_id        bigint not null references events.outbox(id) on delete cascade,
  subscription_key extensions.citext not null references events.subscriptions(key) on delete cascade,
  status           events.delivery_status not null default 'queued',
  attempts         integer not null default 0,
  last_error       text,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  constraint deliveries_unique unique (outbox_id, subscription_key)
);
create index if not exists deliveries_pending_idx on events.deliveries (id) where status in ('queued','failed');

-- --- RLS: platform-observability read only; writes only via definer fns -----
alter table events.outbox        enable row level security;
alter table events.outbox        force  row level security;
alter table events.subscriptions enable row level security;
alter table events.subscriptions force  row level security;
alter table events.deliveries    enable row level security;
alter table events.deliveries    force  row level security;

drop policy if exists outbox_select on events.outbox;
create policy outbox_select on events.outbox for select to authenticated
  using (identity.has_platform_permission('events.event.read'));
drop policy if exists subscriptions_select on events.subscriptions;
create policy subscriptions_select on events.subscriptions for select to authenticated
  using (identity.has_platform_permission('events.event.read'));
drop policy if exists deliveries_select on events.deliveries;
create policy deliveries_select on events.deliveries for select to authenticated
  using (identity.has_platform_permission('events.event.read'));

-- Table privileges: SELECT only (RLS filters to platform observers). All writes
-- go through the SECURITY DEFINER producer/dispatcher functions below.
grant select on events.outbox, events.subscriptions, events.deliveries to authenticated;

-- --- Producer API: emit in the caller's transaction -------------------------
create or replace function events.emit(p_topic extensions.citext, p_tenant uuid, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into events.outbox (tenant_id, topic, payload)
  values (p_tenant, p_topic, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end; $$;
comment on function events.emit(extensions.citext, uuid, jsonb) is
  'Append a domain event in the caller''s transaction. Called by module SECURITY DEFINER functions (owned by postgres); not granted to clients.';
revoke all on function events.emit(extensions.citext, uuid, jsonb) from public, anon, authenticated;

-- --- Dispatcher: fan out to subscriptions, at-least-once --------------------
create or replace function events.dispatch_batch(p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer := 0; r record;
begin
  for r in
    select o.id, o.topic from events.outbox o
    where o.published_at is null
    order by o.id
    for update skip locked
    limit p_limit
  loop
    insert into events.deliveries (outbox_id, subscription_key, status)
    select r.id, s.key, 'queued'
    from events.subscriptions s
    where s.topic = r.topic and s.active
    on conflict (outbox_id, subscription_key) do nothing;
    update events.outbox set published_at = now(), attempts = attempts + 1 where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
comment on function events.dispatch_batch(integer) is
  'Claims unpublished outbox rows (FOR UPDATE SKIP LOCKED), writes one delivery per active subscription, marks published. Scheduled by pg_cron in production.';
revoke all on function events.dispatch_batch(integer) from public, anon, authenticated;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('events.event.read', 'Read the platform event outbox and deliveries (observability).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('platform_owner', 'events.event.read'),
  ('platform_admin', 'events.event.read')
on conflict do nothing;
