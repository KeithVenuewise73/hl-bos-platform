# Phase 1 · Deliverable 15 (CP7) — Test Coverage Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · Real runs, real output. Nothing here is "should pass".

## 1. Totals (measured this session)

| Suite                              | Result                   | How run                                                               |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| Database (pgTAP)                   | **470 passed, 0 failed** | embedded PostgreSQL 17.6 + pgTAP 1.3.5 (`apply.cjs` → `runtests.cjs`) |
| Edge functions (Deno)              | **79 passed, 0 failed**  | Node 22 + `tsx` `Deno.test` shim (CI runs real `deno test`)           |
| Repo unit tests (vitest)           | **45 passed**            | `pnpm test`                                                           |
| Lint / Typecheck / Format          | **clean**                | eslint, tsc via turbo, Prettier 3.9.5 `--check .`                     |
| Migration / secret / TS-pin guards | **OK (24 migrations)**   | `scripts/check-*.sh`                                                  |

CP7 added **90** database assertions (`26_commerce_provisioning.sql`) and **14** edge assertions (`commerce_provisioning.test.ts`), with no regression to the 380 pre-existing database assertions or the 65 pre-existing edge assertions.

## 2. Database — `26_commerce_provisioning.sql` (90)

**Proposal:** creation from an approved blueprint; unauthorized denial; unapproved-blueprint rejection; version 1; blueprint traceability; superseded preservation; structured line items; recommendation + service + module traceability; inactive service/module excluded.
**Pricing:** approved price sellable; provisional/missing price blocks customer-ready; provisional price not approvable; currency + one-time price retained; discount requires approval; no invented price.
**Customer selection:** tied to version; in-progress vs finalized; accept requires finalized selection; superseded cannot be selected.
**Agreements:** version + signer preserved; agreements-complete gate; AI-can't-accept (manage gate); acceptance audited.
**Billing setup:** requires accepted proposal; unaccepted rejected; mock provider ref only; no payment credentials stored; internal approval required; not activated.
**Provisioning:** request from accepted proposal; services/modules mapped; entitlement plan generated + key mapped + not activated; deterministic validate; human-gated approval; ready stops here + inert.
**Work order:** generated; onboarding first; workstreams from items; HL + customer responsibilities retained.
**Readiness:** blocked-unreviewed-legal with structured reasons; ready when satisfied; missing-billing blocks; exception clears + audited; prohibited exceptions rejected; build requires manage.
**Platform:** tenant isolation across proposal/request/authorization; event emission (9 topics); worker subscription + handler; proposal + request audited; exception audited.

## 3. Edge — `commerce_provisioning.test.ts` (14)

**Readiness (7):** complete → ready; missing agreement → blocked with reason; each missing gate → its own reason code; incomplete → not_ready; non-prohibited exception clears; prohibited exception never clears; deterministic (no AI input).
**Executor (2):** ordered plan + no changes (`executed:false`); refuses production target + non-ready request.
**Narrative (5):** valid price-free draft accepted + scoped to selected services; price text rejected; guarantee text rejected; AI failure non-blocking + secret redacted; untrusted finding text fenced.

## 4. Honesty notes

- The Deno suite ran under the Node/`tsx` shim (Deno egress is proxy-blocked in this sandbox); the files are identical to CI's, which is the control.
- The AI narrative is proven against a **mock** `analyze` adapter; no live provider was called. The readiness engine and mock executor are fully deterministic.
- Raw runner output ends with `TOTAL: 470 passed, 0 failed` (DB) and `TOTAL: 14 passed, 0 failed` (CP7 edge file).
