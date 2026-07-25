-- ===========================================================================
-- hlbos_0008_provision_tenant_class
--
-- Replaces platform.provision_tenant(citext, text, uuid) with a class-aware
-- version that also accepts a tenant_class and an optional parent tenant.
-- first_party or a parent require a verified platform admin -- there is no
-- service_role bypass -- in addition to the platform.tenant.create permission.
--
-- RECONCILED FROM HL-BOS CORE. This file is the exact SQL recorded in
-- supabase_migrations.schema_migrations for version 20260718014042 on the paid
-- HL-BOS Core project (mvvtngiopdrgiedjmhfb). It supersedes the 3-argument
-- provision_tenant created in 0006. Behaviour is preserved exactly.
--
-- rollback:
--   DROP FUNCTION IF EXISTS platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid);
--   -- then re-create the 3-argument provision_tenant from 0006 to restore prior behaviour.
-- ===========================================================================

-- hlbos_0008_provision_tenant_class
drop function if exists platform.provision_tenant(extensions.citext, text, uuid);

create or replace function platform.provision_tenant(
  p_slug             extensions.citext,
  p_name             text,
  p_owner            uuid default null,
  p_tenant_class     platform.tenant_class default 'customer',
  p_parent_tenant_id uuid default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_owner      uuid;
  v_tenant     uuid;
  v_membership uuid;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not identity.has_platform_permission('platform.tenant.create') then
    raise exception 'insufficient privilege to create a tenant'
      using errcode = 'insufficient_privilege';
  end if;

  if (p_tenant_class = 'first_party' or p_parent_tenant_id is not null)
     and not identity.is_platform_admin() then
    raise exception
      'only a platform administrator may provision a first_party tenant or assign a parent tenant'
      using errcode = 'insufficient_privilege';
  end if;

  if p_parent_tenant_id is not null
     and not exists (select 1 from platform.tenants t where t.id = p_parent_tenant_id) then
    raise exception 'parent tenant % does not exist', p_parent_tenant_id
      using errcode = 'foreign_key_violation';
  end if;

  v_owner := coalesce(p_owner, v_actor);

  if not exists (select 1 from auth.users u where u.id = v_owner) then
    raise exception 'owner % has no auth.users record', v_owner
      using errcode = 'foreign_key_violation';
  end if;

  v_tenant := pg_catalog.gen_random_uuid();

  insert into platform.tenants
    (id, slug, name, status, tenant_class, parent_tenant_id, created_by, updated_by)
  values
    (v_tenant, p_slug, p_name, 'trial', p_tenant_class, p_parent_tenant_id, v_actor, v_actor)
  on conflict (slug) do nothing;

  if not found then
    raise exception 'tenant slug % already exists', p_slug
      using errcode = 'unique_violation';
  end if;

  insert into identity.memberships (tenant_id, user_id, status, created_by, updated_by)
  values (v_tenant, v_owner, 'active', v_actor, v_actor)
  returning id into v_membership;

  insert into identity.membership_roles (membership_id, role_key, granted_by)
  values (v_membership, 'tenant_owner', v_actor);

  return v_tenant;
end;
$$;

comment on function platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid) is
  'Atomic tenant creation with class. Default customer. first_party or a parent require a verified platform admin (no service_role bypass), in addition to platform.tenant.create.';

revoke all on function platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid) from public;
revoke all on function platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid) from anon;
grant execute on function platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid) to authenticated;
