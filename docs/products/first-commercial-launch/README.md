# First Commercial Launch — recommendation for CEO approval

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Author:** Claude (AI engineer)
**Status:** Decision package. **Analysis only — no code written, no infrastructure expanded.**
Per your instruction, nothing proceeds until you approve this roadmap.

## The recommendation, in one line

> **Launch HL-BTI first — as a consultant-operated managed transformation service — then
> VisibilityAI (the funnel), then SalonAI (first vertical pilot).**

## Why HL-BTI

It wins four of your five ranking dimensions and is the only product the platform itself marks
`ready_to_launch`:

- **Its backend is already live in production** — verified today: `bti` schema, 14 tables, 5
  public API RPCs (migrations 0026/0027 are in the 0001–0028 set now applied). The app build
  has real login, Docker/Coolify config, and a domain; 627/627 database tests pass.
- **Fastest to revenue** — it sells as a delivery tool to Herman Legacy's _own_ warm
  consulting clients, with no dependency on live web-crawling or a net-new engine.
- **Highest reuse** — it composes the most already-built HL-BOS modules.
- **Easiest customer acquisition** — the customer is your existing consulting pipeline, not a
  cold self-serve funnel.

The one honest trade-off: near-term revenue is **engagement fees**, not subscription — so on
_recurring_ revenue it scores lower than VisibilityAI. That is why the subscription is the
_second act_, after real engagements exist.

## The ranking (out of 25)

| Rank  | Opportunity                                     | Score  | Role                                                        |
| ----- | ----------------------------------------------- | :----: | ----------------------------------------------------------- |
| **1** | **HL-BTI** (consultant-operated)                | **23** | First launch — bill engagements now                         |
| 2     | VisibilityAI                                    |   19   | The lead-gen funnel (launch #2, after live-egress security) |
| 3     | SalonAI                                         |   17   | First full Factory vertical pilot (Canvas Hair Co.)         |
| 4     | Review Management                               |   16   | Upsell from a live VisibilityAI assessment                  |
| —     | ReceptionAI / TransportationAI / HomeHuddle     | ~9–10  | Need a net-new engine — not yet                             |
| —     | LandscapeAI / FleetHuddle / CoachAI / Venuewise |   —    | Name-only stubs, no code                                    |

Full scoring and rationale: [02-ranking-and-recommendation.md](02-ranking-and-recommendation.md).

## The honest caveat you should hear

HL-BTI's own validation says it is **not a self-serve product "tomorrow"**: today it
_structures a consultant's opinions_ rather than objectively assessing a business, and its best
work isn't yet visible in the app. That is exactly why the recommendation is
**consultant-operated** — with a Herman Legacy consultant as the operator, that limitation is a
non-issue, and revenue starts now. The fix that turns it into a scalable product is **three
small "evidence bridges," not a rebuild** (13 reused / 3 modified / 3 new), scheduled in Phase 2.

## What I need from you (the decisions that unlock the launch)

1. 🔑 **Approve this roadmap** (or tell me what to change).
2. 🔑 **Grant the Anthropic API key** (unlocks live AI analysis).
3. 🔑 **Authorize deploying the HL-BTI app** to production (`bti.hermanlegacygroup.com`).
4. 🔑 **Set the engagement fee model** (your number — I never invent pricing).
5. 🔑 **Billing:** first engagements out-of-band (recommended) or wire Stripe now.

With those, HL-BTI can be live for a real consultant-run engagement inside 30 days.

## 90-day shape

| Phase | Days  | Outcome                                                                                                              |
| ----- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| 1     | 1–30  | HL-BTI deployed to production; a consultant runs a full engagement and produces a client deliverable                 |
| 2     | 31–60 | First paying engagement billed; the three evidence bridges close the known gaps                                      |
| 3     | 61–90 | 2–3 engagements delivered; productized subscription terms decided; VisibilityAI (launch #2) security-hardening begun |

Detail: [03-90-day-roadmap.md](03-90-day-roadmap.md).

## Documents

| #   | Document                                                             | Contents                                                 |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | [01-opportunity-evaluation.md](01-opportunity-evaluation.md)         | Every real opportunity, by grounded maturity (Tiers A–E) |
| 2   | [02-ranking-and-recommendation.md](02-ranking-and-recommendation.md) | Five-dimension scoring + the recommendation rationale    |
| 3   | [03-90-day-roadmap.md](03-90-day-roadmap.md)                         | The HL-BTI 90-day execution roadmap with decision gates  |

## Grounding & honesty

Every product, status, and readiness signal here is taken from the codebase (portfolio
registry, catalog, `compositions.ts`, `MODULE_REGISTRY`) and the Phase V commercial docs, plus
a live production check on 2026-07-31. **No prices, customers, or metrics were invented** —
all commercial terms remain your decision, and where the docs were silent this package says so.
Platform Foundation v1.0 stands complete; **no infrastructure will be expanded until you
approve this roadmap.**
