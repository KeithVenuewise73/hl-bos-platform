# HL-BTI — Assessment Framework (Deliverable 3)

The assessment framework is **data-driven and extensible**: six intelligence domains, each a set of scored dimensions, rolled up deterministically into seven executive scores. Industries extend the framework by adding rows (industry packs + dimensions), never by replacing it.

## 1. The six intelligence domains (seeded)

| Domain (`key`)                             | Evaluates (PCO)                                                                                                                                        | Transformation weight |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| **Business Intelligence** (`business`)     | maturity, leadership, processes, customer experience, growth readiness                                                                                 | 9                     |
| **Operations Intelligence** (`operations`) | operations, supply chain, scheduling, reporting, automation, fleet, resource utilization, warehouse operations, transportation                         | 8                     |
| **Growth Intelligence** (`growth`)         | website, SEO, AI search optimization, GBP, reviews, content, social media, competitors, lead generation, conversion, brand authority, technology stack | 8                     |
| **Technology Intelligence** (`technology`) | software, security, cloud readiness, architecture, technical debt, scalability, HL-BOS compatibility                                                   | 7                     |
| **AI Readiness** (`ai_readiness`)          | automation opportunities, AI assistants, customer support, marketing automation, internal AI workflows, future AI products                             | 7                     |
| **Financial Intelligence** (`financial`)   | cost reduction, revenue growth, automation ROI, transformation ROI                                                                                     | 8                     |

Each PCO sub-item is a seeded `bti.domain_dimensions` row (43 total) with its own weight.

## 2. Scoring — deterministic and honest

1. An assessor records a **0–5 rating** per dimension via `bti.rate_dimension` (validated against the dimension catalog).
2. `bti.compute_scores` computes each **domain score** = weighted mean of its ratings, scaled to **0–100** (`round(Σ(rating·weight)/Σ(weight)/5·100)`).
3. The **7 executive scores** map each named domain to its rolled-up score. The **Transformation Score** is the weighted mean of the domain scores present, weighted by `transformation_weight`.

**Honest nulls:** a domain with no ratings scores `NULL` — never a fabricated number (platform principle 10). Worked example (also asserted in tests): business dims all 4 → 80; operations 5 & 2 (equal weights) → 70; growth unrated → null; transformation = round((80·9 + 70·8)/17) = **75**.

The DB (`bti.compute_scores`) is the authority; `_shared/bti/scoring.ts` mirrors it exactly. The Deno test asserts identical values (80 / 70 / null / 75).

## 3. The seven executive scores

Business Health · Operations · Growth · Technology · AI Readiness · Financial Opportunity · **Transformation** (the composite). Each 0–100 or null.

## 4. Human-review gate

An assessment cannot be `completed` without an **approved `workflows` instance** (`submit_assessment_for_review` → a permission-holder `workflows.decide('approved')` → `complete_assessment`). Completion re-computes and seals the scorecard and logs a security event. AI cannot self-approve.

## 5. Industry extensibility

`bti.industry_packs` (10 seeded) declares `applicable_domains` (emphasis ordering) and `default_services`. A business selects a pack. Adding a new industry — or a new dimension for one — is a **row**, satisfying the PCO rule "future industries extend the assessment engine rather than replacing it." A `domain_dimensions.industry_pack` column allows industry-specific dimensions (null = applies to all).

## 6. Reuse

The framework rolls up over the existing `discovery` assessment substrate (evidence, profiles) and reuses the same weighted-mean, honest-null scoring philosophy proven in `discovery.complete_assessment`. No second scoring engine, evidence store, or review engine was created.
