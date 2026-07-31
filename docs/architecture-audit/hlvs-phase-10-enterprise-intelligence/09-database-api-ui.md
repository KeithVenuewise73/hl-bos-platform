# 9–11 · Recommended Database Extensions, API Structure & UI Architecture

**All proposed. No migration is written or applied. No code is modified.** These are design recommendations for Phase XI to implement under CEO approval.

---

## 9 · Recommended database extensions

Follow the existing house invariants exactly: **RLS + FORCE on every table; config-as-rows (no enums baked in code); no tenant write path (SECURITY DEFINER RPCs re-check `identity.has_permission`); `events.emit` + `audit.emit` triggers; catalogs world-readable to `authenticated`, tenant data permission-gated.**

### New schema: `catalog` (Enterprise Catalog read model)

Projects the in-code catalog + Application Registry + Capability Library into queryable tables.

| Table                        | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `catalog.assets`             | materialized assets (kind, maturity, owner, layer)   |
| `catalog.relationships`      | the dependency graph edges                           |
| `catalog.capabilities`       | canonical Capability Library (§5)                    |
| `catalog.capability_modules` | capability ↔ providing module                        |
| `catalog.applications`       | Application Registry (deployment/operational fields) |
| `catalog.deployments`        | deploy history (env, url, commit, status, at)        |
| `catalog.business_units`     | HSCS, HL Digital, 5 Star, Venuewise…                 |

### Extend `discovery` (Discovery Engine, §4)

| Table                             | Purpose                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `discovery.research_sources`      | registered external collectors (GitHub, SAM.gov, SaaS dirs) — rows, not code |
| `discovery.research_runs`         | scheduled run ledger (evidence-linked)                                       |
| `discovery.discovered_candidates` | scored opportunities (company/repo/target/RFP)                               |
| `discovery.opportunity_rules`     | rules-as-data scoring (weights/thresholds/confidence)                        |
| `discovery.build_queue`           | Claude Build Queue items → link to `hlvs.software_creation_orders`           |

Reuse existing `discovery.evidence`, `collectors`, `recommendation_rules`, `service_catalog`, `module_catalog` unchanged.

### New schema: `transportation` (greenfield vertical, §Transportation)

| Table                            | Purpose                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `transportation.assessments`     | fleet/logistics maturity (mirrors bti pattern)                                     |
| `transportation.dimensions`      | scored dimensions (fleet, dispatch, freight, fuel, maintenance, compliance) — rows |
| `transportation.scores`          | derived 0–100 per dimension (same deterministic formula)                           |
| `transportation.recommendations` | rules-as-data recommendations                                                      |

No new scoring math — it reuses the BTI weighted-mean engine with a transportation dimension pack.

### AI model catalog

Surface the existing `ai` schema's provider/model registry into `catalog.ai_models` so models are governed assets with cost/ownership like everything else.

---

## 10 · Recommended API structure

**One pattern, already proven by `public.bti_*`:** each subsystem exposes a thin, browser-reachable, `SECURITY DEFINER` RPC surface that re-checks permissions internally. Schemas are **not** PostgREST-exposed; RPCs are the only door.

| Surface               | Example RPCs                                                                      | Consumer                |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| `public.catalog_*`    | `catalog_assets()`, `catalog_application(key)`, `catalog_capabilities()`          | Portal, all subsystems  |
| `public.discovery_*`  | `discovery_opportunities()`, `discovery_candidate(id)`, `discovery_build_queue()` | Portal (HLVS)           |
| `public.bti_*`        | _(exists)_ `bti_latest_analysis`, `bti_list_businesses`…                          | Portal (HL-BTI)         |
| `public.visibility_*` | `visibility_scorecard(business)`, `visibility_competitors(business)`              | Portal (Visibility)     |
| `public.transport_*`  | `transport_fleet_summary(org)`, `transport_compliance(org)`                       | Portal (Transportation) |
| `ai-gateway` (edge)   | _(exists)_ begin/finish run, budget check                                         | all advisory AI         |

Rules:

- **Read-only for the portal.** All portal-facing RPCs are queries; writes (create order, approve) go through workflow-gated RPCs, never from the portal.
- **Advisory AI only through the gateway.** No subsystem calls a model provider directly.
- **Every RPC re-checks `identity.has_permission`.** RLS is the backstop, permissions the gate.
- **Versioned, evidence-carrying outputs** (the existing `*_VERSION` tag + `rule_key`/`rule_version` provenance).

---

## 11 · Recommended UI architecture

**One application: the Executive Portal.** Next.js App Router, read-only, Supabase-Auth, the pure `authz` role×view matrix, and the existing `components/ui.tsx` design system. No new UI framework, no per-subsystem app.

```
apps/executive-portal/src
  ├─ lib/authz.ts .............. role × view matrix + nav groups (rows per new view)
  ├─ lib/session.ts ........... server-only viewer (fail-closed, publishable key only)
  ├─ lib/<subsystem>-data.ts .. one read-only adapter per subsystem (summary/queue/search)
  ├─ components/ui.tsx ........ shared primitives (Card/Tile/Row/Bar/Dot/Grid/Empty)
  ├─ components/PortalShell.tsx grouped nav + server-side authz gate
  └─ app/<subsystem>/* ........ read-only views per subsystem
```

Principles (all carried from Phase VII–IX):

- **Add a subsystem = add an adapter + views + authz rows.** No dashboard surgery (the `IntelligenceSubsystem` contract, §7).
- **Server-side authorization on every route**; sensitive panels gated per role.
- **No command surface, no writes, no service-role key.** Safe to deploy publicly.
- **Provenance-labelled data**; honest placeholders where a source isn't connected.
- **Control Center stays local-only** — it keeps the command surface the portal must never have.

The UI grows by composition, not multiplication — which is the whole point of one platform.
