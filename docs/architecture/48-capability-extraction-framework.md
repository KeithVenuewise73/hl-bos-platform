# CP8 · Deliverable 4 — Capability Extraction Framework

**Date:** 2026-07-27 · **Checkpoint:** 8 · Governed registry + workflow. **No code extraction or repository migration performed.**

`hlvs.extraction_candidates` records reusable capability candidates observed in existing Herman Legacy systems so later extraction is governed rather than ad hoc.

## Each candidate records

- `source_system`, `source_repository`, `source_object`
- `observed_capability`, `proposed_capability_key` (→ `hlvs.capabilities`)
- `potential_duplicate_modules` (jsonb)
- `extraction_status` (`candidate` → `under_review` → `approved_for_extraction` → `extracted` / `rejected` / `deferred`)
- `migration_strategy`, `shared_platform_suitability`, `vertical_remainder`
- `reviewer_decision` + `reviewed_by` (architecture reviewer)
- `evidence` (jsonb)

## Workflow

`hlvs.record_extraction_candidate(source, observed, attrs)` creates a candidate (`candidate`); `hlvs.review_extraction_candidate(id, status, decision)` records the architecture reviewer's decision and advances the status. Both require `hlvs.catalog.manage` (platform). Every write is audited.

## Seeded candidates (12 source systems)

Venuewise, HomeHuddle, AthleteHuddle, CoachesHuddle, 5-Star Sports Media, SalonAI, HSCS, HSCS Government, VisibilityAI, TransportationAI, FleetHuddle, and HL-BOS core — each recorded as a `candidate` for later review.

## Boundary

This is the **governed registry and workflow that will control later extraction** — no actual code extraction, repository read/write, or migration happens in this checkpoint. The migration strategy and shared-platform-vs-vertical split are captured as review inputs, not executed. Ownership of extracted Venuewise (and other) modules is an unresolved **CEO decision** ([CEO Decision Report](64-checkpoint8-ceo-decision-report.md)).
