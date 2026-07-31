# Execution Phase 1 · 01 — Workstreams & prioritized backlog

**For:** Keith Herman, CEO · **From:** Claude (acting COO, HL Software Factory) · **Date:** 2026-07-31
**Planning only — no code, no architecture changes. Engineering Law #1 + Commercialization Law #1 in force.**

Objective: **first recurring customers** (MRR), fastest credible path, maximum reuse. Nothing
here is new platform — every task is _deploy / ignite / assemble / sell_ on what already exists.

## Prioritized backlog (scored across the 5 criteria)

Each task scored 1–5 (5 = best): **Rev** = revenue impact · **TTD** = time-to-deploy (5 = fastest)
· **Reuse** = reuse of existing capability · **Eff** = engineering effort (5 = _least_ effort) ·
**Strat** = strategic value. **P** = priority total /25.

| #   | Task                                                                                                   | Owner      | Rev | TTD | Reuse | Eff | Strat | **P**  | Tier |
| --- | ------------------------------------------------------------------------------------------------------ | ---------- | :-: | :-: | :---: | :-: | :---: | :----: | :--: |
| 1   | **Grant Anthropic API key** (ignite AI seam)                                                           | 🔑 CEO     |  5  |  5  |   5   |  5  |   5   | **25** |  P0  |
| 2   | **Set HL-BTI recurring commercial terms** (monthly managed-service retainer)                           | 🔑 CEO     |  5  |  5  |   5   |  5  |   5   | **25** |  P0  |
| 3   | **Authorize deploy** (edge runtime + HL-BTI app) + confirm hosting + point `bti.hermanlegacygroup.com` | 🔑 CEO     |  5  |  5  |   5   |  4  |   5   | **24** |  P0  |
| 4   | **Deploy HL-BTI app + AI gateway to production** (build exists; backend live)                          | ⚙️ Eng     |  5  |  5  |   5   |  4  |   5   | **24** |  P1  |
| 5   | **Verify live AI seam + first consultant login** on production (clear IAT-001)                         | ⚙️ Eng     |  5  |  4  |   5   |  4  |   5   | **23** |  P1  |
| 6   | **Close first HL-BTI recurring customer** (retainer from warm HSCS pipeline)                           | 🔑 CEO/GTM |  5  |  4  |   5   |  4  |   5   | **23** |  P1  |
| 7   | **Recurring invoicing** — out-of-band retainer first (no Stripe needed)                                | 🔑 CEO     |  4  |  5  |   4   |  5  |   4   | **22** |  P1  |
| 8   | **Deliver engagement #1** end-to-end; produce client deliverable                                       | ⚙️ Eng/GTM |  4  |  4  |   5   |  4  |   5   | **22** |  P1  |
| 9   | **3 evidence bridges** (productize HL-BTI: surface work, client deliverable, evidence-scoring)         | ⚙️ Eng     |  4  |  3  |   5   |  3  |   5   | **20** |  P2  |
| 10  | **Review Management / Reputation Recovery** thin-wrap subscription (upsell)                            | ⚙️ Eng     |  3  |  3  |   5   |  4  |   4   | **19** |  P2  |
| 11  | **VisibilityAI live-egress security hardening** (SSRF / IP-pin)                                        | ⚙️ Eng     |  4  |  2  |   4   |  3  |   5   | **18** |  P2  |
| 12  | **Deploy VisibilityAI** (scan workers + customer UI) → self-serve subscription                         | ⚙️ Eng     |  5  |  2  |   4   |  2  |   5   | **18** |  P2  |
| 13  | **Stripe adapter** (finish the 501 stub) for self-serve recurring billing                              | ⚙️ Eng     |  4  |  2  |   4   |  3  |   4   | **17** |  P2  |
| 14  | **SalonAI vertical** (pilot: Canvas Hair Co.)                                                          | ⚙️ Eng     |  3  |  1  |   5   |  2  |   4   | **15** |  P3  |

**Read:** P0 = CEO ignition decisions (unblock everything). P1 = the direct path to the **first
recurring customer** (HL-BTI retainer). P2 = the **scalable recurring** engine (VisibilityAI
funnel + thin wraps). P3 = first full vertical. Everything above P3 needs **zero** new platform.

## The six workstreams

### WS-1 · Ignition & Deploy (unblocks all revenue) — Owner: 🔑 CEO decisions → ⚙️ Eng executes

Grant the Anthropic key; authorize deploy; confirm hosting (Docker/Coolify per app config) and
point the domain. Then deploy the AI gateway + HL-BTI app against canonical production (backend
already live). **Exit:** HL-BTI reachable at its domain with a working AI seam.

### WS-2 · HL-BTI Go-to-Recurring-Revenue (the first MRR) — Owner: 🔑 CEO/GTM + ⚙️ Eng

Set the **monthly managed-service retainer** terms; provision the first consultant; run
engagement #1; **sign the first retainer** and issue the first recurring invoice. **Exit:
first recurring customer live (MRR > 0).**

### WS-3 · Billing & Commercial Terms — Owner: 🔑 CEO + ⚙️ Eng

Decide recurring plans/prices (yours). **Bill retainers out-of-band first** (no engineering);
finish the Stripe adapter only when self-serve subscriptions (WS-5) need it. **Exit:** money
can be collected recurringly.

### WS-4 · HL-BTI Productization (retain & expand) — Owner: ⚙️ Eng

Ship the **3 evidence bridges** (reuse-first: 13 reused / 3 modified / 3 new) so the app
surfaces the consulting work, produces the client deliverable, and shows evidence provenance —
turning a retainer into a durable, expandable subscription. **Exit:** HL-BTI is a repeatable
product, not a bespoke engagement.

### WS-5 · VisibilityAI Recurring Funnel (scalable MRR) — Owner: ⚙️ Eng

Build the **live-egress security control (SSRF/IP-pin)**; deploy scan workers + customer UI;
launch as a **self-serve subscription** — the top-of-funnel that feeds every product and the
first _scalable_ recurring revenue. Then the **Review Management / Reputation Recovery** thin
wraps as upsells. **Exit:** self-serve recurring subscriptions live.

### WS-6 · Go-To-Market & Customer Acquisition — Owner: 🔑 CEO/GTM

Work the **warm HSCS consulting pipeline** for HL-BTI retainers; use VisibilityAI assessments
as top-of-funnel once live; capture ROI/testimonials. **Exit:** a repeatable acquisition motion
feeding both retainers and subscriptions.

## Dependencies (critical path)

```
WS-1 Ignition (CEO keys + deploy)  ─►  WS-2 HL-BTI live + first retainer  ─►  FIRST RECURRING CUSTOMER
                                        │
                                        └► WS-4 evidence bridges ─► durable subscription
WS-1 ──► WS-5 VisibilityAI security ─► VisibilityAI self-serve ─► WS-5 thin wraps ─► scalable MRR
WS-3 Billing (out-of-band) runs alongside WS-2; Stripe only gates WS-5 self-serve.
```

The single longest pole to the **first** recurring customer is **WS-1 → WS-2**, and its gating
items are all **CEO decisions**, not engineering. Engineering for the first customer is
_deploy an existing build_.
