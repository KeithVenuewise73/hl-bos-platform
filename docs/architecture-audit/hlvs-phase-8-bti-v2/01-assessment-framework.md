# HL-BTI v2 — The Assessment Framework

## In plain language

An executive does not think in terms of "growth dimension 3" or "operations dimension 8." They think in terms of _Website_, _SEO_, _Reputation_, _Sales Funnel_. The Assessment Framework is the translation layer between those two worlds. It defines **15 executive assessment areas** and, for each one, points at the specific measurements the engine already produces. It is a **view**, not a new scoring system: it introduces **no new numbers**. Every area is built out of measurements that `@hl-bos/bti-engine` already defines, weights and scores. Adding a new area, or re-pointing an existing one, is a **data-row change** — a line in a list — never new logic.

Source: [`packages/transformation-intelligence/src/framework.ts`](../../../packages/transformation-intelligence/src/framework.ts)

---

## What is reused vs what is new

|                                   |                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reused** (`@hl-bos/bti-engine`) | The canonical `DOMAINS` catalog — **6 intelligence domains, 43 dimensions**, each with its own weight. All scoring authority.                                                                     |
| **New** (this package)            | The `ASSESSMENT_AREAS` list — 15 named executive areas, each a grouping of canonical `(domain, dimension)` references. Plus two pure functions, `validateFramework()` and `requiredDimensions()`. |

The framework **owns no scores**. It owns only the mapping from "what an executive asks about" to "what the engine already measures."

---

## The core types

The framework's only structural additions are two small interfaces:

```ts
export interface DimensionRef {
  domain: DomainKey; // one of the 6 canonical domains
  dimension: string; // a canonical dimension key within that domain
}

export interface AssessmentArea {
  key: string;
  name: string;
  description: string;
  /** Canonical (domain, dimension) pairs this area rolls up. */
  refs: DimensionRef[];
}
```

A `DimensionRef` is a pointer, not a definition. The dimension it names must already exist in the engine's `DOMAINS` catalog — the framework never invents one.

---

## The 15 assessment areas → canonical DimensionRefs

Every area below resolves entirely into pairs that already exist in `@hl-bos/bti-engine`'s `DOMAINS`. No pair here is new.

| #   | Area (`key`)                                                | Canonical `(domain, dimension)` references                                                             |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Website (`website`)                                         | `growth.website`                                                                                       |
| 2   | SEO (`seo`)                                                 | `growth.seo`, `growth.ai_search_optimization`                                                          |
| 3   | Google Business Profile (`google_business_profile`)         | `growth.google_business_profile`                                                                       |
| 4   | Reputation (`reputation`)                                   | `growth.reviews`, `growth.brand_authority`                                                             |
| 5   | Reviews (`reviews`)                                         | `growth.reviews`                                                                                       |
| 6   | Marketing (`marketing`)                                     | `growth.content`, `growth.social_media`                                                                |
| 7   | Sales Funnel (`sales_funnel`)                               | `growth.lead_generation`, `growth.conversion`                                                          |
| 8   | CRM (`crm`)                                                 | `business.customer_experience`, `operations.reporting`                                                 |
| 9   | Operations (`operations`)                                   | `operations.operations`, `operations.scheduling`, `operations.automation`                              |
| 10  | Customer Experience (`customer_experience`)                 | `business.customer_experience`                                                                         |
| 11  | AI Readiness (`ai_readiness`)                               | `ai_readiness.automation_opportunities`, `ai_readiness.ai_assistants`, `ai_readiness.customer_support` |
| 12  | Financial Opportunities (`financial_opportunities`)         | `financial.cost_reduction`, `financial.revenue_growth`, `financial.automation_roi`                     |
| 13  | Digital Presence (`digital_presence`)                       | `growth.website`, `growth.social_media`, `technology.software`                                         |
| 14  | Competitive Position (`competitive_position`)               | `growth.competitors`, `business.growth_readiness`                                                      |
| 15  | Internal Process Efficiency (`internal_process_efficiency`) | `operations.automation`, `business.processes`, `technology.technical_debt`                             |

**Notes that follow directly from the data:**

- Areas **overlap on purpose.** `growth.reviews` backs both _Reputation_ and _Reviews_; `business.customer_experience` backs both _CRM_ and _Customer Experience_; `growth.website` backs both _Website_ and _Digital Presence_; `operations.automation` backs both _Operations_ and _Internal Process Efficiency_. An executive area is a lens, and one underlying measurement can be seen through more than one lens. This is expected and correct — the framework groups, it does not partition.
- Across all 15 areas there are **31 references** to **26 distinct** canonical dimensions. The 15 areas are therefore a curated _view_ over the engine's 43 dimensions, deliberately surfacing the ones an executive brief asks about, not all of them.

---

## `validateFramework()` — proof of no drift

Because the framework only _points at_ the engine, the one thing that could go wrong is a **dangling pointer**: an area referencing a dimension that the engine does not (or no longer) defines. `validateFramework()` exists to make that impossible to miss.

```ts
export interface FrameworkValidation {
  ok: boolean;
  areaCount: number;
  referencedDimensions: number;
  /** References that do not resolve to a canonical (domain, dimension). */
  unresolved: DimensionRef[];
}

export function validateFramework(): FrameworkValidation;
```

Mechanically, it builds the set of every canonical `${domain}.${dimension}` from `DOMAINS`, then walks all `ASSESSMENT_AREAS` refs and records any that are not in that set. `ok` is true only when `unresolved` is empty. If someone renames or removes a dimension in the engine, or fat-fingers a ref here, this function reports it instead of the framework silently scoring against a phantom. It is the guarantee that **the view can never drift from the engine it is a view of**.

---

## `requiredDimensions()` — the minimum an assessment must rate

```ts
/** The distinct canonical dimensions an assessment must rate to cover all 15 areas. */
export function requiredDimensions(): DimensionRef[];
```

It returns the **de-duplicated** set of dimensions referenced by the 15 areas (26 distinct, from the 31 references above). This is the answer to "what does a business actually have to be rated on for the executive view to be complete?" — the shopping list of measurements the assessment must collect. It is derived from the same `ASSESSMENT_AREAS` data, so it stays automatically in step with any area change.

---

## Adding or retargeting an area is a data change, never new logic

This is the governing property of the framework. To add an area, or to point an existing one at different measurements, you edit the `ASSESSMENT_AREAS` list — a `key`, a `name`, a `description`, and a list of `refs`. You write **no scoring code**, because there is no scoring here to write. `validateFramework()` immediately confirms the new refs resolve; `requiredDimensions()` immediately reflects any new dimension in the shopping list. There is no industry name in this file and no per-industry branch: which dimensions matter for a given business is handled upstream by the engine's data-driven industry templates, not here.

---

## Reused vs new

- **Reused:** the entire measurement and scoring authority — `@hl-bos/bti-engine`'s `DOMAINS` (6 domains, 43 dimensions and their weights). The framework validates against it and depends on it for every reference.
- **New:** a 15-row `ASSESSMENT_AREAS` view plus two pure, side-effect-free functions (`validateFramework`, `requiredDimensions`). No new scores, no new weights, no industry logic — a naming and grouping layer that is provably consistent with the engine it sits on.
