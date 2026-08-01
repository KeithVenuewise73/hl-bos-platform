# Software Factory · 02 — The Product Portfolio Lifecycle (Part 3)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `PORTFOLIO_LIFECYCLE` in `packages/catalog/src/portfolio.ts`.

Every software idea — from a napkin sketch to a live product — moves through **one** standard
lifecycle. There is no separate track for "big" vs "small" ideas; the same 11 stages apply, and
each stage is performed by a mechanism that **already exists**.

## The 11 stages

| #   | Stage                      | Performed by (existing mechanism)                       | Gate |
| --- | -------------------------- | ------------------------------------------------------- | :--: |
| 1   | Idea Discovery             | `OPPORTUNITY_CATALOG` + `evaluateIdea`                  |      |
| 2   | Market Validation          | discovery engine + HL-BTI assessment                    |      |
| 3   | Capability Search          | `factory-registry.findImplementations`                  |      |
| 4   | Factory Assembly Estimate  | `factory-blueprints.assembleBlueprint`                  |      |
| 5   | Commercialization Analysis | Commercialization Law L1–L5 layer mapping               |      |
| 6   | **CEO Approval**           | workflows human-approval gate                           |  ✔   |
| 7   | **Product Creation**       | `compositions.ProductComposition`                       |  ✔   |
| 8   | **Manufacturing**          | HLVS factory lifecycle (creation order → build package) |  ✔   |
| 9   | **Launch**                 | application registry + gated deployment                 |  ✔   |
| 10  | Revenue Tracking           | billing + analytics                                     |      |
| 11  | Portfolio Review           | `portfolioDashboard` (this module)                      |      |

Stages 6–9 are **human-gated** — the CEO approves commercial terms, product creation is
authorized, manufacturing runs through the governed factory loop, and launch is a gated
deployment. Nothing proceeds through a gate autonomously.

## Where each product sits today

The lifecycle is not decorative — every product in the catalog is placed at a real stage,
computed from its maturity and assembly picture:

- **`ceo_approval`** — built and running as an engine, awaiting go-to-market approval
  (HL-BTI, Government Intelligence).
- **`commercialization_analysis`** — assemblable now, layer analysis is the next step
  (VisibilityAI, Review Management, Reputation Recovery, Sports Intelligence).
- **`capability_search`** — specified (`planned`), resolving capabilities (SalonAI,
  TransportationAI, ReceptionAI).
- **`idea_discovery`** — identified (`concept`), requirements not yet specified (the vertical
  and sport concepts).
- **`portfolio_review`** — legacy, a rebuild candidate (Asset Recovery).

No product is at `revenue_tracking` — because none has a paying customer yet. The lifecycle
says so honestly rather than showing a revenue stage that isn't real.
