# 1 · Enterprise Knowledge Graph Architecture

## Principle: project, don't duplicate

The graph is a **materialized read projection** over the authoritative sources that already exist. Nothing becomes a new record of truth.

```mermaid
flowchart LR
  subgraph Sources of truth (authoritative WRITE)
    S1["Capability Library (in-code)"]
    S2["Enterprise Catalog registry (in-code)"]
    S3["Application Registry (in-code)"]
    S4["MODULE_REGISTRY / compositions (in-code)"]
    S5["Migrations / DB schemas"]
    S6["Tenant data via RPCs (bti, discovery)"]
  end
  S1 & S2 & S3 & S4 & S5 & S6 --> PROJ["Projection job (CI / edge worker)"]
  PROJ --> KG["Enterprise Knowledge Graph (READ model)"]
  KG --> Q["Deterministic traversal API"]
  Q --> CONSUMERS["Portal · HLVS · HL-BTI · Visibility · Transport · Discovery"]
```

Consequences:

- **No divergence.** Edit the source; the graph re-projects. The graph is never edited directly.
- **Deterministic.** Same sources → same graph. Traversal is graph-theoretic, not probabilistic.
- **Explainable.** Every node and edge carries an `evidence` source and a `scope`; an AI (advisory only) reasons over _explicit typed edges_, never over hidden embeddings.

## The three-part type system

1. **Nodes** — enterprise entities with stable identity, lifecycle, governance, evidence, and a _scope_ (platform / tenant / opportunity).
2. **Edges** — typed, directed relationships with a declared inverse and cardinality. Reuses the catalog's `RelationKind` (uses, depends_on, provides, consumes, extends, owned_by, referenced_by, replaced_by, successor, deprecated) plus a small closed set of capability/deployment edges.
3. **Attributes** — properties that are NOT nodes (Pricing, Licensing, Owner-as-name, Health, Version). Modeling these as nodes would explode the graph; they live on the node they describe.

> **Design correction (repo is source of truth):** of the 23 "authoritative entities" the directive lists, several are not nodes. **Dependency** is an _edge_ (dependency direction), **Pricing / Licensing** are _attributes_ (commercial metadata, `pending-ceo`), and **Owner** is both an attribute (a name string) and a node when it resolves to a **Business Unit**. Classifying them honestly (§02) is what keeps the graph coherent instead of ambiguous.

## Scopes (drive read governance)

| Scope           | Nodes                                                                                                                                                       | Read gate (existing)                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Platform**    | Application, Product, Capability, Module, Service, Business Unit, Industry, Repository, Schema, API, Integration, Deployment, AI Model, Technology, Roadmap | catalog is world-readable to `authenticated`; `hlvs.*` gated on `hlvs.catalog.read` |
| **Tenant**      | Customer, Engagement, Assessment                                                                                                                            | `identity.has_permission(tenant, ...)` — never cross-tenant                         |
| **Opportunity** | External Opportunity, Acquisition Target, Government Program                                                                                                | executive-gated (Phase IX authz `government`/`intelligence`)                        |

The graph inherits — never weakens — the existing RLS/permission model. A tenant node is only ever reachable within its tenant's permission scope; the projection carries the scope so the read API can enforce it.

## Why this satisfies the KG principles

| Principle                     | How the design meets it                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Avoid duplicate relationships | One directed edge per semantic + declared inverse; dedupe key `(from, kind, to)`; no free-form edges (closed `RelationKind`). |
| Deterministic navigation      | Typed edges + `neighborhood()` traversal (already in `graph.ts`); no ambiguous multi-meaning edges.                           |
| Explainable AI reasoning      | Evidence + scope on every node/edge; AI reasons over explicit edges, advisory only.                                           |
| Future recommendation engines | Reuse %, impact, and gap analysis are graph queries the engines call.                                                         |
| Discovery workflows           | Opportunity-scope nodes attach to Capability nodes via `requires` / `would_provide`.                                          |
| Acquisition analysis          | Acquisition Target → Capability edges run straight into the duplicate gate.                                                   |
| Reuse-before-rebuild          | The Capability Library duplicate check _is_ a graph query over `provided_by` / `composed_of`.                                 |
| Executive reporting           | Every executive question (§05) is a bounded traversal with a deterministic answer.                                            |

## What is explicitly out of scope

- No AI memory, vector store, or embedding index (directive).
- No new writable system of record.
- No implementation, schema, or API is built here — only defined (§06 recommends the XI-2 build).
