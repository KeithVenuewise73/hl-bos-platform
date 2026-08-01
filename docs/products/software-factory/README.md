# The Operational Software Factory (Executive Summary)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Status: Operating model + Product Portfolio Management System operational. 134/134 catalog
tests green. No new project, no production migration, fully reversible.**

## What you asked for

Complete the Software Factory operating model: (1) make **Herman Legacy operate entirely through
the Factory**, and (2) **restore and extend HLVS into the permanent Product Portfolio Management
System** — one lifecycle, one product catalog, one opportunity catalog, one CEO dashboard, and a
single entry point where the CEO submits an idea and immediately knows everything.

## What was built (assembly, not rebuild)

Two new in-code modules in `@hl-bos/catalog`, extending the Factory foundation from Execution
Phase 1 — no new database, no new Supabase project, reversible by deleting the files:

- **`operating-model.ts`** — Herman Legacy's 14-stage internal operating system, each stage
  assembled from existing capabilities. **86% needs no net-new engineering**; the only two gaps
  are a customer-success desk and support ticketing.
- **`portfolio.ts`** — the permanent Product Portfolio Management System: the **11-stage
  lifecycle**, the **20-opportunity master catalog** with computed assembly, the **CEO
  dashboard**, and **`evaluateIdea`** — the Definition-of-Done entry point.

Both **reuse** the existing HLVS engines (discovery, scoring, recommendations, approval/launch
workflows, the assembler, the reuse-governance duplicate check) rather than rebuilding them —
see the [restoration inventory](00-hlvs-restoration-inventory.md).

## The result in one screen

- **Herman Legacy operating system:** 14 stages, 5 operational · 7 assemblable · 2 partial ·
  **0 hard gaps**. Only net-new: customer-success desk, support ticketing.
- **Product portfolio:** 20 opportunities, all placed in one lifecycle. **6 assemblable now**,
  8 P1 (highest readiness), **0 with revenue** (honest — nothing is live).
- **`evaluateIdea`:** submit any idea → exists?, reusable capabilities, assembly %, required
  engineering, commercialization layers, path to launch — computed live.

## Definition of Done — met

| #   | DoD clause                                            | Where                                                                 |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Herman Legacy operates on the Factory                 | [01 — operating model](01-operating-model.md)                         |
| 2   | HLVS is the permanent Product Portfolio Mgmt System   | [00 — restoration](00-hlvs-restoration-inventory.md) + `portfolio.ts` |
| 3   | Every opportunity enters the same lifecycle           | [02 — lifecycle](02-portfolio-lifecycle.md)                           |
| 4   | Every product has an assembly blueprint               | [03 — catalog](03-product-catalog.md)                                 |
| 5   | Every reusable capability linked to commercialization | L1–L5 per product (Execution Phase 1 layers)                          |
| 6   | CEO submits an idea, immediately knows everything     | [04 — CEO dashboard](04-ceo-dashboard.md) `evaluateIdea`              |

## Deliverables

| Part | Deliverable                              | Where                                                                |
| ---- | ---------------------------------------- | -------------------------------------------------------------------- |
| 1    | Herman Legacy operating model            | `operating-model.ts` + [01](01-operating-model.md)                   |
| 2    | HLVS restoration inventory               | [00-hlvs-restoration-inventory.md](00-hlvs-restoration-inventory.md) |
| 3    | Product Portfolio lifecycle              | `PORTFOLIO_LIFECYCLE` + [02](02-portfolio-lifecycle.md)              |
| 4    | Product catalog (17 fields/product)      | `productCatalog()` + [03](03-product-catalog.md)                     |
| 5    | Software opportunity catalog (20)        | `OPPORTUNITY_CATALOG` + [03](03-product-catalog.md)                  |
| 6    | CEO portfolio dashboard + `evaluateIdea` | `portfolioDashboard`/`evaluateIdea` + [04](04-ceo-dashboard.md)      |

## Engineering constraints honored

- **ASSEMBLE, DON'T REBUILD.** Every HLVS engine is reused; two modules add the standing
  portfolio layer that did not exist.
- **No new Supabase project, no production migration** — pure TypeScript in `@hl-bos/catalog`.
- **Honesty (Principle 10).** ROI and market size are `not_estimated`, current customers are 0,
  revenue-generating is empty, runtime monitoring is gated — nothing is dressed up. Every
  assembly %, net-new list and priority is computed and reproducible.

## The decision this puts in front of you

The **6 assemblable-now** products (HL-BTI, VisibilityAI, Review Management, Reputation
Recovery, Government Intelligence, Sports Intelligence) need **zero net-new engineering** — they
wait only on your go-to-market approval and commercial terms. That is the next CEO decision; the
Factory has done the analysis.
