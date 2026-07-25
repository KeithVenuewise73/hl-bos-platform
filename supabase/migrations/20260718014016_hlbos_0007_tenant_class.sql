-- ===========================================================================
-- hlbos_0007_tenant_class
--
-- Adds tenant classification (first_party | customer) and optional parent-tenant
-- support to platform.tenants, plus a trigger that prevents a tenant from
-- changing its own class or parent -- only a platform admin may.
--
-- RECONCILED FROM HL-BOS CORE. This file is the exact SQL recorded in
-- supabase_migrations.schema_migrations for version 20260718014016 on the paid
-- HL-BOS Core project (mvvtngiopdrgiedjmhfb). It was applied there directly and
-- was previously absent from version control; this restores Git as the source
-- of truth. Behaviour is preserved exactly -- do not edit to "improve" it.
--
-- rollback:
--   DROP TRIGGER IF EXISTS tenants_enforce_class_managed ON platform.tenants;
--   DROP FUNCTION IF EXISTS platform.enforce_tenant_class_managed();
--   DROP INDEX IF EXISTS platform.tenants_first_party_idx;
--   DROP INDEX IF EXISTS platform.tenants_parent_idx;
--   ALTER TABLE platform.tenants DROP CONSTRAINT IF EXISTS tenants_parent_not_self;
--   ALTER TABLE platform.tenants DROP COLUMN IF EXISTS parent_tenant_id;
--   ALTER TABLE platform.tenants DROP COLUMN IF EXISTS tenant_class;
--   DROP TYPE IF EXISTS platform.tenant_class;
-- ===========================================================================

-- hlbos_0007_tenant_class
do $$ begin
  create type platform.tenant_class as enum ('first_party', 'customer');
exception when duplicate_object then null; end $$;

comment on type platform.tenant_class is
  'first_party = a Herman Legacy company; customer = an external customer. Same table, same policies, same provisioning path -- only this value differs.';

alter table platform.tenants
  add column if not exists tenant_class platform.tenant_class not null default 'customer';

comment on column platform.tenants.tenant_class is
  'Whether this tenant is a Herman Legacy company (first_party) or an external customer. Set by the platform; a tenant cannot change its own class. NOT an authorization input -- no RLS policy grants first_party tenants any access a customer lacks.';

alter table platform.tenants
  add column if not exists parent_tenant_id uuid references platform.tenants(id) on delete set null;

comment on column platform.tenants.parent_tenant_id is
  'Optional owning tenant, for the Herman Legacy corporate hierarchy. NOT an authorization input.';

do $$ begin
  alter table platform.tenants
    add constraint tenants_parent_not_self
      check (parent_tenant_id is null or parent_tenant_id <> id);
exception when duplicate_object then null; end $$;

create index if not exists tenants_first_party_idx
  on platform.tenants (id) where tenant_class = 'first_party';
create index if not exists tenants_parent_idx
  on platform.tenants (parent_tenant_id) where parent_tenant_id is not null;

create or replace function platform.enforce_tenant_class_managed()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (new.tenant_class is distinct from old.tenant_class)
     or (new.parent_tenant_id is distinct from old.parent_tenant_id) then
    if not identity.is_platform_admin() then
      raise exception
        'tenant_class and parent_tenant_id are managed by the platform and cannot be changed by a tenant'
        using errcode = '42501';
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

comment on table platform.tenants is
  'A tenant: a Herman Legacy company (tenant_class = first_party) or an external customer (customer). One shape, one set of policies, one provisioning path for both. Soft-deactivation only -- no DELETE policy exists for any role.';
