-- ===========================================================================
-- v0_events_handlers — shared delivery→handler invocation for the event bus
--
-- Closes the CP2/CP3 gap: events.dispatch_batch() writes one events.deliveries
-- row per active subscription but never INVOKES a consumer. This adds the
-- reusable, at-least-once, retrying, dead-lettering claim/complete mechanism
-- every module (comms worker, discovery website worker, …) consumes. It is a
-- SHARED HL-BOS capability, NOT a scanner-specific queue, and it EXTENDS the
-- existing `events` schema — no second bus.
--
-- A worker loop (an Edge Function in production, a local harness in dev) calls
-- events.claim_deliveries(handler_ref, limit) -> runs the handler -> calls
-- events.complete_delivery(id, success, error). Claiming uses FOR UPDATE SKIP
-- LOCKED so many workers run safely in parallel. Scheduled invocation
-- (pg_cron -> pg_net -> worker) is CEO-gated and remains inactive; see the
-- Shared Dispatcher Handler-Invocation Report.
--
-- No enum value is added (ALTER TYPE ADD VALUE cannot run in a migration tx);
-- "claimed" is represented by claimed_at + claim_token, status stays in the
-- existing {queued,failed,delivered,dead} set.
--
-- rollback:
--   DROP FUNCTION IF EXISTS events.complete_delivery(bigint, boolean, text);
--   DROP FUNCTION IF EXISTS events.claim_deliveries(extensions.citext, integer);
--   DROP FUNCTION IF EXISTS events.register_handler(extensions.citext, text, integer, integer, integer);
--   DROP TABLE IF EXISTS events.handlers;
--   ALTER TABLE events.deliveries DROP COLUMN IF EXISTS claimed_at;
--   ALTER TABLE events.deliveries DROP COLUMN IF EXISTS claim_token;
--   ALTER TABLE events.deliveries DROP COLUMN IF EXISTS next_attempt_at;
--   ALTER TABLE events.deliveries DROP COLUMN IF EXISTS correlation_id;
-- ===========================================================================

alter table events.deliveries add column if not exists claimed_at      timestamptz;
alter table events.deliveries add column if not exists claim_token     uuid;
alter table events.deliveries add column if not exists next_attempt_at timestamptz not null default now();
alter table events.deliveries add column if not exists correlation_id  uuid not null default pg_catalog.gen_random_uuid();

-- --- Handler registry (one handler per subscription) ------------------------
create table if not exists events.handlers (
  subscription_key extensions.citext primary key references events.subscriptions(key) on delete cascade,
  handler_ref      text not null,                    -- logical worker name (edge fn / harness maps to code)
  is_active        boolean not null default true,
  max_attempts     integer not null default 5,
  backoff_seconds  integer not null default 30,
  timeout_seconds  integer not null default 30,
  created_at       timestamptz not null default now(),
  constraint handlers_positive check (max_attempts > 0 and backoff_seconds >= 0 and timeout_seconds > 0)
);
comment on table events.handlers is 'Maps a subscription to an invokable worker (handler_ref) with retry/backoff/timeout policy. Registered by the platform at deploy.';

create index if not exists deliveries_claimable_idx
  on events.deliveries (next_attempt_at) where status in ('queued','failed') and claimed_at is null;

alter table events.handlers enable row level security;
alter table events.handlers force  row level security;
drop policy if exists handlers_select on events.handlers;
create policy handlers_select on events.handlers for select to authenticated
  using (identity.has_platform_permission('events.event.read'));
grant select on events.handlers to authenticated;

-- --- Registration (platform config) -----------------------------------------
create or replace function events.register_handler(
  p_subscription extensions.citext, p_handler_ref text,
  p_max_attempts integer default 5, p_backoff_seconds integer default 30, p_timeout_seconds integer default 30)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Internal/deploy-config function: authorization is the EXECUTE grant
  -- (service_role + postgres only), mirroring events.dispatch_batch. Not a
  -- client-callable RPC.
  insert into events.handlers (subscription_key, handler_ref, max_attempts, backoff_seconds, timeout_seconds)
  values (p_subscription, p_handler_ref, greatest(p_max_attempts,1), greatest(p_backoff_seconds,0), greatest(p_timeout_seconds,1))
  on conflict (subscription_key) do update
    set handler_ref = excluded.handler_ref, max_attempts = excluded.max_attempts,
        backoff_seconds = excluded.backoff_seconds, timeout_seconds = excluded.timeout_seconds;
end; $$;
revoke all on function events.register_handler(extensions.citext, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function events.register_handler(extensions.citext, text, integer, integer, integer) to service_role;

-- --- Claim: atomic, concurrency-safe (FOR UPDATE SKIP LOCKED) ---------------
-- Returns due, unclaimed deliveries for the given handler and marks them
-- claimed. A crashed worker's claim expires via next_attempt_at on the retry
-- path (complete_delivery reschedules); duplicate execution is prevented by the
-- claim + the consuming handler's own idempotency.
create or replace function events.claim_deliveries(p_handler_ref text, p_limit integer default 10)
returns table (
  delivery_id bigint, outbox_id bigint, topic extensions.citext, tenant_id uuid,
  payload jsonb, subscription_key extensions.citext, attempts integer, correlation_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
begin
  return query
  with due as (
    select d.id
    from events.deliveries d
    join events.subscriptions s on s.key = d.subscription_key
    join events.handlers h on h.subscription_key = s.key
    where h.handler_ref = p_handler_ref and h.is_active
      and d.status in ('queued','failed')
      and d.claimed_at is null
      and d.next_attempt_at <= now()
    order by d.id
    for update skip locked
    limit greatest(p_limit, 1)
  ),
  claimed as (
    update events.deliveries d
       set claimed_at = now(), claim_token = pg_catalog.gen_random_uuid()
      from due where d.id = due.id
      returning d.id, d.outbox_id, d.subscription_key, d.attempts, d.correlation_id
  )
  select c.id, c.outbox_id, o.topic, o.tenant_id, o.payload, c.subscription_key, c.attempts, c.correlation_id
  from claimed c join events.outbox o on o.id = c.outbox_id
  order by c.id;
end; $$;
revoke all on function events.claim_deliveries(text, integer) from public, anon, authenticated;
grant execute on function events.claim_deliveries(text, integer) to service_role;

-- --- Complete: success -> delivered; failure -> retry/backoff or dead-letter -
create or replace function events.complete_delivery(p_delivery bigint, p_success boolean, p_error text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_sub extensions.citext; v_max integer; v_backoff integer; v_attempts integer; v_tenant uuid;
begin
  select d.subscription_key, d.attempts into v_sub, v_attempts from events.deliveries d where d.id = p_delivery;
  if not found then raise exception 'delivery % not found', p_delivery using errcode = 'no_data_found'; end if;
  select h.max_attempts, h.backoff_seconds into v_max, v_backoff from events.handlers h where h.subscription_key = v_sub;
  v_max := coalesce(v_max, 5); v_backoff := coalesce(v_backoff, 30);

  if p_success then
    update events.deliveries
       set status = 'delivered', delivered_at = now(), claimed_at = null, claim_token = null, last_error = null
     where id = p_delivery;
  else
    v_attempts := v_attempts + 1;
    if v_attempts >= v_max then
      update events.deliveries
         set status = 'dead', attempts = v_attempts, claimed_at = null, claim_token = null,
             last_error = left(coalesce(p_error,''), 2000)
       where id = p_delivery;
      -- dead-letter is a platform observability event
      select o.tenant_id into v_tenant from events.deliveries d join events.outbox o on o.id = d.outbox_id where d.id = p_delivery;
      perform audit.log_security_event('events.delivery.dead','denied','warning',
        v_tenant,'events.deliveries',p_delivery::text, jsonb_build_object('attempts', v_attempts));
    else
      update events.deliveries
         set status = 'failed', attempts = v_attempts, claimed_at = null, claim_token = null,
             last_error = left(coalesce(p_error,''), 2000),
             next_attempt_at = now() + pg_catalog.make_interval(secs => v_backoff * v_attempts)
       where id = p_delivery;
    end if;
  end if;
end; $$;
revoke all on function events.complete_delivery(bigint, boolean, text) from public, anon, authenticated;
grant execute on function events.complete_delivery(bigint, boolean, text) to service_role;
