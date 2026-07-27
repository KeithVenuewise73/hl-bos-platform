# Phase 1 · Deliverable 9 (CP5) — Known Limitations Report

**Date:** 2026-07-27 · **Checkpoint:** 5 · What the collector does not yet do, stated before anyone asks.

An empty panel that explains itself beats a green one that lies. This is the honest boundary of Checkpoint 5.

## 1. Hard gates (nothing live)

| Limitation                               | Consequence                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No real DNS/HTTP egress adapter          | The collector cannot crawl a real site. `runScan` is proven only with injected `resolve`/`fetchPage`.                                                                                                        |
| **Connect-time IP pin not implemented**  | The rebinding defense is proven at the DNS layer only. A production `fetchPage` must pin or re-validate the socket peer; until it exists and is reviewed, the collector must not be pointed at real targets. |
| Worker edge function inert, not deployed | Queued scan events are not processed. `discovery-website-worker` claims deliveries but wires no egress.                                                                                                      |
| No scheduler                             | No `pg_cron`/`pg_net`; nothing runs automatically.                                                                                                                                                           |
| AI is mock-only                          | No live interpretation. Structured-output validation and failure-degradation are proven against the mock.                                                                                                    |
| PageSpeed is a mock interface            | No real performance metrics; the performance dimension is a placeholder adapter.                                                                                                                             |

## 2. Scope limitations (by design for Module 1)

- **Single page.** The technical assessment fetches one page (the normalized target). Multi-page crawling, sitemap expansion, and per-section deep dives are deferred.
- **Regex extraction, not a DOM.** `extract.ts` is pure and dependency-free (runs in any runtime). It is robust for the signals it captures but does not execute JavaScript, so client-rendered content and SPA routes are invisible to it. This is an explicit trade for zero dependencies and determinism.
- **Performance is not measured.** No Core Web Vitals, no Lighthouse — that arrives with the gated PageSpeed provider.
- **No screenshots / visual analysis.** Storage integration for artifacts exists (`storage_meta.files`) but no image capture is wired.

## 3. Rubric maturity

`rubric-0.1.0` covers seven Digital-Maturity dimensions with deterministic contributions. It is a first, conservative version: confidence is fixed at 0.9 for rubric contributions, and the Business-Health framework is not yet fed by website evidence (only Digital-Maturity is). Rubric versions are stamped on every scan row and every evidence note, so re-scoring under a later rubric is traceable.

## 4. Test-environment divergence

The Deno suite ran under the Node/`tsx` shim because Deno's network egress is blocked by the sandbox proxy. The test files are identical to CI's; CI (real `deno test`, real Supabase stack) is the control for any shim drift. The database session runs as a superuser locally, unlike production's `authenticator` role — the suite compensates by asserting the grant graph and RLS policies directly (see `scripts/local-test/README.md`).

## 5. What is NOT a limitation

The database contract is complete and fully tested: lifecycle, idempotency, canonical evidence, data-driven scoring, tenant isolation, permission gating, events, audit, dead-lettering. The deterministic scan core (validation, extraction, scoring, injection fencing, orchestration) is complete and tested offline. The gap is purely the **live egress + activation** layer, which is intentionally gated.
