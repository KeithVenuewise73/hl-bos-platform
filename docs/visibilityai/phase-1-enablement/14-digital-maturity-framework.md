# Phase 1 · Deliverable 3 (CP4) — Digital Maturity Framework

**Date:** 2026-07-27 · **Checkpoint:** 4 · Data-driven; **nothing hard-coded.**

Dimensions and weights are **rows** in `discovery.score_dimensions` (`framework='maturity'`). New dimensions are additive (a row, not a code change). Per-assessment scores live in `discovery.profile_scores`; the composite Digital Maturity Score is a weighted mean of the 0–5 dimension scores, scaled to 0–100, derived **only** from dimensions that were actually scored (honest instrumentation — an unscored assessment has a null score, never a fabricated one).

## Seeded dimensions (12)

| Key                   | Dimension           | Weight |
| --------------------- | ------------------- | -----: |
| `digital_presence`    | Digital Presence    |      8 |
| `marketing`           | Marketing           |      7 |
| `sales`               | Sales               |      7 |
| `customer_experience` | Customer Experience |      7 |
| `operations`          | Operations          |      6 |
| `automation`          | Automation          |      6 |
| `analytics`           | Analytics           |      5 |
| `ai_adoption`         | AI Adoption         |      5 |
| `security`            | Security            |      6 |
| `business_processes`  | Business Processes  |      6 |
| `communications`      | Communications      |      6 |
| `growth_readiness`    | Growth Readiness    |      7 |

## Scoring model

- Each dimension is scored 0–5 (`discovery.score_dimension(assessment,'maturity',key,score)`).
- Composite = `round( Σ(score×weight) / Σ(weight) / 5 × 100 )` over the scored maturity dimensions → 0–100.
- Weights are tunable per row; adding a dimension (e.g. a future "Data Governance") is an additive row and immediately participates.
- Verified in test 22: scoring `digital_presence=4` (weight 8) alone yields a composite of **80**.

## Reuse

Every vertical uses the same framework and dimension catalog; a vertical may add its own dimensions without affecting others. The Website Assessment collector (CP5) and the existing VisibilityAI 16-category assessment both map into these maturity dimensions as evidence-backed inputs.
