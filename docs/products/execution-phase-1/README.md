# Execution Phase 1 — Commercialization Execution Plan

**For:** Keith Herman, CEO · **From:** Claude (acting COO, Herman Legacy Software Factory)
**Date:** 2026-07-31 · **Status:** Execution plan for approval. **Planning only — no code, no
architecture changes.** Engineering Law #1 (assemble, don't rebuild) + Commercialization Law #1
(five layers) in force.

## The mission

**Get Herman Legacy from today to its first paying recurring customers — in ~4–6 weeks of
execution, not construction.** The platform is built; the backend is live on production. The
job now is **deploy → sell → collect recurring revenue**.

## The strategy (fastest credible path to MRR)

1. **HL-BTI first, sold as a monthly managed-service retainer** → the **first recurring
   revenue**. It's the only `ready_to_launch` product, its backend is already on production,
   and it sells to Herman Legacy's _own_ warm consulting pipeline. A retainer is recurring
   (MRR) from day one — no dependency on new engines or self-serve billing.
2. **VisibilityAI second, as a self-serve subscription funnel** → the first _scalable_
   recurring revenue and the top-of-funnel that feeds everything else (after one security
   control is built).
3. **Review Management / Reputation Recovery** → thin-wrap subscriptions upsold from the
   funnel.

This turns recurring revenue on with the least engineering earliest, and each step funds and
de-risks the next.

## Six workstreams

| WS  | Name                               | Outcome                                                | Owner               |
| --- | ---------------------------------- | ------------------------------------------------------ | ------------------- |
| 1   | **Ignition & Deploy**              | HL-BTI live on production with a working AI seam       | 🔑 CEO → ⚙️ Eng     |
| 2   | **HL-BTI Go-to-Recurring-Revenue** | First managed-service retainer signed (MRR > 0)        | 🔑 CEO/GTM + ⚙️ Eng |
| 3   | **Billing & Terms**                | Recurring collection (out-of-band first)               | 🔑 CEO + ⚙️ Eng     |
| 4   | **HL-BTI Productization**          | 3 evidence bridges → durable, expandable subscription  | ⚙️ Eng              |
| 5   | **VisibilityAI Recurring Funnel**  | Self-serve subscriptions live (security + deploy)      | ⚙️ Eng              |
| 6   | **Go-To-Market**                   | Repeatable acquisition motion (warm pipeline + funnel) | 🔑 CEO/GTM          |

Detail + the fully scored, prioritized backlog: [01-workstreams-and-backlog.md](01-workstreams-and-backlog.md).

## The milestone ladder to first recurring revenue

| Milestone                            | When         | Done when                                                             |
| ------------------------------------ | ------------ | --------------------------------------------------------------------- |
| M0 · Ignition                        | Week 0       | Key granted · deploy authorized · retainer terms set · domain pointed |
| M1 · HL-BTI live on prod             | Week 1–2     | App reachable; live AI verified; consultant login works               |
| M2 · First engagement delivered      | Week 2–4     | Real client blueprint/proposal produced on production                 |
| **M3 · FIRST RECURRING CUSTOMER** ⭐ | **Week 4–6** | **First retainer signed; first recurring invoice (MRR > 0)**          |
| M4 · HL-BTI productized              | Week 6–10    | Evidence bridges shipped; retainer renewed/expanded                   |
| M5 · Scalable recurring live         | Week 10–14   | VisibilityAI self-serve subscription; first self-serve customer       |
| M6 · Recurring base                  | Week 14+     | N recurring customers / target MRR (CEO-set)                          |

Full KPI dashboard + blocker register: [02-milestones-and-blockers.md](02-milestones-and-blockers.md).

## The blockers — and who clears them

**The only things between today and the first recurring customer (M3) are CEO decisions**, not
engineering:

| Blocker                         | Owner      | Action                                                |
| ------------------------------- | ---------- | ----------------------------------------------------- |
| Anthropic key keyless           | 🔑 CEO     | Grant the key                                         |
| Deploy not authorized / hosting | 🔑 CEO     | Authorize deploy; confirm hosting; grant infra access |
| HL-BTI terms unset              | 🔑 CEO     | Set the monthly retainer price/model (your number)    |
| Domain not pointed              | 🔑 CEO     | Point `bti.hermanlegacygroup.com`                     |
| First customer unnamed          | 🔑 CEO/GTM | Pick the first engagement from the warm HSCS pipeline |

Engineering blockers (Stripe adapter, VisibilityAI SSRF guard, auth email) gate only the
_scalable_ recurring wave (M5) — **not** the first retainer.

## What I need from you to start the revenue clock (M0)

1. 🔑 **Grant the Anthropic API key.**
2. 🔑 **Authorize deploying HL-BTI** (app + AI gateway) to production, and confirm hosting +
   point the domain.
3. 🔑 **Set the HL-BTI monthly retainer terms** (your price/model — I never invent pricing).
4. 🔑 **Name the first customer** from the warm HSCS pipeline.
5. 🔑 **Billing:** out-of-band retainer invoicing first (recommended), Stripe later.

Give me those and I execute WS-1 → WS-2: HL-BTI deployed and verified on production within
~2 weeks, first recurring invoice within ~4–6.

## Guardrails (held throughout)

- **Assemble, don't rebuild** — every task is deploy/ignite/assemble/sell on existing assets;
  zero new platform, schemas, or redesign.
- **Honesty** — no invented prices, customers, revenue, or metrics; a KPI is reported only when
  it actually happens. Empty means "not yet."
- **Everything gated** — keys, deploy, terms, and each invoice remain your decisions; I execute
  and report with real evidence.

## Documents

| #   | Document                                                       | Contents                                                                     |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | [01-workstreams-and-backlog.md](01-workstreams-and-backlog.md) | Six workstreams + the 14-item backlog scored across the 5 criteria           |
| 2   | [02-milestones-and-blockers.md](02-milestones-and-blockers.md) | Milestone ladder to first recurring revenue, KPI dashboard, blocker register |

_Builds directly on the approved Discovery outputs: [`../first-commercial-launch/`](../first-commercial-launch/README.md),
[`../factory-commercialization-audit/`](../factory-commercialization-audit/README.md),
[`../canonical-asset-inventory/`](../canonical-asset-inventory/README.md)._
