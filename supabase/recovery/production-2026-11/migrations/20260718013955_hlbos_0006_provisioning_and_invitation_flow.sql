-- hlbos_0006_provisioning_and_invitation_flow
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
    raise exception 'insufficient privilege to create a tenant'
      using errcode = 'insufficient_privilege';
  end if;

  v_owner := coalesce(p_owner, v_actor);

  if not exists (select 1 from auth.users u where u.id = v_owner) then
    raise exception 'owner % has no auth.users record', v_owner
      using errcode = 'foreign_key_violation';
  end if;

  v_tenant := pg_catalog.gen_random_uuid();

  insert into platform.tenants (id, slug, name, status, created_by, updated_by)
  values (v_tenant, p_slug, p_name, 'trial', v_actor, v_actor)
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

comment on function platform.provision_tenant(extensions.citext, text, uuid) is
  'The ONLY way a tenant comes into existence. Creates tenant + owner membership + tenant_owner role atomically. platform.tenants has no INSERT policy.';

revoke all on function platform.provision_tenant(extensions.citext, text, uuid) from public;
revoke all on function platform.provision_tenant(extensions.citext, text, uuid) from anon;
grant execute on function platform.provision_tenant(extensions.citext, text, uuid) to authenticated;

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

  v_selector := split_part(p_token, '.', 1);
  v_verifier := split_part(p_token, '.', 2);
  if v_selector = '' or v_verifier = '' then
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  select * into v_inv from identity.invitations i
  where i.token_selector = v_selector
  for update;

  if not found then
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if not identity.ct_eq(
       encode(extensions.digest(v_verifier, 'sha256'), 'hex'),
       v_inv.token_verifier_hash
     ) then
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if v_inv.status <> 'pending' then
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if v_inv.expires_at <= now() then
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if v_inv.email is distinct from v_email then
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  if not platform.tenant_is_operable(v_inv.tenant_id) then
    raise exception '%', c_generic using errcode = 'invalid_parameter_value';
  end if;

  insert into identity.memberships (tenant_id, user_id, status, created_by, updated_by)
  values (v_inv.tenant_id, v_actor, 'active', v_actor, v_actor)
  on conflict (tenant_id, user_id)
    do update set status = 'active', updated_by = v_actor
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

revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from public;
revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from anon;
revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from authenticated;
revoke all on function platform.bootstrap_first_platform_owner(extensions.citext) from service_role;