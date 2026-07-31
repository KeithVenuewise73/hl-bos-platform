# First Commercial Launch · Ranking & recommendation

**For:** Keith Herman, CEO · **Date:** 2026-07-31

Scored across your five dimensions, 1–5 (5 = best). For "customer-acquisition difficulty,"
5 = **easiest**. Scores are grounded in [01-opportunity-evaluation.md](01-opportunity-evaluation.md);
the rationale column says _why_, not just the number.

## The scoring

| Opportunity                                 | Fastest to revenue | Engineering readiness | HL-BOS reuse | Customer acq. (5=easiest) | Recurring revenue | **Total /25** |
| ------------------------------------------- | :----------------: | :-------------------: | :----------: | :-----------------------: | :---------------: | :-----------: |
| **HL-BTI** (consultant-operated)            |       **5**        |         **5**         |    **5**     |           **5**           |         3         |    **23**     |
| **VisibilityAI** (the funnel)               |         2          |           3           |      5       |             4             |       **5**       |    **19**     |
| **SalonAI** (first vertical pilot)          |         2          |           3           |      5       |             3             |         4         |    **17**     |
| **Review Management** (upsell)              |         3          |           2           |      4       |             3             |         4         |    **16**     |
| ReceptionAI / TransportationAI / HomeHuddle |         1          |           1           |      3       |             2             |        2–3        |     ~9–10     |

Name-only stubs (LandscapeAI, FleetHuddle, CoachAI, Venuewise), legacy products, and the
internal engines (Gov-Contracts Intelligence, Consulting Framework) are **not** first-launch
candidates — no product code, out of scope, or not a standalone SKU.

## Why the scores fall where they do

**HL-BTI — 23/25.**

- _Fastest to revenue (5):_ backend **already on production** (14 tables, 5 RPCs); a
  deployment build with real auth + Docker/Coolify + domain exists; it sells as a
  **consulting-delivery tool to Herman Legacy's own warm HSCS clients** — no dependency on
  live web-crawl security or a net-new engine.
- _Engineering readiness (5):_ the only `ready_to_launch` product; 627/627 DB tests; PRO-001
  11/12 on preview. Remaining work is deploy + wire the AI key, not construction.
- _HL-BOS reuse (5):_ composes the most built modules (spine + ai_gateway, discovery,
  blueprint, commerce_provisioning, bti_platform, scoring).
- _Customer acquisition (5, easiest):_ the customer is **Herman Legacy's existing consulting
  pipeline**; a consultant demos and closes. No cold self-serve funnel required.
- _Recurring revenue (3):_ near-term revenue is **engagement fees**, not subscription. A
  managed-service subscription is the _tail_, credible only after real engagements. Scored
  honestly rather than flattered.

**VisibilityAI — 19/25.** Strategically the most important (it is the acquisition funnel and
the strongest pure-subscription play, recurring = 5), but **not fastest to revenue**: it is
mock-only and gated on a real **SSRF/live-egress security control that isn't built** before it
can touch a real customer's website, and it has no customer UI. Right as **launch #2**.

**SalonAI — 17/25.** The cleanest _full vertical_ and it has a named pilot (Canvas Hair Co.),
but it needs genuine new build (salon domain, booking, three app surfaces, public site) — a
composition exercise, but still weeks. The first **Factory** showcase, best as **launch #3**.

**Review Management — 16/25.** A fast follow-on, but its natural motion is an **upsell from a
live VisibilityAI assessment** — so it depends on launch #2 being live first.

## Recommendation

> **Launch HL-BTI first — as a consultant-operated managed transformation service, not as an
> unattended self-serve SaaS.**

This is the honest reading of the five dimensions _and_ of HL-BTI's own Executive Validation.
As a **consultant-operated** offering the frontrunner's one real weakness disappears: the
tool "structures a consultant's opinions rather than objectively assessing a business" — which
is exactly right when a Herman Legacy consultant _is_ the operator and the evidence source.
Near-term revenue is **billable engagement fees** (fast, warm pipeline); the productized
subscription follows once real engagements exist and the three "evidence bridges" land
(reuse-first: 13 reused / 3 modified / 3 new — not a rebuild).

**Sequence:** HL-BTI (consultant-operated) → **VisibilityAI** (the funnel, once live-egress
security is built) → **SalonAI** (first full Factory vertical pilot, Canvas Hair Co.). This
matches the order the Phase V docs already assert — reached here independently from the
five-dimension scoring and current production state.

## What this recommendation is NOT

- Not a claim that HL-BTI is a finished self-serve SaaS — it is not; it is a
  consultant-operated delivery tool that generates revenue now and productizes later.
- Not an invented price, customer, or forecast — every commercial term remains **your
  decision** (see the roadmap's decision gates).
- Not a mandate to build — this is a recommendation for your approval. No infrastructure will
  be expanded until you approve the roadmap in
  [03-90-day-roadmap.md](03-90-day-roadmap.md).
