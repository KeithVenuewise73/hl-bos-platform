-- hlbos_0003_roles_and_permissions
do $$ begin
  create type identity.role_scope as enum ('platform','tenant');
exception when duplicate_object then null; end $$;

create table if not exists identity.roles (
  key          extensions.citext primary key,
  name         text not null,
  description  text not null,
  scope        identity.role_scope not null,
  is_system    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table identity.roles is 'Role catalog. Static vocabulary; changes only by migration.';

create table if not exists identity.permissions (
  key          extensions.citext primary key,
  description  text not null,
  scope        identity.role_scope not null,
  created_at   timestamptz not null default now(),
  constraint permissions_key_format
    check (key ~ '^[a-z_]+\.[a-z_]+\.(read|create|update|delete|revoke|assign|manage)$')
);
comment on table identity.permissions is 'Permission vocabulary. Frozen at 17 for Phase 2.';

create table if not exists identity.role_permissions (
  role_key        extensions.citext not null references identity.roles(key) on delete cascade,
  permission_key  extensions.citext not null references identity.permissions(key) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (role_key, permission_key)
);
comment on table identity.role_permissions is
  'Role -> permission grants. A trigger enforces scope equality: a tenant role can never hold a platform permission.';

create table if not exists identity.membership_roles (
  membership_id  uuid not null references identity.memberships(id) on delete cascade,
  role_key       extensions.citext not null references identity.roles(key) on delete restrict,
  granted_at     timestamptz not null default now(),
  granted_by     uuid references auth.users(id) on delete set null,
  primary key (membership_id, role_key)
);
comment on table identity.membership_roles is 'Roles held by a membership. Tenant-scoped roles only (trigger enforced).';

create table if not exists identity.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role_key    extensions.citext not null references identity.roles(key) on delete restrict,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users(id) on delete set null
);
comment on table identity.platform_admins is
  'Platform-level authority. Deliberately a separate table, not a membership with a sentinel tenant -- a magic tenant_id would need a special case in every tenant-scoped policy, and one missed case is a cross-tenant leak.';

do $$ begin
  alter table identity.invitations
    add constraint invitations_role_key_fkey
    foreign key (role_key) references identity.roles(key) on delete restrict;
exception when duplicate_object then null; end $$;

create or replace function identity.assert_role_permission_scope_match()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_role identity.role_scope; v_perm identity.role_scope;
begin
  select scope into v_role from identity.roles       where key = new.role_key;
  select scope into v_perm from identity.permissions where key = new.permission_key;
  if v_role is distinct from v_perm then
    raise exception 'scope mismatch: role % is %, permission % is %',
      new.role_key, v_role, new.permission_key, v_perm
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create or replace function identity.assert_role_scope_tenant()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_scope identity.role_scope;
begin
  select scope into v_scope from identity.roles where key = new.role_key;
  if v_scope <> 'tenant' then
    raise exception 'role % is %-scoped and cannot be attached to a tenant membership',
      new.role_key, v_scope using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create or replace function identity.assert_role_scope_platform()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_scope identity.role_scope;
begin
  select scope into v_scope from identity.roles where key = new.role_key;
  if v_scope <> 'platform' then
    raise exception 'role % is %-scoped and cannot be granted as a platform admin role',
      new.role_key, v_scope using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists role_permissions_scope_guard on identity.role_permissions;
create trigger role_permissions_scope_guard
  before insert or update on identity.role_permissions
  for each row execute function identity.assert_role_permission_scope_match();

drop trigger if exists membership_roles_scope_guard on identity.membership_roles;
create trigger membership_roles_scope_guard
  before insert or update on identity.membership_roles
  for each row execute function identity.assert_role_scope_tenant();

drop trigger if exists platform_admins_scope_guard on identity.platform_admins;
create trigger platform_admins_scope_guard
  before insert or update on identity.platform_admins
  for each row execute function identity.assert_role_scope_platform();

create or replace function platform.tenant_is_operable(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from platform.tenants t
    where t.id = p_tenant and t.status in ('trial','active')
  );
$$;
comment on function platform.tenant_is_operable(uuid) is
  'True when the tenant may be used. Suspended/deactivated tenants deny everything, to every role, including tenant_owner.';

create or replace function identity.is_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from identity.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = p_tenant
      and m.status = 'active'
  );
$$;

create or replace function identity.my_tenant_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.tenant_id
  from identity.memberships m
  where m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function identity.has_permission(p_tenant uuid, p_permission extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from identity.memberships m
    join platform.tenants           t  on t.id = m.tenant_id
    join identity.membership_roles mr  on mr.membership_id = m.id
    join identity.role_permissions rp  on rp.role_key = mr.role_key
    where m.user_id = auth.uid()
      and m.tenant_id = p_tenant
      and m.status = 'active'
      and t.status in ('trial','active')
      and rp.permission_key = p_permission
  );
$$;
comment on function identity.has_permission(uuid, extensions.citext) is
  'THE authorization check. Requires an active membership AND a trial/active tenant. Must not be weakened -- invitation acceptance deliberately does not call it (owner ruling 2026-07-15).';

create or replace function identity.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from identity.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

create or replace function identity.has_platform_permission(p_permission extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from identity.platform_admins pa
    join identity.role_permissions rp on rp.role_key = pa.role_key
    where pa.user_id = auth.uid()
      and rp.permission_key = p_permission
  );
$$;

create or replace function identity.can_grant_role(p_tenant uuid, p_role extensions.citext)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1
    from identity.role_permissions rp
    where rp.role_key = p_role
      and not identity.has_permission(p_tenant, rp.permission_key)
  );
$$;
comment on function identity.can_grant_role(uuid, extensions.citext) is
  'True when the caller holds every permission the target role holds, in this tenant. Prevents granting authority you do not have. Bypassed by SECURITY DEFINER flows (provision/accept), which is intended.';

revoke all on function identity.can_grant_role(uuid, extensions.citext) from public;
grant execute on function identity.can_grant_role(uuid, extensions.citext) to authenticated;

create or replace function identity.assert_invitation_role_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_scope identity.role_scope;
begin
  select scope into v_scope from identity.roles where key = new.role_key;
  if v_scope is distinct from 'tenant' then
    raise exception 'invitation role % is %-scoped; invitations may only carry tenant roles',
      new.role_key, coalesce(v_scope::text, 'unknown')
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists invitations_role_scope_guard on identity.invitations;
create trigger invitations_role_scope_guard
  before insert or update on identity.invitations
  for each row execute function identity.assert_invitation_role_scope();

create or replace function identity.ct_eq(a text, b text)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare
  diff int := 0;
  i    int;
begin
  if length(a) <> length(b) then
    return false;
  end if;
  for i in 1..length(a) loop
    diff := diff | (ascii(substr(a, i, 1)) # ascii(substr(b, i, 1)));
  end loop;
  return diff = 0;
end;
$$;
comment on function identity.ct_eq(text, text) is
  'Constant-time-intent string equality; XOR-accumulates every byte with no early exit. See the limitation note in the function body.';

revoke all on function platform.tenant_is_operable(uuid) from public;
revoke all on function identity.is_member(uuid) from public;
revoke all on function identity.my_tenant_ids() from public;
revoke all on function identity.has_permission(uuid, extensions.citext) from public;
revoke all on function identity.is_platform_admin() from public;
revoke all on function identity.has_platform_permission(extensions.citext) from public;
revoke all on function identity.ct_eq(text, text) from public;

grant execute on function platform.tenant_is_operable(uuid) to authenticated;
grant execute on function identity.is_member(uuid) to authenticated;
grant execute on function identity.my_tenant_ids() to authenticated;
grant execute on function identity.has_permission(uuid, extensions.citext) to authenticated;
grant execute on function identity.is_platform_admin() to authenticated;
grant execute on function identity.has_platform_permission(extensions.citext) to authenticated;

alter table identity.roles             enable row level security;
alter table identity.roles             force  row level security;
alter table identity.permissions       enable row level security;
alter table identity.permissions       force  row level security;
alter table identity.role_permissions  enable row level security;
alter table identity.role_permissions  force  row level security;
alter table identity.membership_roles  enable row level security;
alter table identity.membership_roles  force  row level security;
alter table identity.platform_admins   enable row level security;
alter table identity.platform_admins   force  row level security;

grant select on identity.roles, identity.permissions, identity.role_permissions to authenticated;
grant select on platform.tenants to authenticated;
grant update on platform.tenants to authenticated;
grant select, insert, update on identity.profiles to authenticated;
grant select, insert, update, delete on identity.memberships to authenticated;
grant select, insert, update on identity.invitations to authenticated;
grant select, insert, delete on identity.membership_roles to authenticated;
grant select on identity.platform_admins to authenticated;

drop policy if exists roles_select on identity.roles;
create policy roles_select on identity.roles
  for select to authenticated using (true);

drop policy if exists permissions_select on identity.permissions;
create policy permissions_select on identity.permissions
  for select to authenticated using (true);

drop policy if exists role_permissions_select on identity.role_permissions;
create policy role_permissions_select on identity.role_permissions
  for select to authenticated using (true);

drop policy if exists tenants_select on platform.tenants;
create policy tenants_select on platform.tenants
  for select to authenticated
  using (
    identity.is_member(id)
    or identity.has_platform_permission('platform.tenant.read')
  );

drop policy if exists tenants_update on platform.tenants;
create policy tenants_update on platform.tenants
  for update to authenticated
  using (
    identity.has_permission(id, 'tenancy.tenant.update')
    or identity.has_platform_permission('platform.tenant.manage')
  )
  with check (
    identity.has_permission(id, 'tenancy.tenant.update')
    or identity.has_platform_permission('platform.tenant.manage')
  );

drop policy if exists profiles_select on identity.profiles;
create policy profiles_select on identity.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from identity.memberships me
      join identity.memberships them
        on them.tenant_id = me.tenant_id and them.user_id = identity.profiles.id
      where me.user_id = auth.uid()
        and me.status = 'active'
        and them.status = 'active'
        and identity.has_permission(me.tenant_id, 'identity.profile.read')
    )
  );

drop policy if exists profiles_insert on identity.profiles;
create policy profiles_insert on identity.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update on identity.profiles;
create policy profiles_update on identity.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists memberships_select on identity.memberships;
create policy memberships_select on identity.memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or identity.has_permission(tenant_id, 'identity.membership.read')
  );

drop policy if exists memberships_insert on identity.memberships;
create policy memberships_insert on identity.memberships
  for insert to authenticated
  with check (identity.has_permission(tenant_id, 'identity.membership.create'));

drop policy if exists memberships_update on identity.memberships;
create policy memberships_update on identity.memberships
  for update to authenticated
  using (identity.has_permission(tenant_id, 'identity.membership.update'))
  with check (identity.has_permission(tenant_id, 'identity.membership.update'));

drop policy if exists memberships_delete on identity.memberships;
create policy memberships_delete on identity.memberships
  for delete to authenticated
  using (identity.has_permission(tenant_id, 'identity.membership.delete'));

drop policy if exists invitations_select on identity.invitations;
create policy invitations_select on identity.invitations
  for select to authenticated
  using (identity.has_permission(tenant_id, 'identity.invitation.read'));

drop policy if exists invitations_insert on identity.invitations;
create policy invitations_insert on identity.invitations
  for insert to authenticated
  with check (
    identity.has_permission(tenant_id, 'identity.invitation.create')
    and identity.can_grant_role(tenant_id, role_key)
  );

drop policy if exists invitations_update on identity.invitations;
create policy invitations_update on identity.invitations
  for update to authenticated
  using (identity.has_permission(tenant_id, 'identity.invitation.revoke'))
  with check (identity.has_permission(tenant_id, 'identity.invitation.revoke'));

drop policy if exists membership_roles_select on identity.membership_roles;
create policy membership_roles_select on identity.membership_roles
  for select to authenticated
  using (exists (
    select 1 from identity.memberships m
    where m.id = membership_id
      and (m.user_id = auth.uid()
           or identity.has_permission(m.tenant_id, 'identity.membership.read'))
  ));

drop policy if exists membership_roles_insert on identity.membership_roles;
create policy membership_roles_insert on identity.membership_roles
  for insert to authenticated
  with check (exists (
    select 1 from identity.memberships m
    where m.id = membership_id
      and identity.has_permission(m.tenant_id, 'identity.role.assign')
      and identity.can_grant_role(m.tenant_id, role_key)
  ));

drop policy if exists membership_roles_delete on identity.membership_roles;
create policy membership_roles_delete on identity.membership_roles
  for delete to authenticated
  using (exists (
    select 1 from identity.memberships m
    where m.id = membership_id
      and identity.has_permission(m.tenant_id, 'identity.role.assign')
      and identity.can_grant_role(m.tenant_id, role_key)
  ));

drop policy if exists platform_admins_select on identity.platform_admins;
create policy platform_admins_select on identity.platform_admins
  for select to authenticated
  using (identity.is_platform_admin());