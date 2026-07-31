# ADR-XI-2B · In-Code Knowledge Graph Projection

**Status:** Accepted (implemented on `claude/hlvs-architectural-assessment-ltqs1b`, not merged).
**Date:** 2026-07-30 · **Context:** Phase XI-2B, first implementation stage of the approved XI-2A blueprint.

## Decision

Implement the Enterprise Knowledge Graph as a **deterministic, in-code, read-only projection** inside `@hl-bos/catalog`:

- `graph-model.ts` — typed node/edge model (closed `NodeType` + closed `GraphEdgeKind` = the 10 `RelationKind` + 11 XI-2A edges, each with a declared inverse in `GRAPH_INVERSE`); stable `nodeId`/`edgeId`.
- `graph-projection.ts` — `buildKnowledgeGraph()` (assembles from the authoritative registries; deterministic ordering, deduped edges) + `validateGraph()` (integrity).
- `graph-traverse.ts` — typed, explainable traversal primitives + executive query helpers.

## Decisions of record

| Decision                           | Rationale                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projection, not a store**        | No new source of truth or persistence (XI-2B boundary). The graph is rebuilt from registries; writes stay at the source.                   |
| **Modules from `MODULE_REGISTRY`** | It is what the Capability Library references; the catalog `mod.*` assets are the older view (recon §1). Avoids a duplicate module set.     |
| **Services as modules**            | `shared_service` assets are 1:1 with shared modules; representing them as module nodes honors no-duplication.                              |
| **Closed vocabularies**            | `NodeType` and `GraphEdgeKind` are closed unions; no free-form kinds. Same governance as `AssetKind`/`RelationKind`.                       |
| **Deterministic edge identity**    | edgeId joins from/kind/to; a Map dedupes; the build is reproducible (tested).                                                              |
| **Only connect existing nodes**    | `addEdge` no-ops if an endpoint is missing → integrity holds by construction; `validateGraph` proves it.                                   |
| **Evidence-or-planned**            | Every node/edge carries evidence; nodes with no built provider are `planned` (14 of 145). Nothing fabricated.                              |
| **Scope-aware, tenant-safe**       | Each node has a scope; validation flags any platform→tenant edge; 0 tenant nodes projected (bti.businesses empty), so no leak is possible. |
| **Acyclic families enforced**      | `depends_on`, `composed_of`, `provided_by` are validated acyclic via DFS.                                                                  |
| **Reuse `graph.ts`**               | Concepts (outgoing/incoming/inverse) generalized to typed edges; the existing utility remains.                                             |

## Alternatives rejected

- **New graph database / persistence now** — out of scope (XI-2C, migration-gated).
- **Project modules from catalog `mod.*` assets** — would fork the module namespace and break capability links.
- **Materialize a second static node registry** — rejected as duplication; the graph is derived.

## Consequences

- **Positive:** one deterministic, explainable graph answering the blueprint's executive questions with zero production risk; strengthens (does not replace) the Catalog, Capability Library, and Application Registry.
- **Accepted:** the projection is recomputed per call (145 nodes / 427 edges — negligible). Persistence for runtime query is deferred to the migration-gated XI-2C.
