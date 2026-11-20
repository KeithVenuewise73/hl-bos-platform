-- ===========================================================================
-- 0060_sitegen_core — HLG SiteGen: sites, immutable versions, assets, limits
--
-- A multi-tenant website generator. Every site is a validated JSON "SiteSpec";
-- this migration holds the specs, who may change which part of one, and who
-- may publish it. It contains NO AI: the free tier costs nothing to run, and
-- the AI path (staff only) arrives in a later migration.
--
-- Design: docs/products/hlg-sitegen/phase-1-design.md
--
-- What is deliberately NOT here
--   * No site_domains (custom domains arrive with their provider, phase 4).
--   * No public/anon surface. The schema is not API-exposed. The public host
--     app reads a published site through sitegen.published_site(), which only
--     service_role may execute. Client/admin browsers get INVOKER wrappers in
--     `public` in a later phase, which add no advisor findings.
--   * No prices. Plans below are placeholders; their limits are DATA.
--
-- Tenancy: a SiteGen client IS a platform.tenants row. Nothing here creates a
-- second tenant or membership table. Authorisation is by permission
-- (identity.has_permission), never by role name, and never by plan name:
-- code asks "does this tenant hold feature X / what is limit Y".
--
-- Additive only. Nothing existing is altered; only new rows are added to
-- identity.permissions, identity.role_permissions, entitlements.features,
-- entitlements.plan_features, billing.products and billing.plans.
--
-- rollback:
--   -- Forward-repair is the norm (see db-migrate.yml); this is the documented
--   -- manual undo, to be run only with approval, children first:
--   delete from entitlements.tenant_entitlements where feature_key like 'sitegen.%';
--   delete from entitlements.plan_features       where feature_key like 'sitegen.%';
--   delete from entitlements.features            where key like 'sitegen.%';
--   delete from billing.subscriptions            where plan_key in ('sitegen_free','sitegen_managed');
--   delete from billing.plans                    where key in ('sitegen_free','sitegen_managed');
--   delete from billing.products                 where key = 'sitegen';
--   delete from identity.role_permissions        where permission_key like 'sitegen.%';
--   delete from identity.permissions             where key like 'sitegen.%';
--   drop schema if exists sitegen cascade;   -- needs an approved-destructive marker if run as a migration
-- ===========================================================================

create schema if not exists sitegen;
comment on schema sitegen is
  'HLG SiteGen: multi-tenant AI website generator. NOT exposed via PostgREST. Writes only through SECURITY DEFINER functions.';
revoke all on schema sitegen from public, anon, authenticated;
grant usage on schema sitegen to authenticated, service_role;
alter default privileges in schema sitegen revoke all on tables from public;
alter default privileges in schema sitegen revoke all on functions from public;

do $$ begin
  create type sitegen.site_status as enum ('draft','published','suspended','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sitegen.version_origin as enum ('ai','user','staff','system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sitegen.asset_kind as enum ('logo','hero','photo');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Catalogs (data, platform-managed by migration)
-- ---------------------------------------------------------------------------
create table if not exists sitegen.verticals (
  key               extensions.citext primary key,
  name              text not null,
  schema_org_type   text not null,
  default_cta       text not null check (default_cta in ('call','text','book')),
  default_pages     jsonb not null,
  section_library  jsonb not null,
  intake_fields     jsonb not null,
  tone_guidelines   text not null default '',
  spec_schema_version integer not null default 1,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint verticals_key_format check (key ~ '^[a-z][a-z0-9_]{2,40}$')
);
comment on table sitegen.verticals is
  'A business vertical: section library, default pages, required intake fields, tone, schema.org type, default CTA. Adding a vertical is a row, not code.';

-- Font allowlist. A tenant picks a KEY, never a CSS string, so no tenant can
-- inject a font stack, a URL or anything else into the page. System stacks
-- only: no web-font download, which keeps the sites fast.
create table if not exists sitegen.theme_fonts (
  key        extensions.citext primary key,
  label      text not null,
  css_stack  text not null,
  active     boolean not null default true,
  constraint theme_fonts_key_format check (key ~ '^[a-z][a-z0-9_]{2,40}$')
);

-- Slugs nobody may take as a subdomain (phishing / impersonation / our own).
create table if not exists sitegen.reserved_slugs (
  slug extensions.citext primary key
);

-- Curated hero graphics a Free-tier client may choose. A row is a platform-owned
-- file in a platform bucket; it is NOT a tenant upload. Empty until curated:
-- the renderer falls back to a plain themed hero when there is no choice.
create table if not exists sitegen.library_assets (
  key          extensions.citext primary key,
  vertical_key extensions.citext references sitegen.verticals(key) on delete cascade,
  label        text not null,
  alt_text     text not null,
  asset_ref    text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint library_assets_key_format check (key ~ '^[a-z][a-z0-9_]{2,60}$')
);

-- ---------------------------------------------------------------------------
-- Sites and immutable versions
-- ---------------------------------------------------------------------------
create table if not exists sitegen.sites (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id         uuid not null references platform.tenants(id) on delete cascade,
  vertical_key      extensions.citext not null references sitegen.verticals(key) on delete restrict,
  slug              extensions.citext not null,
  name              text not null,
  status            sitegen.site_status not null default 'draft',
  active_version_id uuid,
  published_at      timestamptz,
  published_by      uuid references auth.users(id) on delete set null,
  suspended_reason  text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sites_slug_unique unique (slug),
  constraint sites_tenant_id_unique unique (tenant_id, id),
  constraint sites_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  constraint sites_name_not_blank check (length(btrim(name)) between 1 and 120),
  constraint sites_published_has_version check (status <> 'published' or active_version_id is not null),
  constraint sites_suspended_has_reason check (status <> 'suspended' or suspended_reason is not null)
);
comment on table sitegen.sites is
  'One website. active_version_id is the published version; it can only be set by sitegen.publish() (enforced by trigger, not by convention).';
create index if not exists sites_tenant_idx on sitegen.sites (tenant_id);

create table if not exists sitegen.site_versions (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  site_id            uuid not null,
  tenant_id          uuid not null,
  version_no         integer not null,
  spec               jsonb not null,
  spec_schema_version integer not null,
  spec_hash          text not null,
  origin             sitegen.version_origin not null,
  created_by         uuid references auth.users(id) on delete set null,
  approved_by        uuid references auth.users(id) on delete set null,
  parent_version_id  uuid,
  note               text,
  created_at         timestamptz not null default now(),
  constraint site_versions_site_fk foreign key (tenant_id, site_id)
    references sitegen.sites (tenant_id, id) on delete cascade,
  constraint site_versions_no_unique unique (site_id, version_no),
  constraint site_versions_site_id_id unique (site_id, id),
  constraint site_versions_parent_fk foreign key (site_id, parent_version_id)
    references sitegen.site_versions (site_id, id),
  constraint site_versions_spec_is_object check (jsonb_typeof(spec) = 'object'),
  constraint site_versions_spec_size check (octet_length(spec::text) <= 262144),
  constraint site_versions_hash_hex check (spec_hash ~ '^[0-9a-f]{64}$'),
  constraint site_versions_note_len check (note is null or length(note) <= 500)
);
comment on table sitegen.site_versions is
  'Immutable. Every edit is a new row; rollback is publishing an older row. Never updated, never deleted (except by cascade when the whole site is removed).';

-- The published version must belong to the SAME site.
do $$ begin
  alter table sitegen.sites
    add constraint sites_active_version_fk foreign key (id, active_version_id)
    references sitegen.site_versions (site_id, id) deferrable initially deferred;
exception when duplicate_object then null; end $$;

create or replace function sitegen.block_version_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- A cascade from deleting the whole site/tenant runs inside the RI trigger
  -- (depth > 1) and is allowed; a direct DELETE or any UPDATE is not.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'site versions are immutable (% refused)', tg_op using errcode = 'insufficient_privilege';
end; $$;

drop trigger if exists site_versions_immutable on sitegen.site_versions;
create trigger site_versions_immutable before update or delete on sitegen.site_versions
  for each row execute function sitegen.block_version_change();

-- Only sitegen.publish() / suspend / unsuspend may change what is live.
create or replace function sitegen.guard_site_live_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.active_version_id is distinct from old.active_version_id
      or new.status is distinct from old.status
      or new.published_at is distinct from old.published_at)
     and coalesce(current_setting('sitegen.publishing', true), '') <> 'on' then
    raise exception 'a site goes live only through sitegen.publish()' using errcode = 'insufficient_privilege';
  end if;
  if new.tenant_id is distinct from old.tenant_id or new.vertical_key is distinct from old.vertical_key then
    raise exception 'a site cannot change tenant or vertical' using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists sites_guard_live on sitegen.sites;
create trigger sites_guard_live before update on sitegen.sites
  for each row execute function sitegen.guard_site_live_state();

drop trigger if exists sites_audit on sitegen.sites;
create trigger sites_audit after insert or update or delete on sitegen.sites
  for each row execute function audit.emit();

-- ---------------------------------------------------------------------------
-- Assets: tenant files in storage_meta, tied to one site
-- ---------------------------------------------------------------------------
create table if not exists sitegen.site_assets (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null,
  site_id     uuid not null,
  kind        sitegen.asset_kind not null,
  file_id     uuid not null unique references storage_meta.files(id) on delete restrict,
  alt_text    text not null default '',
  width       integer,
  height      integer,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint site_assets_site_fk foreign key (tenant_id, site_id)
    references sitegen.sites (tenant_id, id) on delete cascade,
  constraint site_assets_id_site unique (site_id, id),
  constraint site_assets_dims check ((width is null) = (height is null)
    and (width is null or (width between 16 and 4000 and height between 16 and 4000))),
  constraint site_assets_alt_len check (length(alt_text) <= 200)
);
create index if not exists site_assets_site_idx on sitegen.site_assets (site_id);

-- ---------------------------------------------------------------------------
-- Limits as DATA. Entitlement flags live in entitlements.*; numeric limits
-- here (the existing entitlements can only say yes/no).
--   value  >= 0 : the limit      -1 : unlimited      no row : 0 (deny)
-- ---------------------------------------------------------------------------
create table if not exists sitegen.plan_limits (
  plan_key   extensions.citext not null references billing.plans(key) on delete cascade,
  limit_key  extensions.citext not null,
  value      integer not null check (value >= -1),
  primary key (plan_key, limit_key),
  constraint plan_limits_key_format check (limit_key ~ '^sitegen\.[a-z_]+$')
);

create table if not exists sitegen.tenant_limit_overrides (
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  limit_key  extensions.citext not null,
  value      integer not null check (value >= -1),
  reason     text not null check (length(btrim(reason)) > 0),
  set_by     uuid references auth.users(id) on delete set null,
  set_at     timestamptz not null default now(),
  primary key (tenant_id, limit_key),
  constraint tenant_limit_overrides_key_format check (limit_key ~ '^sitegen\.[a-z_]+$')
);

create table if not exists sitegen.usage_counters (
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  metric       extensions.citext not null,
  period_start date not null,
  used         integer not null default 0 check (used >= 0),
  primary key (tenant_id, metric, period_start),
  constraint usage_counters_metric_format check (metric ~ '^sitegen\.[a-z_]+$')
);

-- The effective limit: tenant override, else the best active plan. Not granted
-- to any client role: it is called only by the definer functions below.
create or replace function sitegen.limit_for(p_tenant uuid, p_key extensions.citext)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.value from sitegen.tenant_limit_overrides o
      where o.tenant_id = p_tenant and o.limit_key = p_key),
    (select case when bool_or(pl.value = -1) then -1 else max(pl.value) end
       from billing.subscriptions s
       join sitegen.plan_limits pl on pl.plan_key = s.plan_key and pl.limit_key = p_key
      where s.tenant_id = p_tenant and s.status in ('active','trialing')),
    0);
$$;
revoke all on function sitegen.limit_for(uuid, extensions.citext) from public, anon, authenticated;

-- Atomic check-and-increment. The upsert takes the row lock, so two concurrent
-- calls cannot both slip under the limit. Internal: no client role holds it.
create or replace function sitegen.consume(p_tenant uuid, p_metric extensions.citext, p_amount integer default 1)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_limit integer := sitegen.limit_for(p_tenant, p_metric);
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_used integer;
begin
  if p_amount is null or p_amount < 1 then
    raise exception 'amount must be at least 1' using errcode = 'check_violation';
  end if;
  if v_limit <> -1 and p_amount > v_limit then
    raise exception 'limit reached for %', p_metric using errcode = '53400';
  end if;
  insert into sitegen.usage_counters as u (tenant_id, metric, period_start, used)
  values (p_tenant, p_metric, v_period, p_amount)
  on conflict (tenant_id, metric, period_start)
  do update set used = u.used + excluded.used
     where v_limit = -1 or u.used + excluded.used <= v_limit
  returning u.used into v_used;
  if v_used is null then
    raise exception 'limit reached for %', p_metric using errcode = '53400';
  end if;
  return v_used;
end; $$;
revoke all on function sitegen.consume(uuid, extensions.citext, integer) from public, anon, authenticated;

create or replace function sitegen.set_limit_override(
  p_tenant uuid, p_key extensions.citext, p_value integer, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('sitegen.admin.manage') then
    raise exception 'only a platform administrator may override a limit' using errcode = 'insufficient_privilege';
  end if;
  insert into sitegen.tenant_limit_overrides (tenant_id, limit_key, value, reason, set_by)
  values (p_tenant, p_key, p_value, p_reason, auth.uid())
  on conflict (tenant_id, limit_key) do update
    set value = excluded.value, reason = excluded.reason, set_by = excluded.set_by, set_at = now();
  perform audit.log_security_event('sitegen.limit.override', 'allowed', 'info', p_tenant,
    'sitegen.tenant_limit_overrides', p_key::text,
    jsonb_build_object('limit', p_key, 'value', p_value, 'reason', p_reason));
end; $$;
revoke all on function sitegen.set_limit_override(uuid, extensions.citext, integer, text) from public, anon;
grant execute on function sitegen.set_limit_override(uuid, extensions.citext, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Validation. The AI and the UI are not trusted: these run in the database on
-- every save, so no caller path can store a spec that breaks the template.
-- Deep shape validation (every section) is the zod schema's job; these are the
-- limits that must hold even if a client skips it.
-- ---------------------------------------------------------------------------
create or replace function sitegen.assert_theme(p_site uuid, p_theme jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_logo uuid;
begin
  if p_theme is null or jsonb_typeof(p_theme) <> 'object' then
    raise exception 'theme must be an object' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_object_keys(p_theme) k
              where k not in ('brandColor','accentColor','fontHeading','fontBody','logoAssetId')) then
    raise exception 'theme has an unknown field' using errcode = 'check_violation';
  end if;
  if coalesce(p_theme->>'brandColor','') !~* '^#[0-9a-f]{6}$'
     or coalesce(p_theme->>'accentColor','') !~* '^#[0-9a-f]{6}$' then
    raise exception 'theme colors must be #rrggbb' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from sitegen.theme_fonts f where f.key = p_theme->>'fontHeading' and f.active)
     or not exists (select 1 from sitegen.theme_fonts f where f.key = p_theme->>'fontBody' and f.active) then
    raise exception 'theme font is not on the allowed list' using errcode = 'check_violation';
  end if;
  if p_theme ? 'logoAssetId' and p_theme->'logoAssetId' <> 'null'::jsonb then
    if (p_theme->>'logoAssetId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'logoAssetId must be a uuid' using errcode = 'check_violation';
    end if;
    v_logo := (p_theme->>'logoAssetId')::uuid;
    if not exists (
      select 1 from sitegen.site_assets a
      join storage_meta.files f on f.id = a.file_id
      where a.id = v_logo and a.site_id = p_site and a.kind = 'logo' and f.status = 'stored') then
      raise exception 'logo is not an uploaded logo of this site' using errcode = 'check_violation';
    end if;
  end if;
end; $$;
revoke all on function sitegen.assert_theme(uuid, jsonb) from public, anon, authenticated;

create or replace function sitegen.assert_profile(p_profile jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'profile must be an object' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_profile->'businessName') is distinct from 'string'
     or length(btrim(p_profile->>'businessName')) not between 1 and 120 then
    raise exception 'business name must be 1 to 120 characters' using errcode = 'check_violation';
  end if;
  if coalesce(p_profile->>'phone','') !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone must be in international format, like +17165550100' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_profile->'services') is distinct from 'array'
     or jsonb_array_length(p_profile->'services') > 30 then
    raise exception 'services must be a list of at most 30' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_profile->'services') s
              where jsonb_typeof(s->'name') is distinct from 'string'
                 or length(btrim(s->>'name')) not between 1 and 80) then
    raise exception 'each service needs a name of 1 to 80 characters' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_profile->'hours') is distinct from 'array'
     or jsonb_array_length(p_profile->'hours') > 7 then
    raise exception 'hours must be a list of at most 7 days' using errcode = 'check_violation';
  end if;
end; $$;
revoke all on function sitegen.assert_profile(jsonb) from public, anon, authenticated;

create or replace function sitegen.assert_hero_choice(p_site uuid, p_vertical extensions.citext, p_choice jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_kind text;
begin
  if p_choice is null or jsonb_typeof(p_choice) <> 'object' then
    raise exception 'hero choice must be an object' using errcode = 'check_violation';
  end if;
  v_kind := p_choice->>'kind';
  if v_kind = 'default' then
    return;
  elsif v_kind = 'library' then
    if not exists (select 1 from sitegen.library_assets l
                    where l.key = p_choice->>'key' and l.active
                      and (l.vertical_key is null or l.vertical_key = p_vertical)) then
      raise exception 'that hero graphic is not in the library' using errcode = 'check_violation';
    end if;
  elsif v_kind = 'asset' then
    if (p_choice->>'assetId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (
         select 1 from sitegen.site_assets a
         join storage_meta.files f on f.id = a.file_id
         where a.id = (p_choice->>'assetId')::uuid and a.site_id = p_site
           and a.kind = 'hero' and f.status = 'stored') then
      raise exception 'hero image is not an uploaded hero of this site' using errcode = 'check_violation';
    end if;
  else
    raise exception 'hero choice kind must be default, library or asset' using errcode = 'check_violation';
  end if;
end; $$;
revoke all on function sitegen.assert_hero_choice(uuid, extensions.citext, jsonb) from public, anon, authenticated;

-- Every factual claim must say where it came from. A claim with no intake or
-- user source is refused here, whoever wrote it, the AI included.
create or replace function sitegen.assert_claims(p_claims jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_claims is null then return; end if;
  if jsonb_typeof(p_claims) <> 'array' then
    raise exception 'claims must be a list' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_claims) c
     where coalesce(c #>> '{source,type}', '') not in ('intake','user')
        or length(btrim(coalesce(c #>> '{source,field}', ''))) = 0) then
    raise exception 'every claim needs a source (intake or user) and the field it came from'
      using errcode = 'check_violation';
  end if;
end; $$;
revoke all on function sitegen.assert_claims(jsonb) from public, anon, authenticated;

create or replace function sitegen.assert_spec(
  p_site uuid, p_vertical extensions.citext, p_spec jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    raise exception 'a site spec must be an object' using errcode = 'check_violation';
  end if;
  if (p_spec->'specVersion') is distinct from '1'::jsonb then
    raise exception 'unsupported specVersion' using errcode = 'check_violation';
  end if;
  if p_spec->>'vertical' is distinct from p_vertical::text then
    raise exception 'spec vertical does not match the site' using errcode = 'check_violation';
  end if;
  perform sitegen.assert_theme(p_site, p_spec->'theme');
  perform sitegen.assert_profile(p_spec->'profile');
  perform sitegen.assert_hero_choice(p_site, p_vertical, p_spec #> '{hero,choice}');
  perform sitegen.assert_claims(p_spec->'claims');
end; $$;
revoke all on function sitegen.assert_spec(uuid, extensions.citext, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writes. All through these functions; no client role can write a table.
-- ---------------------------------------------------------------------------
create or replace function sitegen.create_site(
  p_tenant uuid, p_vertical extensions.citext, p_slug extensions.citext, p_name text, p_spec jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_staff boolean := identity.has_platform_permission('sitegen.admin.update');
  v_site uuid := pg_catalog.gen_random_uuid();
  v_limit integer; v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not (v_staff or identity.has_permission(p_tenant, 'sitegen.site.create')) then
    raise exception 'insufficient privilege to create a site' using errcode = 'insufficient_privilege';
  end if;
  if not platform.tenant_is_operable(p_tenant) then
    raise exception 'tenant is not active' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from sitegen.verticals v where v.key = p_vertical and v.active) then
    raise exception 'unknown or inactive vertical %', p_vertical using errcode = 'no_data_found';
  end if;
  if exists (select 1 from sitegen.reserved_slugs r where r.slug = p_slug) then
    raise exception 'that address is reserved' using errcode = 'check_violation';
  end if;
  if not v_staff then
    v_limit := sitegen.limit_for(p_tenant, 'sitegen.max_sites');
    select count(*) into v_count from sitegen.sites s
      where s.tenant_id = p_tenant and s.status <> 'archived';
    if v_limit <> -1 and v_count >= v_limit then
      raise exception 'site limit reached' using errcode = '53400';
    end if;
  end if;
  -- insert first so assets/fonts checks that reference the site resolve
  insert into sitegen.sites (id, tenant_id, vertical_key, slug, name, created_by)
  values (v_site, p_tenant, p_vertical, p_slug, p_name, auth.uid());
  perform sitegen.assert_spec(v_site, p_vertical, p_spec);
  insert into sitegen.site_versions
    (site_id, tenant_id, version_no, spec, spec_schema_version, spec_hash, origin, created_by, note)
  values
    (v_site, p_tenant, 1, p_spec, 1,
     encode(extensions.digest(p_spec::text, 'sha256'), 'hex'),
     case when v_staff then 'staff' else 'user' end::sitegen.version_origin,
     auth.uid(), 'first version');
  perform events.emit('sitegen.site.created', p_tenant, jsonb_build_object('site', v_site));
  return v_site;
end; $$;
revoke all on function sitegen.create_site(uuid, extensions.citext, extensions.citext, text, jsonb) from public, anon;
grant execute on function sitegen.create_site(uuid, extensions.citext, extensions.citext, text, jsonb) to authenticated;

-- Save a new version. A non-staff caller may change only the parts of the site
-- their plan allows; the comparison is done HERE, against the base version,
-- so a tampered client cannot go further than its entitlements.
create or replace function sitegen.save_version(
  p_site uuid, p_base_version uuid, p_spec jsonb, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_site sitegen.sites%rowtype;
  v_staff boolean := identity.has_platform_permission('sitegen.admin.update');
  v_latest sitegen.site_versions%rowtype;
  v_base_spec jsonb;
  v_new uuid;
  v_pages_limit integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  select * into v_site from sitegen.sites where id = p_site;
  if not found then raise exception 'site not found' using errcode = 'no_data_found'; end if;
  if not (v_staff or identity.has_permission(v_site.tenant_id, 'sitegen.site.update')) then
    raise exception 'insufficient privilege to edit this site' using errcode = 'insufficient_privilege';
  end if;
  if not platform.tenant_is_operable(v_site.tenant_id) then
    raise exception 'tenant is not active' using errcode = 'insufficient_privilege';
  end if;
  if v_site.status in ('suspended','archived') and not v_staff then
    raise exception 'this site cannot be edited' using errcode = 'insufficient_privilege';
  end if;

  -- optimistic concurrency: edits are made against the newest version
  select * into v_latest from sitegen.site_versions
    where site_id = p_site order by version_no desc limit 1;
  if v_latest.id is distinct from p_base_version then
    raise exception 'the site changed since you opened it; reload and try again'
      using errcode = '40001';
  end if;
  v_base_spec := v_latest.spec;

  perform sitegen.assert_spec(p_site, v_site.vertical_key, p_spec);

  if not v_staff then
    if (p_spec->'theme') is distinct from (v_base_spec->'theme')
       and not entitlements.has_feature(v_site.tenant_id, 'sitegen.edit_theme') then
      raise exception 'your plan does not include changing the theme' using errcode = 'insufficient_privilege';
    end if;
    if (p_spec->'profile') is distinct from (v_base_spec->'profile')
       and not entitlements.has_feature(v_site.tenant_id, 'sitegen.edit_profile') then
      raise exception 'your plan does not include changing business details' using errcode = 'insufficient_privilege';
    end if;
    if (p_spec #> '{hero,choice}') is distinct from (v_base_spec #> '{hero,choice}')
       and not entitlements.has_feature(v_site.tenant_id, 'sitegen.edit_hero') then
      raise exception 'your plan does not include changing the hero graphic' using errcode = 'insufficient_privilege';
    end if;
    -- everything else: pages, sections, copy, SEO, claims, hero text, ...
    if ((p_spec - 'theme' - 'profile' - 'hero')
          is distinct from (v_base_spec - 'theme' - 'profile' - 'hero'))
       or ((p_spec->'hero') - 'choice') is distinct from ((v_base_spec->'hero') - 'choice') then
      if not entitlements.has_feature(v_site.tenant_id, 'sitegen.edit_content') then
        raise exception 'your plan does not include changing page content' using errcode = 'insufficient_privilege';
      end if;
    end if;
    v_pages_limit := sitegen.limit_for(v_site.tenant_id, 'sitegen.max_pages');
    if v_pages_limit <> -1
       and coalesce(jsonb_array_length(p_spec->'pages'), 0) > v_pages_limit then
      raise exception 'page limit reached' using errcode = '53400';
    end if;
  end if;

  insert into sitegen.site_versions
    (site_id, tenant_id, version_no, spec, spec_schema_version, spec_hash, origin,
     created_by, parent_version_id, note)
  values
    (p_site, v_site.tenant_id, v_latest.version_no + 1, p_spec, 1,
     encode(extensions.digest(p_spec::text, 'sha256'), 'hex'),
     case when v_staff then 'staff' else 'user' end::sitegen.version_origin,
     auth.uid(), v_latest.id, p_note)
  returning id into v_new;
  perform events.emit('sitegen.version.saved', v_site.tenant_id,
    jsonb_build_object('site', p_site, 'version', v_new));
  return v_new;
end; $$;
revoke all on function sitegen.save_version(uuid, uuid, jsonb, text) from public, anon;
grant execute on function sitegen.save_version(uuid, uuid, jsonb, text) to authenticated;

-- Publishing is always a person's explicit act. Choosing an OLDER version is
-- how a rollback is done.
create or replace function sitegen.publish(p_site uuid, p_version uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_site sitegen.sites%rowtype;
  v_staff boolean := identity.has_platform_permission('sitegen.publication.manage');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  select * into v_site from sitegen.sites where id = p_site for update;
  if not found then raise exception 'site not found' using errcode = 'no_data_found'; end if;
  if not (v_staff or identity.has_permission(v_site.tenant_id, 'sitegen.publication.create')) then
    raise exception 'insufficient privilege to publish' using errcode = 'insufficient_privilege';
  end if;
  if not platform.tenant_is_operable(v_site.tenant_id) then
    raise exception 'tenant is not active' using errcode = 'insufficient_privilege';
  end if;
  if v_site.status in ('suspended','archived') then
    raise exception 'this site cannot be published' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from sitegen.site_versions v where v.id = p_version and v.site_id = p_site) then
    raise exception 'that version does not belong to this site' using errcode = 'foreign_key_violation';
  end if;
  perform set_config('sitegen.publishing', 'on', true);
  update sitegen.sites
     set active_version_id = p_version, status = 'published',
         published_at = now(), published_by = auth.uid()
   where id = p_site;
  perform set_config('sitegen.publishing', 'off', true);
  perform events.emit('sitegen.site.published', v_site.tenant_id,
    jsonb_build_object('site', p_site, 'version', p_version));
  perform audit.log_security_event('sitegen.site.publish', 'allowed', 'info', v_site.tenant_id,
    'sitegen.sites', p_site::text, jsonb_build_object('version', p_version));
end; $$;
revoke all on function sitegen.publish(uuid, uuid) from public, anon;
grant execute on function sitegen.publish(uuid, uuid) to authenticated;

-- Takedown switch: pulls a site off the air immediately (abuse, phishing,
-- non-payment). Platform staff only.
create or replace function sitegen.suspend_site(p_site uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if not identity.has_platform_permission('sitegen.admin.manage') then
    raise exception 'only platform staff may suspend a site' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a reason is required' using errcode = 'check_violation';
  end if;
  perform set_config('sitegen.publishing', 'on', true);
  update sitegen.sites set status = 'suspended', suspended_reason = p_reason
   where id = p_site returning tenant_id into v_tenant;
  perform set_config('sitegen.publishing', 'off', true);
  if v_tenant is null then raise exception 'site not found' using errcode = 'no_data_found'; end if;
  perform audit.log_security_event('sitegen.site.suspend', 'allowed', 'warning', v_tenant,
    'sitegen.sites', p_site::text, jsonb_build_object('reason', p_reason));
end; $$;
revoke all on function sitegen.suspend_site(uuid, text) from public, anon;
grant execute on function sitegen.suspend_site(uuid, text) to authenticated;

-- Lifting a suspension returns the site to draft; it must be published again
-- by a person.
create or replace function sitegen.unsuspend_site(p_site uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if not identity.has_platform_permission('sitegen.admin.manage') then
    raise exception 'only platform staff may lift a suspension' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('sitegen.publishing', 'on', true);
  update sitegen.sites
     set status = 'draft', active_version_id = null, published_at = null, suspended_reason = null
   where id = p_site and status = 'suspended' returning tenant_id into v_tenant;
  perform set_config('sitegen.publishing', 'off', true);
  if v_tenant is null then raise exception 'no suspended site %', p_site using errcode = 'no_data_found'; end if;
  perform audit.log_security_event('sitegen.site.unsuspend', 'allowed', 'info', v_tenant,
    'sitegen.sites', p_site::text, '{}'::jsonb);
end; $$;
revoke all on function sitegen.unsuspend_site(uuid) from public, anon;
grant execute on function sitegen.unsuspend_site(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Assets: register (pending) -> confirm (stored). Delegates the file record to
-- storage_meta so the tenant-path guarantee is the platform's, not ours.
-- Re-encoding/EXIF stripping happens in the upload path before confirm.
-- ---------------------------------------------------------------------------
create or replace function sitegen.register_asset(
  p_site uuid, p_kind sitegen.asset_kind, p_filename text, p_mime extensions.citext,
  p_size bigint, p_alt text default '')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_site sitegen.sites%rowtype;
  v_ext text; v_max bigint; v_file uuid; v_asset uuid := pg_catalog.gen_random_uuid();
begin
  select * into v_site from sitegen.sites where id = p_site;
  if not found then raise exception 'site not found' using errcode = 'no_data_found'; end if;
  if not (identity.has_platform_permission('sitegen.admin.update')
          or identity.has_permission(v_site.tenant_id, 'sitegen.site.update')) then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_ext := case p_mime::text when 'image/png' then 'png' when 'image/jpeg' then 'jpg'
                              when 'image/webp' then 'webp' else null end;
  if v_ext is null then
    raise exception 'only PNG, JPEG or WebP images are accepted' using errcode = 'check_violation';
  end if;
  v_max := case p_kind when 'logo' then 2097152 else 5242880 end;   -- 2 MB logo, 5 MB other
  if p_size is null or p_size < 1 or p_size > v_max then
    raise exception 'image is too large (limit % bytes)', v_max using errcode = 'check_violation';
  end if;
  v_file := storage_meta.register_upload(
    v_site.tenant_id, 'sitegen', case p_kind when 'logo' then 'logo' else 'brand_asset' end::storage_meta.file_category,
    'sitegen/' || p_site::text || '/' || v_asset::text || '.' || v_ext,
    p_filename, p_mime, p_size, 'sitegen.site', p_site::text,
    'public', 'standard', 'sitegen-assets');
  insert into sitegen.site_assets (id, tenant_id, site_id, kind, file_id, alt_text, created_by)
  values (v_asset, v_site.tenant_id, p_site, p_kind, v_file, coalesce(p_alt, ''), auth.uid());
  return v_asset;
end; $$;
revoke all on function sitegen.register_asset(uuid, sitegen.asset_kind, text, extensions.citext, bigint, text) from public, anon;
grant execute on function sitegen.register_asset(uuid, sitegen.asset_kind, text, extensions.citext, bigint, text) to authenticated;

create or replace function sitegen.confirm_asset(
  p_asset uuid, p_checksum_sha256 text, p_size bigint, p_width integer, p_height integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_asset sitegen.site_assets%rowtype;
begin
  select * into v_asset from sitegen.site_assets where id = p_asset;
  if not found then raise exception 'asset not found' using errcode = 'no_data_found'; end if;
  if not (identity.has_platform_permission('sitegen.admin.update')
          or identity.has_permission(v_asset.tenant_id, 'sitegen.site.update')) then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if p_width is null or p_height is null or p_width not between 16 and 4000 or p_height not between 16 and 4000 then
    raise exception 'image dimensions must be between 16 and 4000 pixels' using errcode = 'check_violation';
  end if;
  perform storage_meta.confirm_upload(v_asset.file_id, p_checksum_sha256, p_size);
  update sitegen.site_assets set width = p_width, height = p_height where id = p_asset;
end; $$;
revoke all on function sitegen.confirm_asset(uuid, text, bigint, integer, integer) from public, anon;
grant execute on function sitegen.confirm_asset(uuid, text, bigint, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The public read: what the host app serves. service_role only. Returns null
-- unless the site is published, its tenant is operable and it is not suspended.
-- ---------------------------------------------------------------------------
create or replace function sitegen.published_site(p_slug extensions.citext)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'siteId', s.id, 'slug', s.slug, 'vertical', s.vertical_key,
           'versionId', v.id, 'versionNo', v.version_no, 'spec', v.spec,
           'publishedAt', s.published_at)
    from sitegen.sites s
    join sitegen.site_versions v on v.site_id = s.id and v.id = s.active_version_id
   where s.slug = p_slug and s.status = 'published'
     and platform.tenant_is_operable(s.tenant_id);
$$;
revoke all on function sitegen.published_site(extensions.citext) from public, anon, authenticated;
grant execute on function sitegen.published_site(extensions.citext) to service_role;

-- Trigger functions are never called by a client; nothing here is executable by
-- anon, and only the functions granted above are executable by anyone else.
revoke all on function sitegen.block_version_change() from public, anon, authenticated, service_role;
revoke all on function sitegen.guard_site_live_state() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: enabled + FORCED on every table, every table has a policy (so no
-- "RLS enabled, no policy" advisor finding), and no client role can write.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['verticals','theme_fonts','reserved_slugs','library_assets','sites',
                           'site_versions','site_assets','plan_limits','tenant_limit_overrides','usage_counters']
  loop
    execute format('alter table sitegen.%I enable row level security', t);
    execute format('alter table sitegen.%I force row level security', t);
    execute format('revoke all on sitegen.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on sitegen.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists verticals_select on sitegen.verticals;
create policy verticals_select on sitegen.verticals for select to authenticated using (active);
drop policy if exists theme_fonts_select on sitegen.theme_fonts;
create policy theme_fonts_select on sitegen.theme_fonts for select to authenticated using (active);
drop policy if exists library_assets_select on sitegen.library_assets;
create policy library_assets_select on sitegen.library_assets for select to authenticated using (active);
drop policy if exists plan_limits_select on sitegen.plan_limits;
create policy plan_limits_select on sitegen.plan_limits for select to authenticated using (true);
drop policy if exists reserved_slugs_select on sitegen.reserved_slugs;
create policy reserved_slugs_select on sitegen.reserved_slugs for select to authenticated
  using (identity.has_platform_permission('sitegen.admin.read'));

drop policy if exists sites_select on sitegen.sites;
create policy sites_select on sitegen.sites for select to authenticated
  using (identity.has_permission(tenant_id, 'sitegen.site.read')
         or identity.has_platform_permission('sitegen.admin.read'));
drop policy if exists site_versions_select on sitegen.site_versions;
create policy site_versions_select on sitegen.site_versions for select to authenticated
  using (identity.has_permission(tenant_id, 'sitegen.site.read')
         or identity.has_platform_permission('sitegen.admin.read'));
drop policy if exists site_assets_select on sitegen.site_assets;
create policy site_assets_select on sitegen.site_assets for select to authenticated
  using (identity.has_permission(tenant_id, 'sitegen.site.read')
         or identity.has_platform_permission('sitegen.admin.read'));
drop policy if exists tenant_limit_overrides_select on sitegen.tenant_limit_overrides;
create policy tenant_limit_overrides_select on sitegen.tenant_limit_overrides for select to authenticated
  using (identity.has_permission(tenant_id, 'sitegen.usage.read')
         or identity.has_platform_permission('sitegen.admin.read'));
drop policy if exists usage_counters_select on sitegen.usage_counters;
create policy usage_counters_select on sitegen.usage_counters for select to authenticated
  using (identity.has_permission(tenant_id, 'sitegen.usage.read')
         or identity.has_platform_permission('sitegen.admin.read'));

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('sitegen.site.read',    'See a tenant''s SiteGen sites, versions and assets.', 'tenant'),
  ('sitegen.site.create',  'Create a site for a tenant.', 'tenant'),
  ('sitegen.site.update',  'Save new versions and upload assets (limited by the tenant''s entitlements).', 'tenant'),
  ('sitegen.publication.create', 'Publish a version of a tenant''s site.', 'tenant'),
  ('sitegen.usage.read',   'See SiteGen usage and limit overrides.', 'tenant'),
  ('sitegen.admin.read',   'Read every tenant''s SiteGen data (platform staff).', 'platform'),
  ('sitegen.admin.update',   'Edit any site, without plan limits (platform staff).', 'platform'),
  ('sitegen.publication.manage','Publish any site (platform staff).', 'platform'),
  ('sitegen.admin.manage', 'Suspend sites and override limits (platform staff).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','sitegen.site.read'),('tenant_owner','sitegen.site.create'),('tenant_owner','sitegen.site.update'),
  ('tenant_owner','sitegen.publication.create'),('tenant_owner','sitegen.usage.read'),
  ('tenant_admin','sitegen.site.read'),('tenant_admin','sitegen.site.create'),('tenant_admin','sitegen.site.update'),
  ('tenant_admin','sitegen.publication.create'),('tenant_admin','sitegen.usage.read'),
  ('manager','sitegen.site.read'),('manager','sitegen.site.update'),('manager','sitegen.usage.read'),
  ('staff','sitegen.site.read'),
  ('viewer','sitegen.site.read'),
  ('platform_owner','sitegen.admin.read'),('platform_owner','sitegen.admin.update'),
  ('platform_owner','sitegen.publication.manage'),('platform_owner','sitegen.admin.manage'),
  ('platform_admin','sitegen.admin.read'),('platform_admin','sitegen.admin.update'),
  ('platform_admin','sitegen.publication.manage'),('platform_admin','sitegen.admin.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Entitlements and plans, as DATA. PLACEHOLDERS: pricing is undecided, so no
-- prices exist, and these limits are starting values to be set by the CEO.
-- Tier names appear nowhere in function bodies above.
-- ---------------------------------------------------------------------------
insert into entitlements.features (key, name, module, description) values
  ('sitegen.edit_theme',      'Edit theme',          'sitegen', 'Change colors, fonts and logo within the allowed values.'),
  ('sitegen.edit_profile',    'Edit business info',  'sitegen', 'Change name, phone, hours, services and address.'),
  ('sitegen.edit_hero',       'Choose hero graphic', 'sitegen', 'Pick the hero graphic from the library or upload one.'),
  ('sitegen.edit_content',    'Edit page content',   'sitegen', 'Change sections, copy and SEO fields.'),
  ('sitegen.custom_domain',   'Custom domain',       'sitegen', 'Serve the site on the client''s own domain.'),
  ('sitegen.change_requests', 'Change requests',     'sitegen', 'Submit change requests that HLG staff apply.'),
  ('sitegen.growth_layer',    'Growth layer',        'sitegen', 'Missed-call text-back, review requests and other add-ons.')
on conflict (key) do nothing;

insert into billing.products (key, name, module, description) values
  ('sitegen', 'HLG SiteGen', 'sitegen', 'Website generator for local service businesses.')
on conflict (key) do nothing;

insert into billing.plans (key, product_key, name, interval, trial_days) values
  ('sitegen_free',    'sitegen', 'SiteGen Free (placeholder)',        'month', 0),
  ('sitegen_managed', 'sitegen', 'SiteGen HLG-managed (placeholder)', 'month', 0)
on conflict (key) do nothing;

insert into entitlements.plan_features (plan_key, feature_key) values
  ('sitegen_free','sitegen.edit_theme'),('sitegen_free','sitegen.edit_profile'),('sitegen_free','sitegen.edit_hero'),
  ('sitegen_managed','sitegen.edit_theme'),('sitegen_managed','sitegen.edit_profile'),('sitegen_managed','sitegen.edit_hero'),
  ('sitegen_managed','sitegen.edit_content'),('sitegen_managed','sitegen.custom_domain'),
  ('sitegen_managed','sitegen.change_requests'),('sitegen_managed','sitegen.growth_layer')
on conflict do nothing;

insert into sitegen.plan_limits (plan_key, limit_key, value) values
  ('sitegen_free','sitegen.max_sites', 1),
  ('sitegen_free','sitegen.max_pages', 1),
  ('sitegen_free','sitegen.ai_assisted_edits_per_month', 0),
  ('sitegen_managed','sitegen.max_sites', 5),
  ('sitegen_managed','sitegen.max_pages', 10),
  ('sitegen_managed','sitegen.ai_assisted_edits_per_month', 10)
on conflict do nothing;

insert into sitegen.theme_fonts (key, label, css_stack) values
  ('sans_clean',     'Clean sans-serif',     'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'),
  ('serif_classic',  'Classic serif',        'Georgia, "Times New Roman", Times, serif'),
  ('sans_rounded',   'Friendly rounded',     'ui-rounded, "Hiragino Maru Gothic ProN", "Segoe UI", system-ui, sans-serif'),
  ('mono_workshop',  'Workshop typewriter',  'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'),
  ('sans_condensed', 'Strong condensed',     '"Arial Narrow", "Helvetica Neue", Arial, sans-serif')
on conflict (key) do nothing;

insert into sitegen.reserved_slugs (slug) values
  ('www'),('admin'),('api'),('app'),('login'),('signin'),('signup'),('register'),('account'),('accounts'),
  ('billing'),('pay'),('payments'),('checkout'),('secure'),('support'),('help'),('mail'),('email'),('smtp'),
  ('ftp'),('static'),('assets'),('cdn'),('status'),('dashboard'),('portal'),('staging'),('dev'),('test'),
  ('hlg'),('hlgdigital'),('hermanlegacy'),('hlbos'),('sitegen'),('root'),('null'),('undefined'),
  ('google'),('facebook'),('instagram'),('paypal'),('stripe'),('apple'),('microsoft'),('amazon'),('bank')
on conflict (slug) do nothing;

insert into sitegen.verticals
  (key, name, schema_org_type, default_cta, default_pages, section_library, intake_fields, tone_guidelines)
values (
  'barber', 'Barber shop', 'HairSalon', 'book',
  '[{"slug":"home","title":"Home","sections":["hero","services","hours","about","contact"]}]'::jsonb,
  '["hero","services","hours","about","gallery","contact","faq"]'::jsonb,
  '["businessName","phone","address","hours","services"]'::jsonb,
  'Plain, friendly, local. Short sentences. State only what the owner told us: no years in business, awards, reviews or testimonials unless supplied.'
) on conflict (key) do nothing;
