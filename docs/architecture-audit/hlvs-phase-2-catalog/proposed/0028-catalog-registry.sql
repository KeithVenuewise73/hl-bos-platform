-- ===========================================================================
-- PROPOSAL — hlbos_0028_catalog_registry  (NOT APPLIED)
--
-- Status: DRAFT / awaiting CEO approval. This file lives under docs/ on purpose:
-- it is deliberately NOT in supabase/migrations/ so it is never auto-applied.
-- The running Enterprise Catalog does not need it — the catalog's source of
-- truth today is version-controlled code (packages/catalog/src/registry.ts).
--
-- Purpose: OPTIONALLY persist the Enterprise Catalog asset graph into the hlvs
-- schema, so the catalog is durable in the database and can be governed across
-- surfaces (not just the console). It extends the HLVS Factory; it replaces
-- nothing. Reuse before rebuild.
--
-- Honors the platform contract: extends the existing `hlvs` schema, RLS +
-- FORCE, permission-gated writes, no tenant exposure (platform-internal), and a
-- rollback block. Apply only after review and explicit approval.
--
-- rollback:
--   DROP TABLE IF EXISTS hlvs.catalog_relationships;
--   DROP TABLE IF EXISTS hlvs.catalog_assets;
--   DROP TYPE  IF EXISTS hlvs.catalog_asset_kind;
--   DROP TYPE  IF EXISTS hlvs.catalog_relation_kind;
--   DROP TYPE  IF EXISTS hlvs.catalog_reuse_flag;
--   DROP TYPE  IF EXISTS hlvs.catalog_maturity;
-- ===========================================================================

-- --- Enums mirror packages/catalog/src/types.ts ---------------------------
create type hlvs.catalog_asset_kind as enum (
  'product','application','module','package','shared_service','ai_capability',
  'api','repository','database','workflow','edge_function','industry_solution',
  'business_capability'
);

create type hlvs.catalog_relation_kind as enum (
  'uses','depends_on','provides','consumes','extends','owned_by',
  'referenced_by','replaced_by','successor','deprecated'
);

create type hlvs.catalog_reuse_flag as enum (
  'reusable','internal_only','commercial','requires_refactor',
  'requires_documentation','requires_testing','deprecated'
);

create type hlvs.catalog_maturity as enum (
  'live','built_undeployed','prototype','reference','dormant','legacy','planned'
);

-- --- Assets ----------------------------------------------------------------
create table if not exists hlvs.catalog_assets (
  id            text primary key,                       -- stable slug, e.g. db.identity
  kind          hlvs.catalog_asset_kind not null,
  name          text not null,
  summary       text not null,
  maturity      hlvs.catalog_maturity not null,
  reuse         hlvs.catalog_reuse_flag[] not null default '{}',
  owner         text not null,
  layer         text not null,
  discover_key  text,                                   -- ties to a physical object
  location      text,
  tags          text[] not null default '{}',
  metrics       jsonb not null default '{}'::jsonb,
  evidence      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --- Relationships (the dependency graph) ---------------------------------
create table if not exists hlvs.catalog_relationships (
  id        bigint generated always as identity primary key,
  from_id   text not null references hlvs.catalog_assets(id) on delete cascade,
  kind      hlvs.catalog_relation_kind not null,
  to_id     text not null references hlvs.catalog_assets(id) on delete cascade,
  note      text,
  unique (from_id, kind, to_id)
);

-- --- Security: platform-internal, permission-gated -------------------------
-- Consistent with the rest of hlvs.* (migration 0025): no tenant_id, RLS + FORCE,
-- read gated on the existing hlvs.catalog.read permission; writes only via
-- SECURITY DEFINER RPCs gated on hlvs.catalog.manage (to be added alongside).
alter table hlvs.catalog_assets        enable row level security;
alter table hlvs.catalog_assets        force  row level security;
alter table hlvs.catalog_relationships enable row level security;
alter table hlvs.catalog_relationships force  row level security;

create policy catalog_assets_read on hlvs.catalog_assets
  for select using (identity.has_platform_permission('hlvs.catalog.read'));

create policy catalog_relationships_read on hlvs.catalog_relationships
  for select using (identity.has_platform_permission('hlvs.catalog.read'));

comment on table hlvs.catalog_assets is
  'PROPOSED. Enterprise Catalog assets. Mirrors @hl-bos/catalog registry. Platform-internal.';
comment on table hlvs.catalog_relationships is
  'PROPOSED. Enterprise Catalog dependency graph edges.';

-- Seeding would be generated from packages/catalog/src/registry.ts so the DB and
-- the code stay in lockstep (a drift check would fail CI if they diverge).
