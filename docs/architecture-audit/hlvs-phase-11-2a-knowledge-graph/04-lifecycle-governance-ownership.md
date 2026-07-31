# 4–6 · Entity Lifecycles · Governance · Read/Write Ownership

## 4 · Entity lifecycle definitions

Lifecycles reuse the honest `Maturity` vocabulary already in `types.ts` (`live`, `built_undeployed`, `prototype`, `reference`, `dormant`, `legacy`, `planned`) and the Capability Library's `implemented / partial / planned / deprecated`. Each node type has a defined, ordered lifecycle; a node cannot skip to `live`/`implemented` without evidence.

| Node                      | Lifecycle (ordered)                                             | Terminal   | Promotion evidence required                |
| ------------------------- | --------------------------------------------------------------- | ---------- | ------------------------------------------ |
| Capability                | planned → partial → implemented → deprecated                    | deprecated | a built module provides it                 |
| Module                    | planned → built_undeployed → live → dormant                     | dormant    | code + tests + applied schema              |
| Application               | planned → built_undeployed → deployed → deprecated              | deprecated | a successful Deployment node               |
| Product                   | planned → needs_assembly → ready_to_launch → available → legacy | legacy     | assembler `assemblable` + commercial terms |
| Deployment                | pending → active → rolled_back / superseded                     | superseded | deploy record (env, commit, status)        |
| Integration               | planned → partial → live                                        | live       | live connector code                        |
| Customer                  | prospect → engaged → active → churned                           | churned    | tenant engagement record                   |
| Government Program        | open → assessed → bid / no_bid                                  | closed     | CEO bid decision                           |
| Opportunity / Acquisition | discovered → scored/evaluated → pursued / declined              | closed     | research evidence + CEO decision           |
| Roadmap Phase             | planned → active → done                                         | done       | phase completion report                    |

**Rule:** lifecycle transitions that cross a business gate (deploy, launch, bid, acquire) are **workflow-gated** (the existing human-approval service). AI never advances a lifecycle.

## 5 · Governance model

The graph inherits the platform's governance; it invents none.

1. **Deterministic authority, advisory AI.** Node/edge facts are deterministic projections; AI may _annotate_ (advisory, confidence < 1.0) but never mutate an authoritative edge.
2. **Evidence or it is planned.** No node is `live`/`implemented` without a repository/DB evidence source. Unevidenced = `planned`. (Principle 10.)
3. **Closed vocabularies.** Node kinds and edge kinds are closed sets changed only by review — preventing graph sprawl and duplicate relationships.
4. **Scope-aware reads.** Platform / tenant / opportunity scope on every node drives read authorization (below).
5. **Reconciliation.** A projection run reconciles the graph against sources; drift (a node with no source, an edge to a missing node) fails CI — the same governance the Capability Library and catalog completeness already enforce.
6. **Immutable audit.** Lifecycle transitions and (future) graph-driven actions emit to the existing `audit` schema.

## 6 · Read/write ownership rules

**The single most important rule: the graph is READ-only; writes go to the authoritative source.** This is what guarantees one source of truth per fact.

| Node type                                                                  | Authoritative WRITER (source of truth)                     | Graph WRITE?      | READ gate                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------- | ---------------------------------------------- |
| Capability, edges `provided_by`/`composed_of`                              | Capability Library (in-code)                               | never (projected) | authenticated                                  |
| Application, Deployment                                                    | Application Registry (in-code)                             | never             | authenticated                                  |
| Product, Industry, Service, Repository, API, Schema, Module, Business Unit | Enterprise Catalog registry + MODULE_REGISTRY + migrations | never             | authenticated (`hlvs.*` → `hlvs.catalog.read`) |
| AI Model                                                                   | `ai` schema registry                                       | never             | platform perm                                  |
| Technology                                                                 | pnpm catalog                                               | never             | authenticated                                  |
| Roadmap Phase                                                              | `discovery.roadmap_phases`                                 | never             | authenticated                                  |
| **Customer / Engagement**                                                  | `bti.*` RPCs (SECURITY DEFINER)                            | never             | **`identity.has_permission(tenant,…)`**        |
| Government Program / Opportunity / Acquisition                             | Government Intelligence + future Discovery                 | never             | executive-gated (`government`/`intelligence`)  |

Rules:

- **Write to the source, re-project the graph.** No API writes a node directly into the graph. This makes divergence structurally impossible.
- **Tenant isolation is absolute.** Customer-scope nodes and their edges are only ever returned within the owning tenant's permission scope. The graph projection stores scope so the read API enforces it — cross-tenant traversal is impossible by construction.
- **Opportunity nodes are executive-only.** External opportunities, acquisition targets and government programs (and their profit/gap edges) require the Phase IX executive/owner roles.
- **Least privilege on traversal.** A traversal returns only nodes/edges the caller may read; a blocked node terminates that path rather than leaking its existence.
