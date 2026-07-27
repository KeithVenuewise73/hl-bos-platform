-- ===========================================================================
-- v0_storage_meta — reusable shared document & asset storage (HL-BOS Factory)
--
-- The tenant-aware METADATA + ACCESS-CONTROL layer over Supabase Storage. Bytes
-- live in Supabase Storage buckets; this schema is the single shared file record
-- every vertical references instead of building its own upload table.
--
-- Schema name: `storage_meta`, NOT `storage` — Supabase already owns a schema
-- called `storage` (buckets/objects). See docs/visibilityai/phase-1-enablement/
-- 06-checkpoint3-reuse-analysis.md.
--
-- Reuses the spine (identity/permissions/audit) + V0 (events). No new tenant
-- model, no new event bus. Buckets are created at DEPLOY time (documented in the
-- Storage Architecture Report) — deliberately NOT here, so this migration applies
-- and tests on a bare PostgreSQL that has no Supabase `storage` schema.
--
-- rollback:
--   DROP SCHEMA IF EXISTS storage_meta CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'storage.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'storage.%';
-- ===========================================================================

create schema if not exists storage_meta;
comment on schema storage_meta is 'HL-BOS: tenant-aware file metadata + access control over Supabase Storage. NOT exposed via PostgREST.';
revoke all on schema storage_meta from public, anon, authenticated;
grant usage on schema storage_meta to authenticated;
alter default privileges in schema storage_meta revoke all on tables from public;
alter default privileges in schema storage_meta revoke all on functions from public;

do $$ begin create type storage_meta.file_category as enum
  ('evidence','screenshot','report','proposal','contract','logo','brand_asset',
   'customer_upload','generated_document','ai_media','export','other');
exception when duplicate_object then null; end $$;

do $$ begin create type storage_meta.file_visibility as enum ('private','tenant','public');
exception when duplicate_object then null; end $$;

do $$ begin create type storage_meta.retention_class as enum ('transient','standard','legal_hold');
exception when duplicate_object then null; end $$;

do $$ begin create type storage_meta.file_status as enum ('pending','stored','deleted');
exception when duplicate_object then null; end $$;

-- --- files ------------------------------------------------------------------
-- Max size mirrors supabase/config.toml [storage] file_size_limit (50 MiB).
create table if not exists storage_meta.files (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  source_module    extensions.citext not null,            -- owning product/module
  category         storage_meta.file_category not null,
  bucket           extensions.citext not null default 'tenant-private',
  object_path      text not null,                         -- MUST be under '<tenant_id>/'
  original_filename text not null,
  mime_type        extensions.citext not null,
  size_bytes       bigint not null,
  checksum_sha256  text,
  visibility       storage_meta.file_visibility not null default 'private',
  retention        storage_meta.retention_class not null default 'standard',
  status           storage_meta.file_status not null default 'pending',
  related_type     text,                                  -- e.g. 'visibility.assessment'
  related_id       text,
  uploaded_by      uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users(id) on delete set null,

  constraint files_bucket_path_unique unique (bucket, object_path),
  constraint files_size_positive check (size_bytes > 0),
  constraint files_size_within_limit check (size_bytes <= 52428800),   -- 50 MiB
  constraint files_checksum_is_sha256 check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  -- CROSS-TENANT PATH PREVENTION, structural: an object cannot live outside its
  -- own tenant's prefix, so one tenant's row can never point at another's bytes.
  constraint files_path_is_tenant_scoped check (object_path like tenant_id::text || '/%'),
  constraint files_deleted_consistent check ((status = 'deleted') = (deleted_at is not null))
);
comment on table storage_meta.files is
  'One shared file record per stored object. object_path is always under <tenant_id>/ so cross-tenant references are structurally impossible. No tenant write path — all writes via SECURITY DEFINER RPCs.';
comment on column storage_meta.files.bucket is
  'Supabase Storage bucket. Private by default; buckets are created at deploy, not in this migration.';

create index if not exists files_tenant_idx  on storage_meta.files (tenant_id, status);
create index if not exists files_related_idx on storage_meta.files (related_type, related_id);
create index if not exists files_module_idx  on storage_meta.files (source_module);

create trigger files_set_updated_at before update on storage_meta.files
  for each row execute function platform.set_updated_at();
create trigger files_audit after insert or update or delete on storage_meta.files
  for each row execute function audit.emit();

-- --- RLS: members read by permission; NO tenant write path -----------------
alter table storage_meta.files enable row level security;
alter table storage_meta.files force  row level security;

drop policy if exists files_select on storage_meta.files;
create policy files_select on storage_meta.files for select to authenticated
  using (
    -- live files: any reader in the tenant
    (status <> 'deleted' and identity.has_permission(tenant_id, 'storage.file.read'))
    -- soft-deleted files: only a delete/restore-holder may list them (you cannot
    -- restore what you cannot see), so ordinary readers still don't see deletions
    or (status = 'deleted' and identity.has_permission(tenant_id, 'storage.file.delete'))
    or identity.has_platform_permission('storage.file.manage')
  );

grant select on storage_meta.files to authenticated;
-- No INSERT/UPDATE/DELETE grant or policy: writes go through the definer RPCs.

-- --- Validation helper (raises on unsafe input) ----------------------------
-- Deterministic, reusable. Dangerous executable/script types are rejected
-- regardless of category. Enforced in-DB so every caller path is covered.
create or replace function storage_meta.assert_safe(
  p_filename text, p_mime extensions.citext, p_size bigint)
returns void language plpgsql immutable set search_path = '' as $$
declare v_ext text;
begin
  if p_size is null or p_size <= 0 then
    raise exception 'invalid file size' using errcode = 'check_violation';
  end if;
  if p_size > 52428800 then
    raise exception 'file exceeds 50MiB limit' using errcode = 'check_violation';
  end if;
  v_ext := lower(regexp_replace(p_filename, '^.*\.', ''));
  if v_ext = any (array['exe','sh','bat','cmd','com','msi','dll','scr','jar',
                        'app','deb','rpm','bin','ps1','vbs']) then
    raise exception 'file type .% is not permitted', v_ext using errcode = 'check_violation';
  end if;
  -- MIME/extension mismatch or executable MIME
  if p_mime ~* '^application/(x-msdownload|x-sh|x-executable|x-msdos-program)$'
     or p_mime ~* 'x-dosexec' then
    raise exception 'executable MIME type % is not permitted', p_mime using errcode = 'check_violation';
  end if;
end; $$;
revoke all on function storage_meta.assert_safe(text, extensions.citext, bigint) from public, anon;
grant execute on function storage_meta.assert_safe(text, extensions.citext, bigint) to authenticated;

-- --- Upload lifecycle: register (pending) -> confirm (stored) ---------------
-- register_upload creates the metadata a signed upload URL will target. The
-- signed URL itself is issued by the edge/app layer against object_path; this
-- RPC enforces permission, validation, and the tenant path prefix first.
create or replace function storage_meta.register_upload(
  p_tenant uuid, p_source_module extensions.citext, p_category storage_meta.file_category,
  p_object_path text, p_original_filename text, p_mime extensions.citext, p_size bigint,
  p_related_type text default null, p_related_id text default null,
  p_visibility storage_meta.file_visibility default 'private',
  p_retention storage_meta.retention_class default 'standard',
  p_bucket extensions.citext default 'tenant-private')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_path text;
begin
  if not identity.has_permission(p_tenant, 'storage.file.create') then
    raise exception 'insufficient privilege to store a file' using errcode = 'insufficient_privilege';
  end if;
  perform storage_meta.assert_safe(p_original_filename, p_mime, p_size);
  -- Normalize + enforce tenant prefix: strip leading slashes and any '..'
  -- traversal, then require the '<tenant>/' prefix (added if absent).
  v_path := regexp_replace(p_object_path, '\.\.', '', 'g');
  v_path := ltrim(v_path, '/');
  if v_path not like p_tenant::text || '/%' then
    v_path := p_tenant::text || '/' || v_path;
  end if;
  insert into storage_meta.files
    (tenant_id, source_module, category, bucket, object_path, original_filename,
     mime_type, size_bytes, visibility, retention, status, related_type, related_id, uploaded_by)
  values
    (p_tenant, p_source_module, p_category, p_bucket, v_path, p_original_filename,
     p_mime, p_size, p_visibility, p_retention, 'pending', p_related_type, p_related_id, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function storage_meta.register_upload(uuid, extensions.citext, storage_meta.file_category, text, text, extensions.citext, bigint, text, text, storage_meta.file_visibility, storage_meta.retention_class, extensions.citext) from public, anon;
grant execute on function storage_meta.register_upload(uuid, extensions.citext, storage_meta.file_category, text, text, extensions.citext, bigint, text, text, storage_meta.file_visibility, storage_meta.retention_class, extensions.citext) to authenticated;

create or replace function storage_meta.confirm_upload(
  p_file uuid, p_checksum_sha256 text default null, p_size bigint default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_size bigint; v_name text; v_mime extensions.citext;
begin
  select tenant_id, size_bytes, original_filename, mime_type
    into v_tenant, v_size, v_name, v_mime
    from storage_meta.files where id = p_file and status = 'pending';
  if not found then raise exception 'no pending file %', p_file using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'storage.file.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if p_size is not null then perform storage_meta.assert_safe(v_name, v_mime, p_size); end if;
  update storage_meta.files
     set status = 'stored',
         checksum_sha256 = coalesce(p_checksum_sha256, checksum_sha256),
         size_bytes = coalesce(p_size, size_bytes)
   where id = p_file;
  perform events.emit('file.uploaded', v_tenant,
    jsonb_build_object('file', p_file, 'module', (select source_module from storage_meta.files where id = p_file)));
end; $$;
revoke all on function storage_meta.confirm_upload(uuid, text, bigint) from public, anon;
grant execute on function storage_meta.confirm_upload(uuid, text, bigint) to authenticated;

-- --- Soft delete + restore --------------------------------------------------
create or replace function storage_meta.soft_delete_file(p_file uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from storage_meta.files where id = p_file;
  if not found then raise exception 'file % not found', p_file using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'storage.file.delete') then
    raise exception 'insufficient privilege to delete a file' using errcode = 'insufficient_privilege';
  end if;
  update storage_meta.files set status = 'deleted', deleted_at = now(), deleted_by = auth.uid()
    where id = p_file and status <> 'deleted';
  perform events.emit('file.deleted', v_tenant, jsonb_build_object('file', p_file));
end; $$;
revoke all on function storage_meta.soft_delete_file(uuid) from public, anon;
grant execute on function storage_meta.soft_delete_file(uuid) to authenticated;

create or replace function storage_meta.restore_file(p_file uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from storage_meta.files where id = p_file;
  if not found then raise exception 'file % not found', p_file using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'storage.file.delete') then
    raise exception 'insufficient privilege to restore a file' using errcode = 'insufficient_privilege';
  end if;
  update storage_meta.files set status = 'stored', deleted_at = null, deleted_by = null
    where id = p_file and status = 'deleted';
end; $$;
revoke all on function storage_meta.restore_file(uuid) from public, anon;
grant execute on function storage_meta.restore_file(uuid) to authenticated;

-- --- Access boundary for signed-URL issuance -------------------------------
-- The edge/app layer calls this before minting a signed download URL. Returns
-- true only for a live file the caller may read in ITS OWN tenant — the check
-- that stops a cross-tenant signed URL.
create or replace function storage_meta.can_access(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from storage_meta.files f
    where f.id = p_file and f.status <> 'deleted'
      and (identity.has_permission(f.tenant_id, 'storage.file.read')
           or identity.has_platform_permission('storage.file.manage'))
  );
$$;
revoke all on function storage_meta.can_access(uuid) from public, anon;
grant execute on function storage_meta.can_access(uuid) to authenticated;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('storage.file.read',   'Read a tenant''s file metadata and obtain signed download URLs.', 'tenant'),
  ('storage.file.create',  'Register and confirm file uploads for a tenant.', 'tenant'),
  ('storage.file.delete', 'Soft-delete or restore a tenant''s files.', 'tenant'),
  ('storage.file.manage', 'Read/manage files across all tenants (platform).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','storage.file.read'),('tenant_owner','storage.file.create'),('tenant_owner','storage.file.delete'),
  ('tenant_admin','storage.file.read'),('tenant_admin','storage.file.create'),('tenant_admin','storage.file.delete'),
  ('manager','storage.file.read'),('manager','storage.file.create'),
  ('staff','storage.file.read'),
  ('viewer','storage.file.read'),
  ('service_account','storage.file.read'),('service_account','storage.file.create'),
  ('platform_owner','storage.file.manage'),
  ('platform_admin','storage.file.manage')
on conflict do nothing;
