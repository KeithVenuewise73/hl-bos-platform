# Phase 1 · Deliverable 8 (CP6) — Evidence Traceability Report

**Date:** 2026-07-27 · **Checkpoint:** 6 · Internal traceability is complete, even where the customer narrative is later simplified.

Every element of a Blueprint can be traced back to the facts that produced it. This is the anti-fabrication guarantee for the transformation plan.

## 1. What each element references

| Blueprint element    | Traces to                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blueprint_sections` | `evidence_refs` (evidence ids) + `origin` + optional `ai_run_id`                                                                                                  |
| `blueprint_findings` | `evidence_refs` + `affected_dimensions` + `origin` + `review_status`                                                                                              |
| `recommendations`    | `rule_key` + `rule_version` + `evidence_refs` + `affected_dimensions` + `service_key`/`module_key` + `origin`                                                     |
| `roadmap_items`      | `related_recommendations` + `related_evidence` + `phase_key` + `required_approvals`                                                                               |
| `impact_estimates`   | `recommendation_id` + `input_source` + `assumption` + `calculation_method`                                                                                        |
| blueprint (whole)    | `assessment_id` → `profile_scores` → `score_dimensions`; `rule_version` + `priority_model_version` + `impact_model_version`; `ai_run_ids`; `workflow_instance_id` |

## 2. Reference targets available

- **Discovery evidence** — `discovery.evidence` ids (website scan findings, interview answers, documents, all land here as the canonical store).
- **Profile scores** — `discovery.profile_scores` per dimension.
- **AI runs** — `ai.runs` id on sections and via `blueprints.ai_run_ids`.
- **Stored documents** — `storage_meta.files` (future artifacts).
- **Versions** — collector version (from CP5 scans), rubric version, `rule_version`, `priority_model_version`, `impact_model_version`.
- **Human-review decisions** — `workflows.instances`/`approvals` via `workflow_instance_id`; overrides record `reviewed_by` + `override_reason`.

## 3. AI content is traceable or dropped

An AI-assisted section/finding/recommendation must carry evidence: the RPCs reject an `ai_assisted` write with no `evidence_refs` (proven by `t_ai_section_requires_evidence`, `t_ai_finding_requires_evidence`, `t_ai_rec_requires_evidence`), and the assembler drops any AI finding that cites a non-existent evidence id (`assemble: unsupported AI finding is dropped`). AI never invents a fact that isn't anchored to real evidence.

## 4. Versioned + reproducible

Because every engine version is stamped on the blueprint and every recommendation names its rule + rule version, a blueprint can be re-derived or audited later: the same evidence + the same rule version yields the same deterministic plan. Re-running under a newer rule version produces a **new blueprint version** (the prior is preserved), so history is never silently rewritten.

## 5. Customer simplification is a later, additive step

The customer-facing narrative may be simplified for readability, but the internal record — evidence ids, rule versions, review decisions — remains complete and is the source of truth for any dispute or audit.
