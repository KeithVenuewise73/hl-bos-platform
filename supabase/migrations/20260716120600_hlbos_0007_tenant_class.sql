-- ===========================================================================
-- hlbos_0007_tenant_class
--
-- Adds the tenant CLASS to platform.tenants: first_party (a Herman Legacy
-- company) or customer (an external customer).
--
-- This is the whole tenancy requirement, and it is deliberately ADDITIVE:
-- platform.tenants already exists (0002). Herman Legacy companies are onboarded
-- first; external customers use the identical table, the identical policies and
-- the identical provisioning path. The only difference between them is the value
-- of this one column. There is no "internal companies" table and no first_party
-- branch anywhere in the schema -- that absence is exactly what lets external
-- customers arrive later without a redesign.
--
-- SECURITY. authenticated already holds UPDATE on platform.tenants (0003), so a
-- tenant admin (who has tenancy.tenant.update) could otherwise flip its own
-- tenant to first_party. tenant_class and the ownership hierarchy are PLATFORM
-- facts, not tenant-assertable ones, so a BEFORE UPDATE trigger refuses to
-- change either unless the actor is a platform admin. Ordinary tenant edits
-- (name, branding, settings) are unaffected.
--
-- Additive: no existing column or row is altered; no data is touched.
--
-- OPEN DECISION for review: the guard allows only identity.is_platform_admin().
-- It does NOT exempt the service_role backend. If automated backend
-- provisioning must set first_party without a platform-admin session, add that
-- exemption deliberately. The conservative default here requires a platform
-- admin, on the view that declaring a tenant "first-party" is a trust decision.
--
-- rollback:
--   DROP TRIGGER  IF EXISTS tenants_enforce_class_managed ON platform.tenants;
--   DROP FUNCTION IF EXISTS platform.enforce_tenant_class_managed();
--   DROP INDEX    IF EXISTS platform.tenants_first_party_idx;
--   DROP INDEX    IF EXISTS platform.tenants_parent_idx;
--   ALTER TABLE   platform.tenants DROP COLUMN IF EXISTS parent_tenant_id;
--   ALTER TABLE   platform.tenants DROP COLUMN IF EXISTS tenant_class;
--   DROP TYPE     IF EXISTS platform.tenant_class;
-- ===========================================================================

-- --- Enum ------------------------------------------------------------------
do $$ begin
  create type platform.tenant_class as enum ('first_party', 'customer');
exception when duplicate_object then null; end $$;

comment on type platform.tenant_class is
  'first_party = a Herman Legacy company; customer = an external customer. Same table, same policies, same provisioning path -- only this value differs.';

-- --- Columns ---------------------------------------------------------------
-- Default 'customer': the least-assumption class. First-party status is a trust
-- statement and must be set explicitly by a platform admin, never defaulted in.
alter table platform.tenants
  add column if not exists tenant_class platform.tenant_class not null default 'customer';

comment on column platform.tenants.tenant_class is
  'Whether this tenant is a Herman Legacy company (first_party) or an external customer. Set by the platform; a tenant cannot change its own class. NOT an authorization input -- no RLS policy grants first_party tenants any access a customer lacks.';

-- Optional corporate hierarchy: a first_party company may belong to a parent
-- (for example Herman Legacy Software Ventures). Nullable; self-reference.
alter table platform.tenants
  add column if not exists parent_tenant_id uuid references platform.tenants(id) on delete set null;

comment on column platform.tenants.parent_tenant_id is
  'Optional owning tenant, for the Herman Legacy corporate hierarchy. NOT an authorization input.';

do $$ begin
  alter table platform.tenants
    add constraint tenants_parent_not_self
      check (parent_tenant_id is null or parent_tenant_id <> id);
exception when duplicate_object then null; end $$;

-- --- Indexes ---------------------------------------------------------------
-- First-party tenants are the minority long term; index them partially.
create index if not exists tenants_first_party_idx
  on platform.tenants (id) where tenant_class = 'first_party';
create index if not exists tenants_parent_idx
  on platform.tenants (parent_tenant_id) where parent_tenant_id is not null;

-- --- Guard: class and hierarchy are platform-managed -----------------------
create or replace function platform.enforce_tenant_class_managed()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (new.tenant_class is distinct from old.tenant_class)
     or (new.parent_tenant_id is distinct from old.parent_tenant_id) then
    -- A tenant may not assert its own class or ownership. Only a platform admin
    -- may. is_platform_admin() re-derives authority from auth.uid(); a tenant
    -- admin with tenancy.tenant.update passes RLS to reach here, and is stopped
    -- now.
    if not identity.is_platform_admin() then
      raise exception
        'tenant_class and parent_tenant_id are managed by the platform and cannot be changed by a tenant'
        using errcode = '42501';  -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

comment on function platform.enforce_tenant_class_managed() is
  'Refuses any change to tenant_class or parent_tenant_id unless the actor is a platform admin. Closes the path where a tenant admin, who holds UPDATE on platform.tenants, promotes its own tenant to first_party.';

drop trigger if exists tenants_enforce_class_managed on platform.tenants;
create trigger tenants_enforce_class_managed
  before update on platform.tenants
  for each row execute function platform.enforce_tenant_class_managed();

-- --- Generalise the table comment ------------------------------------------
-- 0002 called this "A customer organisation." It is both a Herman Legacy
-- company and an external customer now -- one shape for both.
comment on table platform.tenants is
  'A tenant: a Herman Legacy company (tenant_class = first_party) or an external customer (customer). One shape, one set of policies, one provisioning path for both. Soft-deactivation only -- no DELETE policy exists for any role.';
