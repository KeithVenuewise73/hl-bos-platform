# Deliverables 7, 8, 9 — Implementation Plan, Critical Path, Required Code Changes

**Planning only. No code is written by this order.** Each phase is a separately-approved, controlled execution. Sequencing folds in the validation's V1.0 prerequisites (deploy + wire) so the two efforts converge.

## Deliverable 7 — Phased implementation plan

### Phase 0 — Foundation (prerequisite, from the Executive Validation)

- Apply migrations 0021–0026 to a real project (CEO-gated).
- Wire HL-BTI Alpha to the live backend (replace the local store with `bti.*` RPCs — the store already maps 1:1).
- **Outcome:** a deployed, persistent platform to build the evidence layer on.

### Phase 1 — Evidence → rating bridges (the core correction)

- Migration: `bti.dimension_evidence_map` (catalog) + evidence columns on `bti.dimension_ratings` (`source`, `confidence`, `evidence_ids`, `proposed_rating`).
- `@hl-bos/bti-engine`: the deterministic **rating-proposal engine** (`proposeRating`) + evidence-aggregation + tests (DB-authority + edge-mirror pattern, same fixture discipline).
- Map the **already-built website scanner** output → growth/technology dimensions (first real evidence source).
- **Outcome:** for a business with a scanned website, HL-BTI _proposes_ ratings with confidence + supporting facts + gaps — no manual entry required for those dimensions.

### Phase 2 — Consultant validation workflow + surface consulting

- BTI assessment gains a **propose → validate → approve** state (reuses `workflows.request_approval` / `decide`).
- HL-BTI Alpha: new **Evidence**, **Findings (FACT/INFERENCE/OPINION)**, **Roadmap**, **Narrative**, **CEO Review** views — rendering the **existing** `consulting` engine output; the assessment wizard becomes "confirm/correct proposals," not "enter numbers."
- **Outcome:** the consultant reviews; the consulting brain is the primary experience. This is the single highest-value phase.

### Phase 3 — Asset-based assessment

- Migration: `bti.asset_types` (catalog) + `bti.assets` + `bti.asset_assessments` + `asset_assessment_id` on ratings.
- Aggregation rule (reuses `computeScorecard`); Alpha asset UI (business → assets → per-asset assessment).
- **Outcome:** evidence and scores are per-asset and aggregated — scores differentiate businesses instead of converging.

### Phase 4 — Additional collectors (incremental, not critical path)

- App/Technology, Social/Reviews (bridge `visibility`), Document-analysis (financial/ops uploads via `storage_meta`), Internal-observation. Each a **collector row** against the existing contract + a map extension.
- **Outcome:** progressively less manual, more evidence-driven.

### Phase 5 — Commercial polish (from the validation)

- Branded export/PDF (from the consulting renderer), onboarding, client management, analytics.

## Deliverable 8 — Critical path

```
Phase 0 (deploy + wire Alpha)
   └─► Phase 1 (evidence→dimension map + rating-proposal engine + website mapping)
          └─► Phase 2 (validate workflow + surface consulting in Alpha)   ◀── first evidence-driven engagement possible here
                 └─► Phase 3 (asset model)
                        └─► Phase 4/5 (more collectors, commercial polish)
```

**The gating dependencies:** nothing evidence-driven works until Phase 0 deploys the backend; proposals need Phase 1's map + engine; the consultant-as-reviewer experience needs Phase 2. **Phases 0→1→2 are the minimum to satisfy the corrected vision for a first engagement** (website evidence + proposed findings + consultant validation + consulting output). Phase 3 makes it robust; Phase 4/5 make it broad and sellable.

## Deliverable 9 — Required code changes (specific, for controlled execution)

**New migrations (CEO-gated, applied only on approval):**

- `00xx_bti_evidence_link.sql` — `bti.dimension_evidence_map`; add `source`/`confidence`/`evidence_ids`/`proposed_rating` to `bti.dimension_ratings`; seed initial website→dimension mappings.
- `00xx_bti_assets.sql` — `bti.asset_types`, `bti.assets`, `bti.asset_assessments`; add `asset_assessment_id` to `bti.dimension_ratings`; RLS+FORCE + permissions, mirroring existing `bti` conventions.

**`@hl-bos/bti-engine` (new modules, tested):**

- `evidence/propose.ts` — `proposeRating(dimension, evidenceRows, map)` (deterministic, honest nulls).
- `evidence/map.ts` — the evidence→dimension mapping types + defaults (mirrors the DB catalog).
- Tests asserting: no evidence → null proposal; confidence from coverage; DB/engine parity.

**Edge (reuse patterns):**

- `bti-consulting-worker` (or extend an existing worker) — runs `generateConsultingReport` over an approved assessment; wires the AI fence for narrative/extraction.
- Map website-scan evidence → `bti.dimension_evidence_map` consumption.

**`bti` RPCs (additive, mirror existing style):**

- `bti.propose_ratings(assessment)` — populate proposed ratings from evidence.
- `bti.validate_rating(...)` / `bti.approve_assessment(...)` — the consultant review gate (reuses `workflows`).
- `bti.register_asset(...)` / `bti.start_asset_assessment(...)`.

**HL-BTI Alpha (UI wiring only — render existing engine output):**

- New screens: Evidence, Findings, Roadmap, Narrative, CEO Review, Assets.
- Assessment wizard: "confirm/correct proposals" mode.
- Consume `@hl-bos/bti-engine` `consulting` + the new proposal engine (already a workspace dependency).

**No existing engine, store, bus, or scoring math is rewritten.** Every change is additive and mirrors an established convention.
