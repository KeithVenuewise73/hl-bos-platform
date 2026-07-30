# Project Atlas — Phase 1: HLVS Architectural Assessment

**Prepared for:** Keith Herman (CEO / Product Owner), Herman Legacy Group
**Prepared by:** Claude (AI engineer / acting Chief Enterprise Architect)
**Date:** 2026-07-29
**Type:** Architectural discovery sprint — **inventory and assessment only. No code, schema, or infrastructure was changed.**

---

## Why this exists

Phase II of Herman Legacy Group is not about inventing new software. It is about **organizing, consolidating, and scaling what already exists**, and about evolving HLVS from an Innovation Studio into the **Product Intelligence Layer** of the Herman Legacy Platform.

Before any architectural change, leadership needs one true, current picture of everything HLVS and HL-BOS already contain. This assessment is that picture. Its governing instinct is **preserve and reuse** — the accumulated intellectual property is the asset; the objective is to _extend_ it, not recreate it.

## What grounds it

Every material claim here was verified against one of three primary sources, not asserted from memory:

1. **The live canonical database** — Supabase project _HL-BOS Core_ (`mvvtngiopdrgiedjmhfb`), read-only catalog and advisor queries, 2026-07-29.
2. **The repository** — 27 SQL migrations, 8 edge functions, 3 apps, 2 shared packages, and 29 pgTAP test files.
3. **The prior audit** — `docs/architecture-audit/visibilityai-phase-0/` (2026-07-26), which this assessment **updates and extends** rather than repeats.

Where this assessment and an older document disagree, the **live database wins** and the difference is called out.

## The one-paragraph answer

HL-BOS is real, tested, and materially further along than at the last audit: **27 migrations applied, 124 application tables across 17 purpose-named schemas, 100% RLS-enabled, 0 ERROR-level security advisories.** Since Phase 0 (which saw 17 migrations / 49 tables) the platform has added the discovery/blueprint engine, commerce & provisioning, a sales pipeline, communications, storage metadata, the **HLVS Software Factory** (`hlvs` schema, 19 tables), and **HL-BTI** — the first product the Factory produced. The legacy VisibilityAI/HLVS estate (156 tables in an unreachable legacy project) remains out of scope and is preserved, not touched. The safest path forward is to **extend the Factory and the discovery/BI engines into the Enterprise Catalog**, deploy the already-built (but undeployed) edge runtime, and continue assembling verticals from shared modules.

---

## Deliverables

| #   | Report                                                             | What it answers                                                                                   |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 01  | [Executive Summary](01-executive-summary.md)                       | The whole picture in CEO language: what we have, what to preserve, what to extend, the safe path. |
| 02  | [Current HLVS Architecture](02-current-hlvs-architecture.md)       | How the system is actually shaped today — planes, boundaries, the HLVS↔HL-BOS↔HL-BTI split.       |
| 03  | [Existing Feature Inventory](03-existing-feature-inventory.md)     | Every significant component, classified and located.                                              |
| 04  | [Database Assessment](04-database-assessment.md)                   | 17 schemas, 124 tables, relationships, RLS, function/API surface.                                 |
| 05  | [Service Assessment](05-service-assessment.md)                     | Edge functions, workers, the outbox dispatcher pattern, deployment state.                         |
| 06  | [UI Assessment](06-ui-assessment.md)                               | The three apps: Control Center, HL-BTI, HL-BTI Alpha.                                             |
| 07  | [AI Capability Assessment](07-ai-capability-assessment.md)         | The AI gateway, the deterministic engines, and where AI is governed.                              |
| 08  | [Shared Service Assessment](08-shared-service-assessment.md)       | The reusable platform spine and each shared domain's maturity.                                    |
| 09  | [Enterprise Catalog Readiness](09-enterprise-catalog-readiness.md) | Gap analysis: what already exists, partially exists, or is missing for the Catalog.               |
| 10  | [Duplication Analysis](10-duplication-analysis.md)                 | Where duplication does and does not exist, and forward risks.                                     |
| 11  | [Recommended Architecture](11-recommended-architecture.md)         | Where each capability should live; the target shape with minimal disruption.                      |
| 12  | [Prioritized Implementation Roadmap](12-implementation-roadmap.md) | The sequenced, reuse-first path — no rebuilds.                                                    |

**This is a discovery sprint. It does not begin implementing the Enterprise Catalog.** That design is the next phase, once this architecture is fully understood and blessed.
