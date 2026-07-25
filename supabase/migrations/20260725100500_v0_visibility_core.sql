-- ===========================================================================
-- v0_visibility_core — VisibilityAI module boundary (minimal core)
--
-- Establishes the schema and the boundary that proves the reusable primitives
-- compose correctly, WITHOUT building the full Growth Engine:
--   * sites            — the property under management
--   * content_assets   — AI-drafted content that CANNOT publish without the
--                        workflows human gate (Principle 4)
--   * reviews          — no tenant-writable INSERT path: a review cannot be
--                        fabricated (Principle 5); ingested only via a trusted
--                        connector path
-- Gated by entitlements (module activation + feature) so products consume it
-- rather than rebuild it.
--
-- rollback:
--   DROP SCHEMA IF EXISTS visibility CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'visibility.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'visibility.%';
-- ===========================================================================

create schema if not exists visibility;
comment on schema visibility is 'HL-BOS: VisibilityAI Growth Engine (V0 core). NOT exposed via PostgREST.';
revoke all on schema visibility from public, anon, authenticated;
grant usage on schema visibility to authenticated;
alter default privileges in schema visibility revoke all on tables from public;
alter default privileges in schema visibility revoke all on functions from public;

do $$ begin
  create type visibility.content_status as enum ('draft','pending_approval','approved','published','rejected');
exception when duplicate_object then null; end $$;

create table if not exists visibility.sites (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  url        extensions.citext not null,
  verified   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_tenant_url_unique unique (tenant_id, url)
);

create table if not exists visibility.content_assets (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  site_id              uuid references visibility.sites(id) on delete set null,
  kind                 extensions.citext not null default 'article',
  title                text not null,
  body                 text not null default '',
  status               visibility.content_status not null default 'draft',
  ai_run_id            bigint references ai.runs(id) on delete set null,
  approval_instance_id uuid references workflows.instances(id) on delete set null,
  approved_by          uuid references auth.users(id) on delete set null,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- a published asset must have been through an approval instance
  constraint content_published_needs_approval
    check (status <> 'published' or approval_instance_id is not null)
);
create index if not exists content_assets_tenant_idx on visibility.content_assets (tenant_id, status);

create table if not exists visibility.reviews (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  source      extensions.citext not null,
  external_id extensions.citext not null,
  rating      integer not null,
  body        text,
  sentiment   extensions.citext,   -- descriptive only; NEVER a publish/suppress filter
  received_at timestamptz not null default now(),
  constraint reviews_rating_range check (rating between 1 and 5),
  constraint reviews_source_unique unique (tenant_id, source, external_id)
);
comment on table visibility.reviews is 'Ingested reviews. No tenant-writable INSERT path exists — a review cannot be fabricated (Principle 5). sentiment is descriptive metadata, never a filter.';

create trigger sites_set_updated_at before update on visibility.sites for each row execute function platform.set_updated_at();
create trigger sites_audit after insert or update or delete on visibility.sites for each row execute function audit.emit();
create trigger content_set_updated_at before update on visibility.content_assets for each row execute function platform.set_updated_at();
create trigger content_audit after insert or update or delete on visibility.content_assets for each row execute function audit.emit();
create trigger reviews_audit after insert or update or delete on visibility.reviews for each row execute function audit.emit();

-- --- RLS --------------------------------------------------------------------
alter table visibility.sites          enable row level security; alter table visibility.sites          force row level security;
alter table visibility.content_assets enable row level security; alter table visibility.content_assets force row level security;
alter table visibility.reviews        enable row level security; alter table visibility.reviews        force row level security;

-- sites: members read; managers write
drop policy if exists sites_select on visibility.sites;
create policy sites_select on visibility.sites for select to authenticated using (identity.is_member(tenant_id));
drop policy if exists sites_write on visibility.sites;
create policy sites_write on visibility.sites for all to authenticated
  using (identity.has_permission(tenant_id, 'visibility.site.manage'))
  with check (identity.has_permission(tenant_id, 'visibility.site.manage'));

-- content: read by permission; NO direct write policy -> all writes go through
-- the SECURITY DEFINER RPCs, which enforce the entitlement + publish gates.
drop policy if exists content_select on visibility.content_assets;
create policy content_select on visibility.content_assets for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.content.read'));

-- reviews: read by permission; NO write policy at all -> cannot be fabricated.
drop policy if exists reviews_select on visibility.reviews;
create policy reviews_select on visibility.reviews for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.review.read'));

grant select on visibility.sites, visibility.content_assets, visibility.reviews to authenticated;
grant insert, update, delete on visibility.sites to authenticated;   -- gated by sites_write policy

-- --- Content lifecycle: draft -> submit -> (human gate) -> publish ----------
create or replace function visibility.draft_content(
  p_tenant uuid, p_site uuid, p_kind extensions.citext, p_title text, p_body text default '', p_ai_run bigint default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'visibility.content.create') then
    raise exception 'insufficient privilege to create content' using errcode = 'insufficient_privilege';
  end if;
  if not entitlements.module_is_active(p_tenant, 'visibility') then
    raise exception 'the visibility module is not active for this tenant' using errcode = 'insufficient_privilege';
  end if;
  if not entitlements.has_feature(p_tenant, 'visibility.content') then
    raise exception 'tenant is not entitled to AI content generation' using errcode = 'insufficient_privilege';
  end if;
  insert into visibility.content_assets (tenant_id, site_id, kind, title, body, ai_run_id, status)
  values (p_tenant, p_site, p_kind, p_title, coalesce(p_body,''), p_ai_run, 'draft')
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function visibility.draft_content(uuid, uuid, extensions.citext, text, text, bigint) from public, anon;
grant execute on function visibility.draft_content(uuid, uuid, extensions.citext, text, text, bigint) to authenticated;

create or replace function visibility.submit_content_for_approval(p_content uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id into v_tenant from visibility.content_assets where id = p_content;
  if not found then raise exception 'content % not found', p_content using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.content.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_instance := workflows.request_approval(v_tenant, 'visibility.content.publish', 'visibility.content', p_content::text, 'tenant_admin');
  update visibility.content_assets set status = 'pending_approval', approval_instance_id = v_instance where id = p_content;
  return v_instance;
end; $$;
revoke all on function visibility.submit_content_for_approval(uuid) from public, anon;
grant execute on function visibility.submit_content_for_approval(uuid) to authenticated;

-- Publishing is IMPOSSIBLE without a passed human gate.
create or replace function visibility.publish_content(p_content uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id, approval_instance_id into v_tenant, v_instance from visibility.content_assets where id = p_content;
  if not found then raise exception 'content % not found', p_content using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.content.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'content cannot be published without an approved human review' using errcode = 'insufficient_privilege';
  end if;
  update visibility.content_assets
     set status = 'published', published_at = now(), approved_by = auth.uid()
   where id = p_content;
  perform events.emit('visibility.content.published', v_tenant, jsonb_build_object('content', p_content));
end; $$;
revoke all on function visibility.publish_content(uuid) from public, anon;
grant execute on function visibility.publish_content(uuid) to authenticated;

-- --- Review ingestion: the ONLY insert path, trusted-connector-only ---------
create or replace function visibility.ingest_review(
  p_tenant uuid, p_source extensions.citext, p_external_id extensions.citext, p_rating integer, p_body text default null, p_sentiment extensions.citext default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  -- Only a platform/service actor (the review connector) may ingest. A tenant
  -- admin cannot fabricate a review.
  if not identity.is_platform_admin() then
    raise exception 'reviews may be ingested only by the trusted review connector' using errcode = 'insufficient_privilege';
  end if;
  insert into visibility.reviews (tenant_id, source, external_id, rating, body, sentiment)
  values (p_tenant, p_source, p_external_id, p_rating, p_body, p_sentiment)
  on conflict (tenant_id, source, external_id) do nothing
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function visibility.ingest_review(uuid, extensions.citext, extensions.citext, integer, text, extensions.citext) from public, anon;
grant execute on function visibility.ingest_review(uuid, extensions.citext, extensions.citext, integer, text, extensions.citext) to authenticated;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('visibility.site.manage',   'Manage a tenant''s sites.', 'tenant'),
  ('visibility.content.create','Create and submit content for approval.', 'tenant'),
  ('visibility.content.read',  'Read a tenant''s content assets.', 'tenant'),
  ('visibility.review.read',   'Read a tenant''s reviews.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','visibility.site.manage'),('tenant_owner','visibility.content.create'),('tenant_owner','visibility.content.read'),('tenant_owner','visibility.review.read'),
  ('tenant_admin','visibility.site.manage'),('tenant_admin','visibility.content.create'),('tenant_admin','visibility.content.read'),('tenant_admin','visibility.review.read'),
  ('manager','visibility.content.create'),('manager','visibility.content.read'),('manager','visibility.review.read'),
  ('staff','visibility.content.read'),('staff','visibility.review.read'),
  ('viewer','visibility.content.read'),('viewer','visibility.review.read')
on conflict do nothing;
