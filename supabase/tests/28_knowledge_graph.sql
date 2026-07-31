-- pgTAP: Enterprise Knowledge Graph read model (migration 0028).
-- Structural + authorization-surface assertions that run in the CI harness.
-- (Publisher/activate/rollback mechanics and integrity-constraint rejection are
-- additionally validated on a throwaway local Postgres cluster — see the Phase
-- XI-2C completion report.)

begin;
select plan(18);

-- Schema + tables exist.
select has_schema('graph');
select has_table('graph', 'projections', 'projections table exists');
select has_table('graph', 'nodes', 'nodes table exists');
select has_table('graph', 'edges', 'edges table exists');
select has_table('graph', 'node_types', 'node_types vocab exists');
select has_table('graph', 'edge_kinds', 'edge_kinds vocab exists');

-- RLS enabled AND forced on the data tables.
select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'graph.nodes'::regclass), 'nodes: RLS enabled+forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'graph.edges'::regclass), 'edges: RLS enabled+forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'graph.projections'::regclass), 'projections: RLS enabled+forced');

-- Vocabulary seeded (closed sets).
select is((select count(*)::int from graph.node_types), 17, '17 node types seeded');
select is((select count(*)::int from graph.edge_kinds), 21, '21 edge kinds seeded');
select is((select count(*)::int from graph.scopes), 3, '3 scopes seeded');

-- Every edge kind declares an inverse.
select is((select count(*)::int from graph.edge_kinds where inverse_kind is null or inverse_kind = ''),
          0, 'every edge kind has an inverse');

-- Integrity constraints present.
select ok((select count(*) > 0 from pg_constraint
           where conname = 'graph_edges_no_self'), 'no-self-edge check exists');
select ok((select count(*) > 0 from pg_indexes
           where schemaname='graph' and indexname='graph_projections_one_active'),
          'one-active-projection unique index exists');

-- Write-denial: nodes/edges expose ONLY select policies (no insert/update/delete).
select is((select count(*)::int from pg_policies
           where schemaname='graph' and tablename in ('nodes','edges') and cmd <> 'SELECT'),
          0, 'no write policies on nodes/edges (mutation denied to ordinary roles)');

-- Read RPCs are granted to authenticated, not to anon.
select ok((select has_function_privilege('authenticated','public.graph_get_node(text)','execute')),
          'authenticated may call graph_get_node');
select ok((select not has_function_privilege('anon','public.graph_active_projection_status()','execute')),
          'anon may NOT call graph_active_projection_status');

select * from finish();
rollback;
