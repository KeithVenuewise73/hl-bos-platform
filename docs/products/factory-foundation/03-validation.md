# Factory Foundation · 03 — Validation: the Seven Questions

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Proven in code by** `factoryValidation()` in `packages/catalog/src/factory-blueprints.ts`,
asserted by `factory-registry.test.ts` (117/117 catalog tests green). The answers below are the
**live output** of that function — not hand-written claims.

The Definition of Done is that the Factory can reason about a product idea across platforms.
These seven questions prove it can.

---

### Q1 — Which platform provides CRM?

**Venuewise Platform** — a functional CRM / lead-capture store (`leads` table + RLS).
**HL-BOS Core has no dedicated CRM capability** (its `business_discovery` carries a
`lead_capture` alias but is prospect-intelligence, not a CRM of record). → If a product needs
CRM today, it comes from Venuewise, or CRM is net-new on HL-BOS.

### Q2 — Which billing implementations exist?

Two, and they are **contested**:

| Implementation                              | Platform    | Maturity                             |
| ------------------------------------------- | ----------- | ------------------------------------ |
| `billing@hlbos_core`                        | HL-BOS Core | partial (Stripe stubbed, undeployed) |
| `payments_subscriptions@venuewise_platform` | Venuewise   | **production** (live Stripe suite)   |

→ The mature billing implementation is **Venuewise's live Stripe suite**. Adopting it vs.
finishing HL-BOS's `billing_core` is a canonical decision (step 8).

### Q3 — Which scheduling is mature?

**Venuewise Platform — production** (`calendar_events` 93, `events` 118, cron every 10/30 min).
**HL-BOS scheduling is only planned** (no built scheduler). → This is the clearest cross-platform
win: any HL-BOS product needing real scheduling should reuse Venuewise's, not build one.

### Q4 — Which capabilities are available for HockeyIQ?

Eight, already built (identity on HL-BOS; the rest proven on Venuewise):

`identity (hlbos_core, production)` · `scheduling (venuewise, production)` ·
`messaging (venuewise, production)` · `payments (hlbos_core, partial)` ·
`team roster (venuewise, functional)` · `athlete development (venuewise, functional)` ·
`coach management (venuewise, functional)` · `facility booking (venuewise, functional)`

### Q5 — Which capabilities are net-new for HockeyIQ?

Exactly two — both hockey-specific: **hockey analytics engine** and **player development index**.
Everything else is assembly. A whole new sports product is ~80% reuse.

### Q6 — Which capabilities can be sold independently (L3 standalone SaaS)?

**20** capabilities, built today. Highlights: Scheduling, Messaging/SMS, Forms Engine, Documents
Engine, Workflow Engine, Business Discovery, Blueprint Generation, Digital Visibility, Reputation
Management, Executive Dashboards, Transformation Intelligence, Government Contract Intelligence,
and the full sports set (Athlete, Coach, Team, Facility, Clinics/Academy, Organization, Media).

### Q7 — Which capabilities support each of the five commercialization layers?

| Layer  | Meaning                           | # capabilities |
| ------ | --------------------------------- | :------------: |
| **L1** | Internal Herman Legacy operations |       42       |
| **L2** | HL-BTI transformation delivery    |       10       |
| **L3** | Standalone SaaS                   |       20       |
| **L4** | Licensed / API / white-label      |       27       |
| **L5** | Factory assembly building block   |       43       |

**Every built capability supports L5** (it is a composable block) — consistent with the Venuewise
harvest's finding that every capability can serve factory assembly. L2 is the narrowest (the
discovery/scoring/intelligence/forms/documents/workflow capabilities that feed a transformation
engagement).

---

## What this proves

The Factory can take a product idea and answer, deterministically and with evidence:

1. **Which capabilities exist** and at what maturity — Q4, `findImplementations`.
2. **On which platform** — Q1–Q3, `platformsProviding`.
3. **What adapters/decisions are needed** — the two contested capabilities, `contestedCapabilities`.
4. **What is genuinely net-new** — Q5, `assembleBlueprint`.
5. **How it commercializes** — Q6–Q7, `implementationsSupportingLayer`.
6. **What returns to the catalog** — step 12 of the order process.

That is the Definition of Done. **The Factory foundation is operational.** Per the execution
prompt, work now **stops and awaits CEO approval** before any actual product is assembled.
