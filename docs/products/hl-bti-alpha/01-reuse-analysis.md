# HL-BTI Alpha — Reuse Analysis

**Product:** HL-BTI Alpha (the customer-facing Business Transformation application) · **PCO:** #2 · **Scope:** presentation + workflow layer only. Local development.

> The PCO is explicit: _"Do NOT duplicate Identity, Authentication, Permissions, Tenancy, Billing, Proposal Engine, Blueprint Engine, Discovery Engine, Provisioning, Factory Governance, Assessment scoring, Executive scoring. Reuse every existing capability."_ This document proves the Alpha adds a UI and nothing else.

## 1. What the Alpha reuses

| PCO "do NOT duplicate"                                                 | Reused from                                                                                                                           | How the Alpha uses it                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Assessment scoring / Executive scoring**                             | `@hl-bos/bti-engine` (new canonical package) — the same algorithm as the DB authority `bti.compute_scores` and the edge `_shared/bti` | the Alpha calls `computeScorecard`; it never re-derives a score                                                                                                    |
| **Blueprint Engine**                                                   | `@hl-bos/bti-engine` `assembleExecutiveBlueprint` (mirrors `_shared/bti/blueprint.ts`)                                                | the Blueprint Viewer renders the engine's 17 structured sections                                                                                                   |
| **Growth intelligence**                                                | `@hl-bos/bti-engine` `analyzeGrowth`                                                                                                  | the Scorecard + Blueprint show priority/ROI/service recommendations                                                                                                |
| **Engagement lifecycle**                                               | `@hl-bos/bti-engine` `canAdvance` / `nextStage` (mirrors `bti.advance_stage`)                                                         | the stage machine + the Venuewise analysis-only cap                                                                                                                |
| **Identity / Auth / Permissions / Tenancy**                            | HL-BOS `identity`/`platform` (backend)                                                                                                | not reimplemented; the Alpha is a local single-operator tool. When wired to a live project, reads/writes map to the `bti.*` RPCs which already enforce all of this |
| **Proposal / Billing / Provisioning / Discovery / Factory Governance** | HL-BOS `sales`/`billing`/`provisioning`/`discovery`/`hlvs` (backend)                                                                  | the Proposal Viewer maps 1:1 to the `sales` flow; pricing/billing are deliberately not invented                                                                    |

## 2. The one new package — `@hl-bos/bti-engine`

The Alpha needs to compute scores in the browser (offline, no live DB). Rather than re-implement scoring in the UI (which the PCO forbids), the canonical deterministic engine was **extracted into a shared workspace package** — one algorithm, now consumable by every HL-BOS surface. It is asserted against the **same fixture** as the DB and edge layers (business 80 / operations 70 / growth null / transformation 75), so all three cannot drift. This is the established "DB authority + TS mirror" pattern of this repo, made into a proper shared module.

## 3. What is genuinely new (and only this)

- `apps/hl-bti-alpha` — the Next.js static-export SPA: 9 executive screens + a navigation system + a theme system.
- A **local workspace store** (`src/lib/store.ts`) that maps 1:1 to the `bti.*` RPC contracts and persists to `localStorage` (clearly labelled "Alpha local workspace — not the production database").

No identity, auth, permission, tenancy, billing, proposal, blueprint, discovery, provisioning, factory-governance, or scoring **system** was created. The Alpha is presentation + workflow over the existing engine.

## 4. Honesty posture

- Scores come only from ratings actually entered; unrated domains show "Not scored", never a number.
- Pricing is never invented (it is a CEO decision); the proposal shows "price TBD".
- Empty dashboards say they are empty; the CEO command center shows "Not started" for businesses with no assessment.
- Venuewise is a clearly-badged **Demonstration** and is **analysis-only** — the UI refuses to take it to a proposal, implementation, or ROI, mirroring the backend cap.
