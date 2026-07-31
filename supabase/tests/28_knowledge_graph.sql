-- pgTAP: Enterprise Knowledge Graph read model (migration 0028).
-- Structural + authorization-surface assertions that run in the CI harness.
-- (Publisher/activate/rollback mechanics and integrity-constraint rejection are
-- additionally validated on a throwaway local Postgres cluster — see the Phase
-- XI-2C completion report.)

begin;
select plan(23);

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

-- ── Runtime execution regression guard (added Phase XI-2J) ───────────────────
-- The root cause of a bug found on the preview: the graph_* RPCs existed and
-- were granted, but NO test EXECUTED them, so graph_find_blast_radius shipped
-- with an ambiguous-column error that only surfaced at runtime with real
-- dependents. These assertions actually CALL the RPCs against a published
-- projection so that class of bug fails in CI, not in production.
\ir _fixtures.sql.inc
select tests.seed();
insert into identity.role_permissions (role_key, permission_key)
  values ('platform_owner','graph.projection.manage'), ('platform_owner','graph.projection.read')
  on conflict do nothing;
-- Act as a platform owner via JWT (the publisher runs from a controlled path).
select set_config('request.jwt.claims',
                  json_build_object('sub', tests.uid('powner')::text)::text, true);
select graph.publish_projection(1,'kg-test','pgtap','c',true,
  $n$[{"id":"m:a","type":"module","canonicalName":"a","displayName":"A","lifecycle":"live","scope":"platform","sourceRegistry":"t","evidence":"e"},
      {"id":"m:b","type":"module","canonicalName":"b","displayName":"B","lifecycle":"live","scope":"platform","sourceRegistry":"t","evidence":"e"},
      {"id":"m:c","type":"module","canonicalName":"c","displayName":"C","lifecycle":"live","scope":"platform","sourceRegistry":"t","evidence":"e"}]$n$::jsonb,
  $e$[{"id":"m:a|depends_on|m:b","from":"m:a","kind":"depends_on","to":"m:b","inverse":"depended on by","scope":"platform","evidence":"e","sourceSystem":"t"},
      {"id":"m:b|depends_on|m:c","from":"m:b","kind":"depends_on","to":"m:c","inverse":"depended on by","scope":"platform","evidence":"e","sourceSystem":"t"}]$e$::jsonb);
select graph.activate_projection(1);
select ok((public.graph_find_dependencies('m:a',6)->'dependencies') ? 'm:c',
          'graph_find_dependencies traverses depends_on multi-hop');
select ok((public.graph_find_blast_radius('m:c',6,100)->'dependents') ? 'm:a',
          'graph_find_blast_radius executes and returns transitive dependents');
select is((public.graph_find_blast_radius('m:c',999,999)->>'maxDepth'), '12',
          'graph_find_blast_radius caps traversal depth at 12');
select ok(jsonb_array_length(public.graph_get_neighbors('m:b',100)->'outgoing') >= 1,
          'graph_get_neighbors executes and returns edges');
select is(public.graph_get_node('m:a')->>'node_id', 'm:a',
          'graph_get_node executes and returns the node');

select * from finish();
rollback;
