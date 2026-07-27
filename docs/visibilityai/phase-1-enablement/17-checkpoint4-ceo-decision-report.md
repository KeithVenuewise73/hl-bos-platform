# Phase 1 · Deliverable 10 (CP4) — CEO Decision Report

**Date:** 2026-07-27 · **Checkpoint:** 4

Decisions surfaced by building the Business Discovery Engine. None blocks continued local development; several shape the product and must be settled before go-live.

### D-CP4-1 — Converge `visibility.assessments` into the Discovery Engine?

**Context:** the existing VisibilityAI assessment (migration 0017: prospect + 16 website categories → Business Growth Score) overlaps with the new, general `discovery.assessments` (any business, two frameworks). This checkpoint is additive; both exist.
**Options:** (a) **Keep both now; converge in a later checkpoint** — the Website Assessment collector (CP5) records website findings as discovery evidence, and the 16 categories map into maturity dimensions; then retire `visibility.assessments` once parity is proven _(recommended)_; (b) converge now (touches a live vertical prematurely); (c) keep both permanently (duplication).
**Recommendation:** (a). **Consequence of delay:** two assessment representations coexist a while longer (documented, not silent). **Before dev:** no.

### D-CP4-2 — Confirm the scoring frameworks and weights

**Context:** 12 Digital-Maturity + 8 Business-Health dimensions are seeded with default weights (rows, tunable). These weights drive the scores customers will see.
**Options:** (a) accept defaults for now, tune with real assessments _(recommended)_; (b) CEO/product sets weights before first use.
**Recommendation:** (a) — weights are data; adjust from evidence. **Before dev:** no.

### D-CP4-3 — Authorize the Website Assessment collector (Checkpoint 5)

**Context:** the `website_assessment` collector is registered but **inactive**; scanning logic is deferred to CP5. Building it will require the SSRF/abuse controls designed in Phase 0 (Deliverable 9, V-1) and, to run on a schedule, the shared dispatcher handler-invocation extension + `pg_cron`/`pg_net`.
**Options:** (a) **proceed to CP5 to implement the collector, local-only** _(recommended)_; (b) prioritize another collector (interview UI, document analysis) first.
**Recommendation:** (a). **Before dev:** this is the CP5 go-ahead itself.

### D-CP4-4 — Standing provider/infrastructure authorizations (carried forward, still open)

No change this checkpoint; repeated so they aren't lost:

| #   | Action                                                                                     | Unlocks                        |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| 1   | Store `anthropic_api_key` in Vault (D-5)                                                   | Real AI evidence/analysis      |
| 2   | Choose email provider; authorize Twilio + `twilio_auth_token`                              | Assessment/proposal delivery   |
| 3   | Arm the `production` GitHub Environment + `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` | Applying 0018–0020; any deploy |
| 4   | Authorize `pg_cron`/`pg_net` (D-8)                                                         | Scheduled collection/dispatch  |
| 5   | Reconcile canonical project / retire empty project (D-1)                                   | Operating on the right DB      |

None performed this checkpoint.

### D-CP4-5 — Herman Legacy service catalog + HL-BOS module keys for recommendations

**Context:** `discovery.recommendations` can name a `recommended_service` (a Herman Legacy service) and a `recommended_module` (an HL-BOS module key). To generate real recommendations later, the set of sellable services and module keys must be defined (they tie into `billing.products`/`plans` and `entitlements`).
**Options:** (a) define the service/module catalog before blueprint generation (a later checkpoint) _(recommended)_; (b) free-text recommendations initially.
**Recommendation:** (a) — reuse `billing`/`entitlements` catalogs as the source of truth. **Before dev:** no (needed before blueprint/proposal generation).
