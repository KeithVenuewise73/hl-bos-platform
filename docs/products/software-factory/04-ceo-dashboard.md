# Software Factory · 04 — CEO Portfolio Dashboard & the DoD (Part 6 + Definition of Done)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `portfolioDashboard()` and `evaluateIdea()` in
`packages/catalog/src/portfolio.ts`. Live output below.

## Part 6 — the Executive Portfolio Dashboard

One function answers everything the brief says the CEO must immediately know. Live output
(`portfolioDashboard()`, 2026-07-31):

| The CEO immediately knows…             | Answer (live)                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **What products exist**                | **20** in the portfolio                                                                                            |
| **What is under construction**         | 0 (nothing is in manufacturing yet — honest)                                                                       |
| **What is generating revenue**         | **0** — nothing is commercially live (honest, not flattering)                                                      |
| **What is waiting for approval**       | **2** — HL-BTI, Government Intelligence (built, awaiting go-to-market)                                             |
| **What is highest priority**           | **8 P1 products** (see below)                                                                                      |
| **Which can be assembled immediately** | **6** — HL-BTI, VisibilityAI, Review Management, Reputation Recovery, Government Intelligence, Sports Intelligence |
| **Which require engineering**          | **14** — every product with a net-new capability                                                                   |

- **P1 (highest readiness):** HL-BTI, VisibilityAI, SalonAI, TransportationAI, Review
  Management, Reputation Recovery, Government Intelligence, Sports Intelligence.
- **By line:** service 6 · vertical 4 · logistics 3 · sports 3 · consulting 1 · media 1 ·
  government 1 · horizontal 1.
- **By priority:** P1 = 8 · P2 = 11 · P3 = 1 · P4 = 0.

## Definition of Done — submit an idea, know everything immediately

`evaluateIdea(idea)` is the single entry point the DoD requires. Given a software idea it
answers, from the live registry, all six required questions. Worked example — a brand-new idea,
**LacrosseIQ** (live output):

```
evaluateIdea({ name: "LacrosseIQ", market: "sports",
  capabilities: [identity, scheduling, messaging, team roster,
                 athlete development, lacrosse analytics engine],
  knownNetNew: ["lacrosse analytics engine"] })
```

| DoD question                          | Answer                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Does it already exist?**            | **No** — no lacrosse product in the catalog                                                                                                                                                               |
| **Which capabilities can be reused?** | identity, scheduling, messaging, team roster, athlete development (5, cross-platform from Venuewise + HL-BOS)                                                                                             |
| **Estimated assembly %**              | **83%**                                                                                                                                                                                                   |
| **Required engineering**              | **lacrosse analytics engine** (the one net-new build)                                                                                                                                                     |
| **Commercialization opportunities**   | L1 (internal ops) + L5 (factory assembly building block)                                                                                                                                                  |
| **Expected path to launch**           | Idea Discovery → Market Validation → Capability Search → Assembly Estimate → Commercialization → **CEO Approval (gated)** → **Product Creation (gated)** → **Manufacturing (gated)** → **Launch (gated)** |

And it detects duplicates: `evaluateIdea({ name: "HockeyIQ" })` returns `alreadyExists: true`
and points at the existing `hockey_iq` record — reuse/extend before building.

When an idea does **not** specify its capabilities, `evaluateIdea` says so
(`capabilitiesSpecified: false`) and assumes only the horizontal spine — it does **not** invent
vertical capabilities to flatter the estimate.

## Part 6 surfacing

The dashboard data (`portfolioDashboard()`, `productCatalog()`) is plain, deterministic output
of `@hl-bos/catalog`, ready for the executive surfaces that already consume the catalog — the
CEO Development Control Center and the Executive Portal's `portfolio` view. No new console, no
new database, no new project — the same source of truth, one new question answered.

## Definition of Done — met

| DoD clause                                                   | Status                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1. Herman Legacy operates on the Factory                     | ✅ 14-stage operating model, 86% assemblable ([01](01-operating-model.md))                |
| 2. HLVS is the permanent Product Portfolio Management System | ✅ `portfolio.ts` extends HLVS ([00](00-hlvs-restoration-inventory.md))                   |
| 3. Every opportunity enters the same lifecycle               | ✅ 11-stage `PORTFOLIO_LIFECYCLE`, every product placed ([02](02-portfolio-lifecycle.md)) |
| 4. Every product has an assembly blueprint                   | ✅ computed for all 20 ([03](03-product-catalog.md))                                      |
| 5. Every reusable capability is linked to commercialization  | ✅ L1–L5 per implementation (Execution Phase 1) surfaced per product                      |
| 6. The CEO can submit an idea and immediately know…          | ✅ `evaluateIdea` answers all six questions                                               |

**134/134 catalog tests green.** Every number in these documents is reproducible from the code.
