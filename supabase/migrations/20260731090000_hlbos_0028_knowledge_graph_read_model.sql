-- HL-BOS 0028 — Enterprise Knowledge Graph read model (Phase XI-2C).
--
-- A PERSISTENT, VERSIONED, READ-ONLY PROJECTION of the deterministic in-code
-- Knowledge Graph (packages/catalog buildKnowledgeGraph). It is NOT a competing
-- source of truth: the authoritative registries (Enterprise Catalog, Capability
-- Library, Application Registry, MODULE_REGISTRY, compositions) remain the only
-- writers of facts. This schema stores a rebuildable projection that authorized
-- subsystems query at runtime.
--
-- Governance (house conventions): the `graph` schema is NOT exposed through
-- PostgREST (config.toml exposes only `public`). Every table is RLS + FORCE.
-- Ordinary/authenticated roles have NO write path — only the SECURITY DEFINER
-- publisher (gated on `graph.projection.manage`) may write. Runtime reads go through
-- `public.graph_*` SECURITY DEFINER functions gated on `graph.projection.read`.

create schema if not exists graph;

-- ==========================================================================
-- Vocabulary (rows, not enums — the house "closed vocabulary as data" pattern)
-- ==========================================================================
create table if not exists graph.node_types (key text primary key);
create table if not exists graph.scopes (key text primary key);
create table if not exists graph.edge_kinds (
  key          text primary key,
  inverse_kind text not null,
  is_acyclic   boolean not null default false
);

insert into graph.node_types (key) values
  ('capability'),('module'),('product'),('application'),('service'),('schema'),
  ('industry'),('business_unit'),('deployment'),('host'),('technology'),
  ('repository'),('api'),('customer'),('government_program'),
  ('external_opportunity'),('acquisition_target')
on conflict (key) do nothing;

insert into graph.scopes (key) values ('platform'),('tenant'),('opportunity')
on conflict (key) do nothing;

-- Mirrors packages/catalog GRAPH_INVERSE + ACYCLIC_EDGE_KINDS.
insert into graph.edge_kinds (key, inverse_kind, is_acyclic) values
  ('uses','used by',false),
  ('depends_on','depended on by',true),
  ('provides','provided by',false),
  ('consumes','consumed by',false),
  ('extends','extended by',false),
  ('owned_by','owns',false),
  ('referenced_by','references',false),
  ('replaced_by','replaces',false),
  ('successor','predecessor of',false),
  ('deprecated','deprecates',false),
  ('provided_by','provides',true),
  ('composed_of','composed into',true),
  ('consolidates','consolidated by',false),
  ('alias_of','has alias',false),
  ('deployed_as','deployment of',false),
  ('hosted_on','hosts',false),
  ('targets','targeted by',false),
  ('built_with','used by',false),
  ('requires','required by',false),
  ('would_provide','would be provided by',false),
  ('maps_to','mapped from',false)
on conflict (key) do nothing;

-- ==========================================================================
-- Projection versions
-- ==========================================================================
create table if not exists graph.projections (
  id                  uuid primary key default gen_random_uuid(),
  version             integer not null unique,
  graph_model_version text not null,
  source_ref          text,
  status              text not null default 'staged'
                        check (status in ('staged','active','superseded','failed')),
  node_count          integer not null default 0,
  edge_count          integer not null default 0,
  integrity_ok        boolean not null default false,
  checksum            text,
  failure_details     jsonb,
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  activated_at        timestamptz
);
-- At most one active projection (controlled, atomic activation).
create unique index if not exists graph_projections_one_active
  on graph.projections ((status)) where status = 'active';

-- ==========================================================================
-- Nodes + edges (typed relational columns for filtering/authz/integrity)
-- ==========================================================================
create table if not exists graph.nodes (
  projection_id           uuid not null references graph.projections (id) on delete cascade,
  node_id                 text not null,
  node_type               text not null references graph.node_types (key),
  canonical_name          text not null,
  display_name            text not null,
  lifecycle               text not null,
  scope                   text not null references graph.scopes (key),
  tenant_id               uuid,
  source_registry         text not null,
  source_record_id        text,
  evidence                text not null,           -- evidence retention (NOT NULL)
  owner_ref               text,
  security_classification text not null default 'internal',
  verification            text not null default 'verified',
  planned                 boolean not null default false,
  metadata                jsonb,                    -- supplemental only
  primary key (projection_id, node_id),
  -- tenant-scoped nodes MUST carry a tenant; non-tenant nodes MUST NOT.
  constraint graph_nodes_tenant_scope
    check ((scope = 'tenant') = (tenant_id is not null))
);

create table if not exists graph.edges (
  projection_id  uuid not null references graph.projections (id) on delete cascade,
  edge_id        text not null,                    -- deterministic: from|kind|to
  from_node_id   text not null,
  edge_kind      text not null references graph.edge_kinds (key),
  to_node_id     text not null,
  inverse_kind   text not null,
  scope          text not null references graph.scopes (key),
  tenant_id      uuid,
  evidence       text not null,
  source_system  text not null,
  verification   text not null default 'verified',
  primary key (projection_id, edge_id),
  -- valid references: both endpoints must exist in the same projection.
  foreign key (projection_id, from_node_id)
    references graph.nodes (projection_id, node_id) on delete cascade,
  foreign key (projection_id, to_node_id)
    references graph.nodes (projection_id, node_id) on delete cascade,
  -- no self-dependency (stricter than "prohibited kinds only" — we never emit one).
  constraint graph_edges_no_self check (from_node_id <> to_node_id)
);

create index if not exists graph_nodes_active on graph.nodes (projection_id, node_type);
create index if not exists graph_edges_from on graph.edges (projection_id, from_node_id);
create index if not exists graph_edges_to on graph.edges (projection_id, to_node_id);
create index if not exists graph_edges_kind on graph.edges (projection_id, edge_kind);

-- ==========================================================================
-- Permissions
-- ==========================================================================
insert into identity.permissions (key, description, scope) values
  ('graph.projection.read', 'Read the Enterprise Knowledge Graph read model', 'platform'),
  ('graph.opportunity.read', 'Read opportunity-scoped graph nodes', 'platform'),
  ('graph.projection.manage', 'Publish/activate/rollback graph projections', 'platform')
on conflict (key) do nothing;

-- ==========================================================================
-- RLS — every table enable + force. NO write policies (writes only via the
-- SECURITY DEFINER publisher). Reads are scope-aware.
-- ==========================================================================
do $$
declare t text;
begin
  foreach t in array array['node_types','scopes','edge_kinds','projections','nodes','edges'] loop
    execute format('alter table graph.%I enable row level security', t);
    execute format('alter table graph.%I force row level security', t);
  end loop;
end $$;

-- vocab tables: readable by any authenticated context (configuration).
create policy node_types_select on graph.node_types for select to authenticated using (true);
create policy scopes_select on graph.scopes for select to authenticated using (true);
create policy edge_kinds_select on graph.edge_kinds for select to authenticated using (true);

-- projections: platform read permission.
create policy projections_select on graph.projections for select to authenticated
  using (identity.has_platform_permission('graph.projection.read'));

-- helper: may the caller see a node/edge of this scope?
create or replace function graph._can_see(p_scope text, p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_scope
    when 'platform'    then identity.has_platform_permission('graph.projection.read')
    when 'tenant'      then p_tenant is not null and identity.has_permission(p_tenant, 'graph.projection.read')
    when 'opportunity' then identity.has_platform_permission('graph.opportunity.read')
    else false
  end;
$$;

create policy nodes_select on graph.nodes for select to authenticated
  using (graph._can_see(scope, tenant_id));
create policy edges_select on graph.edges for select to authenticated
  using (graph._can_see(scope, tenant_id));

-- ==========================================================================
-- Publisher (SECURITY DEFINER, gated on graph.projection.manage). The ONLY write path.
-- ==========================================================================
create or replace function graph._require_manage()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('graph.projection.manage') then
    raise exception 'insufficient privilege to manage graph projections'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Stage + validate + atomically activate a projection. Integrity is enforced by
-- the table constraints (PK dedupe, FK valid refs, CHECK no-self, vocab FKs):
-- any violation aborts the transaction, refusing publication. Cycle checking is
-- performed by the in-code validator BEFORE calling this; a caller must pass
-- p_integrity_ok = true (proven in code) or publication is refused here too.
create or replace function graph.publish_projection(
  p_version integer,
  p_model_version text,
  p_source_ref text,
  p_checksum text,
  p_integrity_ok boolean,
  p_nodes jsonb,
  p_edges jsonb
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_ncount int; v_ecount int;
begin
  perform graph._require_manage();
  if not coalesce(p_integrity_ok, false) then
    raise exception 'projection refused: in-code integrity validation did not pass'
      using errcode = 'check_violation';
  end if;

  insert into graph.projections
    (version, graph_model_version, source_ref, status, integrity_ok, checksum, created_by)
  values
    (p_version, p_model_version, p_source_ref, 'staged', true, p_checksum, auth.uid())
  returning id into v_id;

  insert into graph.nodes
    (projection_id, node_id, node_type, canonical_name, display_name, lifecycle,
     scope, tenant_id, source_registry, source_record_id, evidence, owner_ref,
     security_classification, verification, planned, metadata)
  select v_id, n->>'id', n->>'type', n->>'canonicalName', n->>'displayName',
         n->>'lifecycle', n->>'scope', nullif(n->>'tenantId','')::uuid,
         n->>'sourceRegistry', n->>'sourceRecordId', n->>'evidence',
         nullif(n->>'ownerRef',''), coalesce(n->>'securityClassification','internal'),
         coalesce(n->>'verification','verified'), coalesce((n->>'planned')::boolean,false),
         n->'metadata'
    from jsonb_array_elements(p_nodes) as n;

  insert into graph.edges
    (projection_id, edge_id, from_node_id, edge_kind, to_node_id, inverse_kind,
     scope, tenant_id, evidence, source_system, verification)
  select v_id, e->>'id', e->>'from', e->>'kind', e->>'to', e->>'inverse',
         e->>'scope', nullif(e->>'tenantId','')::uuid, e->>'evidence',
         e->>'sourceSystem', coalesce(e->>'verification','verified')
    from jsonb_array_elements(p_edges) as e;

  select count(*) into v_ncount from graph.nodes where projection_id = v_id;
  select count(*) into v_ecount from graph.edges where projection_id = v_id;
  if v_ncount <> jsonb_array_length(p_nodes) or v_ecount <> jsonb_array_length(p_edges) then
    raise exception 'projection count mismatch (nodes %/%, edges %/%)',
      v_ncount, jsonb_array_length(p_nodes), v_ecount, jsonb_array_length(p_edges)
      using errcode = 'check_violation';
  end if;

  update graph.projections
     set node_count = v_ncount, edge_count = v_ecount
   where id = v_id;
  return v_id;   -- staged; call activate_projection to make live
end $$;

-- Atomically activate a staged projection; supersede the prior active one.
create or replace function graph.activate_projection(p_version integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform graph._require_manage();
  update graph.projections set status = 'superseded'
   where status = 'active' and version <> p_version;
  update graph.projections
     set status = 'active', activated_at = now()
   where version = p_version and status = 'staged';
  if not found then
    raise exception 'no staged projection with version %', p_version
      using errcode = 'no_data_found';
  end if;
end $$;

-- Roll back to the most recent superseded projection.
create or replace function graph.rollback_projection()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_prev integer;
begin
  perform graph._require_manage();
  select version into v_prev from graph.projections
   where status = 'superseded' order by version desc limit 1;
  if v_prev is null then
    raise exception 'no superseded projection to roll back to'
      using errcode = 'no_data_found';
  end if;
  update graph.projections set status = 'superseded' where status = 'active';
  update graph.projections set status = 'active', activated_at = now() where version = v_prev;
  return v_prev;
end $$;

create or replace function graph.record_failed_projection(
  p_version integer, p_model_version text, p_source_ref text, p_details jsonb
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform graph._require_manage();
  insert into graph.projections
    (version, graph_model_version, source_ref, status, integrity_ok, failure_details, created_by)
  values (p_version, p_model_version, p_source_ref, 'failed', false, p_details, auth.uid())
  on conflict (version) do update set status = 'failed', failure_details = excluded.failure_details
  returning id into v_id;
  return v_id;
end $$;

-- Safe cleanup of old superseded/failed projections (keep the newest p_keep superseded).
create or replace function graph.cleanup_superseded(p_keep integer default 3)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_deleted integer;
begin
  perform graph._require_manage();
  with keep as (
    select id from graph.projections where status = 'superseded'
     order by version desc limit greatest(p_keep, 0)
  )
  delete from graph.projections
   where status in ('superseded','failed') and id not in (select id from keep);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- ==========================================================================
-- Read-only public.graph_* RPCs (SECURITY DEFINER, gated on graph.projection.read).
-- Bounded, scope-aware, deterministic, explainable. NEVER mutate.
-- ==========================================================================
create or replace function graph._active_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from graph.projections where status = 'active' limit 1;
$$;

create or replace function public.graph_active_projection_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not identity.has_platform_permission('graph.projection.read') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  select to_jsonb(p) - 'created_by' into v from graph.projections p where status = 'active' limit 1;
  return coalesce(v, jsonb_build_object('status','none'));
end $$;

create or replace function public.graph_get_node(p_node_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_pid uuid;
begin
  if not identity.has_platform_permission('graph.projection.read') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_pid := graph._active_id();
  select to_jsonb(n) into v from graph.nodes n
   where n.projection_id = v_pid and n.node_id = p_node_id
     and graph._can_see(n.scope, n.tenant_id);
  return v;   -- null if not found or not visible (no existence leak)
end $$;

-- Direct neighbors (both directions), bounded.
create or replace function public.graph_get_neighbors(p_node_id text, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pid uuid; v_out jsonb; v_in jsonb; v_lim int := least(greatest(coalesce(p_limit,100),1),500);
begin
  if not identity.has_platform_permission('graph.projection.read') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_pid := graph._active_id();
  select coalesce(jsonb_agg(to_jsonb(e) order by e.edge_id), '[]'::jsonb) into v_out
    from (select * from graph.edges e where e.projection_id = v_pid and e.from_node_id = p_node_id
                and graph._can_see(e.scope, e.tenant_id) order by e.edge_id limit v_lim) e;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.edge_id), '[]'::jsonb) into v_in
    from (select * from graph.edges e where e.projection_id = v_pid and e.to_node_id = p_node_id
                and graph._can_see(e.scope, e.tenant_id) order by e.edge_id limit v_lim) e;
  return jsonb_build_object(
    'projectionVersion', (select version from graph.projections where id = v_pid),
    'node', p_node_id, 'outgoing', v_out, 'incoming', v_in,
    'truncated', (jsonb_array_length(v_out) >= v_lim or jsonb_array_length(v_in) >= v_lim));
end $$;

-- Bounded reverse traversal over dependency-bearing kinds = blast radius.
create or replace function public.graph_find_blast_radius(
  p_node_id text, p_max_depth integer default 6, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pid uuid; v_depth int := least(greatest(coalesce(p_max_depth,6),1),12);
        v_lim int := least(greatest(coalesce(p_limit,200),1),1000); v_nodes jsonb;
begin
  if not identity.has_platform_permission('graph.projection.read') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_pid := graph._active_id();
  with recursive rev(node_id, depth) as (
    select p_node_id, 0
    union
    select e.from_node_id, r.depth + 1
      from rev r
      join graph.edges e
        on e.projection_id = v_pid and e.to_node_id = r.node_id
       and e.edge_kind in ('depends_on','provided_by','composed_of','uses')
       and graph._can_see(e.scope, e.tenant_id)
     where r.depth < v_depth
  )
  select coalesce(jsonb_agg(distinct n order by n), '[]'::jsonb) into v_nodes
    from (select r.node_id as n from rev r where r.node_id <> p_node_id limit v_lim) s
    join lateral (select s.n as n) n on true;
  return jsonb_build_object(
    'projectionVersion', (select version from graph.projections where id = v_pid),
    'start', p_node_id, 'maxDepth', v_depth,
    'dependents', coalesce(v_nodes,'[]'::jsonb),
    'explanation', 'Nodes that transitively depend on the start node (would be impacted if it is retired).');
end $$;

-- Dependencies (forward depends_on), bounded.
create or replace function public.graph_find_dependencies(
  p_node_id text, p_max_depth integer default 6)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pid uuid; v_depth int := least(greatest(coalesce(p_max_depth,6),1),12); v_nodes jsonb;
begin
  if not identity.has_platform_permission('graph.projection.read') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_pid := graph._active_id();
  with recursive fwd(node_id, depth) as (
    select p_node_id, 0
    union
    select e.to_node_id, f.depth + 1
      from fwd f join graph.edges e
        on e.projection_id = v_pid and e.from_node_id = f.node_id and e.edge_kind = 'depends_on'
       and graph._can_see(e.scope, e.tenant_id)
     where f.depth < v_depth
  )
  select coalesce(jsonb_agg(distinct node_id), '[]'::jsonb) into v_nodes
    from fwd where node_id <> p_node_id;
  return jsonb_build_object('projectionVersion',(select version from graph.projections where id=v_pid),
    'start', p_node_id, 'dependencies', v_nodes);
end $$;

create or replace function public.graph_find_capabilities_for_application(p_app_node text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pid uuid; v jsonb;
begin
  if not identity.has_platform_permission('graph.projection.read') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_pid := graph._active_id();
  select coalesce(jsonb_agg(e.to_node_id order by e.to_node_id), '[]'::jsonb) into v
    from graph.edges e join graph.nodes n on n.projection_id = v_pid and n.node_id = e.to_node_id
   where e.projection_id = v_pid and e.from_node_id = p_app_node and e.edge_kind = 'uses'
     and n.node_type = 'capability' and graph._can_see(e.scope, e.tenant_id);
  return jsonb_build_object('projectionVersion',(select version from graph.projections where id=v_pid),
    'application', p_app_node, 'capabilities', v);
end $$;

create or replace function public.graph_find_applications_for_capability(p_cap_node text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pid uuid; v jsonb;
begin
  if not identity.has_platform_permission('graph.projection.read') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_pid := graph._active_id();
  select coalesce(jsonb_agg(e.from_node_id order by e.from_node_id), '[]'::jsonb) into v
    from graph.edges e join graph.nodes n on n.projection_id = v_pid and n.node_id = e.from_node_id
   where e.projection_id = v_pid and e.to_node_id = p_cap_node and e.edge_kind = 'uses'
     and n.node_type = 'application' and graph._can_see(e.scope, e.tenant_id);
  return jsonb_build_object('projectionVersion',(select version from graph.projections where id=v_pid),
    'capability', p_cap_node, 'applications', v);
end $$;

-- Grants: read RPCs to authenticated; publisher/vocab to no one over HTTP.
revoke all on function public.graph_active_projection_status() from public, anon;
revoke all on function public.graph_get_node(text) from public, anon;
revoke all on function public.graph_get_neighbors(text, integer) from public, anon;
revoke all on function public.graph_find_blast_radius(text, integer, integer) from public, anon;
revoke all on function public.graph_find_dependencies(text, integer) from public, anon;
revoke all on function public.graph_find_capabilities_for_application(text) from public, anon;
revoke all on function public.graph_find_applications_for_capability(text) from public, anon;
grant execute on function public.graph_active_projection_status() to authenticated;
grant execute on function public.graph_get_node(text) to authenticated;
grant execute on function public.graph_get_neighbors(text, integer) to authenticated;
grant execute on function public.graph_find_blast_radius(text, integer, integer) to authenticated;
grant execute on function public.graph_find_dependencies(text, integer) to authenticated;
grant execute on function public.graph_find_capabilities_for_application(text) to authenticated;
grant execute on function public.graph_find_applications_for_capability(text) to authenticated;
