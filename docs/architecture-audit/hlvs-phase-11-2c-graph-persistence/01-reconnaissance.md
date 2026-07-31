# Phase XI-2C · Persistence Reconnaissance

Confirmed against the repository and environment before implementation.

| #   | Checked                 | Finding                                                                                                                                                                                  |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Migration conventions   | `supabase/migrations/*.sql`, date-prefixed `YYYYMMDDHHMMSS_hlbos_00NN_<name>.sql`; 27 existing (through 0027). New file: `…_0028_knowledge_graph_read_model.sql`.                        |
| 2   | Suitable schemas        | No existing schema semantically owns a graph read model. A **new bounded `graph` schema** is justified (not a reuse of `bti`/`discovery`/`hlvs`, which are domain schemas).              |
| 3   | RLS pattern             | `enable` + `force row level security`; `select` policy `using (identity.has_platform_permission('<perm>'))`; tenant data `identity.has_permission(tenant,'<perm>')`. Reused verbatim.    |
| 4   | RPC naming/security     | `create function public.<name>(...) language plpgsql stable security definer set search_path=''`; `revoke all … from public, anon`; `grant execute … to authenticated`. Reused verbatim. |
| 5   | Audit pattern           | `events.emit`/`audit.emit` triggers exist on domain tables; a read-model projection is append/replace by the publisher, so audit hooks are optional here (noted for a future pass).      |
| 6   | Refresh/projection      | None existed. Introduced a controlled publisher (`graph.publish_projection` → `activate_projection`); **no autonomous schedule** (out of scope).                                         |
| 7   | Schema-version/sync     | None existed for a graph. Introduced `graph.projections` (version, checksum, status, counts).                                                                                            |
| 8   | In-code graph builder   | `buildKnowledgeGraph()` (145 nodes / 427 edges, deterministic) + `validateGraph()` — the semantic contract.                                                                              |
| 9   | Identity representation | Nodes `type:key`; edges join from/kind/to; evidence + scope + lifecycle on every node/edge; mirrored 1:1 in the read model.                                                              |
| 10  | Blueprint vs reality    | No conflict. `config.toml` exposes only `public` → the `graph` schema is internal by construction; `public.graph_*` RPCs are the only door (matches the blueprint).                      |

## Environment capability for LOCAL validation (critical for the stop condition)

- **Supabase CLI:** not installed. **Docker daemon:** down. **`psql` + native Postgres 16 server binaries:** present (`/usr/lib/postgresql/16/bin/`), and a non-root `postgres` system user exists.
- **Decision:** validate the migration on a **throwaway local Postgres 16 cluster** (initdb under the `postgres` user, private unix socket) with stubbed `auth`/`identity` prerequisites — entirely local, **no remote project touched, no Supabase MCP apply**. This satisfies "create and locally validate migration files" without violating "do not apply remotely".

## New schema justification (§2)

`graph` is a bounded, internal read-model schema — not a domain schema and not PostgREST-exposed. It holds only a derived projection (versions, nodes, edges) plus the controlled publisher and read RPCs. It introduces no new authoritative facts; every row is a projection of an existing registry. This is the minimal correct home for the read model and cannot become a competing source of truth (no consumer write path).
