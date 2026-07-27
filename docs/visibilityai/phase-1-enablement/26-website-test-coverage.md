# Phase 1 · Deliverable 8 (CP5) — Test Coverage Report

**Date:** 2026-07-27 · **Checkpoint:** 5 · Real runs, real output. Nothing here is "should pass".

## 1. Totals (measured this session)

| Suite                         | Result                   | How run                                                               |
| ----------------------------- | ------------------------ | --------------------------------------------------------------------- |
| Database (pgTAP)              | **315 passed, 0 failed** | embedded PostgreSQL 17.6 + pgTAP 1.3.5 (`apply.cjs` → `runtests.cjs`) |
| Edge functions (Deno)         | **44 passed, 0 failed**  | Node 22 + `tsx` `Deno.test` shim (CI runs real `deno test`)           |
| Repo unit tests (vitest)      | **45 passed**            | `pnpm test`                                                           |
| Lint (eslint)                 | **clean**                | `pnpm lint`                                                           |
| Typecheck (tsc via turbo)     | **clean**                | `pnpm typecheck`                                                      |
| Format (prettier `--check .`) | **clean**                | pinned Prettier 3.9.5                                                 |
| Migration guard               | **OK (22 migrations)**   | `scripts/check-migrations.sh`                                         |
| Secret guard                  | **OK**                   | `scripts/check-no-public-secrets.sh`                                  |
| TypeScript pin                | **OK (6.0.3)**           | `scripts/check-typescript-pin.sh`                                     |

CP5 added **40** database assertions (`23_events_handlers.sql` = 13, `24_website_scan.sql` = 27) and **30** edge assertions (`discovery_website.test.ts`), with no regression to the 275 pre-existing database assertions or the 14 pre-existing edge assertions.

## 2. Database — new files

**`23_events_handlers.sql` (13)** — shared dispatcher: register handler; emit → dispatch → delivery exists; claim one; second claim returns zero (idempotent); correlation id present; complete-success → `delivered`; failure → `failed` + rescheduled `next_attempt_at`; exhausted → `dead`; dead-letter audited.

**`24_website_scan.sql` (27)** — collector active; request scan; idempotent in-flight reuse; exactly one collection; progress update; record finding → **canonical** `discovery.evidence`; findings counter; scoring contribution → `profile_scores`; complete `partially_completed`; collection → `collected`; re-run creates a new scan and preserves prior evidence; cancel; **viewer cannot request** (permission denial); **tenant isolation**; requested/completed events emitted; every write audited.

## 3. Edge — `discovery_website.test.ts` (30)

**Security (11):** public URL accepted; private/loopback/link-local/metadata/CGNAT IPs rejected; non-HTTP schemes rejected; embedded credentials rejected; dangerous ports rejected; internal hostnames rejected; DNS rebinding rejected (single + mixed poisoned answer + empty answer); redirect-to-private rejected; over-limit redirect chain rejected; over-size response rejected; non-HTML content-type rejected.

**Extraction (7):** metadata/headings/identity; accessibility (images-missing-alt, missing `lang`); conversion + communication signals; brand/social; analytics/OpenGraph/structured-data; security headers; mixed-content flagged on https only.

**Scoring (4):** rubric version stamped + every dimension carries evidence keys and a bounded score/confidence; healthy > poor on the same dimension; every derived finding carries category/severity/deterministic detection (and missing-https is `critical`); canonical surfaced as search evidence.

**Prompt injection (3):** untrusted content fenced and absent from system instructions; embedded fence markers cannot break out (exactly one open/close pair); a real page with an embedded attack stays fenced through a full scan.

**Orchestrator (5):** happy path → deterministic findings + scored dimensions; URL normalization (tracking params stripped, host lowercased, fragment dropped); AI structured output validated and returned; **AI failure → `partially_completed` while deterministic findings/scores survive**; fetch error fails cleanly and is redacted.

## 4. Honesty notes

- The Deno suite ran under the Node/`tsx` shim in this sandbox (Deno's network egress is blocked by the proxy here). The test **files are identical** to what CI executes with real `deno test`; the shim only provides `Deno.test`, and Node 22 supplies native `fetch`/`Response`/`Headers`. This divergence is stated, not hidden — CI is the control.
- The scan core is proven **offline** with injected `resolve`/`fetchPage`. The connect-time IP pin in the future production `fetchPage` adapter is **not** covered by these tests (there is no such adapter yet) and is called out in the [Known Limitations Report](27-known-limitations.md).
- Raw runner output for the database suite ends with `TOTAL: 315 passed, 0 failed`; the edge suite prints `TOTAL: 30 passed, 0 failed` for the new file and `8` / `6` for the pre-existing files.
