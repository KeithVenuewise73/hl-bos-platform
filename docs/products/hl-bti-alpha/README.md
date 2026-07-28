# HL-BTI Alpha — Business Transformation application

**Product Creation Order #2** — the first customer-facing Business Transformation application, built on the HL-BTI backend (PCO #1). Presentation + workflow only; every engine is reused, no platform service is duplicated.

**Code:** `apps/hl-bti-alpha` (Next.js static-export SPA) · `packages/bti-engine` (canonical shared engine).
**Run locally:** `pnpm --filter @hl-bos/hl-bti-alpha dev` (port 4100), or serve the static `out/` from `pnpm --filter @hl-bos/hl-bti-alpha build`.

## Screens (deliverables 1–10)

CEO Command Center · Executive Dashboard · Clients · Engagement workspace (Overview · Assessment Wizard · Executive Scorecard · Blueprint Viewer · Proposal Viewer · Implementation · ROI) · Navigation + theme system.

## Docs

- [01 · Reuse Analysis](01-reuse-analysis.md)
- [11 · Architecture Impact Report](11-architecture-impact-report.md)
- [12 · Build Completion Report](12-build-completion-report.md)

## Headlines

- **Reuse-first:** scoring, executive scoring, growth, blueprint and lifecycle all come from `@hl-bos/bti-engine` — the same algorithm as the DB (`bti.compute_scores`) and the edge (`_shared/bti`), asserted to the same fixture (80 / 70 / null / 75).
- **Honest UI:** a permanent "local workspace, not a production database" banner; unrated domains read "Not scored"; pricing is never invented; empty panels say so.
- **Venuewise is analysis-only — in the UI too:** proposal, implementation and ROI are hidden and refused; the stage bar reads "capped at blueprint".
- **Proven:** `next build` (static export) succeeds; a Chromium smoke navigates the app and renders the live scorecard; 60 vitest tests pass; eslint / typecheck / prettier clean.
