# HL-BTI Alpha — Build Completion Report (Deliverable 12)

**Product Creation Order #2** · HL-BTI Alpha — the first customer-facing Business Transformation application · **Date:** 2026-07-28 · **Stack:** local development only.

## What was built

A professional, executive, theme-aware, responsive UI over the existing HL-BTI backend — `apps/hl-bti-alpha` (Next.js static-export SPA) plus the canonical shared engine `@hl-bos/bti-engine`. It reuses every engine; it introduces no platform service.

## Required deliverables — status

| #   | Deliverable                | Where it lives                                                                      |
| --- | -------------------------- | ----------------------------------------------------------------------------------- |
| 1   | CEO Dashboard              | `CommandCenter.tsx` (command center) + `CeoDashboard.tsx` (operating center)        |
| 2   | Client Dashboard           | `Clients.tsx`                                                                       |
| 3   | Engagement Dashboard       | `Engagement.tsx` (Overview + tabbed workspace)                                      |
| 4   | Assessment Wizard          | `AssessmentWizard.tsx` (one section at a time, autosave, progress, evidence, notes) |
| 5   | Executive Scorecard        | `Scorecard.tsx` (7 scores, each with explanation/strengths/gaps/recommendations)    |
| 6   | Executive Blueprint Viewer | `BlueprintViewer.tsx` (17 sections, print/export)                                   |
| 7   | Proposal Viewer            | `ProposalViewer.tsx` (preview, deliverables, pricing summary, signature status)     |
| 8   | Implementation Dashboard   | `Implementation.tsx` (projects/milestones/tasks, completion %)                      |
| 9   | ROI Dashboard              | `RoiDashboard.tsx` (baseline → projected → realized)                                |
| 10  | Navigation System          | `nav.ts` + the shell in `app/page.tsx` (sidebar, tabs, mobile menu, theme)          |
| 11  | Architecture Impact Report | [11-architecture-impact-report.md](11-architecture-impact-report.md)                |
| 12  | Build Completion Report    | this document                                                                       |

## Primary workflow (the guided consulting process)

Dashboard → New Engagement (`Clients`) → Business Discovery / Assessment Wizard → Executive Scorecard → Transformation Blueprint → Proposal → Implementation → ROI. The engagement stage machine advances one governed step at a time.

## Design

Professional, executive, modern, simple, fast. Dashboard-first. Mobile responsive (single-column + slide-in nav under 900px). Light/dark theme with a persisted toggle and no flash-of-wrong-theme. Self-contained (no external fonts, no external assets, no network calls).

## Honesty guarantees (visible in the UI)

- A persistent banner: **"Alpha local workspace — data lives in this browser, not a production database."**
- Unrated domains show "Not scored"; empty dashboards say they are empty; the command center shows "Not started" where there is no assessment.
- Pricing is never invented ("price TBD — pricing is a CEO decision"); revenue pipeline shows "—".
- **Venuewise is a clearly-badged Demonstration and is analysis-only**: the UI hides and refuses proposal, implementation, and ROI, and the stage bar shows "Analysis-only: capped at blueprint" — mirroring the backend cap.

## Reuse (no duplication)

Scoring, executive scoring, growth intelligence, blueprint assembly and the lifecycle all come from `@hl-bos/bti-engine` — the same algorithm as the DB authority `bti.compute_scores` and the edge `_shared/bti`, asserted to the **same fixture** (business 80 / operations 70 / growth null / transformation 75). Identity, auth, permissions, tenancy, billing, the proposal engine, discovery, provisioning and factory governance are the backend's; the Alpha calls them (or, offline, maps 1:1 to their RPC contracts). See [Reuse Analysis](01-reuse-analysis.md).

## Exact results (real runs)

| Check                                         | Result                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next build` (static export)                  | **Compiled + TypeScript-checked + 3 static pages generated**, `out/` ≈ 830 KB                                                                                                                                       |
| Browser smoke (Chromium)                      | App loads and is interactive: navigated CEO Command Center, opened the Venuewise workspace, rendered the Executive Scorecard (Transformation 53; Business Health 72; …), switched light/dark — screenshots captured |
| vitest (whole repo)                           | **60 passed** (HL-BTI Alpha + engine added 15; prior 45 unchanged)                                                                                                                                                  |
| eslint `.`                                    | clean                                                                                                                                                                                                               |
| turbo typecheck                               | clean (control-center, config, bti-engine, hl-bti-alpha)                                                                                                                                                            |
| prettier `--check .`                          | clean                                                                                                                                                                                                               |
| pgTAP / Deno (unchanged)                      | **607 / 104** still green (no backend change)                                                                                                                                                                       |
| check-migrations / no-public-secrets / ts-pin | OK (26 migrations, no public secrets, TS 6.0.3)                                                                                                                                                                     |

## Success criteria (PCO) — met

Keith can sit down with an HSCS client and, entirely within HL-BTI Alpha: open an engagement, perform the six-domain assessment through the guided wizard, generate the seven executive scores, present the Transformation Blueprint, draft a proposal, track implementation, and measure ROI — without additional software. The Venuewise internal pilot demonstrates the analysis-only path end to end.

## What remains (out of scope, honestly stated)

- Wiring the Alpha to a live `bti` backend (applying migration 0026 + swapping the local store for `bti.*` RPC calls) — at which point auth/tenancy/permissions/human-review are enforced by the database.
- Real digital-signature sending, calendar/meeting sync, and pricing — each intentionally left as an honest placeholder rather than a fabricated feature.

**All gates pass on real runs. Stopping here for CEO review; nothing applied to production.**
