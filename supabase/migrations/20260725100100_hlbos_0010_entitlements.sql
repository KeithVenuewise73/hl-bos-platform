-- ===========================================================================
-- v0_entitlements — feature entitlements & per-tenant module activation
--
-- The mechanism by which a tenant "inherits" a Factory capability. VisibilityAI
-- is toggled per tenant/plan through entitlements.activate_module('visibility').
-- Reusable by every product; not duplicated inside VisibilityAI.
--
-- rollback:
--   DROP SCHEMA IF EXISTS entitlements CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'entitlements.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'entitlements.%';
-- ===========================================================================

create schema if not exists entitlements;
comment on schema entitlements is 'HL-BOS: feature entitlements and module activation. NOT exposed via PostgREST.';
revoke all on schema entitlements from public, anon, authenticated;
grant usage on schema entitlements to authenticated;
alter default privileges in schema entitlements revoke all on tables from public;
alter default privileges in schema entitlements revoke all on functions from public;

do $$ begin
  create type entitlements.grant_source as enum ('plan','trial','grant');
exception when duplicate_object then null; end $$;

create table if not exists entitlements.features (
  key         extensions.citext primary key,
  name        text not null,
  module      text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  constraint features_key_format check (key ~ '^[a-z_]+\.[a-z_]+$')
);
comment on table entitlements.features is 'Global feature catalog. key like visibility.reputation.';

create table if not exists entitlements.plan_features (
  plan_key    extensions.citext not null,   -- soft link to billing.plans (billing not built in V0)
  feature_key extensions.citext not null references entitlements.features(key) on delete cascade,
  primary key (plan_key, feature_key)
);

create table if not exists entitlements.tenant_entitlements (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  feature_key extensions.citext not null references entitlements.features(key) on delete restrict,
  source      entitlements.grant_source not null default 'grant',
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz,
  constraint tenant_entitlements_unique unique (tenant_id, feature_key)
);
create index if not exists tenant_entitlements_tenant_idx on entitlements.tenant_entitlements (tenant_id);

create table if not exists entitlements.module_activations (
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  module        extensions.citext not null,
  active        boolean not null default true,
  activated_at  timestamptz not null default now(),
  activated_by  uuid references auth.users(id) on delete set null,
  primary key (tenant_id, module)
);

create trigger tenant_entitlements_audit after insert or update or delete on entitlements.tenant_entitlements
  for each row execute function audit.emit();
create trigger module_activations_audit after insert or update or delete on entitlements.module_activations
  for each row execute function audit.emit();

-- --- RLS --------------------------------------------------------------------
alter table entitlements.features            enable row level security;
alter table entitlements.features            force  row level security;
alter table entitlements.plan_features       enable row level security;
alter table entitlements.plan_features       force  row level security;
alter table entitlements.tenant_entitlements enable row level security;
alter table entitlements.tenant_entitlements force  row level security;
alter table entitlements.module_activations  enable row level security;
alter table entitlements.module_activations  force  row level security;

-- catalog is readable by any authenticated member context; grants change via definer fns only
drop policy if exists features_select on entitlements.features;
create policy features_select on entitlements.features for select to authenticated using (true);
drop policy if exists plan_features_select on entitlements.plan_features;
create policy plan_features_select on entitlements.plan_features for select to authenticated using (true);
-- a tenant sees only its own entitlements + activations
drop policy if exists tenant_entitlements_select on entitlements.tenant_entitlements;
create policy tenant_entitlements_select on entitlements.tenant_entitlements for select to authenticated
  using (identity.is_member(tenant_id));
drop policy if exists module_activations_select on entitlements.module_activations;
create policy module_activations_select on entitlements.module_activations for select to authenticated
  using (identity.is_member(tenant_id));

grant select on entitlements.features, entitlements.plan_features,
                entitlements.tenant_entitlements, entitlements.module_activations to authenticated;

-- --- The gate: has_feature --------------------------------------------------
create or replace function entitlements.has_feature(p_tenant uuid, p_feature extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from entitlements.tenant_entitlements te
    where te.tenant_id = p_tenant and te.feature_key = p_feature
      and (te.expires_at is null or te.expires_at > now())
  );
$$;
comment on function entitlements.has_feature(uuid, extensions.citext) is
  'True if the tenant currently holds the feature (honoring expiry). The gate every product/module consults. Fails closed.';
revoke all on function entitlements.has_feature(uuid, extensions.citext) from public, anon;
grant execute on function entitlements.has_feature(uuid, extensions.citext) to authenticated;

create or replace function entitlements.module_is_active(p_tenant uuid, p_module extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from entitlements.module_activations m
                 where m.tenant_id = p_tenant and m.module = p_module and m.active);
$$;
revoke all on function entitlements.module_is_active(uuid, extensions.citext) from public, anon;
grant execute on function entitlements.module_is_active(uuid, extensions.citext) to authenticated;

-- --- Activation (platform-admin only) ---------------------------------------
create or replace function entitlements.activate_module(p_tenant uuid, p_module extensions.citext)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not identity.has_platform_permission('entitlements.module.manage') then
    raise exception 'only a platform administrator may activate a module for a tenant'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from platform.tenants t where t.id = p_tenant) then
    raise exception 'tenant % does not exist', p_tenant using errcode = 'foreign_key_violation';
  end if;
  insert into entitlements.module_activations (tenant_id, module, active, activated_by)
  values (p_tenant, p_module, true, auth.uid())
  on conflict (tenant_id, module) do update set active = true, activated_at = now(), activated_by = auth.uid();
  perform events.emit('entitlements.module.activated', p_tenant, jsonb_build_object('module', p_module));
  perform audit.log_security_event('entitlements.module.activate', 'allowed', 'info',
    p_tenant, 'entitlements.module_activations', p_module::text, jsonb_build_object('module', p_module));
end; $$;
revoke all on function entitlements.activate_module(uuid, extensions.citext) from public, anon;
grant execute on function entitlements.activate_module(uuid, extensions.citext) to authenticated;

-- --- Permissions + seed -----------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('entitlements.feature.read', 'Read a tenant''s feature entitlements and module activations.', 'tenant'),
  ('entitlements.module.manage', 'Activate or deactivate modules for tenants (platform).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','entitlements.feature.read'),
  ('tenant_admin','entitlements.feature.read'),
  ('manager','entitlements.feature.read'),
  ('platform_owner','entitlements.module.manage'),
  ('platform_admin','entitlements.module.manage')
on conflict do nothing;

-- Seed the VisibilityAI feature catalog (activation happens per-tenant later).
insert into entitlements.features (key, name, module, description) values
  ('visibility.core',       'VisibilityAI Core',        'visibility', 'Sites, SEO audits, module access.'),
  ('visibility.content',    'AI Content Generation',    'visibility', 'AI-drafted content with human approval.'),
  ('visibility.reputation', 'Reputation Management',    'visibility', 'Review ingestion and gated responses.')
on conflict (key) do nothing;
