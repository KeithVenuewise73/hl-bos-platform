# Deliverable 5 — Reuse Analysis / Reuse Audit (Step 8)

Every capability the corrected architecture requires, classified **Reuse Existing · Modify Existing · New Development**. Creating duplicate functionality is prohibited — this audit proves the correction is overwhelmingly reuse.

| Capability required                                                               | Verdict                     | Detail                                                                                |
| --------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| Evidence repository                                                               | **Reuse Existing**          | `discovery.evidence` (tenant-scoped, RLS+FORCE, confidence).                          |
| Collector registry / framework                                                    | **Reuse Existing**          | `discovery.collectors` + `record_evidence` + `discovery.collections`.                 |
| Website evidence collector                                                        | **Reuse Existing**          | CP5 scanner (`_shared/discovery/*` + `discovery-website-worker`) — activate + map.    |
| Visibility / SEO / reviews evidence                                               | **Reuse Existing**          | `visibility` schema (VisibilityAI).                                                   |
| Document storage for uploads                                                      | **Reuse Existing**          | `storage_meta.files`.                                                                 |
| Interview / questionnaire                                                         | **Reuse Existing**          | `business_interview` collector + `interview_questions`.                               |
| AI extraction + narrative                                                         | **Reuse Existing**          | `ai` gateway + `_shared/ai` + injection fence.                                        |
| Human approval gate                                                               | **Reuse Existing**          | `workflows.request_approval` / `decide`.                                              |
| Eventing / triggering                                                             | **Reuse Existing**          | `events.emit` + CP5 shared dispatcher.                                                |
| Executive scoring (7 scores)                                                      | **Reuse Existing**          | `@hl-bos/bti-engine` `computeScorecard` + `bti.compute_scores`.                       |
| Consulting Intelligence Framework                                                 | **Reuse Existing**          | `@hl-bos/bti-engine/src/consulting/*` — already accepts evidence.                     |
| Blueprint / Proposal / Provisioning / Billing                                     | **Reuse Existing**          | `discovery` (0023) / `sales` / `provisioning` / `billing`.                            |
| Assessment lifecycle + stage machine                                              | **Reuse Existing**          | `bti` schema (0026).                                                                  |
| **`bti.dimension_ratings` (add evidence link)**                                   | **Modify Existing**         | add `source`, `confidence`, `evidence_ids`, `proposed_rating`, `asset_assessment_id`. |
| **BTI assessment flow (propose → validate → approve)**                            | **Modify Existing**         | assessment gains a "proposed" state before ratings are set; reuses `workflows`.       |
| **HL-BTI Alpha (surface consulting + evidence + review)**                         | **Modify Existing**         | UI wiring of existing engine output; render, don't recompute.                         |
| **Evidence → 43-dimension mapping**                                               | **New Development**         | catalog table/config (`bti.dimension_evidence_map`) — data, extensible.               |
| **Rating-proposal engine**                                                        | **New Development**         | deterministic `@hl-bos/bti-engine` function (DB-authority + edge-mirror pattern).     |
| **Asset model**                                                                   | **New Development**         | `bti.asset_types` (catalog), `bti.assets`, `bti.asset_assessments`.                   |
| **Evidence-driven collectors beyond website** (app, tech, social, financial docs) | **New Development (later)** | each a collector row against the existing contract; not in the critical path.         |

## Tally

- **Reuse Existing:** 13 capabilities (the entire evidence store, collector framework, intelligence engines, scoring, consulting brain, blueprint/proposal/provisioning/billing, AI, workflows, events).
- **Modify Existing:** 3 (evidence-linked ratings; propose→validate→approve flow; Alpha UI wiring).
- **New Development:** 3 core bridges (evidence→dimension map; rating-proposal engine; asset model) + future collectors.

**No duplicate platform service is created.** The correction connects and surfaces what exists, adds three deterministic bridges, and one thin asset layer.
