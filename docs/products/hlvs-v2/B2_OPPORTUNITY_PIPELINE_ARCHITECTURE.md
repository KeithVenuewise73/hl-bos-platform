# HLVS V2 · B2 — Opportunity Intelligence Pipeline (Architecture)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **The successor to the HLVS Think Tank, inside Venture Studio.**

## Purpose

Continuously **ingest → organise → relate → score → prioritise** software opportunities, and let the CEO Notebook be the workspace where they're explored. One product (`apps/venture-studio`), not a new app.

## The pipeline (data flow)

```
Connector (stubbed) ──> Discovery record ──> Opportunity (Inbox)
   │  integrations         summary/source/url/       vstudio.opportunities
   │  + discovery          category/confidence/       (+ source_connector,
   │  collector            reuse/effort/revenue/        external_ref dedup)
   │                       Build·Acquire·Partner·Ignore
   ▼                              │
 ai gateway  ──────────> AI summary (NON-authoritative)   Duplicate detection
 (ai.runs)               vstudio.opportunity_summaries    (deterministic) ──> relationships
                                 │                         vstudio.opportunity_relationships
                                 ▼
                     Executive Priority Queue (deterministic score/tier)
                                 │
                     CEO decision (authoritative) — unchanged, 0029
```

## What is reused (assemble, do not rebuild)

| Pipeline need                                      | Reused HL-BOS capability                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Connector framework (add sources without redesign) | **`integrations`** registry (catalog + per-tenant connection w/ Vault credential ref + sync run) |
| Ingestion collectors                               | **`discovery`** engine (collectors are rows, not code)                                           |
| AI summaries / research                            | **`ai`** gateway + `ai.runs` ledger (provenance)                                                 |
| Reuse scoring                                      | **`@hl-bos/catalog`** `analyzeReuse` (deterministic)                                             |
| Relationships (future projection)                  | **`graph`** read model                                                                           |
| Human review of research                           | **`workflows`** gate                                                                             |
| Event trail                                        | **`events.emit`**                                                                                |
| Advisory vs. authoritative                         | existing `recommendation.ts` + the CEO decision (0029)                                           |

**Net-new is thin and additive** (migration 0031): opportunity **relationships**, a **non-authoritative AI summary** carrying honest estimates, and **source/priority** columns on opportunities. Duplicate detection and priority scoring are **pure functions** in `@hl-bos/venture-studio`.

## Connector architecture (extensible without redesign)

A connector is a **registry entry** (`OPPORTUNITY_CONNECTORS` in `@hl-bos/venture-studio`) that maps a source to: an Intelligence Program, a credential type (`none`/`api_key`/`oauth`), and an integration style (`rest`/`rss`/`graphql`/`scrape`). Adding a source = **one registry entry + one `discovery` collector (edge function)** — no schema or app redesign. All 11 sources ship **stubbed** (no credential, no live calls, no fabricated discoveries):

GitHub · Reddit · Product Hunt · Hacker News · Acquire.com · AppSumo · Microns.io · Flippa · Grants.gov · USPTO · Google Patents.

Each maps to a permanent Intelligence Program (Opportunity / Acquisition / Research / Grant), so no connector is an orphan.

## Every discovery produces (the ten fields)

Summary · Source · URL · Category · Confidence · Related Opportunities (duplicate detection) · Reuse Opportunities (catalog) · Estimated Build Effort (honest `Estimate`) · Estimated Revenue Potential (honest `Estimate`) · **Build / Acquire / Partner / Ignore** recommendation — **advisory, never authoritative**.

## Honesty & governance

- **AI recommendations are non-authoritative** — enforced by a DB `CHECK (authoritative = false)` on `opportunity_summaries`, mirroring `recommendations` (0029).
- **Estimates are never bare numbers** — build effort / revenue carry a measured/estimated/unknown status; unknown renders "no data".
- **The CEO decision stays the only authoritative act** (0029, unchanged).
- **Connectors are stubbed** until a CEO-approved credential (Vault reference) exists — never the service-role key, never behind `NEXT_PUBLIC_*`.
- All new tables are RLS-forced, `vstudio.opportunity.read`-gated, anon-denied. No new permission key.
