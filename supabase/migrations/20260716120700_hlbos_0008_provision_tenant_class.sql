-- ===========================================================================
-- hlbos_0008_provision_tenant_class
--
-- Companion to 0007. Teaches platform.provision_tenant() the tenant class, so a
-- tenant is created with its class atomically instead of being created as a
-- customer and promoted afterwards.
--
-- Rules (owner decisions):
--   * tenant_class is an explicit parameter, DEFAULT 'customer'.
--   * Only a VERIFIED PLATFORM ADMINISTRATOR may provision a first_party tenant
--     or assign a parent tenant. This is checked in addition to the existing
--     platform.tenant.create permission.
--   * NO general service_role exemption. Declaring a company first-party, or
--     placing it in the corporate hierarchy, is a platform trust decision and
--     must carry a platform-admin session.
--
-- The function's parameter LIST changes, so this DROPs the 0006 three-argument
-- version and CREATEs the extended one. Two-argument callers are unaffected:
-- the new parameters have defaults, and there is only ever one provision_tenant,
-- so `provision_tenant('slug','name')` resolves unambiguously and behaves
-- exactly as before (customer class).
--
-- Not destructive to data. DROP FUNCTION only.
--
-- rollback:
--   -- Restore the 0006 three-argument function verbatim, then drop this one.
--   DROP FUNCTION IF EXISTS platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid);
--   CREATE OR REPLACE FUNCTION platform.provision_tenant(
--     p_slug extensions.citext, p_name text, p_owner uuid default null
--   ) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $restore$
--   DECLARE v_actor uuid := auth.uid(); v_owner uuid; v_tenant uuid; v_membership uuid;
--   BEGIN
--     IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING errcode='insufficient_privilege'; END IF;
--     IF NOT identity.has_platform_permission('platform.tenant.create') THEN
--       RAISE EXCEPTION 'insufficient privilege to create a tenant' USING errcode='insufficient_privilege'; END IF;
--     v_owner := coalesce(p_owner, v_actor);
--     IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_owner) THEN
--       RAISE EXCEPTION 'owner % has no auth.users record', v_owner USING errcode='foreign_key_violation'; END IF;
--     v_tenant := pg_catalog.gen_random_uuid();
--     INSERT INTO platform.tenants (id, slug, name, status, created_by, updated_by)
--       VALUES (v_tenant, p_slug, p_name, 'trial', v_actor, v_actor) ON CONFLICT (slug) DO NOTHING;
--     IF NOT FOUND THEN RAISE EXCEPTION 'tenant slug % already exists', p_slug USING errcode='unique_violation'; END IF;
--     INSERT INTO identity.memberships (tenant_id, user_id, status, created_by, updated_by)
--       VALUES (v_tenant, v_owner, 'active', v_actor, v_actor) RETURNING id INTO v_membership;
--     INSERT INTO identity.membership_roles (membership_id, role_key, granted_by)
--       VALUES (v_membership, 'tenant_owner', v_actor);
--     RETURN v_tenant;
--   END; $restore$;
--   REVOKE ALL ON FUNCTION platform.provision_tenant(extensions.citext, text, uuid) FROM public, anon;
--   GRANT EXECUTE ON FUNCTION platform.provision_tenant(extensions.citext, text, uuid) TO authenticated;
-- ===========================================================================

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

  -- Creating a first-party tenant, or placing a tenant under a parent, is a
  -- platform trust decision beyond ordinary tenant creation. Require a verified
  -- platform administrator. No service_role bypass -- deliberately.
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

  -- Generated INTERNALLY. Never accepted from the caller.
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

-- Re-establish the grant surface dropped with the old function.
revoke all on function platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid) from public;
revoke all on function platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid) from anon;
grant execute on function platform.provision_tenant(extensions.citext, text, uuid, platform.tenant_class, uuid) to authenticated;
