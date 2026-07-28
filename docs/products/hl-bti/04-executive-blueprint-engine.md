# HL-BTI — Executive Blueprint Engine (Deliverable 4)

The Executive Business Transformation Blueprint is assembled **deterministically** from the executive scorecard, growth intelligence, and recommendations. Structure is code; narrative is advisory AI (reused CP6 assembler + AI fence), and never changes a score or invents a section's data.

## 1. Where it lives

- **Structural assembly:** `supabase/functions/_shared/bti/blueprint.ts` (`assembleExecutiveBlueprint`, `BTI_BLUEPRINT_VERSION = bti-blueprint-0.1.0`).
- **Container + versioning + workflow approval:** reused `discovery.blueprints` + the CP6 blueprint engine (0023) — HL-BTI adds the executive-scorecard section, it does not fork the blueprint machinery.
- **Recommendations:** reused `discovery.recommendations` (already carries `recommended_service`, `estimated_impact`, `priority`).

## 2. The 17 mandated sections (PCO)

Executive Summary · Current State · Strengths · Weaknesses · Quick Wins · Transformation Opportunities · Operational Improvements · Growth Strategy · Marketing Strategy · SEO Strategy · AI Strategy · 90-Day Roadmap · 6-Month Roadmap · 12-Month Vision · Estimated ROI · Recommended Herman Legacy Services · Implementation Plan.

`assembleExecutiveBlueprint` emits **all 17**, in order (the Deno test asserts `sections.length === 17`).

## 3. Deterministic derivation

| Section                                | Derived from                                                        |
| -------------------------------------- | ------------------------------------------------------------------- |
| Executive Summary                      | transformation score + count of domains scored                      |
| Current State                          | the per-domain scorecard                                            |
| Strengths / Weaknesses                 | domains ≥ 70 / < 55                                                 |
| Quick Wins                             | critical/high growth recommendations                                |
| Transformation Opportunities           | all recorded recommendations                                        |
| Operational Improvements / AI Strategy | operations / ai_readiness scores                                    |
| Growth / Marketing / SEO Strategy      | growth intelligence recommendations, filtered by dimension          |
| 90-Day / 6-Month / 12-Month            | recommendations bucketed by priority (critical+high / medium / low) |
| Estimated ROI                          | captured ROI metrics (illustrative, assumption-based)               |
| Recommended Services                   | distinct recommended Herman Legacy services                         |
| Implementation Plan                    | phased recommendation count                                         |

## 4. Honesty rule (enforced in code + tests)

A section with no supporting data is emitted with `hasData: false` and an explicit `note` explaining why — **never a fabricated paragraph**. `blueprint.complete` is `true` only if every section has data. Two Deno tests prove this: an empty-ROI section carries a reason; a no-scores blueprint marks the summary empty and `complete: false`.

## 5. AI boundary

The narrative layer reuses the CP6 `_shared/blueprint/assemble.ts` pattern: AI output is fenced, secret-redacted, and validated; unsupported AI claims are dropped; AI failure yields a partial (not a blocked) blueprint. AI writes prose around the deterministic facts — it does not produce the facts.
