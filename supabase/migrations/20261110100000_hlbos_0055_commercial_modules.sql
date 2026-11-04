-- ===========================================================================
-- hlbos_0055_commercial_modules — module catalog, packages, and the server-side
-- licensing gate shared by every commercial product (TransportationOS, SalonOS).
--
-- Builds ON the existing entitlements schema (0010): module_activations stays the
-- single source of "is this module on for this tenant". Nothing here duplicates
-- identity, tenancy, billing or communications.
--
-- Product migrations (0110+, 0120+) seed their own module rows and packages.
--
-- rollback:
--   DROP FUNCTION IF EXISTS platform.provision_product_tenant(extensions.citext, text, extensions.citext, uuid);
--   DROP FUNCTION IF EXISTS entitlements.set_module_active(uuid, extensions.citext, boolean);
--   DROP FUNCTION IF EXISTS entitlements.apply_package(uuid, extensions.citext);
--   DROP FUNCTION IF EXISTS entitlements.require_module(uuid, extensions.citext);
--   DROP TABLE IF EXISTS entitlements.packages, entitlements.modules;
-- ===========================================================================

create table if not exists entitlements.modules (
  module_key      extensions.citext primary key,
  product         text not null check (product in ('platform','transportationos','salonos')),
  name            text not null,
  description     text not null default '',
  requires        extensions.citext[] not null default '{}',   -- modules that must ALSO be active
  billing_plan_key extensions.citext,                           -- soft link to billing.plans
  usage_limits    jsonb not null default '{}'::jsonb,           -- e.g. {"vehicles":25}; enforced by the owning module
  created_at      timestamptz not null default now(),
  constraint modules_key_format check (module_key ~ '^[a-z]+\.[a-z_]+$'),
  constraint modules_not_self_required check (not (module_key = any (requires)))
);
comment on table entitlements.modules is 'Commercial module catalog. One row per independently licensable module.';

create table if not exists entitlements.packages (
  package_key      extensions.citext primary key,
  product          text not null check (product in ('transportationos','salonos')),
  name             text not null,
  modules          extensions.citext[] not null,
  billing_plan_key extensions.citext,
  created_at       timestamptz not null default now()
);
comment on table entitlements.packages is 'Sellable bundles of modules. Applying a package only ADDS activations.';

alter table entitlements.modules  enable row level security;
alter table entitlements.modules  force  row level security;
alter table entitlements.packages enable row level security;
alter table entitlements.packages force  row level security;
drop policy if exists modules_select  on entitlements.modules;
create policy modules_select  on entitlements.modules  for select to authenticated using (true);
drop policy if exists packages_select on entitlements.packages;
create policy packages_select on entitlements.packages for select to authenticated using (true);
grant select on entitlements.modules, entitlements.packages to authenticated;

-- --- The gate -----------------------------------------------------------------
-- Called inside every product RPC BEFORE any data is touched. Internal: not granted
-- to API roles (it would let a caller probe another tenant's licences).
create or replace function entitlements.require_module(p_tenant uuid, p_module extensions.citext)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_req extensions.citext[]; r extensions.citext;
begin
  if not platform.tenant_is_operable(p_tenant) then
    raise exception 'tenant is not operable' using errcode = 'insufficient_privilege';
  end if;
  select m.requires into v_req from entitlements.modules m where m.module_key = p_module;
  if not found then
    raise exception 'unknown module %', p_module using errcode = 'undefined_object';
  end if;
  if not entitlements.module_is_active(p_tenant, p_module) then
    raise exception 'module % is not licensed for this tenant', p_module using errcode = 'insufficient_privilege';
  end if;
  foreach r in array v_req loop
    if not entitlements.module_is_active(p_tenant, r) then
      raise exception 'module % requires % which is not active', p_module, r using errcode = 'insufficient_privilege';
    end if;
  end loop;
end; $$;
revoke all on function entitlements.require_module(uuid, extensions.citext) from public, anon, authenticated;

-- --- Package application (platform administrators) ----------------------------
create or replace function entitlements.apply_package(p_tenant uuid, p_package extensions.citext)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_mods extensions.citext[]; m extensions.citext; v_n integer := 0; v_missing extensions.citext;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if not identity.has_platform_permission('entitlements.module.manage') then
    raise exception 'only a platform administrator may apply a package' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from platform.tenants t where t.id = p_tenant) then
    raise exception 'tenant % does not exist', p_tenant using errcode = 'foreign_key_violation';
  end if;
  select p.modules into v_mods from entitlements.packages p where p.package_key = p_package;
  if not found then raise exception 'unknown package %', p_package using errcode = 'undefined_object'; end if;
  -- every module in the package must exist, and its dependencies must be in the package or already on
  foreach m in array v_mods loop
    if not exists (select 1 from entitlements.modules x where x.module_key = m) then
      raise exception 'package % references unknown module %', p_package, m using errcode = 'undefined_object';
    end if;
    if exists (select 1 from entitlements.modules x where x.module_key = m and x.usage_limits->>'status' = 'planned') then
      raise exception 'module % is planned and has no implementation yet; it cannot be licensed', m using errcode = 'feature_not_supported';
    end if;
    select r into v_missing from entitlements.modules x, unnest(x.requires) r
     where x.module_key = m and not (r = any (v_mods)) and not entitlements.module_is_active(p_tenant, r) limit 1;
    if v_missing is not null then
      raise exception 'package % is incomplete: % requires %', p_package, m, v_missing using errcode = 'check_violation';
    end if;
  end loop;
  foreach m in array v_mods loop
    insert into entitlements.module_activations (tenant_id, module, active, activated_by)
    values (p_tenant, m, true, auth.uid())
    on conflict (tenant_id, module) do update set active = true, activated_at = now(), activated_by = auth.uid();
    v_n := v_n + 1;
  end loop;
  perform events.emit('entitlements.package.applied', p_tenant, jsonb_build_object('package', p_package, 'modules', v_n));
  return v_n;
end; $$;
revoke all on function entitlements.apply_package(uuid, extensions.citext) from public, anon;
grant execute on function entitlements.apply_package(uuid, extensions.citext) to authenticated;

-- Switch one module on/off. Turning a module OFF never deletes operational data;
-- it only closes the gate. A module still required by an active module cannot be turned off.
create or replace function entitlements.set_module_active(p_tenant uuid, p_module extensions.citext, p_active boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_dep extensions.citext; v_req extensions.citext;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if not identity.has_platform_permission('entitlements.module.manage') then
    raise exception 'only a platform administrator may change a module' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from entitlements.modules x where x.module_key = p_module) then
    raise exception 'unknown module %', p_module using errcode = 'undefined_object';
  end if;
  if p_active then
    if exists (select 1 from entitlements.modules x where x.module_key = p_module and x.usage_limits->>'status' = 'planned') then
      raise exception 'module % is planned and has no implementation yet; it cannot be licensed', p_module using errcode = 'feature_not_supported';
    end if;
    select r into v_req from entitlements.modules x, unnest(x.requires) r
     where x.module_key = p_module and not entitlements.module_is_active(p_tenant, r) limit 1;
    if v_req is not null then
      raise exception 'module % requires % which is not active', p_module, v_req using errcode = 'check_violation';
    end if;
  else
    select a.module into v_dep from entitlements.module_activations a
      join entitlements.modules x on x.module_key = a.module
     where a.tenant_id = p_tenant and a.active and p_module = any (x.requires) limit 1;
    if v_dep is not null then
      raise exception 'module % is required by active module %', p_module, v_dep using errcode = 'check_violation';
    end if;
  end if;
  insert into entitlements.module_activations (tenant_id, module, active, activated_by)
  values (p_tenant, p_module, p_active, auth.uid())
  on conflict (tenant_id, module) do update set active = p_active, activated_at = now(), activated_by = auth.uid();
  perform events.emit((case when p_active then 'entitlements.module.activated' else 'entitlements.module.deactivated' end)::extensions.citext,
                      p_tenant, jsonb_build_object('module', p_module));
end; $$;
revoke all on function entitlements.set_module_active(uuid, extensions.citext, boolean) from public, anon;
grant execute on function entitlements.set_module_active(uuid, extensions.citext, boolean) to authenticated;

-- --- One-call product tenant provisioning (platform administrators) ------------
create or replace function platform.provision_product_tenant(
  p_slug extensions.citext, p_name text, p_package extensions.citext, p_owner uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if not identity.has_platform_permission('entitlements.module.manage') then
    raise exception 'only a platform administrator may provision a product tenant' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from entitlements.packages p where p.package_key = p_package) then
    raise exception 'unknown package %', p_package using errcode = 'undefined_object';
  end if;
  v_tenant := platform.provision_tenant(p_slug, p_name, p_owner);
  perform entitlements.apply_package(v_tenant, p_package);
  return v_tenant;
end; $$;
revoke all on function platform.provision_product_tenant(extensions.citext, text, extensions.citext, uuid) from public, anon;
grant execute on function platform.provision_product_tenant(extensions.citext, text, extensions.citext, uuid) to authenticated;

create trigger modules_audit  after insert or update or delete on entitlements.modules  for each row execute function audit.emit();
