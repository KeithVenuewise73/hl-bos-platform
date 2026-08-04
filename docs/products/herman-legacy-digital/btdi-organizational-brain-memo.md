# Design Memo — Preparing BTDI for the HLD Organizational Brain

**Status:** Approved as **engineering direction** (CEO, 2026-08-04).
**Disposition:** Recommendations are **DEFERRED to a future BTDI V1.1 initiative.**
They are **NOT** included in PR #28 and **NOT** implemented. PR #28's single
mission — build the Business Transformation Digital Intake — is complete and its
scope will not be expanded.

**This is not authorization** to build the Intelligence Center, a CRM,
dashboards, or any new software. It is a captured design principle so that
today's V1 does not foreclose tomorrow's organizational learning.

---

## The one principle to protect

Today's intake stores what the **client tells us**. A future increment may store
what **HLD learns** from each completed engagement. The single rule that keeps
that future open: **keep the two ownership domains separable, and — when the time
comes — capture at intake only the things that cannot be added back later.**

Almost everything in the "Intelligence Record" (root causes, lessons, patterns,
technologies) is produced _after_ an engagement and can be added in a later,
separately-approved increment. Only a few items must be decided at intake,
because they are impossible or corrupting to backfill.

## The two outputs (design principle, approved)

Every completed Business Transformation engagement should ultimately produce two
separate outputs:

- **Output 1 — Client Deliverables** (client-owned): Business Transformation
  Analysis, Executive Summary, Marketing Strategy, 30-Day Execution Plan, 90-Day
  Roadmap.
- **Output 2 — HLD Intelligence Record** (HLD-owned): industry, business stage,
  primary challenge, root causes, successful recommendations, marketing and
  operational lessons, technologies recommended, partnerships, campaign
  observations, opportunities, reusable patterns, consultant notes, future
  software opportunities.

The client receives Output 1. Herman Legacy Digital retains Output 2.

## What V1 (PR #28) already gets right — no change needed

- **A stable engagement key.** The submission `id` is a permanent anchor a
  future intelligence record can link to. Do not reuse or overwrite it.
- **Grouped JSONB + denormalized columns** — structured, queryable raw material.
- **A workflow `status` and `internal_notes`** — the seed of an internal record.

## Recommended additive captures — for BTDI V1.1 (NOT now)

| #   | Recommendation                                                                                                                                                    | Why it must be captured _at intake_ (not backfillable)                                                                                                    | Where it belongs                                    | Owner                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------- |
| 1   | **Learning-retention consent** — one optional, plainly-worded checkbox: _"HLD may retain de-identified insights from my engagement to improve its methodology."_  | **Cannot be backfilled.** Consent can never be obtained retroactively from past clients; without it, accumulated learnings may be unusable.               | New consent field + `consent_*` column              | **Internal Intelligence** |
| 2   | **Normalized industry key** stored alongside the free-text `industry` (a controlled slug, e.g. `logistics`).                                                      | Free text fragments instantly ("Logistics"/"freight"). Cross-engagement learning needs one clean dimension; reconciling hundreds of rows later is costly. | Additive `industry_key` column; a select maps to it | **Both**                  |
| 3   | **Primary-challenge category** — a coarse enum derived from the client's challenge answers (`visibility`, `operations`, `time`, `sales`, `technology`).           | The highest-value learning axis is "what problem → what worked." A stable category from day one enables later aggregation by challenge type.              | Additive `primary_challenge_category` column        | **Internal Intelligence** |
| 4   | **Reserved Output-2 boundary** — a single HLD-owned location, separable from PII, that a future increment will populate. Declare the _shape_ only; build nothing. | Prevents the future Brain from being wedged into the client-facing table and keeps de-identified rollups possible without touching contact PII.           | Reserved namespace/table keyed by submission `id`   | **Internal Intelligence** |
| 5   | **Status-transition timestamps** — a small history of status changes, not just latest `updated_at`.                                                               | Enables future funnel/velocity learning with zero extra client burden.                                                                                    | Additive `status_history` JSONB on the existing row | **Internal Intelligence** |

## Explicitly out of scope (now and for V1.1 unless separately approved)

- No outcome-capture UI, no root-cause / lessons entry screens.
- No dashboards, no Intelligence Center, no CRM, no cross-client analytics.
- No new PII. Items 1–5 add **categorical/consent metadata only**.
- Never merge Output-2 intelligence into the client's own answer JSONB — that
  blurs the ownership line the whole design depends on.

## Recommendation for the V1.1 increment (when authorized)

When a future BTDI V1.1 initiative is opened as its own bounded increment
(one mission → one branch → one PR → one approval), fold **items 1–3** into the
intake at the same time storage is first provisioned — they are trivial additive
columns plus one consent checkbox and two selects. Treat **items 4–5** as
documented reservations to be built later. This keeps each increment bounded
while guaranteeing the first real engagement carries the consent and clean
dimensions the Organizational Brain will need.

**Until then, nothing here is implemented.** The next Herman Legacy Digital
Operations engagement is the **Venuewise Business Transformation Analysis**.
