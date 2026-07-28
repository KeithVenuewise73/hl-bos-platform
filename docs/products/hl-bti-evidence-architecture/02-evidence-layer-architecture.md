# Deliverable 1 — Evidence Layer Architecture (Steps 2 & 3)

The Evidence Collection Layer is the **single source of truth for every assessment**. It is built by **formalizing the existing `discovery` evidence plane** as a platform capability and adding two thin bridges to the 43 BTI dimensions. No new store, no new bus, no duplicate collector framework.

## 1. Principle

> **No score exists without supporting evidence.** A dimension's rating is _proposed_ from the evidence collected for it, carries a confidence, and lists its supporting facts and its missing evidence. The consultant validates — they do not originate the number.

## 2. The layer (reuses `discovery.*`)

```
Collectors ──record_evidence()──▶ discovery.evidence  ◀── the Evidence Repository (exists)
   │                                    │
   │                                    ▼
   │                         Evidence→Dimension Map (NEW catalog)
   │                                    │
   ▼                                    ▼
discovery.collectors            Rating-Proposal Engine (NEW, deterministic)
 (registry, exists)                     │
                                        ▼
                             Proposed dimension ratings + confidence + facts + gaps
                                        │  (consultant validates/approves)
                                        ▼
                             bti.dimension_ratings (evidence-linked)  ──▶ Consulting Framework
```

## 3. Evidence sources (Step 2) — the reusable framework, not implementations

Every source is a **collector row** in `discovery.collectors` writing typed evidence via `discovery.record_evidence`. The **collector contract** (already implicit in 0020) is formalized as:

```
Collector {
  key, kind, is_active
  collect(profile, config) -> writes discovery.evidence rows:
     { source, key, value(jsonb), confidence, refs, file_id?, ai_run_id? }
}
```

Source catalog (each a collector `kind`; ✔ built, ○ slot exists, ◆ future):

| Source                                            | Collector kind                               | State                                   |
| ------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| Website                                           | `website_assessment`                         | ✔ scanner built (CP5)                   |
| Web Application / Mobile Application              | `app_assessment`                             | ◆ new collector (same contract)         |
| SEO / Visibility                                  | `visibility` (bridge to `visibility` schema) | ○ VisibilityAI exists                   |
| Technology / Hosting / Security / Performance     | `tech_assessment`                            | ◆ (website scanner already yields some) |
| Marketing / Reviews / Social Media                | `social_presence` + reviews bridge           | ○ slot + `visibility.reviews`           |
| Customer Interviews / Questionnaires              | `business_interview`                         | ✔ active                                |
| Financial / Operations Documents / Uploaded Files | `document_analysis` (+ `storage_meta.files`) | ○ slot + storage exists                 |
| Internal Observations                             | `internal_observation`                       | ◆ manual-entry collector                |
| Future AI Collectors                              | any `kind`                                   | ◆ contract already supports             |

**Architecture only — collectors are not implemented here.** The point is that all sources share one contract, one write path, and one store.

## 4. Evidence → Dimension Mapping (Step 3) — the first new bridge

A **data-driven catalog** (proposed table `bti.dimension_evidence_map`, or a config module in `@hl-bos/bti-engine`) linking evidence keys to the 43 dimensions:

```
DimensionEvidenceMap {
  domain_key, dimension_key,
  evidence_key,            -- a discovery.evidence.key this dimension consumes
  weight,                  -- contribution to the proposed rating
  direction,               -- higher-evidence => higher/lower rating
  confidence_floor         -- min confidence to count
}
```

For **every dimension**, the layer can then report exactly what the ACO requires:

| Field                | Source                                                    |
| -------------------- | --------------------------------------------------------- |
| **Evidence Sources** | the collectors whose keys map to it                       |
| **Confidence**       | aggregate of contributing evidence confidences × coverage |
| **Missing Evidence** | mapped evidence keys with no rows collected               |
| **Supporting Facts** | the actual `discovery.evidence` rows                      |
| **Related Findings** | the consulting findings generated from its rating         |

This mapping is **configuration (rows)** — extensible per industry, never hardcoded.

## 5. Rating-Proposal Engine (deterministic) — the second new bridge

A pure function in `@hl-bos/bti-engine` (mirrors the existing DB-authority + edge-mirror pattern):

```
proposeRating(dimension, evidenceRows, map) -> {
  proposedRating: 0-5 | null,     -- null when no evidence (never invented)
  confidence: high|moderate|low,  -- from coverage + evidence confidence
  supportingFacts: [...],         -- the evidence used
  missingEvidence: [...],         -- mapped keys not yet collected
  rationale                       -- deterministic explanation
}
```

Rules (honesty-preserving):

- **No evidence → `null` proposal**, flagged "evidence required." Never a fabricated rating.
- Confidence is **low** when coverage is thin or an extreme is uncorroborated (feeds the CEO Review).
- The proposal is a **starting point the consultant confirms or overrides** — the override is recorded with the consultant as the source (auditable).

## 6. Evidence-linked ratings (schema change, planned)

`bti.dimension_ratings` gains (future migration, CEO-gated): `source` (`proposed` | `consultant` | `overridden`), `confidence`, `evidence_ids jsonb`, `proposed_rating`. So every rating records **where it came from and what backs it** — the structural fix for "scores rely on manual input."

## 7. What this reuses vs. adds

- **Reuses:** `discovery.evidence`, `discovery.collectors`, `discovery.collections`, `record_evidence`, the website scanner, VisibilityAI, `storage_meta`, the AI fence, `workflows`.
- **Adds:** the evidence→dimension map (catalog), the deterministic rating-proposal engine, and evidence columns on `bti.dimension_ratings`. Three bridges — no new engine, store, or bus.
