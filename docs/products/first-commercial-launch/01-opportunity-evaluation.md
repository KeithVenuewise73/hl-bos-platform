# First Commercial Launch · Opportunity evaluation (grounded)

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Author:** Claude (AI engineer)
**This is analysis only. No code was written and no infrastructure was expanded.**

Every opportunity below is drawn from what is **literally in the codebase and docs** — the
portfolio registry (`apps/control-center/src/lib/registry.ts`, whose rule is "a product
moves off `not-started` only when it has code"), the catalog, `compositions.ts`,
`MODULE_REGISTRY`, and the Phase V CEO Commercial Decision Package. Nothing here is invented.

## Two facts that frame everything

1. **The platform is built; almost nothing is _deployed_.** Platform ~92%, Factory ~70%,
   **commercial readiness 0% — by design** (pricing/licensing/ownership are held as
   `PENDING CEO DECISION` for every product; the code refuses to invent them). The universal
   blocker is **ignition + decisions, not construction**: grant the Anthropic key, authorize
   deploy, set commercial terms.
2. **Two product backends are already on canonical production** (verified 2026-07-31 against
   `mvvtngiopdrgiedjmhfb`, now at migrations 0001–0028): **HL-BTI** — `bti` schema, **14
   tables, 5 public API RPCs**; and **VisibilityAI** — `visibility` schema, **8 tables**.
   This supersedes older docs (e.g. IAT-001) that described production stopping at 0017 with
   `bti` absent. The HL-BTI database and API are live in production **today**.

## The opportunities, by real maturity

### Tier A — real, tested product code

| Opportunity                                       | What it is                                                                                                                   | Maturity (grounded)                                                                                                                                                                                                                                                                                                                                                                 | Backend on prod?               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **HL-BTI** (Business Transformation Intelligence) | Consultant tool: assess a business → blueprint → proposal → ROI; maps findings to Herman Legacy products                     | The **only** product the code marks `commercialAvailability: "ready_to_launch"`. `bti` schema (0026) + public API (0027) + `@hl-bos/bti-engine` + a deployment build (`apps/hl-bti`) with real Supabase Auth, Docker/Coolify config and domain `bti.hermanlegacygroup.com`; **627/627 DB tests**; production rehearsal PRO-001 **11/12, zero product defects** (on a preview stack) | ✅ **Yes** (14 tables, 5 RPCs) |
| **VisibilityAI**                                  | Discovery → website assessment → Business Growth Score → recommendations; the top-of-funnel lead-gen for every other product | Deep engine built locally (up to 470 pgTAP + 79 Deno), but **mock-only**: no live DNS/HTTP egress, scan worker inert, AI/PageSpeed mocked, and an **SSRF/live-egress security control is not implemented** ("the collector must not be pointed at real targets"). No customer UI. `needs_assembly`. **Absent from the CEO portfolio registry.**                                     | ✅ Yes (8 tables)              |

### Tier B — foundation built, product not yet assembled

| Opportunity             | What it is                                                                                        | Maturity                                                                                                                                           | Net-new work                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SalonAI**             | Vertical operating system for salons (booking, reviews, growth). **Named pilot: Canvas Hair Co.** | `not-started` in the portfolio; `needs_assembly` in compositions. **100% of required _modules_ built** but the salon product itself is not written | Salon domain, booking/calendar, customer/admin/staff app surfaces, public site (a "composition exercise, not a platform build"). Stripe adapter stubbed; runtime undeployed |
| **Review Management**   | Collect/monitor/respond to reviews                                                                | ~30%, built on `visibility.reviews`; `needs_assembly`                                                                                              | UI + config; natural upsell from a VisibilityAI assessment ("quick vertical win after SalonAI")                                                                             |
| **Reputation Recovery** | Ethical reputation recovery workflows                                                             | ~25%, on `visibility.reviews` + comms; `needs_assembly`                                                                                            | UI; "bundle with Review Management"                                                                                                                                         |

### Tier C — need a net-new domain engine (`not_yet`)

- **ReceptionAI** (~15%) — needs a net-new AI-receptionist engine + telephony.
- **TransportationAI** (~15%) — needs a net-new route-assessment engine.
- **HomeHuddle** (~15–20%) — blocked on a "Venuewise convergence decision."

### Tier D — internal engines / enablers (not standalone SKUs)

- **Government-Contracts Intelligence** (`@hl-bos/transformation-intelligence`) — win-probability, capability-gap, pursue/partner/decline, gated on a CEO spend approval. Built & validated on **labelled sample only**, in-memory, not priced. Decision-support, not a sold product (today).
- **HL-BTI Consulting Intelligence Framework** — the methodology-as-software brain reused across engagements; a component, not a standalone SKU. Its case studies (HSCS 49, Venuewise 47) are explicitly **illustrative demos**, not real assessments.

### Tier E — name-only or out of scope

- **Name-only stubs** (no code, no composition, no modules): **LandscapeAI, FleetHuddle, CoachAI, Venuewise**.
- **Legacy, unreachable, out of scope**: HLVS Venture Studio, HSCS Government Logistics, AI Asset Recovery (live in the legacy Supabase project; not managed from here; one has an open security finding).
- **Deferred frontier** (greenfield, separately funded): Video/broadcast AI.

## The honest caveat on the frontrunner

HL-BTI is the most complete opportunity, **but its own Executive Validation is candid**: as a
self-serve _product_, it is "not a product tomorrow." Four structural gaps — nothing was
deployed/persistent (now partly resolved: the backend is on production); the best consulting
work is invisible in the app; it **structures a consultant's opinions** (43 manual 0–5
ratings) rather than objectively assessing a business; and it produces no client deliverable.
Crucially, the fix is **not a rebuild** — the evidence-architecture plan is "three small
bridges and some wiring" (13 reused / 3 modified / 3 new). This shapes the recommendation:
launch HL-BTI **consultant-operated**, where the consultant is the evidence source, not as an
unattended SaaS. See [02-ranking-and-recommendation.md](02-ranking-and-recommendation.md).

## Reuse dividend (why any of these is fast)

A shared **COMMON_SPINE** of 9 built modules (identity, tenancy, audit, events, entitlements,
workflows, billing-core, storage, communications) underpins all eight composed products, plus
19 registered `MODULE_REGISTRY` modules (all `live` or `built_undeployed`). Foundation
readiness is therefore **not** the differentiator between candidates — deployment and
commercial terms are. That is what makes a _first_ launch a matter of ignition, not months of
construction.
