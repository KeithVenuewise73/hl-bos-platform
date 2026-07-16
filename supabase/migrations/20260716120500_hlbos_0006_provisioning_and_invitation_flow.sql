-- ===========================================================================
-- hlbos_0006_provisioning_and_invitation_flow
--
-- The three controlled entry points. Each depends on every other object in the
-- set, so they ship last, on a complete foundation.
--
--   platform.provision_tenant()               -- atomic tenant creation
--   identity.accept_invitation()              -- token-authorized acceptance
--   platform.bootstrap_first_platform_owner() -- one-time, owner-only
--
-- Design: docs/operations/phase-2-migration-set.md sections 6 and 8
--         docs/operations/bootstrap-first-platform-owner.md
--
-- rollback:
--   DROP FUNCTION IF EXISTS platform.bootstrap_first_platform_owner(extensions.citext);
--   DROP FUNCTION IF EXISTS identity.accept_invitation(text);
--   DROP FUNCTION IF EXISTS platform.provision_tenant(extensions.citext, text, uuid);
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- platform.provision_tenant
--
-- Takes NO tenant id. There is no parameter through which a caller could
-- supply one, so "a supplied tenant UUID is never accepted as authorization"
-- holds STRUCTURALLY, not by validation.
--
-- Atomic: a PL/pgSQL exception rolls back every effect of the call, so a
-- failure at the role step cannot leave an ownerless tenant behind.
-- ---------------------------------------------------------------------------
create or replace function platform.provision_tenant(
  p_slug  extensions.citext,
  p_name  text,
  p_owner uuid default null
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
    perform audit.log_security_event(
      'platform.tenant.create', 'denied', 'warning', null, 'platform.tenants', null,
      jsonb_build_object('slug', p_slug::text)
    );
    raise exception 'insufficient privilege to create a tenant'
      using errcode = 'insufficient_privilege';
  end if;

  v_owner := coalesce(p_owner, v_actor);

  if not exists (select 1 from auth.users u where u.id = v_owner) then
    raise exception 'owner % has no auth.users record', v_owner
      using errcode = 'foreign_key_violation';
  end if;

  -- Generated INTERNALLY. Never accepted from the caller.
  v_tenant := pg_catalog.gen_random_uuid();

  insert into platform.tenants (id, slug, name, status, created_by, updated_by)
  values (v_tenant, p_slug, p_name, 'trial', v_actor, v_actor)
  on conflict (slug) do nothing;

  if not found then
    -- Deterministic rejection, no partial write. Chosen over silently returning
    -- the existing tenant, which would mask a race between two callers.
    raise exception 'tenant slug % already exists', p_slug
      using errcode = 'unique_violation';
  end if;

  insert into identity.memberships (tenant_id, user_id, status, created_by, updated_by)
  values (v_tenant, v_owner, 'active', v_actor, v_actor)
  returning id into v_membership;

  insert into identity.membership_roles (membership_id, role_key, granted_by)
  values (v_membership, 'tenant_owner', v_actor);

  -- audit rows are emitted by the 0004 triggers on all three tables.
  return v_tenant;
end;
$$;

comment on function platform.provision_tenant(extensions.citext, text, uuid) is
  'The ONLY way a tenant comes into existence. Creates tenant + owner membership + tenant_owner role atomically. platform.tenants has no INSERT policy.';

revoke all on function platform.provision_tenant(extensions.citext, text, uuid) from public;
revoke all on function platform.provision_tenant(extensions.citext, text, uuid) from anon;
grant execute on function platform.provision_tenant(extensions.citext, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- identity.accept_invitation
--
-- Owner ruling 2026-07-15: acceptance is authenticated-user + token authorized,
-- NOT permission authorized. has_permission() is never called here -- it
-- requires an active membership, which the invitee by definition lacks.
--
-- Signature carries no authorization surface: no actor_user_id parameter (the
-- user comes from auth.uid()), no tenant id (it comes from the invitation row).
--
-- Every failure path raises the SAME message. Distinct messages would let a
-- token holder probe whether a selector exists, whether it is expired, whether
-- it was revoked, and which address it belongs to. The discriminating detail
-- goes to audit.security_events, which the attacker cannot read.
-- ---------------------------------------------------------------------------
create or replace function identity.accept_invitation(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_email      extensions.citext;
  v_selector   text;
  v_verifier   text;
  v_inv        identity.invitations%rowtype;
  v_membership uuid;
  c_generic    constant text := 'invalid or expired invitation';
begin
  if v_actor is null then
    raise exception '%', c_generic using errcode = 'insufficient_privilege';
  end if;

  select u.email::extensions.citext into v_email from auth.users u where u.id = v_actor;

  -- Split "<selector>.<verifier>". Malformed input takes the same path as a
  -- wrong token, so token shape is not distinguishable from token validity.
  v_selector := split_part(p_token, '.', 1);
  v_verifier := split_part(p_token, '.', 2);
  if v_selector = '' or v_verifier = '' then
    perform audit.log_security_event('identity.invitation.accept', 'denied', 'warning',
      null, 'identity.invitations', null, jsonb_build_object('reason','malformed_token'));
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  -- Lookup by the NON-SECRET selector. Its timing reveals only that some
  -- selector exists -- never anything about the verifier.
  -- FOR UPDATE locks the row: replay and concurrent acceptance serialize here.
  select * into v_inv from identity.invitations i
  where i.token_selector = v_selector
  for update;

  if not found then
    perform audit.log_security_event('identity.invitation.accept', 'denied', 'warning',
      null, 'identity.invitations', null, jsonb_build_object('reason','unknown_selector'));
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  -- CONSTANT-TIME verifier comparison. The lookup above never touched the secret.
  if not identity.ct_eq(
       encode(extensions.digest(v_verifier, 'sha256'), 'hex'),
       v_inv.token_verifier_hash
     ) then
    perform audit.log_security_event('identity.invitation.accept', 'denied', 'critical',
      v_inv.tenant_id, 'identity.invitations', v_inv.id::text,
      jsonb_build_object('reason','verifier_mismatch'));
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if v_inv.status <> 'pending' then     -- replay, revoked, already accepted
    perform audit.log_security_event('identity.invitation.accept', 'denied', 'warning',
      v_inv.tenant_id, 'identity.invitations', v_inv.id::text,
      jsonb_build_object('reason','status_' || v_inv.status::text));
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if v_inv.expires_at <= now() then
    update identity.invitations set status = 'expired' where id = v_inv.id;
    perform audit.log_security_event('identity.invitation.accept', 'denied', 'info',
      v_inv.tenant_id, 'identity.invitations', v_inv.id::text,
      jsonb_build_object('reason','expired'));
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if v_inv.email is distinct from v_email then
    -- The stolen-link case: valid token, wrong account.
    perform audit.log_security_event('identity.invitation.accept', 'denied', 'critical',
      v_inv.tenant_id, 'identity.invitations', v_inv.id::text,
      jsonb_build_object('reason','email_mismatch'));
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if not platform.tenant_is_operable(v_inv.tenant_id) then
    perform audit.log_security_event('identity.invitation.accept', 'denied', 'warning',
      v_inv.tenant_id, 'identity.invitations', v_inv.id::text,
      jsonb_build_object('reason','tenant_not_operable'));
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  -- Tenant DERIVED from the invitation row, never supplied.
  insert into identity.memberships (tenant_id, user_id, status, created_by, updated_by)
  values (v_inv.tenant_id, v_actor, 'active', v_actor, v_actor)
  on conflict (tenant_id, user_id)
    do update set status = 'active', updated_by = v_actor   -- reactivate a removed member
  returning id into v_membership;

  insert into identity.membership_roles (membership_id, role_key, granted_by)
  values (v_membership, v_inv.role_key, v_actor)
  on conflict do nothing;

  update identity.invitations
     set status = 'accepted', accepted_by = v_actor, accepted_at = now()
   where id = v_inv.id;

  return v_membership;
end;
$$;

comment on function identity.accept_invitation(text) is
  'Token-authorized invitation acceptance. Verifies selector/verifier (constant-time), pending status, expiry, intended email, tenant status. Never calls has_permission(): the invitee has no active membership by definition.';

revoke all on function identity.accept_invitation(text) from public;
revoke all on function identity.accept_invitation(text) from anon;
grant execute on function identity.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- platform.bootstrap_first_platform_owner
--
-- Owner correction 2026-07-15: service_role must NOT be able to bootstrap a
-- platform owner. service_role is an API credential -- it lives in
-- SUPABASE_SERVICE_ROLE_KEY, in env config, on servers, in CI. If a leaked
-- service key could mint a platform_owner, one leaked environment variable is
-- a total platform takeover.
--
-- Callable only by the database owner through the Supabase SQL Editor. No API
-- or application credential is granted execution permission.
-- ---------------------------------------------------------------------------
create or replace function platform.bootstrap_first_platform_owner(p_email extensions.citext)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user      uuid;
  v_confirmed timestamptz;
  v_n         int;
begin
  -- Self-disarming: inert once any platform admin exists, so this cannot
  -- quietly mint a second superuser later.
  if exists (select 1 from identity.platform_admins) then
    raise exception 'bootstrap already performed; use normal role grants'
      using errcode = 'unique_violation';
  end if;

  select count(*) into v_n from auth.users u where lower(u.email) = lower(p_email::text);
  if v_n = 0 then
    raise exception 'no auth.users record for % (create it in the dashboard first)', p_email
      using errcode = 'no_data_found';
  end if;
  if v_n > 1 then
    raise exception 'ambiguous: % auth.users records match %', v_n, p_email
      using errcode = 'cardinality_violation';
  end if;

  select u.id, u.email_confirmed_at into v_user, v_confirmed
  from auth.users u where lower(u.email) = lower(p_email::text);

  -- An unconfirmed signup proves nothing about who controls the address, and
  -- this is the most privileged grant in the system.
  if v_confirmed is null then
    raise exception 'user % has not confirmed their email; refusing to grant platform_owner', p_email
      using errcode = 'insufficient_privilege';
  end if;

  insert into identity.platform_admins (user_id, role_key, granted_by)
  values (v_user, 'platform_owner', v_user);

  perform audit.log_security_event(
    'platform.bootstrap.first_owner', 'allowed', 'critical',
    null, 'identity.platform_admins', v_user::text,
    jsonb_build_object('role_key','platform_owner')
  );

  return v_user;
end;
$$;

comment on function platform.bootstrap_first_platform_owner(extensions.citext) is
  'One-time. Callable only by the database owner through the Supabase SQL Editor. No API or application credential is granted execution permission. Self-disarms once any platform admin exists.';

-- REVOKE FROM PUBLIC is the load-bearing clause: PostgreSQL grants EXECUTE to
-- PUBLIC on every new function by default, so without it service_role would
-- hold execute VIA PUBLIC and the named revokes below would be decorative.
-- The per-role revokes are declarative: they make the intent auditable and
-- survive someone later re-granting to PUBLIC.
revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from public;
revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from anon;
revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from authenticated;
revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from service_role;
-- No GRANT. Owner (postgres) only, by virtue of ownership.
