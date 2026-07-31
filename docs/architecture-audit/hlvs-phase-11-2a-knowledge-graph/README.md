# Phase XI-2A · Enterprise Knowledge Graph — Architecture Blueprint

**For:** Herman Legacy Group leadership · **Author:** Chief Enterprise Architect (Claude) · **Date:** 2026-07-30
**Mode:** Architecture only — **no implementation, no migration, no production change, no merge, no deploy.**
**Branch:** `claude/hlvs-architectural-assessment-ltqs1b` (docs only).

---

## The core decision

> **The Enterprise Knowledge Graph is a typed, directed relationship model that already half-exists — it is the formalization and extension of the catalog's `Asset.relationships` graph, the Capability Library links, and the Application Registry — not a new store and NOT an AI memory system.**

The catalog already ships a directed, typed graph: 13 node kinds (`AssetKind`), 10 relationship kinds (`RelationKind`) each with a declared inverse (`INVERSE_RELATION`), honest lifecycle (`Maturity`), and an `evidence` field on every node. Phase XI-2A makes that graph **complete and coherent** across every enterprise entity, so that HLVS Intelligence, HL-BTI, Visibility, Transportation, the Enterprise Catalog, the Application Registry, the Capability Library and the future Discovery Engine all reason over **one** relationship model.

## What the graph is (and is not)

| It IS                                                                    | It is NOT                         |
| ------------------------------------------------------------------------ | --------------------------------- |
| A typed, directed, deterministic relationship model                      | An AI memory / embedding store    |
| A **read projection** over authoritative in-code registries + DB schemas | A new writable database of record |
| Explainable — every node & edge carries an evidence source               | A black box                       |
| The substrate for reuse, discovery, acquisition, reporting               | A recommendation engine itself    |

Writes always go to the **authoritative source** (the Capability Library, the Application Registry, migrations, tenant RPCs); the graph is projected from them, so it can never silently diverge.

## The model in one picture

```mermaid
flowchart TB
  subgraph Platform scope (read: per existing gates)
    BU[Business Unit] -->|owns| APP[Application]
    APP -->|deployed as| DEP[Deployment]
    DEP -->|hosted on| HOST[Host/Provider]
    APP -->|uses| CAP[Capability]
    PROD[Product] -->|composed of| CAP
    CAP -->|provided by| MOD[Module]
    MOD -->|owns schema| SCH[Schema]
    MOD -->|depends on| MOD
    SVC[Shared Service] -->|provides| CAP
    API[API] -->|uses| SCH
    PROD -->|targets| IND[Industry]
    CAP -->|priced/licensed| COMM[(Commercial: pending-ceo)]
    MOD -->|built with| TECH[Technology]
    CAP -.uses.-> AIM[AI Model]
    REPO[Repository] -->|owns| APP
    ROAD[Roadmap Phase] -->|sequences| CAP
  end
  subgraph Tenant scope (read: permission-gated)
    CUST[Customer] -->|engaged for| PROD
  end
  subgraph Opportunity scope (future Discovery)
    GOV[Government Program] -->|requires| CAP
    ACQ[Acquisition Target] -->|would provide| CAP
    OPP[External Opportunity] -->|maps to| CAP
  end
```

## Executive questions the graph answers (samples — full set in §05)

- If we deprecate a module, **which products and applications break?**
- **What is the cheapest product to ship next** (highest capability reuse %)?
- **Which capabilities are single points of failure** (many dependents, one provider)?
- **Which government programs can we bid on today**, and which need one capability we don't have?
- **What do we own that is reusable but unused** (build candidates to retire, or sell)?
- If we **acquire target Z**, what does it add — and what does it duplicate?

## Deliverables index

| #   | Output                                       | Document                                                                     |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Enterprise Knowledge Graph architecture      | [01-architecture.md](01-architecture.md)                                     |
| 2   | Complete entity relationship model           | [02-entity-model.md](02-entity-model.md)                                     |
| 3   | Relationship definitions                     | [03-relationship-definitions.md](03-relationship-definitions.md)             |
| 4   | Entity lifecycle definitions                 | [04-lifecycle-governance-ownership.md](04-lifecycle-governance-ownership.md) |
| 5   | Governance model                             | [04-lifecycle-governance-ownership.md](04-lifecycle-governance-ownership.md) |
| 6   | Read/write ownership rules                   | [04-lifecycle-governance-ownership.md](04-lifecycle-governance-ownership.md) |
| 7   | Relationship traversal examples              | [05-traversal-and-questions.md](05-traversal-and-questions.md)               |
| 8   | Executive questions the graph answers        | [05-traversal-and-questions.md](05-traversal-and-questions.md)               |
| 9   | Impact on Enterprise Catalog                 | [06-impacts-and-recommendation.md](06-impacts-and-recommendation.md)         |
| 10  | Impact on Capability Library                 | [06-impacts-and-recommendation.md](06-impacts-and-recommendation.md)         |
| 11  | Impact on Application Registry               | [06-impacts-and-recommendation.md](06-impacts-and-recommendation.md)         |
| 12  | Recommendation for Phase XI-2 implementation | [06-impacts-and-recommendation.md](06-impacts-and-recommendation.md)         |

**Constraints honored:** repository remains the source of truth; no entity is invented that the platform doesn't support (unsupported ones are marked _planned_); existing structures (`RelationKind`, `AssetKind`, the capability model) are reused; architecture only. **Stops after the blueprint — no Phase XI-2 implementation.**
