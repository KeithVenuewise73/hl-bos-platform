# Customer Manufacturing · 00 — Lifecycle Capability Inventory (Checkpoint 1)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**ASSEMBLE, DON'T REBUILD.** Before assembling a single lifecycle stage, this is what already
exists. Every capability below is real code / schema in the repository. The Customer
Manufacturing System (Checkpoints 2–5) is assembled from these — it introduces no new system.

## The question

> "What customer-lifecycle capabilities does Herman Legacy already own — so every stage reuses,
> and nothing is rebuilt?"

## The headline finding

**The customer lifecycle already exists as a state machine.** `@hl-bos/bti-engine/lifecycle.ts`
is a 12-stage engagement machine — `prospect → lead_qualification → business_discovery →
assessment → executive_analysis → blueprint → proposal → customer_approval → implementation →
project_management → roi_tracking → monthly_partnership` — with `canAdvance`, `nextStage`, and a
hard analysis-only cap. **We do not build a second workflow engine.** The 21 customer-facing
stages are a finer-grained view that rides on this machine.

## The inventory — every stage's backing already exists

| Lifecycle need                      | Already exists as                                               | Evidence                                         |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| **Engagement state machine**        | 12-stage `ORDER` + `canAdvance` + analysis-only cap             | `@hl-bos/bti-engine/lifecycle.ts`                |
| **Lead / prospect discovery**       | Discovery engine (collectors → unified profile)                 | `svc.discovery` (19 tables)                      |
| **Visibility assessment**           | VisibilityAI (visibility schema + website scanner + reputation) | `prod.visibility-ai`, `mod.website-scanner`      |
| **Business assessment + scoring**   | Deterministic scoring engines                                   | `@hl-bos/bti-engine`, `ai.deterministic-scoring` |
| **Transformation blueprint + recs** | HL-BTI (transformation-intelligence pipeline)                   | `pkg.transformation-intelligence`                |
| **Executive report**                | BTI platform executive scoring + dashboards                     | `mod.bti-platform`, `bti` schema                 |
| **Proposal → agreement**            | Commerce (sales.proposals, agreements)                          | migration 0024 (`sales` schema)                  |
| **Project / work order**            | Provisioning (work_orders, readiness)                           | migration 0024 (`provisioning` schema)           |
| **Assembly + capability selection** | Software Factory + registry + reuse governance                  | `mod.hlvs-factory`, `pkg.catalog`                |
| **Approvals**                       | Human-approval gate                                             | `svc.workflows`, `wf.human-approval-gate`        |
| **Deployment**                      | Application registry + gated deployment                         | `pkg.catalog`, `db-migrate` gate                 |
| **Subscription / billing**          | Billing + entitlements                                          | `svc.billing`, `svc.entitlements`                |
| **Communications**                  | Email/SMS templates, consent, suppression                       | `svc.comms`                                      |
| **Scheduling (meetings)**           | Scheduling — production on Venuewise (cross-platform)           | Factory registry (Phase 1)                       |
| **CRM primitives**                  | Identity (orgs/contacts), events (activities), sales (opps)     | `svc.identity`, `svc.events`, commerce           |
| **Expansion / cross-sell**          | Portfolio engine (`evaluateIdea`)                               | `packages/catalog/portfolio.ts` (Phase 2)        |
| **ROI / QBR**                       | HL-BTI ROI tracking + engagement lifecycle                      | `wf.engagement-lifecycle`, `mod.bti-platform`    |

## The genuine gaps (only what does NOT exist)

Honesty (Principle 10) — the lifecycle has exactly **three** net-new pieces, all small and
horizontal:

1. **Customer Success desk** — a health/renewal-risk store (named in Execution Phase 2).
2. **Referral program** — referral tracking.
3. **Competitive Analysis** — the one VisibilityAI function without a distinct capability.

Everything else is assembly. No new CRM database, no new workflow engine, no redesign of
VisibilityAI or HL-BTI.

## Reuse opportunities (what Checkpoints 2–5 do)

- **CP2** — assemble the 21-stage lifecycle as a view over the reused engagement machine + the
  cross-platform assembler.
- **CP3** — connect VisibilityAI + HL-BTI + the Intelligence CRM (a model over existing systems).
- **CP4** — the CEO Operations Dashboard (measurable metrics real, operational metrics honestly
  zero).
- **CP5** — validate a prospect can traverse Discovery → … → Renewal with no duplicate systems.
