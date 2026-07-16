-- ===========================================================================
-- hlbos_0004_audit_foundation
--
-- Append-only audit. Users CANNOT write here -- not by policy, not by grant,
-- not at all. Rows are produced only by audit.emit(), a SECURITY DEFINER
-- trigger owned by postgres (verified rolbypassrls=true on the target), which
-- derives every field and accepts no caller input.
--
-- Design: docs/operations/phase-2-migration-set.md section 7
--
-- rollback:
--   DROP SCHEMA IF EXISTS audit CASCADE;   -- drops tables, functions, triggers
--   (triggers on identity/platform tables are dropped with the functions)
-- ===========================================================================

do $$ begin
  create type audit.actor_type as enum ('user','service_account','system','anonymous');
exception when duplicate_object then null; end $$;

do $$ begin
  create type audit.severity as enum ('info','warning','critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type audit.outcome as enum ('allowed','denied');
exception when duplicate_object then null; end $$;

-- --- audit.events ----------------------------------------------------------
-- bigint PK, deviating from "UUIDs unless documented". THIS IS THE
-- DOCUMENTATION: this table is append-only and read in time order. A monotonic
-- identity gives a total order and a half-width index that gen_random_uuid()
-- cannot. occurred_at alone collides. PG18's uuidv7() would resolve it; the
-- target is 17.6. Owner-approved.
create table if not exists audit.events (
  id              bigint generated always as identity primary key,
  tenant_id       uuid references platform.tenants(id) on delete set null,
  actor_type      audit.actor_type not null,
  actor_id        uuid,
  action          text not null,
  resource_type   text not null,
  resource_id     text,
  before          jsonb,
  after           jsonb,
  correlation_id  uuid,
  request_id      uuid,
  ip              inet,
  user_agent      text,
  occurred_at     timestamptz not null default now()
);
comment on table audit.events is
  'Append-only. tenant_id NULL = platform-level event. No user can write here; see audit.emit().';

create index if not exists events_tenant_time_idx on audit.events (tenant_id, occurred_at desc);
create index if not exists events_correlation_idx on audit.events (correlation_id);
create index if not exists events_actor_time_idx  on audit.events (actor_id, occurred_at desc);

create table if not exists audit.security_events (
  id              bigint generated always as identity primary key,
  tenant_id       uuid references platform.tenants(id) on delete set null,
  actor_type      audit.actor_type not null,
  actor_id        uuid,
  action          text not null,
  resource_type   text,
  resource_id     text,
  detail          jsonb,
  severity        audit.severity not null default 'info',
  outcome         audit.outcome not null,
  correlation_id  uuid,
  ip              inet,
  user_agent      text,
  occurred_at     timestamptz not null default now()
);
comment on table audit.security_events is
  'Permission denials, auth failures, platform-admin actions. Readable only with platform.audit.read. Written only by internal SECURITY DEFINER paths.';

create index if not exists security_events_time_idx on audit.security_events (occurred_at desc);
create index if not exists security_events_severity_idx on audit.security_events (severity, occurred_at desc);

-- --- The write path: nothing user-callable ---------------------------------
-- audit.emit() is a trigger function. It is SECURITY DEFINER and owned by
-- postgres, which has BYPASSRLS, so it inserts despite there being no INSERT
-- policy. authenticated has neither grant nor policy: a direct INSERT fails
-- twice over.
--
-- EVERY field is DERIVED. There is no parameter a caller can influence, so
-- fabricating a privileged actor, a system event, or another tenant's event is
-- not blocked by a check -- there is nothing to forge.
create or replace function audit.emit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_type audit.actor_type;
  v_tenant     uuid;
  v_resource   text;
  v_before     jsonb;
  v_after      jsonb;
begin
  v_actor_type := case when v_actor is null then 'system' else 'user' end;

  if tg_op <> 'INSERT' then
    v_before := to_jsonb(old) - 'token_verifier_hash';   -- redact the verifier
  end if;
  if tg_op <> 'DELETE' then
    v_after  := to_jsonb(new) - 'token_verifier_hash';
  end if;

  -- tenant_id is DERIVED from the affected row, never supplied.
  if tg_table_schema = 'platform' and tg_table_name = 'tenants' then
    v_tenant   := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
    v_resource := coalesce(v_after->>'id', v_before->>'id');
  elsif tg_table_name = 'membership_roles' then
    select m.tenant_id into v_tenant
    from identity.memberships m
    where m.id = coalesce((v_after->>'membership_id')::uuid, (v_before->>'membership_id')::uuid);
    v_resource := coalesce(v_after->>'membership_id', v_before->>'membership_id');
  elsif tg_table_name = 'platform_admins' then
    v_tenant   := null;   -- platform-level: has no tenant
    v_resource := coalesce(v_after->>'user_id', v_before->>'user_id');
  else
    v_tenant   := coalesce((v_after->>'tenant_id')::uuid, (v_before->>'tenant_id')::uuid);
    v_resource := coalesce(v_after->>'id', v_before->>'id');
  end if;

  insert into audit.events (
    tenant_id, actor_type, actor_id, action, resource_type, resource_id,
    before, after, occurred_at
  ) values (
    v_tenant,
    v_actor_type,
    v_actor,                                                    -- from auth.uid()
    tg_table_schema || '.' || tg_table_name || '.' || lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    v_resource,
    v_before,
    v_after,
    now()                                                       -- database clock
  );

  return null;  -- AFTER trigger
end;
$$;
comment on function audit.emit() is
  'AFTER trigger. Derives every field: actor from auth.uid(), occurred_at from now(), tenant from the affected row. Accepts no caller input. NOT executable by any client role.';

-- The legacy project exposes trigger functions as anon-callable RPC (SEC-3),
-- one of which gates legal review on government bids. Not repeating that.
revoke all on function audit.emit() from public;
revoke all on function audit.emit() from anon;
revoke all on function audit.emit() from authenticated;
revoke all on function audit.emit() from service_role;

-- Internal-only security event writer. No EXECUTE for any client role: it is
-- called from inside other SECURITY DEFINER functions (0006), never from the API.
create or replace function audit.log_security_event(
  p_action        text,
  p_outcome       audit.outcome,
  p_severity      audit.severity default 'warning',
  p_tenant        uuid default null,
  p_resource_type text default null,
  p_resource_id   text default null,
  p_detail        jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  insert into audit.security_events (
    tenant_id, actor_type, actor_id, action, resource_type, resource_id,
    detail, severity, outcome, occurred_at
  ) values (
    p_tenant,
    case when v_actor is null then 'system' else 'user' end,
    v_actor, p_action, p_resource_type, p_resource_id,
    p_detail, p_severity, p_outcome, now()
  );
end;
$$;

revoke all on function audit.log_security_event(text, audit.outcome, audit.severity, uuid, text, text, jsonb) from public;
revoke all on function audit.log_security_event(text, audit.outcome, audit.severity, uuid, text, text, jsonb) from anon;
revoke all on function audit.log_security_event(text, audit.outcome, audit.severity, uuid, text, text, jsonb) from authenticated;
revoke all on function audit.log_security_event(text, audit.outcome, audit.severity, uuid, text, text, jsonb) from service_role;

-- --- Immutability: the ONLY layer that stops service_role ------------------
-- Verified on the target: service_role AND postgres both have rolbypassrls=true.
-- So policies and grants protect audit from `authenticated` and do NOTHING
-- against the most privileged, most leak-prone credential in the system.
-- Triggers fire regardless of RLS and regardless of BYPASSRLS. This is the
-- control; the policy and grant layers are defence in depth.
create or replace function audit.reject_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit.% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = 'insufficient_privilege',
          hint = 'Audit records are immutable by design. If a correction is needed, append a new event.';
end;
$$;

drop trigger if exists events_immutable_update on audit.events;
create trigger events_immutable_update before update on audit.events
  for each row execute function audit.reject_mutation();
drop trigger if exists events_immutable_delete on audit.events;
create trigger events_immutable_delete before delete on audit.events
  for each row execute function audit.reject_mutation();

drop trigger if exists security_events_immutable_update on audit.security_events;
create trigger security_events_immutable_update before update on audit.security_events
  for each row execute function audit.reject_mutation();
drop trigger if exists security_events_immutable_delete on audit.security_events;
create trigger security_events_immutable_delete before delete on audit.security_events
  for each row execute function audit.reject_mutation();

-- --- RLS -------------------------------------------------------------------
alter table audit.events          enable row level security;
alter table audit.events          force  row level security;
alter table audit.security_events enable row level security;
alter table audit.security_events force  row level security;

revoke all on audit.events          from public, anon, authenticated;
revoke all on audit.security_events from public, anon, authenticated;
grant select on audit.events          to authenticated;
grant select on audit.security_events to authenticated;

-- SELECT only. NO INSERT policy, NO UPDATE policy, NO DELETE policy.
drop policy if exists events_select on audit.events;
create policy events_select on audit.events
  for select to authenticated
  using (
    (tenant_id is not null and identity.has_permission(tenant_id, 'audit.event.read'))
    or identity.has_platform_permission('platform.audit.read')
  );

drop policy if exists security_events_select on audit.security_events;
create policy security_events_select on audit.security_events
  for select to authenticated
  using (identity.has_platform_permission('platform.audit.read'));

-- --- Attach audit.emit to the tables that matter ---------------------------
-- 5 tables. identity.platform_admins was missing from this list in the first
-- draft -- a real gap: it is the highest-privilege table in the platform, and
-- an unaudited grant of platform-wide authority is precisely the event an
-- audit log exists to capture.
drop trigger if exists tenants_audit on platform.tenants;
create trigger tenants_audit after insert or update or delete on platform.tenants
  for each row execute function audit.emit();

drop trigger if exists memberships_audit on identity.memberships;
create trigger memberships_audit after insert or update or delete on identity.memberships
  for each row execute function audit.emit();

drop trigger if exists membership_roles_audit on identity.membership_roles;
create trigger membership_roles_audit after insert or update or delete on identity.membership_roles
  for each row execute function audit.emit();

drop trigger if exists invitations_audit on identity.invitations;
create trigger invitations_audit after insert or update or delete on identity.invitations
  for each row execute function audit.emit();

drop trigger if exists platform_admins_audit on identity.platform_admins;
create trigger platform_admins_audit after insert or update or delete on identity.platform_admins
  for each row execute function audit.emit();

-- --- Coverage assertion ----------------------------------------------------
-- Returns offending tables. A new table without RLS+FORCE+a policy fails the
-- build via pgTAP test 39. This is the guarantee Core v1 cannot drift into the
-- legacy project's state (15 tables with USING(true), 2,481 anon-writable rows).
create or replace function audit.verify_rls_coverage()
returns table (schema_name text, table_name text, problem text)
language sql stable security definer set search_path = '' as $$
  select n.nspname::text, c.relname::text,
         case
           when not c.relrowsecurity then 'RLS not enabled'
           when not c.relforcerowsecurity then 'RLS not FORCED'
           else 'no policies'
         end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname in ('platform','identity','audit')
    and (not c.relrowsecurity
         or not c.relforcerowsecurity
         or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
$$;
revoke all on function audit.verify_rls_coverage() from public;
