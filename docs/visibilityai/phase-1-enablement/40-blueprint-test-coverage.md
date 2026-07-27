# Phase 1 · Deliverable 11 (CP6) — Test Coverage Report

**Date:** 2026-07-27 · **Checkpoint:** 6 · Real runs, real output. Nothing here is "should pass".

## 1. Totals (measured this session)

| Suite                              | Result                   | How run                                                               |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| Database (pgTAP)                   | **380 passed, 0 failed** | embedded PostgreSQL 17.6 + pgTAP 1.3.5 (`apply.cjs` → `runtests.cjs`) |
| Edge functions (Deno)              | **65 passed, 0 failed**  | Node 22 + `tsx` `Deno.test` shim (CI runs real `deno test`)           |
| Repo unit tests (vitest)           | **45 passed**            | `pnpm test`                                                           |
| Lint / Typecheck / Format          | **clean**                | eslint, tsc via turbo, Prettier 3.9.5 `--check .`                     |
| Migration / secret / TS-pin guards | **OK (23 migrations)**   | `scripts/check-*.sh`                                                  |

CP6 added **65** database assertions (`25_blueprint_engine.sql`) and **21** edge assertions (`blueprint_engine.test.ts`), with no regression to the 315 pre-existing database assertions or the 44 pre-existing edge assertions.

## 2. Database — `25_blueprint_engine.sql` (65)

Blueprint creation from a completed assessment; unauthorized request denied; rejection when the assessment is incomplete; version = 1; catalogs seeded (services/modules/phases/rules); service availability + pricing-is-a-reference. Generation: sections (deterministic + AI-with-evidence; **AI section without evidence rejected**); findings (severity, evidence preserved; **AI finding without evidence rejected**). Recommendations: rule-based creation traceable to rule + evidence + priority band; service + module recommendations; **AI rec without evidence rejected**; **inactive service/module excluded**; duplicate consolidation (highest confidence kept, duplicate deferred). Human override + accept + proposal flag. Roadmap: ordering, effort retained, required approvals retained, unknown phase rejected. Impact: illustrative flag + caveats. Lifecycle: generated → **AI cannot self-approve** → awaiting_review → human decides → approved → ready_for_proposal. Versioning: v2 created, prior superseded + pointer + **prior findings preserved**. **Tenant isolation** (tenant_b sees nothing). Events (requested/approved/rec.created/rec.overridden) + worker subscription/handler + blueprint audited.

## 3. Edge — `blueprint_engine.test.ts` (21)

**Rules (6):** evidence-matched rule → traceable recommendation (rule_key/version + evidence id); dimension-threshold rule; empty-array sentinel; non-match suppressed; unavailable service marked excluded; consolidate keeps highest confidence.

**Priority (4):** severity sets base band + factors retained; low confidence lowers / immediate urgency raises; band is one of five categories (no false precision); dependency order sorts first.

**Impact (3):** no financial input ⇒ illustrative + caveats + no promised numeric outcome; with input ⇒ computed low/expected/high; guarantee caveat sanitized.

**Roadmap (2):** critical stabilization precedes dependents (records dependency + effort retained); only supplied phases used.

**Assemble (6):** deterministic blueprint without AI (excluded service absent); valid AI narrative validated + attached (deterministic recs still present); **AI failure ⇒ partial, deterministic plan preserved, secret redacted**; unsupported AI finding dropped; guaranteed-outcome AI output rejected ⇒ partial; untrusted evidence fenced before reaching the model.

## 4. Honesty notes

- The Deno suite ran under the Node/`tsx` shim (Deno egress is proxy-blocked in this sandbox). The test files are identical to CI's; CI (real `deno test`) is the control.
- The AI narrative is proven against a **mock** `analyze` adapter. No live provider was called. The deterministic engine is fully proven; the live-AI path is gated.
- Raw runner output ends with `TOTAL: 380 passed, 0 failed` (DB) and `TOTAL: 21 passed, 0 failed` (blueprint edge file).
