# HL-BTI — Build Completion Report (Deliverable 13)

**Product Creation Order #1** · Herman Legacy Business Transformation Intelligence Platform · **Date:** 2026-07-27 · **Stack:** local development only. First flagship product built by the HL-BOS Software Factory.

## What was built

The `bti` schema — an AI-powered Business Transformation Operating System delivered as **another reusable platform inside HL-BOS**:

- **Portfolio registry** (`bti.businesses`) + a **cross-business CEO dashboard** (`bti.ceo_dashboard`).
- **13-stage engagement lifecycle** with a deterministic stage machine and the Venuewise **analysis-only cap**.
- **Executive intelligence framework** — 6 domains, 44 dimensions, 10 industry packs (extensible by row).
- **Deterministic 7-score engine** (`bti.compute_scores` + `_shared/bti/scoring.ts`), honest nulls.
- **Executive Blueprint assembly** (17 mandated sections, honest empties) + **Growth Intelligence engine** (priority + ROI + Herman Legacy service).
- **Consulting delivery** (projects/milestones/tasks) + **ROI tracking** (baseline→projected→realized).
- Reused, unchanged: identity, auth, tenancy, permissions, audit, events+dispatcher, workflows, discovery, sales/proposals, provisioning, billing, comms, AI gateway, storage.

## Migrations authored

- `20260727090300_hlbos_0026_bti_platform.sql` — the `bti` schema: 13 tables, 7 enums, ~20 RPCs, RLS+FORCE on every table, 12 `bti.*` permissions, seeds (6 domains, 44 dimensions, 10 industry packs). **No existing object altered.** Not applied to any live project.

## What existing architecture was reused

Every "do NOT duplicate" item in the PCO — identity, authentication, tenancy, permissions, audit, billing, proposal engine, factory governance, communications — plus events, workflows, discovery, provisioning, AI, storage. **Net new platform services: zero.** (See [Reuse Analysis](12-reuse-analysis.md) and [Architecture Impact](11-architecture-impact-report.md).)

## What is deterministic vs. AI

Deterministic (DB authority + TS mirror, same numbers or it's a bug): the 7 executive scores, the stage machine, the analysis-only cap, growth intelligence, blueprint assembly, ROI math, dashboard aggregation. AI: advisory narrative only — approves, authorizes, scores, and advances nothing.

## Honesty guarantees (proven by tests)

- Domains with no ratings score `null`, never a fabricated number.
- Blueprint sections with no data are emitted empty-with-a-reason; `complete` is false.
- Growth strengths are not padded into recommendations; unrated dimensions are reported, not scored.
- The CEO dashboard shows real state or null — no invented health bars.
- Venuewise (`analysis_only`) cannot reach proposal, delivery, or ROI — enforced in code.

## Exact test totals (real runs)

| Suite                                         | Result                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| pgTAP database suite                          | **607 passed, 0 failed** (HL-BTI added 47 in `28_bti_platform.sql`)  |
| Deno edge suite                               | **104 passed, 0 failed** (HL-BTI added 11 in `bti_platform.test.ts`) |
| vitest                                        | **45 passed**                                                        |
| prettier `--check .`                          | clean                                                                |
| eslint `.`                                    | clean                                                                |
| turbo typecheck                               | clean                                                                |
| check-migrations / no-public-secrets / ts-pin | OK (26 migrations, no public secrets, TS 6.0.3)                      |

> The Deno suite ran under the Node/`tsx` `Deno.test` shim (Deno egress is proxy-blocked in this sandbox); the test files are identical to CI's, which runs real `deno test` and is the control for any shim drift. The database session runs as a local superuser rather than production's `authenticator`; the suite compensates by asserting the grant graph + RLS directly.

## Success criteria (PCO) — status

| Criterion                                               | Status                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Assess a real business (6 domains → 7 scores)           | **Built + tested** (deterministic engine, human-review gate)                         |
| Generate an Executive Business Transformation Blueprint | **Built + tested** (17 sections, honest empties)                                     |
| Produce a professional proposal                         | **Integrated** (reused `sales` flow, linked via `engagements.proposal_id`)           |
| Win consulting engagements                              | **Lifecycle supports it** (customer_approval stage)                                  |
| Manage implementations                                  | **Built + tested** (projects/milestones/tasks)                                       |
| Track customer ROI                                      | **Built + tested** (`roi_metrics`, baseline→realized)                                |
| Recommend Herman Legacy software + services             | **Built** (growth engine + reused `discovery.recommendations`)                       |
| Generate recurring consulting revenue                   | **Lifecycle supports it** (monthly_partnership stage; billing reused, not activated) |

The data foundation and engines for all eight criteria exist and are tested. A customer-facing UI (portal/executive/ROI dashboards) binds to these tested read models and is the next front-end deliverable; per the honesty rule it is not claimed as done until built and shown.

## What requires CEO decisions / production approval

Applying migration 0026 (with 0021–0025) to the canonical project; activating billing for monthly partnerships; any Claude API integration for the advisory narrative; and building/deploying the customer-facing UI. All deliberately out of scope for this build.

## Completion standard — met

HL-BTI can register a business, open a governed engagement, assess it across six intelligence domains into seven deterministic executive scores behind a human-review gate, assemble an Executive Business Transformation Blueprint, integrate a proposal, manage implementation delivery, and track ROI — reusing the entire HL-BOS spine and introducing no duplicate platform service, with Venuewise held to analysis-only in code. **All quality gates pass on real runs. Stopping here for CEO review; nothing applied to production.**
