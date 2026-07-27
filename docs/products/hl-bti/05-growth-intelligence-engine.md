# HL-BTI — Growth Intelligence Engine (Deliverable 5)

`supabase/functions/_shared/bti/growth.ts` (`BTI_GROWTH_VERSION = bti-growth-0.1.0`). Deterministic, data-mapped, offline. No AI, no opaque list, no false precision.

## 1. What it does

Given the ratings (0–5) of the twelve Growth Intelligence dimensions, it produces prioritized recommendations. Per the PCO, **every recommendation carries Priority + Estimated ROI + a Recommended Herman Legacy service** — the Deno test asserts all three are present on every recommendation.

## 2. The dimension → service → ROI map (data)

| Dimension               | Recommended Herman Legacy service | ROI band (when weak) |
| ----------------------- | --------------------------------- | -------------------- |
| Website                 | Website Modernization             | high                 |
| SEO                     | SEO Optimization                  | high                 |
| AI Search Optimization  | AI Search Optimization (AEO)      | high                 |
| Google Business Profile | Local Presence Management         | medium               |
| Reviews                 | Reputation Management             | medium               |
| Content                 | Content Engine                    | medium               |
| Social Media            | Social Media Management           | low                  |
| Competitors             | Competitive Intelligence          | medium               |
| Lead Generation         | Lead Generation System            | high                 |
| Conversion              | Conversion Optimization           | high                 |
| Brand Authority         | Brand Authority Program           | medium               |
| Technology Stack        | Growth Tech Stack Advisory        | low                  |

## 3. Priority rule (transparent)

`rating ≤ 1 → critical · 2 → high · 3 → medium · 4 → low · 5 → strength (not a recommendation)`. Recommendations sort critical→low, tie-broken by ROI band then label for stable, deterministic ordering.

## 4. Honesty

- A dimension scoring **5** is reported as a **strength**, never padded into a fake recommendation.
- A dimension with **no rating** is returned in `unrated[]` — reported honestly, not silently scored.
- ROI bands are **illustrative and assumption-based** (like the CP6 impact engine), never a guaranteed dollar figure.

The Deno tests cover: weak dimensions become prioritized/ROI-tagged/service-mapped recommendations; a rating of 5 becomes a strength; an omitted dimension appears in `unrated`; every recommendation carries priority + ROI + service.

## 5. Relationship to the blueprint

The Growth Strategy, Marketing Strategy, SEO Strategy and Quick Wins sections of the Executive Blueprint ([Deliverable 4](04-executive-blueprint-engine.md)) are populated directly from this engine's output — filtered by dimension — so the blueprint's growth guidance and the growth scorecard never disagree.
