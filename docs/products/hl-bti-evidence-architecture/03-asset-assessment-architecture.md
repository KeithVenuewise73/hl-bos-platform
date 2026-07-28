# Deliverable 2 — Asset-Based Assessment Architecture (Step 5)

Businesses contain **assets**. Today HL-BTI assesses a business as one flat set of 43 dimension ratings — the validation flagged this. The correction: **each asset is assessed on its own**, and the business Executive Blueprint **aggregates** the asset assessments. This also gives evidence a natural home (evidence is collected _per asset_: this website, that app, this GBP listing).

## 1. Model

```
Business (bti.businesses)
  └── Assets (NEW: bti.assets)                  e.g. Website, Web App, Mobile App,
        └── Asset Assessment (per asset)              Marketing, SEO, Technology,
              └── Evidence (discovery.evidence)       Operations, Financial, CX, Brand,
              └── Dimension ratings (asset-scoped)     Facilities, Staff, Products, Services
  └── Business Assessment (aggregates asset assessments) → Executive Blueprint
```

Example (from the ACO):

```
HomeHuddle
├── Website          → evidence: scanner → growth/technology dimensions
├── Application       → evidence: app collector → technology/CX dimensions
├── Marketing         → evidence: social/reviews → growth dimensions
├── SEO               → evidence: VisibilityAI → growth dimensions
├── Technology        → evidence: tech collector → technology dimensions
├── Operations        → evidence: interview/docs → operations dimensions
├── Financial         → evidence: financial docs → financial dimensions
├── Customer Experience → evidence: reviews/interview → business/growth
└── Brand             → evidence: visibility → growth/business
```

## 2. New objects (planned schema — CEO-gated migration)

| Object                                      | Purpose                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bti.asset_types` (catalog)                 | Reusable asset types (website, web_app, mobile_app, marketing, seo, technology, operations, financial, customer_experience, brand, facilities, staff, products, services) — **rows, extensible**, each mapping to the **dimensions it is assessed on** and the **collectors that feed it**. |
| `bti.assets`                                | An asset belonging to a `bti.businesses` row: `type`, `name`, `ref` (URL / file / identifier), `discovery_profile_id`.                                                                                                                                                                      |
| `bti.asset_assessments`                     | An assessment scoped to one asset; holds that asset's evidence-linked dimension ratings.                                                                                                                                                                                                    |
| `bti.dimension_ratings.asset_assessment_id` | Ratings become asset-scoped (the business assessment aggregates them).                                                                                                                                                                                                                      |

## 3. Aggregation (deterministic, reuses the scoring engine)

- Each **asset assessment** scores only the dimensions relevant to its type (from `asset_types`), each rating evidence-proposed then consultant-validated.
- The **business assessment** aggregates asset dimension ratings into the 6 domains, then the 7 executive scores, using the **existing `computeScorecard`** — no new scoring math. Where two assets touch the same dimension (e.g. Website and Marketing both inform `conversion`), aggregation is a documented, deterministic rule (weighted by asset relevance).
- **Honest coverage:** a dimension with no asset evidence stays `null`; the blueprint shows which assets were assessed and which are missing.

## 4. Why this is reuse, not rebuild

- **Scoring, blueprint, consulting**: unchanged — they consume the aggregated ratings exactly as today.
- **Evidence**: already per-source in `discovery.evidence`; assets give it the right owner.
- **The only new structure** is the asset layer (`asset_types`, `assets`, `asset_assessments`) and the asset-scoping column — a thin schema addition, not a new engine.

## 5. Closes the validation gaps

- Adds the missing asset types the validation named: **Applications** (web_app, mobile_app), explicit **Business Model**, **Facilities**, **Staff**, **Products**, **Services**.
- Moves from "one opinion per dimension" to "evidence per asset, aggregated" — the structural change that lets scores differentiate businesses instead of converging on 47–49.
