# HLVS V2 — Herman Legacy Venture Studio · Architecture

**For:** Keith Herman, CEO / Product Owner · **Author:** Claude (AI engineer) · **Date:** 2026-08-01
**Type:** Design document — architectural analysis only. **No production code, no migration, no deployment.**

> **What this is.** HLVS V2 is a **brand-new application assembled on HL-BOS** — Herman Legacy's **executive innovation & software-opportunity intelligence platform**. It is _not_ the legacy HLVS Venture Studio (retired; see `docs/hlvs-forensics/`) and _not_ the `hlvs` Software **Factory** (which it _uses_, not replaces). It continuously discovers software opportunities from the outside world, decides **Build / Buy / Partner / Ignore**, quantifies **reuse and ROI against the real Herman Legacy portfolio**, and hands approved builds into the existing Factory.

> **Governing law.** _ASSEMBLE. DO NOT REBUILD._ ~90% of HLVS V2 is existing HL-BOS capability (identity, AI gateway, integrations, graph, events, discovery scoring, the Factory). The net-new surface is one thin schema and a handful of workers + a CEO UI.

> **Honesty doctrine (Principle 10), baked into the architecture, not bolted on.** Every ROI/ARR/effort number is a **labeled estimate** with a stored methodology and confidence — never presented as fact. External signals are **real ingested data or an explicit "not connected / no data" state** — the system never invents an opportunity, a star count, a funding round, or a score. AI output is **advisory** (metered through `ai.runs`, real tokens only); the **CEO decision is the only authoritative act**. AI approves, authorizes, and publishes nothing.

---

## Naming decision (read first)

| Name                                                      | Meaning                                                  | HLVS V2 stance                            |
| --------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| **HLVS Venture Studio (legacy)**                          | The retired original app (unreachable)                   | Historical reference only                 |
| **`hlvs` Software Factory**                               | The live 19-table build-governance schema in HL-BOS Core | **Reused** as the downstream build engine |
| **`venture_studio`**                                      | A rename that was planned but **never built** (phantom)  | **Do not use** — poisoned/ambiguous       |
| **HLVS V2 → schema `vstudio`, app `apps/venture-studio`** | This new intelligence platform                           | The subject of this document              |

The new schema is deliberately named **`vstudio`** to avoid the `hlvs` (Factory) collision and the `venture_studio` (phantom) association that caused the confusion documented in the forensic trace.

---

## 1. Executive architecture

### The one-sentence model

> **HLVS V2 watches the world for software opportunities, thinks about each one against everything Herman Legacy already owns, and gives the CEO a ranked, honest, decision-ready recommendation — then, on approval, feeds the winners into the Factory that already knows how to build them.**

### Four engines, one dashboard, on the HL-BOS spine

```
   OUTSIDE WORLD                         HLVS V2 (new: schema vstudio + workers + UI)                    HL-BOS (reused, unchanged)
 ┌──────────────┐   integrations   ┌───────────────┐   ai.runs   ┌────────────────┐   graph/catalog  ┌──────────────────────┐
 │ GitHub · HN  │  connectors +    │ 1. DISCOVERY  │  (metered)  │ 2. INTELLIGENCE│   traversal      │ identity · ai        │
 │ Reddit · PH  │─ sync_runs ─────▶│    ENGINE     │────────────▶│    ENGINE      │─────────────────▶│ integrations · graph │
 │ YC · USPTO   │  (real data)     │ opportunities │             │ Build/Buy/     │                  │ events · discovery   │
 │ SBIR · Grants│                  │ + signals     │             │ Partner/Ignore │                  │ workflows · audit    │
 │ arXiv · OSS  │                  └───────┬───────┘             └───────┬────────┘                  └──────────┬───────────┘
 └──────────────┘                          │                            │                                      │
                                           ▼                            ▼                                      ▼
                                   ┌────────────────┐          ┌────────────────────┐              ┌────────────────────────┐
                                   │ 3. FACTORY     │          │ 4. PORTFOLIO       │              │ hlvs Software Factory  │
                                   │  RECOMMENDATION│◀────────▶│    INTELLIGENCE    │─ on BUILD ──▶ │ extraction_candidates  │
                                   │ reuse · effort │          │ which products get │  (governed)  │ → software_creation_   │
                                   │ · cost savings │          │ stronger · leverage│              │   orders (Factory API) │
                                   └───────┬────────┘          └─────────┬──────────┘              └────────────────────────┘
                                           └───────────┬────────────────┘
                                                       ▼
                                        ┌─────────────────────────────┐
                                        │   5. EXECUTIVE DASHBOARD     │   CEO decides: Build/Buy/Partner/Ignore
                                        │   (ranked, honest, gated)    │   (workflows.approvals — the only authoritative act)
                                        └─────────────────────────────┘
```

### Reuse ledger (assemble, don't rebuild)

| HLVS V2 needs                                              | Provided by (existing HL-BOS)                                                                       | Net-new?                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Auth, CEO/admin access, RLS boundary                       | `identity.*` + Supabase Auth                                                                        | Reuse                                                       |
| External source ingestion (polling, webhooks, credentials) | `integrations.*` (connectors, connections, sync_runs, webhooks) + Vault                             | Reuse                                                       |
| AI reasoning (metered, budgeted, guardrailed)              | `ai.*` gateway (`runs`, `prompts`, `budgets`, `guardrails`)                                         | Reuse                                                       |
| Portfolio/opportunity relationships                        | `graph.*` (nodes/edges) + `@hl-bos/catalog` graph                                                   | Reuse                                                       |
| Event-driven workers                                       | `events.*` (outbox/subscriptions/handlers)                                                          | Reuse                                                       |
| Scoring substrate                                          | `discovery.*` (`score_dimensions`, `evidence`, `recommendation_rules`)                              | Reuse pattern                                               |
| Build execution                                            | `hlvs.*` Factory (`extraction_candidates` → `software_creation_orders`)                             | Reuse (handoff)                                             |
| Human approval gates                                       | `workflows.*` (`instances`, `tasks`, `approvals`)                                                   | Reuse                                                       |
| Revenue grounding                                          | `sales.*`, `billing.*`, `entitlements.*`                                                            | Reuse (read)                                                |
| Append-only audit                                          | `audit.*`                                                                                           | Reuse                                                       |
| Portfolio engine, opportunity catalog                      | `@hl-bos/catalog` (`OPPORTUNITY_CATALOG`, `portfolioDashboard`, `evaluateIdea`, `capability-reuse`) | Reuse                                                       |
| **Opportunity intelligence layer**                         | —                                                                                                   | **New: schema `vstudio` + workers + `apps/venture-studio`** |

---

## 2. Database architecture

**One new schema — `vstudio`** — a thin intelligence layer; everything heavy is a foreign reference into existing schemas. Same governance as the rest of Core: RLS on every table, permission-based access via `identity.has_permission`, `anon` revoked, append-only audit, definer RPCs for writes. **No migration is applied without CEO approval.**

| Table                              | Purpose                                                                                                                                                   | Key reuse links                                                | Honesty rule                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `vstudio.sources`                  | Registry of the 13 discovery sources (GitHub, Reddit, HN, Product Hunt, Acquire.com, IndieHackers, YC, USPTO, SBIR/STTR, Grants, OSS, arXiv, startup DBs) | each → `integrations.connectors.id`                            | `status` = connected / not_connected; a source with no connection reports **no data**, never zero-as-success |
| `vstudio.opportunities`            | One discovered opportunity                                                                                                                                | `source_id`, dedup `fingerprint`, `first_seen_at`              | Only real ingested items; `raw_ref` preserves provenance                                                     |
| `vstudio.opportunity_signals`      | Raw evidence per opportunity (stars, upvotes, funding, patent no., grant id)                                                                              | mirrors `discovery.evidence`                                   | Signals are stored verbatim from source; missing = absent, not 0                                             |
| `vstudio.intelligence_assessments` | The **Build/Buy/Partner/Ignore** determination                                                                                                            | `ai_run_id → ai.runs.id`, `methodology`, `confidence`          | AI-produced, **advisory**; `authoritative = false` always; human review status tracked                       |
| `vstudio.reuse_analyses`           | Factory Recommendation: reusable capabilities, overlapping products, effort, cost savings, complexity                                                     | `hlvs.capabilities`, `@hl-bos/catalog` products                | effort/savings are `Estimate` typed (estimated/measured/unknown) + assumptions                               |
| `vstudio.portfolio_impacts`        | Which products get stronger, which shared services reused, new platform leverage                                                                          | `graph.nodes`/`graph.edges`                                    | impact strength labeled; "new leverage" flagged, not asserted as revenue                                     |
| `vstudio.scores`                   | Composite + per-dimension scores (ROI, strategic fit, reuse, revenue potential, competitive, complexity)                                                  | pattern from `discovery.score_dimensions`                      | **deterministic**, reproducible; each dimension carries its inputs                                           |
| `vstudio.decisions`                | The CEO decision (Build/Buy/Partner/Ignore + priority + rationale)                                                                                        | `workflows.approvals`, `identity` (who)                        | the **only authoritative record**; immutable once approved (audit)                                           |
| `vstudio.factory_handoffs`         | Bridge record when a Build decision enters the Factory                                                                                                    | `hlvs.extraction_candidates` / `hlvs.software_creation_orders` | created only via the governed Factory RPC, never hand-seeded                                                 |

**Graph projection.** Opportunities, products, capabilities, and shared services become `graph.nodes`; "reuses", "overlaps", "strengthens", "competes-with" become `graph.edges` (new `edge_kinds`). Portfolio Intelligence is then a **graph traversal**, reusing `@hl-bos/catalog`'s `graph-traverse` — not a new engine.

**Row counts / seeding.** The `vstudio.sources` registry is seed reference data (13 rows). Everything else starts **empty and honest** — the dashboard shows "no opportunities discovered yet / source not connected" until real ingestion runs.

---

## 3. UI architecture

**New app: `apps/venture-studio`** (Next.js, standalone), assembled from the **`executive-portal` pattern** exactly — same Supabase SSR auth (`session.ts`/`middleware.ts`), same Dockerfile/Coolify shape, same security headers. Internal, CEO/executive-only, `identity`-gated. Read-only by default; the **only write is a CEO decision** (permission-checked + approval-gated).

| Route                     | Purpose                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/` (Executive Dashboard) | The CEO cockpit (section 8)                                                                                                   |
| `/opportunities`          | Ranked, filterable feed (by source, decision, score, reuse)                                                                   |
| `/opportunities/[id]`     | Full intelligence view: signals → B/B/P/I assessment + rationale → reuse map → portfolio impact → scores → **decision panel** |
| `/portfolio`              | The Herman Legacy ecosystem graph (products, maturity, shared-service reuse)                                                  |
| `/sources`                | Discovery source health (connected? last sync? items? errors?) — honest states                                                |
| `/factory`                | Handoffs into the `hlvs` Factory + their status                                                                               |

**Component reuse.** Cards, tables, honest no-data panels, and the `PortalShell` come from the existing `executive-portal`/`ui` components. Every estimate renders with a visible **"est."** badge and a hover of its methodology/confidence. No number is shown without provenance.

---

## 4. Discovery workflow

```
sources (13, some connected) ──▶ scheduler (events.subscriptions) ──▶ integrations.sync_run per source
   ──▶ discovery worker (edge function; reuses the built runtime pattern)
       • fetches from the external API (real, rate-limited, ToS/robots respected)
       • credentials from Vault via integrations.connections (never committed)
       • normalizes + fingerprints (dedup) ──▶ vstudio.opportunities (+ opportunity_signals)
   ──▶ emits events.outbox "opportunity.discovered"
```

- **Source tiers by access cost:** _public/no-auth_ (GitHub public, Hacker News/Algolia, arXiv, USPTO, SBIR, Grants.gov, OSS) → connect first; _auth/rate-limited_ (Reddit, Product Hunt, YC) → next; _ToS-sensitive/commercial_ (Acquire.com, IndieHackers, startup DBs) → require an explicit legal/ToS check before connection. The registry records each source's tier and legal posture.
- **Honesty:** a source that is not connected produces **no opportunities and says so**; the pipeline never fabricates listings to fill the feed.
- **Idempotent & incremental:** `fingerprint` dedup + `sync_runs` cursors mean re-runs don't duplicate; only real new items appear.

---

## 5. Intelligence workflow

```
opportunity.discovered ──▶ intelligence worker
   1. gather signals + graph context (existing products/capabilities that overlap)
   2. ai gateway call (ai.runs; budget + guardrails enforced; real tokens)
        → structured Build/Buy/Partner/Ignore + rationale + confidence
        → vstudio.intelligence_assessments  (authoritative = false)
   3. deterministic scoring (NOT AI) → vstudio.scores  (ROI, strategic fit, reuse, revenue, competitive, complexity)
   4. reuse analysis vs hlvs.capabilities + catalog products → vstudio.reuse_analyses
   5. portfolio impact via graph traversal → vstudio.portfolio_impacts
   6. surface to dashboard as a ranked recommendation (still just a recommendation)
```

- **Build / Buy / Partner / Ignore** is produced by AI as **advice**, then combined with **deterministic** reuse and scoring signals. The recommendation is decision-_support_; the CEO's `vstudio.decisions` entry is the decision.
- **Confidence & methodology are first-class:** every assessment stores which model/prompt version ran (`ai.prompt_versions`), the inputs, and a confidence band. Low-confidence items are flagged, never hidden or inflated.
- **No outcome invention:** revenue potential is a _modeled projection_ with visible assumptions; it is never reported as booked ARR. Actual revenue is read only from `sales`/`billing` when it truly exists.

---

## 6. Recommendation engine (Factory Recommendation)

For every opportunity, deterministically computed and stored in `vstudio.reuse_analyses` + `vstudio.scores`:

| Output                               | How it's derived (reuse)                                                 | Label                        |
| ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------- |
| Reusable HL-BOS capabilities         | match against `hlvs.capabilities` + `@hl-bos/catalog` `capability-reuse` | measured (from catalog)      |
| Overlapping existing products        | graph overlap vs `app-registry` / `OPPORTUNITY_CATALOG`                  | measured                     |
| Estimated development effort         | reuse ratio × baseline from `@hl-bos/catalog` metrics                    | **estimated** + method       |
| Estimated cost savings through reuse | (net-new vs reused) × effort model                                       | **estimated** + method       |
| Strategic fit                        | rubric over focus markets + portfolio                                    | **estimated**                |
| Revenue potential                    | modeled from comparable products (assumptions shown)                     | **estimated / unknown**      |
| Competitive landscape                | signals + AI summary (advisory, cited)                                   | **estimated**                |
| Technical complexity                 | net-new surface × integration count                                      | **estimated**                |
| **Reuse score**                      | % of required capability already owned                                   | **measured** (deterministic) |

The **reuse score is the anchor metric** — it is measurable (we know what HL-BOS owns), and it is the truest expression of the "assemble, don't rebuild" law: high reuse = cheap, fast, low-risk; low reuse = expensive net-new.

---

## 7. Factory integration

HLVS V2 **decides what to build; the `hlvs` Factory governs building it.** The bridge is the Factory's own intake mechanism — reused, never duplicated:

```
CEO decision = BUILD  ──▶ vstudio.factory_handoffs
   ──▶ (governed Factory RPC) create hlvs.extraction_candidates  (status: candidate — requires human advance)
   ──▶ optionally draft hlvs.software_creation_orders            (status: draft — CEO/architecture review)
   ──▶ Factory closed loop takes over: blueprint → creation order → dev run → conformance → build package → HL-BOS intake
```

- Writes into `hlvs.*` happen **only through the governed Factory interface** (definer RPCs), matching `docs/architecture/72` ("never by hand-editing seeds").
- **Buy / Partner / Ignore** decisions never touch the Factory: Buy/Partner may open a `sales`/workflow record; Ignore is archived with rationale and can resurface if new signals arrive.
- The Factory remains the single source of truth for _build state_; HLVS V2 reads it back for the dashboard's **Factory utilization** panel.

---

## 8. Executive dashboard (CEO)

The cockpit at `/`. Every tile is **real or explicitly empty**, every projection **labeled**.

| Tile                         | Source                                           | Honesty state                             |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------- |
| New opportunities discovered | `vstudio.opportunities` (by source, time)        | "0 — sources not yet connected" when true |
| Highest ROI opportunities    | `vstudio.scores` (ROI dim)                       | each carries "est." + method              |
| Highest strategic value      | `vstudio.scores` (strategic dim)                 | labeled                                   |
| Highest reuse score          | `vstudio.reuse_analyses` (**measured**)          | the trustworthy headline metric           |
| Estimated build time         | `vstudio.reuse_analyses`                         | "est." + assumptions                      |
| Estimated ARR                | `vstudio.scores` (revenue model)                 | **projection**, never booked ARR          |
| Priority ranking             | deterministic composite                          | reproducible                              |
| Portfolio health             | `graph` + `@hl-bos/catalog` `portfolioDashboard` | real maturity per product                 |
| Factory utilization          | `hlvs.*` (active orders/capacity)                | real Factory state                        |

**Portfolio Intelligence honesty note.** The ecosystem list (Herman Legacy Digital, Venuewise, FleetHuddle, TransportationAI, SalonAI, BroadcastAI, HighlightAI, AI Football/Hockey Film Study, Discovery Engine, VisibilityAI) is **classified by real maturity**, not shown as uniformly live: e.g. Herman Legacy Digital = **built**; Discovery/VisibilityAI = **live capability schemas** (`discovery`, `visibility`); FleetHuddle/TransportationAI/SalonAI/BroadcastAI/HighlightAI/film-study = **concept/opportunity** entries in `OPPORTUNITY_CATALOG`; Venuewise = **legacy/organizational**. The dashboard shows each product's true state — an "opportunity that strengthens SalonAI" is framed against SalonAI's _concept_ status, not a pretend live product.

---

## 9. Implementation roadmap

Reuse-first, each phase ending in a **working capability or a merge-ready PR** — never a plan handed back to the CEO. No migration is applied without explicit CEO approval; `main` stays protected.

| Phase                                 | Deliverable (assembled)                                                                                                                                                              | Reuses                                | Ends with                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------ |
| **V2-1 · Foundation**                 | `vstudio` schema migration (9 tables + RLS + definer RPCs + pgTAP) **written, not applied**; `sources` seed (13); `@hl-bos/venture-studio` package skeleton                          | identity, audit, migration governance | Green PR + approval-gated migration                                |
| **V2-2 · Discovery (public sources)** | `integrations` connectors + a discovery worker for the **no-auth** sources (GitHub public, Hacker News, arXiv, USPTO, SBIR, Grants, OSS); real ingestion → `opportunities`/`signals` | integrations, events, Vault           | Real opportunities flowing; honest no-data for unconnected sources |
| **V2-3 · Intelligence**               | intelligence worker: `ai`-gateway B/B/P/I assessments + deterministic scoring                                                                                                        | ai gateway, discovery scoring         | Assessments + scores on real opportunities                         |
| **V2-4 · Recommendation + Portfolio** | reuse analyses (vs `hlvs.capabilities`/catalog) + graph portfolio-impact projection                                                                                                  | graph, `@hl-bos/catalog`              | Reuse score + portfolio impact per opportunity                     |
| **V2-5 · Executive Dashboard UI**     | `apps/venture-studio` (executive-portal pattern): dashboard + opportunities + detail + decision panel                                                                                | executive-portal auth/deploy/UI       | CEO can review + decide, gated                                     |
| **V2-6 · Factory handoff**            | Build-decision → governed `hlvs` Factory intake; Factory-utilization read-back                                                                                                       | hlvs Factory RPCs, workflows          | Closed loop: discover → decide → build                             |
| **V2-7 · Auth’d & sensitive sources** | Reddit, Product Hunt, YC (auth); Acquire.com/IndieHackers/startup DBs **after ToS/legal check**                                                                                      | integrations                          | Broader real coverage, legally cleared                             |

**Cross-cutting, every phase:** RLS + permission checks on all new objects; append-only audit; no service-role key; real-tokens-only AI; honest empty states; no fabricated metrics. Registered in `app-registry.ts` + `registry.ts` (catalog governance).

---

## Risks & guardrails (named, not hidden)

1. **External ToS / scraping legality** — Acquire.com, IndieHackers, and some startup DBs restrict automated access. **Guardrail:** each source carries a legal-posture flag; sensitive sources stay disconnected until an explicit CEO/legal go-ahead. Prefer official APIs.
2. **AI over-trust** — a slick Build/Buy/Partner/Ignore label can read as fact. **Guardrail:** `authoritative = false`, confidence bands visible, deterministic reuse score as the anchor, CEO decision as the only authority.
3. **Estimate inflation** — ROI/ARR numbers invite optimism. **Guardrail:** typed `Estimate` (estimated/measured/unknown) + stored assumptions + methodology surfaced in the UI; booked revenue read only from `sales`/`billing`.
4. **Cost of continuous AI + polling** — **Guardrail:** `ai.budgets`/`guardrails` cap spend; `sync_runs` are scheduled + incremental; sources rate-limited.
5. **Naming confusion** — **Guardrail:** schema `vstudio`, app `venture-studio`; never `venture_studio`, never conflated with the `hlvs` Factory.

---

## Definition of done for the design phase

This document delivers all nine required artifacts (executive architecture, database, UI, discovery workflow, intelligence workflow, recommendation engine, factory integration, executive dashboard, roadmap), grounded in **verified** HL-BOS assets, honoring _assemble-don't-rebuild_ and the honesty doctrine. The next step is **CEO approval to begin V2-1**, whose copy-paste prompt follows.
