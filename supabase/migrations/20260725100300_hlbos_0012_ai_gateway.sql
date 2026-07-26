-- ===========================================================================
-- v0_ai_gateway — the model gateway foundation (reusable)
--
-- One authenticated door in front of every model. V0 delivers the DB-side run
-- lifecycle, budget enforcement, prompt library and provider abstraction. The
-- actual provider call lives in the ai-gateway edge function (scaffolded with a
-- mock adapter); no live key is required to implement or test structurally.
--
-- ai.runs is the authoritative AI-action ledger: every model call is a row with
-- real tenant, tokens and cost. Honest instrumentation — no run row without a call.
--
-- rollback:
--   DROP SCHEMA IF EXISTS ai CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'ai.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'ai.%';
-- ===========================================================================

create schema if not exists ai;
comment on schema ai is 'HL-BOS: AI gateway, prompt library, run ledger, budgets. NOT exposed via PostgREST.';
revoke all on schema ai from public, anon, authenticated;
grant usage on schema ai to authenticated;
alter default privileges in schema ai revoke all on tables from public;
alter default privileges in schema ai revoke all on functions from public;

do $$ begin create type ai.provider_kind as enum ('anthropic','openai','gemini','mock'); exception when duplicate_object then null; end $$;
do $$ begin create type ai.run_status as enum ('pending','succeeded','failed'); exception when duplicate_object then null; end $$;
do $$ begin create type ai.guardrail_action as enum ('block','flag','gate'); exception when duplicate_object then null; end $$;

create table if not exists ai.providers (
  key            extensions.citext primary key,
  kind           ai.provider_kind not null,
  is_active      boolean not null default false,
  credential_ref extensions.citext,
  created_at     timestamptz not null default now(),
  constraint providers_credential_is_vault_ref
    check (credential_ref is null or credential_ref ~ '^vault:[a-z0-9_./-]{1,120}$')
);
comment on table ai.providers is 'Model providers. Credential is a Vault reference, never a secret. anthropic seeded inactive until a key is granted.';

create table if not exists ai.models (
  key         extensions.citext primary key,
  provider_key extensions.citext not null references ai.providers(key) on delete restrict,
  input_cost  numeric(12,6) not null default 0,   -- USD per input token
  output_cost numeric(12,6) not null default 0,   -- USD per output token
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists ai.prompts (
  key            extensions.citext primary key,
  name           text not null,
  latest_version integer not null default 0,
  created_at     timestamptz not null default now()
);
create table if not exists ai.prompt_versions (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  prompt_key extensions.citext not null references ai.prompts(key) on delete cascade,
  version    integer not null,
  template   text not null,
  model_key  extensions.citext references ai.models(key) on delete set null,
  params     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint prompt_versions_unique unique (prompt_key, version)
);

create table if not exists ai.runs (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references platform.tenants(id) on delete cascade,
  prompt_key     extensions.citext,
  prompt_version integer,
  model_key      extensions.citext,
  actor_id       uuid,
  status         ai.run_status not null default 'pending',
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cost_usd       numeric(12,6) not null default 0,
  correlation_id uuid,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  constraint runs_cost_nonneg check (cost_usd >= 0)
);
comment on table ai.runs is 'The AI-action ledger: one row per model call with real tenant, tokens and cost. Written only via ai.begin_run/finish_run.';
create index if not exists runs_tenant_idx on ai.runs (tenant_id, started_at desc);

create table if not exists ai.budgets (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  period     extensions.citext not null,
  limit_usd  numeric(12,2) not null,
  spent_usd  numeric(12,2) not null default 0,
  resets_at  timestamptz,
  constraint budgets_unique unique (tenant_id, period),
  constraint budgets_nonneg check (limit_usd >= 0 and spent_usd >= 0)
);

create table if not exists ai.guardrails (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id  uuid references platform.tenants(id) on delete cascade,
  rule       text not null,
  action     ai.guardrail_action not null,
  created_at timestamptz not null default now()
);

-- --- RLS --------------------------------------------------------------------
alter table ai.providers       enable row level security; alter table ai.providers       force row level security;
alter table ai.models          enable row level security; alter table ai.models          force row level security;
alter table ai.prompts         enable row level security; alter table ai.prompts         force row level security;
alter table ai.prompt_versions enable row level security; alter table ai.prompt_versions force row level security;
alter table ai.runs            enable row level security; alter table ai.runs            force row level security;
alter table ai.budgets         enable row level security; alter table ai.budgets         force row level security;
alter table ai.guardrails      enable row level security; alter table ai.guardrails      force row level security;

-- catalog readable to any authenticated context; tenant data scoped by membership
drop policy if exists providers_select on ai.providers;
create policy providers_select on ai.providers for select to authenticated using (true);
drop policy if exists models_select on ai.models;
create policy models_select on ai.models for select to authenticated using (true);
drop policy if exists prompts_select on ai.prompts;
create policy prompts_select on ai.prompts for select to authenticated using (true);
drop policy if exists prompt_versions_select on ai.prompt_versions;
create policy prompt_versions_select on ai.prompt_versions for select to authenticated using (true);
drop policy if exists runs_select on ai.runs;
create policy runs_select on ai.runs for select to authenticated
  using (identity.has_permission(tenant_id, 'ai.run.read'));
drop policy if exists budgets_select on ai.budgets;
create policy budgets_select on ai.budgets for select to authenticated
  using (identity.is_member(tenant_id));

grant select on ai.providers, ai.models, ai.prompts, ai.prompt_versions, ai.runs, ai.budgets to authenticated;

-- --- Budget check -----------------------------------------------------------
create or replace function ai.within_budget(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  -- true if no budget set, or spent is below limit
  select not exists (
    select 1 from ai.budgets b where b.tenant_id = p_tenant and b.spent_usd >= b.limit_usd
  );
$$;
revoke all on function ai.within_budget(uuid) from public, anon;
grant execute on function ai.within_budget(uuid) to authenticated;

-- --- Run lifecycle (the gateway's DB side) ----------------------------------
create or replace function ai.begin_run(
  p_tenant uuid, p_prompt extensions.citext, p_version integer, p_model extensions.citext, p_correlation uuid default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not identity.has_permission(p_tenant, 'ai.run.create') then
    raise exception 'insufficient privilege to run AI' using errcode = 'insufficient_privilege';
  end if;
  if not ai.within_budget(p_tenant) then
    perform audit.log_security_event('ai.run.budget_exceeded','denied','warning',
      p_tenant,'ai.runs',null, jsonb_build_object('prompt',p_prompt));
    raise exception 'AI budget exceeded for tenant' using errcode = 'insufficient_privilege';
  end if;
  insert into ai.runs (tenant_id, prompt_key, prompt_version, model_key, actor_id, status, correlation_id)
  values (p_tenant, p_prompt, p_version, p_model, auth.uid(), 'pending', p_correlation)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function ai.begin_run(uuid, extensions.citext, integer, extensions.citext, uuid) from public, anon;
grant execute on function ai.begin_run(uuid, extensions.citext, integer, extensions.citext, uuid) to authenticated;

create or replace function ai.finish_run(
  p_run bigint, p_input_tokens integer, p_output_tokens integer, p_cost_usd numeric, p_status ai.run_status default 'succeeded')
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  update ai.runs
     set input_tokens = p_input_tokens, output_tokens = p_output_tokens,
         cost_usd = p_cost_usd, status = p_status, finished_at = now()
   where id = p_run and status = 'pending'
   returning tenant_id into v_tenant;
  if not found then raise exception 'run % not found or already finished', p_run using errcode = 'no_data_found'; end if;
  -- real cost accrues to the budget (honest instrumentation)
  update ai.budgets set spent_usd = spent_usd + coalesce(p_cost_usd,0) where tenant_id = v_tenant;
  perform events.emit('ai.run.completed', v_tenant, jsonb_build_object('run', p_run, 'status', p_status, 'cost', p_cost_usd));
end; $$;
revoke all on function ai.finish_run(bigint, integer, integer, numeric, ai.run_status) from public, anon;
grant execute on function ai.finish_run(bigint, integer, integer, numeric, ai.run_status) to authenticated;

-- --- Permissions + seed -----------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('ai.run.create',   'Invoke the AI gateway for a tenant.', 'tenant'),
  ('ai.run.read',     'Read a tenant''s AI run history and cost.', 'tenant'),
  ('ai.prompt.manage','Curate the shared prompt library (platform).', 'platform'),
  ('ai.budget.manage','Set AI spend budgets (platform).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','ai.run.create'),('tenant_owner','ai.run.read'),
  ('tenant_admin','ai.run.create'),('tenant_admin','ai.run.read'),
  ('manager','ai.run.create'),('manager','ai.run.read'),
  ('service_account','ai.run.create'),
  ('staff','ai.run.read'),('viewer','ai.run.read'),
  ('platform_owner','ai.prompt.manage'),('platform_owner','ai.budget.manage'),
  ('platform_admin','ai.prompt.manage'),('platform_admin','ai.budget.manage')
on conflict do nothing;

-- Seed providers/models/prompt. Mock is active (for tests); anthropic is present
-- but INACTIVE until a real key is granted at deploy (no secret stored here).
insert into ai.providers (key, kind, is_active, credential_ref) values
  ('mock',      'mock',      true,  null),
  ('anthropic', 'anthropic', false, 'vault:anthropic_api_key')
on conflict (key) do nothing;
insert into ai.models (key, provider_key, input_cost, output_cost, is_active) values
  ('mock-model',       'mock',      0, 0, true),
  ('claude-latest',    'anthropic', 0.000003, 0.000015, false)
on conflict (key) do nothing;
insert into ai.prompts (key, name, latest_version) values ('seo-content','SEO content draft',1)
on conflict (key) do nothing;
insert into ai.prompt_versions (prompt_key, version, template, model_key)
values ('seo-content', 1, 'Write SEO-optimized content for: {{topic}}', 'mock-model')
on conflict (prompt_key, version) do nothing;
