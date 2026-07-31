# Project Atlas — Phase X · Enterprise Intelligence Architecture

**For:** Herman Legacy Group leadership · **Author:** Chief Enterprise Architect (Claude) · **Date:** 2026-07-30
**Mode:** Architecture blueprint only — **no implementation, no migrations, no production change, no merge, no deploy.**
**Branch:** `claude/hlvs-architectural-assessment-ltqs1b` (docs only).

---

## The one decision this blueprint makes

> **There is one platform: HL-BOS.** Every intelligence capability — including everything originally envisioned for HLVS — becomes a **subsystem inside HL-BOS**, never a standalone application. The original HLVS vision is **preserved and absorbed**, not resurrected.

This eliminates the ambiguity Phase IX surfaced: the historical HLVS Venture Studio is gone as a codebase, but its _concepts_ (a factory that researches, reuses, and assembles software) become the **HLVS Intelligence subsystem** of HL-BOS.

## The architecture in one picture

```
Herman Legacy Group
        │
        ▼
┌───────────────────────────── HL-BOS Enterprise Platform ─────────────────────────────┐
│                                                                                       │
│  EXPERIENCE            Executive Portal (the ONE UI, read-only)  ·  Control Center (local) │
│  ───────────────────────────────────────────────────────────────────────────────────│
│  ENTERPRISE            ┌─ HLVS Intelligence ─┐ ┌─ HL-BTI ─┐ ┌─ Visibility ─┐ ┌─ Transport ─┐│
│  INTELLIGENCE LAYER    │ Catalog · Registry  │ │ Assess   │ │ SEO · Rep    │ │ Fleet ·     ││
│  (4 subsystems)        │ Capability Library  │ │ Gap · ROI│ │ Competitive  │ │ Dispatch ·  ││
│                        │ Discovery · Build Q │ │ Proposal │ │ Marketing    │ │ Freight ... ││
│                        └─────────┬───────────┘ └────┬─────┘ └──────┬───────┘ └──────┬──────┘│
│  ───────────────────────────────┼──────────────────┼──────────────┼────────────────┼──────│
│  SHARED PLATFORM       Auth · Comms · Workflow · Notifications · Billing · Storage ·        │
│  SERVICES              Events · Entitlements · Integrations · AI Gateway (advisory only)     │
│  ───────────────────────────────────────────────────────────────────────────────────│
│  CORE PLATFORM         Tenancy (platform) · Identity · Audit · Event Bus                     │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Every subsystem follows **one pattern** (see [01](01-enterprise-intelligence-architecture.md)): a bounded database schema → a deterministic engine package → advisory AI through the single gateway → a human approval gate → a read-only projection in the Executive Portal. **Deterministic authority, advisory AI, human approval.**

## What already exists vs. what is new (grounding this in reality)

| Subsystem                       | Exists today                                                                                                        | New in this blueprint                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **HLVS Intelligence**           | `@hl-bos/catalog` (Enterprise Catalog + Application Registry + Software Factory), `hlvs` schema, `discovery` schema | Capability Library unification; external **Discovery Engine** (software/GitHub/acquisition/AI-trend/brand research); **Claude Build Queue** |
| **HL-BTI Intelligence**         | `@hl-bos/transformation-intelligence`, `@hl-bos/bti-engine`, `bti` schema                                           | Persist v2 outputs; proposal/implementation-plan surfacing                                                                                  |
| **Visibility Intelligence**     | `visibility` schema (prototype), growth dimensions in bti-engine                                                    | Consolidate into a first-class subsystem                                                                                                    |
| **Transportation Intelligence** | operations domain concepts only                                                                                     | **Greenfield** subsystem design (fleet/dispatch/freight/fuel/maintenance/compliance)                                                        |

Nothing here is thrown away; the blueprint is a **consolidation**, not a rewrite.

## Capability-placement decision matrix (the Objectives)

| Capability                                                                                       | Layer                                   | Status                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------- |
| Tenancy, Identity, Audit, Event Bus                                                              | **Core Platform**                       | live                        |
| Auth, Comms, Workflow, Notifications, Billing, Storage, Entitlements, Integrations, AI Gateway   | **Shared Platform Services**            | live                        |
| Enterprise Catalog, Application Registry, Capability Library                                     | **Enterprise Intelligence · HLVS**      | live / to unify             |
| Opportunity Discovery, Software Research, Acquisition, GitHub, AI-Trend, Brand Intelligence      | **Enterprise Intelligence · HLVS**      | new (design)                |
| Claude Build Queue                                                                               | **Enterprise Intelligence · HLVS**      | new front over live factory |
| Assessments, Transformation/Gap Analysis, Proposal, Recommendation, ROI, Implementation Planning | **Business Intelligence · HL-BTI**      | live                        |
| SEO, Digital Visibility, Competitive, Reputation, Marketing                                      | **Marketing Intelligence · Visibility** | prototype → consolidate     |
| Fleet, Dispatch, Freight, Fuel, Maintenance, Compliance                                          | **Transportation Intelligence**         | greenfield (design)         |

## Deliverables index

| #    | Deliverable                                           | Document                                                                                 |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | Enterprise Intelligence Architecture                  | [01-enterprise-intelligence-architecture.md](01-enterprise-intelligence-architecture.md) |
| 2    | Updated Platform Diagram                              | [02-platform-diagram.md](02-platform-diagram.md)                                         |
| 3    | Enterprise Catalog Design                             | [03-enterprise-catalog-design.md](03-enterprise-catalog-design.md)                       |
| 4    | Discovery Engine Architecture                         | [04-discovery-engine-architecture.md](04-discovery-engine-architecture.md)               |
| 5    | Capability Library Design                             | [05-capability-library-design.md](05-capability-library-design.md)                       |
| 6    | Product Intelligence Architecture                     | [06-product-intelligence-architecture.md](06-product-intelligence-architecture.md)       |
| 7    | Executive Dashboard Integration                       | [07-executive-dashboard-integration.md](07-executive-dashboard-integration.md)           |
| 8    | Application Registry Assessment                       | [08-application-registry-assessment.md](08-application-registry-assessment.md)           |
| 9–11 | Database Extensions · API Structure · UI Architecture | [09-database-api-ui.md](09-database-api-ui.md)                                           |
| 12   | Phase XI Implementation Roadmap                       | [10-phase-xi-roadmap.md](10-phase-xi-roadmap.md)                                         |

**All proposed schemas, APIs and UIs in this package are DESIGN ONLY.** No migration is written or applied; no code is modified; nothing is merged or deployed.
