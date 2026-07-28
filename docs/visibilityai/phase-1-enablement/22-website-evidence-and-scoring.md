# Phase 1 · Deliverable 4 (CP5) — Website Evidence and Scoring Specification

**Date:** 2026-07-27 · **Checkpoint:** 5 · Structured evidence, data-driven scores, full traceability.

The collector produces **structured evidence**, not an AI narrative. Every finding is a deterministic fact extracted from the page; every dimension score traces back to the specific evidence keys that justify it. AI, when present, adds interpretation on top and never replaces or overrides a deterministic fact.

## 1. Deterministic extraction (`extract.ts`)

`extractFindings(html, headers, finalUrl)` is a pure, dependency-free function returning a `WebsiteFindings` record:

| Group         | Fields                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| Transport     | `https`, `mixedContent`, `securityHeaders[]`                                                  |
| Search / meta | `title`, `metaDescription`, `canonical`, `robotsMeta`, `structuredDataTypes[]`, `openGraph[]` |
| Structure     | `h1[]`, `headingCounts{h1..h6}`                                                               |
| Accessibility | `lang`, `hasViewport`, `imageCount`, `imagesMissingAlt`                                       |
| Links         | `links{internal,external}`, `socialLinks{}`                                                   |
| Conversion    | `forms`, `contactSignals{tel,mailto}`                                                         |
| Marketing     | `analyticsTags[]` (GA / GTM / Meta Pixel)                                                     |

All values are facts, not judgements. Mixed content is only flagged on `https` pages (an `http` page's problem is the missing TLS, recorded separately).

## 2. Rubric → dimension contributions (`rubric.ts`, `rubric-0.1.0`)

`scoreFromFindings(findings)` maps evidence to seven **Digital-Maturity** dimension contributions, each `0–5`, each carrying the `evidenceKeys` that produced it:

| Dimension             | Driven by                                                  |
| --------------------- | ---------------------------------------------------------- |
| `security`            | https, security headers, mixed content                     |
| `digital_presence`    | title, meta description, canonical, viewport               |
| `customer_experience` | viewport, forms, contact signals, single H1                |
| `marketing`           | analytics tags, open graph, social links                   |
| `analytics`           | analytics tags                                             |
| `communications`      | contact signals, forms                                     |
| `growth_readiness`    | structured data, social links, canonical, meta description |

Each dimension carries a `severity` (derived from the score) and a `confidence` (0.9 for deterministic rubric contributions). A dimension is emitted **only when supporting evidence exists** — there is no score without evidence, proven by `score: every derived finding carries category, severity, and confidence` and the DB test `t_dimension_scored`.

## 3. Evidence is canonical — no parallel store

Each derived finding is written through `discovery.record_scan_finding`, which calls the **existing** `discovery.record_evidence`. The finding's `category`, `severity`, `detection_method` and `page_url` are folded into the evidence `value`; the source is `'website'` and the collector is `'website_assessment'`. There is no separate "website findings" table. `24_website_scan.sql :: t_evidence_is_canonical` asserts the row lands in `discovery.evidence` with the right category.

## 4. Scores flow into the shared framework

Rubric dimension contributions are recorded via `discovery.score_dimension(assessment, framework, dimension, score, note)` into `discovery.profile_scores`. The **composite** maturity/health scores remain computed data-driven in the database from these contributions — the collector never writes a hard-coded overall score. `t_score_contribution` / `t_dimension_scored` prove a website-derived score reaches `profile_scores`.

## 5. AI layer — interpretation only, never authority

When an `analyze` adapter is supplied, `scan.ts` builds a fenced, structured request (see [SSRF & Crawl Security](21-ssrf-and-crawl-security.md) §prompt-injection and the [Architecture Report](20-website-assessment-architecture.md)). The AI is asked for `{ findings: [{ label, evidenceRef, confidence }] }` — every AI finding must cite an `evidenceRef` back to a deterministic fact. AI output is validated as structured JSON; if it fails or the provider errors, the scan degrades to `partially_completed` and **all deterministic findings and scores stand**. Proven by `scan: AI failure degrades to partially_completed but preserves deterministic findings`.

## 6. Traceability summary

```
page HTML ─► extractFindings ─► WebsiteFindings (facts)
                                   │
                    scoreFromFindings (rubric-0.1.0)
                    │                         │
            DerivedFinding[]            DimensionScore[] (score + evidenceKeys)
                    │                         │
         record_scan_finding          score_dimension
                    │                         │
          discovery.evidence          discovery.profile_scores
```

Every number a customer would ever see is reachable from a specific evidence key on a specific page. That is the anti-fabrication guarantee for this module.
