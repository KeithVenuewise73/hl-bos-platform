# Phase XI-2C · Persistent Knowledge Graph Read Model — Completion Report

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Status:** Implemented + **locally validated**, tested. **Not applied to any remote DB. Not merged, not deployed.** Awaiting CEO review.

> **Corrected by Phase XI-2D (2026-07-31).** The local validation below ran
> against a **stubbed** identity schema that did not enforce the real
> `permissions_key_format` constraint. XI-2D validated against the real
> constraint and found that the originally-seeded permission keys `graph.read`
> and `graph.manage` were **invalid** (two-segment; the platform requires
> three-segment `domain.resource.action`). They are now
> **`graph.projection.read`** and **`graph.projection.manage`** throughout
> migration 0028, re-validated on a constraint-faithful cluster. See
> [../hlvs-phase-11-2d-preview-validation/README.md](../hlvs-phase-11-2d-preview-validation/README.md).
> Permission-key names in this document have been updated to the corrected values.

---

## What existed

The deterministic in-code Knowledge Graph (XI-2B, `@hl-bos/catalog`): 145 nodes / 427 edges, typed, validated — but ephemeral (recomputed per call). The migration framework (`supabase/migrations`, 27 files), house RLS/RPC/permission conventions, and a pgTAP test harness were in place. No persistence for the graph.

## What changed

A **persistent, versioned, read-only DB projection** of the in-code graph (no new source of truth):

- **Migration `0028`** (`supabase/migrations/…_0028_knowledge_graph_read_model.sql`): internal `graph` schema — vocabulary tables, `projections`/`nodes`/`edges` with typed columns + integrity constraints, RLS (enable+force, read-only), three `graph.*` permissions, the controlled publisher (`publish_projection`/`activate_projection`/`rollback_projection`/`record_failed_projection`/`cleanup_superseded`), and read-only `public.graph_*` RPCs.
- **In-code serializer** (`graph-serialize.ts`): converts the graph to the publisher payload with a deterministic FNV-1a checksum — the in-code ↔ DB parity bridge.
- **pgTAP suite** (`supabase/tests/28_knowledge_graph.sql`): structural + authorization-surface assertions for CI.
- **Portal**: a "Persistent read model (projection status)" card on `/graph` — model version, checksum, counts, integrity — honestly labelled _migration created, not yet applied_.

Reconnaissance + new-schema justification: [01-reconnaissance.md](01-reconnaissance.md). Design: [02-adr-graph-persistence.md](02-adr-graph-persistence.md). Apply/rollback: [03-migration-runbook.md](03-migration-runbook.md).

## Persistent graph inventory (from the in-code projection the read model persists)

**145 nodes · 427 edges · 14 planned** — projection version `kg-0.1.0`, deterministic checksum. Node types: capability 27, module 19, application 17, deployment 17, schema 16, repository 12, business_unit 11, product 8, api 6, host 6, industry 4, technology 2. Edge kinds: uses 114, composed_of 90, owned_by 62, depends_on 49, built_with 37, provided_by 21, deployed_as 17, hosted_on 17, provides 16, targets 4. Scope: 145 platform · 0 tenant · 0 opportunity (honestly 0).

## Parity results

The DB stores exactly the serializer's output, so parity is by construction; asserted in TS (`graph-serialize.test.ts`):

- node/edge **counts** match the in-code graph;
- node **identity/type/lifecycle/scope/evidence/planned** preserved;
- edge **identity/kind/inverse/endpoints/scope** preserved;
- checksum **deterministic** and **drift-detecting**.
  The pgTAP suite asserts the DB structure/authorization surface in CI; end-to-end DB parity is confirmed at apply time (runbook step 5).

## Local migration validation (no remote touched)

Applied on a **throwaway local Postgres 16 cluster** (initdb under the `postgres` user, private socket; `auth`/`identity` stubbed). Results:

| Check                                        | Result                                        |
| -------------------------------------------- | --------------------------------------------- |
| Migration `0028` applies                     | ✅                                            |
| `publish_projection` + `activate_projection` | ✅ v1 active (2 nodes / 1 edge, integrity_ok) |
| Dangling-edge rejected (composite FK)        | ✅                                            |
| Self-edge rejected (CHECK)                   | ✅                                            |
| Integrity-false refused (publisher guard)    | ✅                                            |
| Atomic activation (one-active index)         | ✅ v2 active, v1 superseded                   |
| `rollback_projection`                        | ✅ back to v1                                 |

## Security results

- **Mutation denial:** `graph.nodes`/`graph.edges` have **no** insert/update/delete policies → authenticated/ordinary roles cannot write; only the SECURITY DEFINER publisher (gated on `graph.projection.manage`) writes. (pgTAP asserts zero non-SELECT policies.)
- **Read gating:** all reads require `graph.projection.read`; `_can_see(scope, tenant)` enforces tenant isolation (`has_permission(tenant,…)`) and opportunity gating (`graph.opportunity.read`). `graph` schema is not PostgREST-exposed.
- **RPC grants:** read RPCs `grant execute … to authenticated`, `revoke … from public, anon` (pgTAP asserts anon is denied).
- **No unauthenticated access, no public browser, no write RPCs for consumers.**

## Migration status (explicit)

- **Migration file created:** ✅ `0028`.
- **Local validation:** ✅ (throwaway Postgres 16 cluster).
- **Remote migration applied:** ❌ **none** — no Supabase MCP apply, no preview, no production.
- **Production database changed:** ❌ none.

## What remains untouched

No merge, no deployment, no DNS change, no production authentication change, no customer-data change, no Factory enforcement, no autonomous refresh schedule, no Discovery/Transportation work. Existing Catalog / Capability Library / Application Registry / portal consumers unchanged and passing.

## Quality gates (exact results)

| Gate                                           | Result                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                            | ✅ clean                                                                                          |
| `pnpm lint`                                    | ✅ clean                                                                                          |
| `pnpm typecheck` (8 projects, TS 6.0.3 strict) | ✅ clean                                                                                          |
| `pnpm test`                                    | ✅ **247/247** (7 new serializer parity tests; migration-count assertion updated to 28)           |
| Local migration validation                     | ✅ applies + publisher/rollback + integrity rejection (throwaway PG16)                            |
| Authorization tests                            | ✅ pgTAP structural/authz suite authored (`28_knowledge_graph.sql`); write-policy denial asserted |
| Executive Portal production build              | ✅ 24 routes compile (incl. `/graph`)                                                             |

## Executive decisions required

1. **Authorize applying migration `0028`** to a preview/branch DB (then production after acceptance) and **granting `graph.projection.read`/`graph.projection.manage`** to platform roles — the only steps that touch a real database. _Nothing else is blocked._

## Recommended next phase (do not begin)

**Phase XI-2D — Controlled projection publish + parity confirmation on a preview DB**, then **wire the read RPCs into the portal `/graph` view** (replacing the in-code read with `public.graph_*` once the projection is live). Later, and separately gated: the anti-duplication gate into the Software Factory. Recommended; **not started**.

### Deliverables index

| #   | Deliverable                                 | Where                                                                                                                   |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Persistence reconnaissance report           | [01-reconnaissance.md](01-reconnaissance.md)                                                                            |
| 2   | Read-model schema                           | migration `0028` (`graph` schema)                                                                                       |
| 3   | Migration package                           | `supabase/migrations/…_0028_knowledge_graph_read_model.sql`                                                             |
| 4   | Projection versioning model                 | `graph.projections`                                                                                                     |
| 5   | Controlled projection publisher             | `graph.publish_projection` + `activate_projection`                                                                      |
| 6   | Rollback mechanism                          | `graph.rollback_projection` + `cleanup_superseded`                                                                      |
| 7   | Read-only graph RPC suite                   | `public.graph_*` (status/get_node/neighbors/blast_radius/dependencies/caps-for-app/apps-for-cap)                        |
| 8   | RLS + authorization policies                | RLS enable+force + `_can_see` + permissions                                                                             |
| 9   | In-code/DB parity tests                     | `packages/catalog/src/graph-serialize.test.ts`                                                                          |
| 10  | Capability reuse enrichment                 | traversal reuse (blast radius, caps-for-app) over the projection; `duplicateCheck`/`evaluateReuse` remain authoritative |
| 11  | Application Registry projection integration | application/deployment/host/repository/business-unit nodes + edges (from XI-2B projection)                              |
| 12  | Minimal portal projection-status            | `/graph` "Persistent read model" card                                                                                   |
| 13  | Architecture decision record                | [02-adr-graph-persistence.md](02-adr-graph-persistence.md)                                                              |
| 14  | Migration & deployment runbook              | [03-migration-runbook.md](03-migration-runbook.md)                                                                      |
| 15  | Completion report                           | this file                                                                                                               |
| 16  | Next-phase recommendation                   | this file (above)                                                                                                       |
