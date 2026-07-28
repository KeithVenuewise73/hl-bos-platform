# HL-BTI Alpha — Architecture Impact Report (Deliverable 11)

## 1. Net additions

- **One new app:** `apps/hl-bti-alpha` — a Next.js 16 **static-export** SPA (client-only, no server tier). 9 executive screens, a navigation system, a theme system, and a local workspace store.
- **One new shared package:** `@hl-bos/bti-engine` (`packages/bti-engine`) — the canonical deterministic engine (scoring, lifecycle, growth, blueprint, catalog), extracted so the UI, the DB authority (`bti.*`), and the edge layer (`_shared/bti`) share one algorithm.
- **Tests:** `packages/bti-engine/src/engine.test.ts` (10) + `apps/hl-bti-alpha/src/lib/store.test.ts` (5) — 15 new vitest tests.

## 2. Net platform-service additions: ZERO

No identity, authentication, permission, tenancy, billing, proposal, blueprint, discovery, provisioning, factory-governance, or scoring **system** was created. The Alpha is presentation + workflow; every engine is reused. (See [Reuse Analysis](01-reuse-analysis.md).)

## 3. Impact on existing objects

- **No database migration, no change to any `bti.*` object**, no change to the edge `_shared/bti` files, no change to `apps/control-center`.
- The workspace catalog (`pnpm-workspace.yaml`) gains two members via the existing `apps/*` and `packages/*` globs — no catalog version changes; the Alpha uses the already-pinned `next`, `react`, `react-dom`.
- The prior test suites are untouched: **607 pgTAP + 104 Deno** remain green; vitest grows from 45 to **60** (this app + engine add 15).

## 4. Relationship to the backend

The Alpha is a faithful client of the HL-BTI backend contract. Every store operation maps 1:1 to a `bti.*` RPC:

| Alpha store op                               | `bti.*` RPC                                                    |
| -------------------------------------------- | -------------------------------------------------------------- |
| `openEngagement`                             | `bti.open_engagement`                                          |
| `advanceEngagement`                          | `bti.advance_stage`                                            |
| `setRating`                                  | `bti.rate_dimension`                                           |
| `scorecardFor`                               | `bti.compute_scores` (via the shared engine)                   |
| `completeAssessment`                         | `bti.submit_assessment_for_review` + `bti.complete_assessment` |
| `createProject` / `addMilestone` / `addTask` | `bti.create_project` / `add_milestone` / `add_task`            |
| `recordRoi` / `realizeRoi`                   | `bti.record_roi_metric` / `bti.realize_roi_metric`             |
| CEO command center                           | `bti.ceo_dashboard`                                            |

When migration 0026 is applied to a project and the Alpha is pointed at it, the local store is replaced by these RPC calls with no UI change — the analysis-only cap, permission checks and human-review gate then come from the database, which is the authority.

## 5. Deployment posture

`output: "export"` → the Alpha is a static bundle (`out/`, ~830 KB). It has no server, shells out to nothing, and persists only to the operator's `localStorage`. Deploying it exposes static files only. It is safe to run locally as a single-operator tool today; a multi-user deployment waits on wiring it to the live `bti` backend (which brings the real auth/tenancy/permission enforcement).

## 6. Standing constraints honored

`main` protected (branch + PR); TypeScript pinned 6.0.3 (the Alpha uses `catalog:`); no secret exposed; no legacy asset touched; no migration applied. The Alpha reuses `@hl-bos/bti-engine`; it introduces no duplicate platform service.
