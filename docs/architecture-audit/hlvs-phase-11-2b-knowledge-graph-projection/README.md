# Phase XI-2B · In-Code Knowledge Graph Projection — Completion Report

**For:** Keith Herman, CEO · **Date:** 2026-07-30 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Status:** Implemented, tested, **not merged, not deployed, no migration, no persistence, no RPC** — awaiting CEO review.

---

## What existed

A directed, typed relationship graph already shipped in `@hl-bos/catalog`: 13 `AssetKind` node kinds, 10 `RelationKind` edges with `INVERSE_RELATION`, and `graph.ts` (`neighborhood`, `referencedIds`). The Capability Library (XI-1) and Application Registry (IX) added computed relationship data. There was no unified, queryable enterprise graph across all of it.

## What changed

A deterministic, read-only **Knowledge Graph projection** inside `@hl-bos/catalog` (no new app, repo, service, store, or source of truth):

- `graph-model.ts` — typed model; closed node/edge vocabularies; `GRAPH_INVERSE`; stable ids.
- `graph-projection.ts` — `buildKnowledgeGraph()` (from the authoritative registries; deterministic) + `validateGraph()` (integrity).
- `graph-traverse.ts` — typed, explainable traversals + executive query helpers.
- Minimal read-only portal view at **`/graph`** (inventory, integrity, single-points-of-dependency, cheapest planned product, node detail with relationships + blast radius); evidence/security role-gated to executives.

Design decisions: [02-adr-graph-projection.md](02-adr-graph-projection.md). Reconnaissance + two documented discrepancies (module namespace; services==modules): [01-reconnaissance.md](01-reconnaissance.md).

## Graph inventory (evidence-backed, nothing fabricated)

**145 nodes · 427 edges · 14 planned nodes.**

| Node type     | Count |     | Edge kind   | Count |
| ------------- | ----- | --- | ----------- | ----- |
| capability    | 27    |     | uses        | 114   |
| module        | 19    |     | composed_of | 90    |
| application   | 17    |     | owned_by    | 62    |
| deployment    | 17    |     | depends_on  | 49    |
| schema        | 16    |     | built_with  | 37    |
| repository    | 12    |     | provided_by | 21    |
| business_unit | 11    |     | deployed_as | 17    |
| product       | 8     |     | hosted_on   | 17    |
| api           | 6     |     | provides    | 16    |
| host          | 6     |     | targets     | 4     |
| industry      | 4     |     |             |       |
| technology    | 2     |     |             |       |

Scope: **145 platform · 0 tenant · 0 opportunity** (tenant/opportunity node types are supported in the model but have no repository evidence yet — honestly 0, not fabricated).

## Integrity results (deterministic validation — all clean)

| Check                              | Result |
| ---------------------------------- | ------ |
| Duplicate edges                    | **0**  |
| Invalid references (dangling)      | **0**  |
| Missing inverses                   | **0**  |
| Self-dependencies                  | **0**  |
| Cycles (acyclic families)          | **0**  |
| Missing evidence                   | **0**  |
| Missing ownership                  | **0**  |
| Scope violations (platform→tenant) | **0**  |

Negative tests prove the validator _catches_ an injected self-dependency and an injected dangling reference.

## Executive query demonstrations (representative, from real data)

- **Apps depending on `module:scoring_engine`** → the HL-BTI apps + Executive Portal (via `bti_platform`/`scoring_engine`).
- **Capabilities used by `application:hl-bti`** → bti_platform → executive_dashboards, deterministic_scoring, business_discovery.
- **Products that could reuse `capability:business_discovery`** → the compositions that include `discovery_engine`.
- **Blast radius of `module:scoring_engine`** → non-empty, explainable dependent set.
- **Single points of dependency (≥2 apps)** → e.g. `identity_access` / `identity_core` (the shared spine).
- **Cheapest planned product to ship** → highest reusable-capability coverage among `not_yet` products.
- **Opportunity overlap** (`["scheduling","communications","orbital-packet-router"]`) → 2 exist, 1 gap, 67% overlap — no fabricated match.

## What remains untouched (confirmed)

- **No migration, no persistence layer, no RPC, no graph writes.** The graph is a pure in-code projection.
- **No deployment, no DNS, no auth change, no customer data, no Factory enforcement wiring.**
- **No branch merged.**
- **Existing consumers preserved** — `graph.ts`, the Capability Library, and the Application Registry are unchanged and still pass their tests.
- **Later stages not begun** — no persistence, no Discovery Engine, no Transportation Intelligence.

## Quality gates (exact results)

| Gate                                           | Result                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm format:check`                            | ✅ clean                                                         |
| `pnpm lint`                                    | ✅ clean                                                         |
| `pnpm typecheck` (8 projects, TS 6.0.3 strict) | ✅ clean                                                         |
| `pnpm test`                                    | ✅ **240/240** (32 new knowledge-graph tests + 1 new authz test) |
| Executive Portal production build              | ✅ 24 routes compile (incl. `/graph`)                            |

The 21 required test proofs — deterministic build, catalog/capability/registry records present, stable node ids, deterministic edge ids, duplicate rejection, valid inverses, invalid-reference rejection, self-dependency rejection, cycle rejection, tenant isolation, planned-vs-operational distinction, evidence retention, typed-only traversal, explainable blast radius, capability reuse traversal, opportunity overlap, role-gating, consumer preservation, green build — are all covered.

## Executive decisions required

1. **Approve the migration-gated persistence stage (XI-2C)** — recommended below. _No decision blocks progress._

## Recommended next phase (do not begin)

**Phase XI-2C — Read-model persistence + traversal RPCs (migration-gated).** Project this graph into the proposed `catalog`/`graph` schema as a materialized read model refreshed by CI/edge worker, exposed via `public.graph_*` SECURITY-DEFINER read RPCs that enforce scope — so subsystems and the portal can query the graph at runtime. It builds directly on this phase and requires **CEO migration approval**. Recommended, **not started**.

### Deliverables index

| #   | Deliverable                            | Where                                                               |
| --- | -------------------------------------- | ------------------------------------------------------------------- |
| 1   | Live graph reconnaissance report       | [01-reconnaissance.md](01-reconnaissance.md)                        |
| 2   | In-code Knowledge Graph model          | `packages/catalog/src/graph-model.ts`                               |
| 3   | Deterministic projection builder       | `graph-projection.ts` (`buildKnowledgeGraph`)                       |
| 4   | Relationship validation framework      | `graph-projection.ts` (`validateGraph`)                             |
| 5   | Typed traversal API                    | `packages/catalog/src/graph-traverse.ts`                            |
| 6   | Executive query proof suite            | `knowledge-graph.test.ts`                                           |
| 7   | Capability Library integration         | `graph-projection.ts` (capability nodes/edges) + reuse in traversal |
| 8   | Application Registry integration       | `graph-projection.ts` (application/deployment/host nodes)           |
| 9   | Scope & authorization validation       | `validateGraph` scope checks + `/graph` role-gating + authz test    |
| 10  | Minimal read-only verification surface | `apps/executive-portal/src/app/graph/page.tsx`                      |
| 11  | Architecture decision record           | [02-adr-graph-projection.md](02-adr-graph-projection.md)            |
| 12  | Completion report                      | this file                                                           |
| 13  | Persistence-phase recommendation       | this file (above)                                                   |
