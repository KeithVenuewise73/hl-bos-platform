# Phase 1 · Deliverable 4 (CP4) — Business Health Framework

**Date:** 2026-07-27 · **Checkpoint:** 4 · Independent of Digital Maturity; data-driven.

A second, **independent** scoring system in the same catalog (`discovery.score_dimensions` with `framework='health'`) and the same per-assessment score table. It answers "how healthy/ready is this business," distinct from "how digitally mature is it." Composite Business Health Score is a weighted mean of 0–5 dimension scores → 0–100, derived only from real scored dimensions.

## Seeded dimensions (8)

| Key                      | Dimension              | Weight |
| ------------------------ | ---------------------- | -----: |
| `operational_health`     | Operational Health     |      8 |
| `customer_engagement`    | Customer Engagement    |      8 |
| `revenue_readiness`      | Revenue Readiness      |      9 |
| `technology_readiness`   | Technology Readiness   |      6 |
| `competitive_position`   | Competitive Position   |      6 |
| `growth_potential`       | Growth Potential       |      7 |
| `risk_indicators`        | Risk Indicators        |      6 |
| `automation_opportunity` | Automation Opportunity |      6 |

## Scoring model

- Scored 0–5 via `discovery.score_dimension(assessment,'health',key,score)`.
- Composite = `round( Σ(score×weight)/Σ(weight)/5×100 )` over scored health dimensions → 0–100.
- Maturity and Health are computed separately and stored separately (`assessments.maturity_score`, `assessments.health_score`); one may be present while the other is null.
- Verified in test 22: scoring `revenue_readiness=3` (weight 9) alone yields a Business Health Score of **60**.

## Why two frameworks

Digital Maturity measures the state of the business's digital/technology capability; Business Health measures operational/commercial readiness and risk. A low-maturity but healthy business (e.g. a thriving cash salon with no website) and a high-maturity but at-risk business are both real and get **different** transformation recommendations. Keeping the frameworks independent lets recommendations target the right gap.
