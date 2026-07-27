# Phase 1 · Deliverable 2 (CP6) — Business Transformation Blueprint Architecture Report

**Date:** 2026-07-27 · **Checkpoint:** 6 · Local development stack only. No remote migration, no deploy, no live AI, no customer data.

The Blueprint Engine turns a **completed Business Discovery assessment** into a structured, versioned, evidence-traceable transformation plan. It is a generation + governance layer over the Discovery Engine (migration 0020) and reuses the platform spine unchanged.

## 1. Where each concern lives

| Concern                          | Layer            | Component                                                                        |
| -------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| Recommendation rule evaluation   | Edge / TS        | `supabase/functions/_shared/blueprint/rules.ts`                                  |
| Prioritization                   | Edge / TS        | `supabase/functions/_shared/blueprint/priority.ts`                               |
| Impact / ROI modeling            | Edge / TS        | `supabase/functions/_shared/blueprint/impact.ts`                                 |
| Roadmap sequencing               | Edge / TS        | `supabase/functions/_shared/blueprint/roadmap.ts`                                |
| Assembly + AI narrative          | Edge / TS        | `supabase/functions/_shared/blueprint/assemble.ts`                               |
| Worker plumbing (inert)          | Edge / TS        | `supabase/functions/discovery-blueprint-worker/index.ts`                         |
| Blueprint lifecycle + versioning | DB (`discovery`) | migration `0023` — `discovery.blueprints` (extended) + lifecycle RPCs            |
| Recommendations (single engine)  | DB (`discovery`) | `discovery.recommendations` (extended) via `discovery.recommend`                 |
| Findings / roadmap / impact      | DB (`discovery`) | `blueprint_findings`, `roadmap_items`, `impact_estimates`                        |
| Catalogs + rules                 | DB (`discovery`) | `service_catalog`, `module_catalog`, `roadmap_phases`, `recommendation_rules`    |
| Approval                         | DB (`workflows`) | `request_approval` / `decide` / `is_approved` (reused)                           |
| Events + handler invocation      | DB (`events`)    | `blueprint.*` / `recommendation.*` topics + CP5 shared dispatcher (inert worker) |

**Why the split.** The database is the durable, tenant-scoped, audited system of record and owns the lifecycle, versioning, and approval gate. The deterministic reasoning (rules → recommendations → priority → roadmap → impact) and the fenced AI narrative live in TS where they are pure and testable offline.

## 2. The Blueprint model answers the ten CEO questions

| Question                             | Answered by                                                          |
| ------------------------------------ | -------------------------------------------------------------------- |
| 1. Current state?                    | `blueprint_sections` (current_state) from `profile_scores` (11 dims) |
| 2. Problems / gaps?                  | `blueprint_findings` (severity, urgency, evidence refs)              |
| 3. What first?                       | Priority model → `priority_band` on findings + recommendations       |
| 4. Opportunities?                    | `recommendations` (kind, problem_addressed, expected_benefit)        |
| 5. What should Herman Legacy create? | `recommendations.service_key` → `service_catalog`                    |
| 6. Which HL services?                | `service_catalog` (data-driven)                                      |
| 7. Which HL-BOS modules?             | `recommendations.module_key` → `module_catalog`                      |
| 8. Implementation sequence?          | `roadmap_items` (phase, sequence, dependencies)                      |
| 9. Expected outcomes?                | `impact_estimates` (assumption-based, low/expected/high, caveats)    |
| 10. What next?                       | Lifecycle → `ready_for_proposal` + proposal flags on recommendations |

## 3. Deterministic first, AI second

`assembleBlueprint` always produces the deterministic plan: rules match evidence and dimension scores → recommendations (each carrying `rule_key` + `rule_version` + evidence refs), deduplicated, prioritized, sequenced into a roadmap, with assumption-based impact estimates. The AI narrative is **optional and non-blocking**: it is fenced as untrusted, structurally validated, and every AI finding must cite real evidence. If AI fails or returns unsupported/guaranteed-outcome content, the blueprint is marked `partially_generated` and the deterministic plan stands unchanged.

## 4. Single engine, no duplication

There is exactly one recommendation table (`discovery.recommendations`, extended), one approval mechanism (`workflows`), one event bus (`events`), one evidence store (`discovery.evidence`), one scoring framework (`discovery.profile_scores`). Opportunities and solution-stack items are recommendations of the appropriate `kind`; findings, roadmap items, and impact estimates are blueprint sub-structures that reference recommendations and evidence. See the [Reuse Analysis](30-checkpoint6-reuse-analysis.md).

## 5. Deliberately absent in Checkpoint 6

No proposal engine, no provisioning, no customer communication, no live AI/PageSpeed/crawl, no remote migration, no billing activation, no created prices. The blueprint worker is inert scaffolding on the CP5 shared dispatcher — no scheduler, no deploy.
