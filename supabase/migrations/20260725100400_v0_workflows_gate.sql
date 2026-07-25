-- ===========================================================================
-- v0_workflows_gate — the human-approval gate (reusable, minimal)
--
-- Principle 4: AI never publishes, sends, charges or bids without a person.
-- A producing module requests approval; a permission-holder decides; the module
-- checks is_approved() before it acts. Reused by visibility, comms, ai, billing.
--
-- rollback:
--   DROP SCHEMA IF EXISTS workflows CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'workflows.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'workflows.%';
-- ===========================================================================

create schema if not exists workflows;
comment on schema workflows is 'HL-BOS: approval/process engine (human gate). NOT exposed via PostgREST.';
revoke all on schema workflows from public, anon, authenticated;
grant usage on schema workflows to authenticated;
alter default privileges in schema workflows revoke all on tables from public;
alter default privileges in schema workflows revoke all on functions from public;

do $$ begin create type workflows.instance_status as enum ('open','approved','rejected','canceled'); exception when duplicate_object then null; end $$;
do $$ begin create type workflows.task_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type workflows.decision as enum ('approved','rejected'); exception when duplicate_object then null; end $$;

create table if not exists workflows.instances (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  kind          extensions.citext not null,           -- e.g. visibility.content.publish
  status        workflows.instance_status not null default 'open',
  subject_type  text not null,
  subject_id    text not null,
  started_by    uuid references auth.users(id) on delete set null,
  started_at    timestamptz not null default now()
);
create index if not exists instances_tenant_idx on workflows.instances (tenant_id, status);

create table if not exists workflows.tasks (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  instance_id   uuid not null references workflows.instances(id) on delete cascade,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  step          integer not null default 1,
  assignee_role extensions.citext,
  assignee_id   uuid references auth.users(id) on delete set null,
  status        workflows.task_status not null default 'pending',
  due_at        timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_instance_idx on workflows.tasks (instance_id);

create table if not exists workflows.approvals (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  task_id     uuid not null references workflows.tasks(id) on delete cascade,
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  decision    workflows.decision not null,
  actor_id    uuid not null references auth.users(id) on delete set null,
  reason      text,
  decided_at  timestamptz not null default now()
);

create trigger instances_audit after insert or update or delete on workflows.instances for each row execute function audit.emit();
create trigger tasks_audit     after insert or update or delete on workflows.tasks     for each row execute function audit.emit();
create trigger approvals_audit after insert or update or delete on workflows.approvals for each row execute function audit.emit();

alter table workflows.instances enable row level security; alter table workflows.instances force row level security;
alter table workflows.tasks     enable row level security; alter table workflows.tasks     force row level security;
alter table workflows.approvals enable row level security; alter table workflows.approvals force row level security;

drop policy if exists instances_select on workflows.instances;
create policy instances_select on workflows.instances for select to authenticated using (identity.is_member(tenant_id));
drop policy if exists tasks_select on workflows.tasks;
create policy tasks_select on workflows.tasks for select to authenticated
  using (identity.has_permission(tenant_id, 'workflows.task.read'));
drop policy if exists approvals_select on workflows.approvals;
create policy approvals_select on workflows.approvals for select to authenticated using (identity.is_member(tenant_id));

grant select on workflows.instances, workflows.tasks, workflows.approvals to authenticated;

-- --- Request approval (a member/module starts a gated process) --------------
create or replace function workflows.request_approval(
  p_tenant uuid, p_kind extensions.citext, p_subject_type text, p_subject_id text, p_assignee_role extensions.citext default 'tenant_admin')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_instance uuid;
begin
  if not identity.is_member(p_tenant) then
    raise exception 'not a member of tenant' using errcode = 'insufficient_privilege';
  end if;
  insert into workflows.instances (tenant_id, kind, subject_type, subject_id, started_by)
  values (p_tenant, p_kind, p_subject_type, p_subject_id, auth.uid())
  returning id into v_instance;
  insert into workflows.tasks (instance_id, tenant_id, assignee_role)
  values (v_instance, p_tenant, p_assignee_role);
  perform events.emit('workflows.task.created', p_tenant, jsonb_build_object('instance', v_instance, 'kind', p_kind));
  return v_instance;
end; $$;
revoke all on function workflows.request_approval(uuid, extensions.citext, text, text, extensions.citext) from public, anon;
grant execute on function workflows.request_approval(uuid, extensions.citext, text, text, extensions.citext) to authenticated;

-- --- Decide (the human gate) ------------------------------------------------
create or replace function workflows.decide(p_task uuid, p_decision workflows.decision, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select t.tenant_id, t.instance_id into v_tenant, v_instance from workflows.tasks t where t.id = p_task;
  if not found then raise exception 'task % not found', p_task using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'workflows.approval.manage') then
    perform audit.log_security_event('workflows.decide','denied','warning', v_tenant,'workflows.tasks',p_task::text,null);
    raise exception 'insufficient privilege to decide this approval' using errcode = 'insufficient_privilege';
  end if;
  update workflows.tasks set status = p_decision::text::workflows.task_status where id = p_task and status = 'pending';
  if not found then raise exception 'task already decided' using errcode = 'unique_violation'; end if;
  insert into workflows.approvals (task_id, tenant_id, decision, actor_id, reason)
  values (p_task, v_tenant, p_decision, auth.uid(), p_reason);
  update workflows.instances set status = p_decision::text::workflows.instance_status where id = v_instance;
  perform events.emit('workflows.approval.managed', v_tenant, jsonb_build_object('instance', v_instance, 'decision', p_decision));
  perform audit.log_security_event('workflows.decide','allowed','info', v_tenant,'workflows.instances',v_instance::text,
    jsonb_build_object('decision', p_decision));
end; $$;
revoke all on function workflows.decide(uuid, workflows.decision, text) from public, anon;
grant execute on function workflows.decide(uuid, workflows.decision, text) to authenticated;

-- --- The check consuming modules call before acting -------------------------
create or replace function workflows.is_approved(p_instance uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from workflows.instances i where i.id = p_instance and i.status = 'approved');
$$;
revoke all on function workflows.is_approved(uuid) from public, anon;
grant execute on function workflows.is_approved(uuid) to authenticated;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('workflows.task.read',      'Read approval tasks for a tenant.', 'tenant'),
  ('workflows.approval.manage','Approve or reject a gated action (the human gate).', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','workflows.task.read'),('tenant_owner','workflows.approval.manage'),
  ('tenant_admin','workflows.task.read'),('tenant_admin','workflows.approval.manage'),
  ('manager','workflows.task.read'),('manager','workflows.approval.manage'),
  ('staff','workflows.task.read')
on conflict do nothing;
