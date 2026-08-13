# HLVS V2 — Master Capability & Architecture Audit

**Status:** Read-only audit, persisted as the canonical HLVS knowledge baseline under narrow CEO approval.
**Verification date:** 2026-08-13
**Author:** Claude (AI engineer)
**Companion artifact:** [`.hlbos/hlvs-capability-registry.json`](../hlvs-capability-registry.json)

> **Authority rule.** Repository code, live database introspection, and deployment
> configuration are authoritative. Planning docs, READMEs and milestone prose are
> not — where they conflict, code/DB/deploy wins, and the conflict is recorded
> under **Documentation drift**. Maturity is never inflated:
> **BUILT ≠ MERGED ≠ APPLIED ≠ DEPLOYED ≠ VERIFIED FUNCTIONAL.** Unknown stays UNKNOWN.

---

## 1. Evidence sources

- **Live Supabase introspection of HL-BOS Core (`mvvtngiopdrgiedjmhfb`), 2026-08-13:** schema census (`pg_namespace`/`pg_class`), row estimates (`pg_stat_user_tables`), enum vocabularies (`pg_enum`), column shapes (`information_schema.columns`), `list_migrations`, `list_edge_functions`.
- **Repository clone** `KeithVenuewise73/hl-bos-platform` @ `main` (HEAD `c562ca4`): `apps/`, `packages/`, `supabase/migrations/`, `supabase/functions/`, `.hlbos/`.
- **Governance files:** `.hlbos/canonical.json`, `.hlbos/milestone.json`, `.hlbos/migration-lineage.json`.
- **GitHub PR history** for `hl-bos-platform` (PRs #9–#46).
- **Exclusion evidence:** `KeithVenuewise73/homehuddle` serves `venuewise.net` (CNAME + 368 refs), contains zero HLVS code, and connects only to the **Venuewise Platform** project (`urwnbskrtoplgnkkxuvl`) — it is not part of HLVS.

## 2. Canonical repository & database

| Item                              | Value                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Canonical repository              | `KeithVenuewise73/hl-bos-platform` (private, pnpm/turbo monorepo)                |
| Audited branch / HEAD             | `main` @ `c562ca4`                                                               |
| Canonical database                | **HL-BOS Core** `mvvtngiopdrgiedjmhfb`, us-west-2                                |
| Organization                      | Herman Legacy Software Ventures (`ihtsbcxtvkbfkkpmforp`)                         |
| Applied `hlbos_*` migrations (DB) | **0001–0029**                                                                    |
| `hlbos_*` migrations in repo main | **0001–0031** (0030, 0031 present but **UNAPPLIED**)                             |
| Deployed edge functions (DB)      | **0**                                                                            |
| `pg_cron`                         | not installed (no scheduled ingestion runs)                                      |
| Data-bearing                      | seed/vocabulary only; all `vstudio.*` and operational `hlvs.*` tables **0 rows** |
| Intended production URL           | `https://hermanlegacydigital.com/HLVS` — **not routed or hosted**                |

Pinned by `.hlbos/canonical.json` and enforced by `.github/workflows/db-migrate.yml` (“Canonical project ref: `mvvtngiopdrgiedjmhfb`… See ADR-0001”).

## 3. Application inventory (`apps/`)

| App                      | Role                                                                     | HLVS relevance                                                                                     | Deploy state                |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------- |
| `venture-studio`         | **HLVS V2** — executive opportunity intelligence                         | **Primary HLVS app** (routes `/`, `/opportunities`, `/notebook`, `/settings`, `/login`, `/logout`) | Built, **not deployed**     |
| `herman-legacy-digital`  | Customer-facing hermanlegacydigital.com (marketing + intake + `/portal`) | Intended **host** of `/HLVS`; no `/HLVS` route today                                               | Built, **not deployed**     |
| `control-center`         | Internal ops console (catalog, factory assembly, status)                 | Hosts Software Factory + capability views                                                          | Built                       |
| `executive-portal`       | Read-only executive portal                                               | Portfolio / intelligence views                                                                     | Staging-ready, not deployed |
| `hl-bti`, `hl-bti-alpha` | Business Transformation Intelligence                                     | Adjacent BTI lineage                                                                               | Built                       |
| `hscs-website`           | HSCS Government Logistics site                                           | Not HLVS                                                                                           | Coolify preview enabled     |

## 4. Feature inventory (HLVS)

Opportunity capture & catalog · deterministic reuse/duplicate analysis · 11-dimension weighted evaluation (0–100) · advisory recommendation vs authoritative CEO decision · read-only factory-readiness preview · CEO Notebook (on `vstudio.notes`) · opportunity pipeline (B2, open PR) · discovery source registry (stub) · HLVS Software Factory (schema + worker) · portfolio/application registry. Each is enumerated with evidence in the **capability registry**.

## 5. Reuse inventory (HL-BOS shared, reusable now)

`identity` (roles 8, permissions 115, role_permissions 347; Supabase Auth + RLS) · `audit.events` (213, functioning) · `ai` gateway (providers/models/prompts; `ai.runs` **0** — never invoked) · `comms` (providers 4, templates 2; 0 sent) · `events` (handlers 4, subscriptions 4, outbox 2) · `integrations.connectors` (5) · `billing`/`entitlements` (plans/features seeded) · `graph` read-model (node_types 17, edge_kinds 21; migration 0028 applied, nodes/edges 0) · `platform.tenants` (3) · `@hl-bos/catalog` (reuse/factory/portfolio modeling).

## 6. Database / migration inventory

- **HLVS-relevant schemas (HL-BOS Core):** `vstudio` (6 tables, all 0 rows), `hlvs` (19 tables — seed only: products 7, capabilities 10, industry_templates 7, extraction_candidates 12; operational tables 0), `discovery` (19 — website/business assessment, seed only), `dma` (28 + 1 view — market intelligence, seeded for HomeHuddle `hh001`).
- **`vstudio` enums:** `opportunity_status` = inbox, researching, evaluated, watch, approved, rejected, archived · `recommendation` = build, buy, partner, watch, ignore · `decision` = build, buy, partner, watch, ignore, defer · `opportunity_type` = greenfield_product, feature_expansion, acquisition_target, partnership, open_source_leverage, research_to_product, market_gap.
- **Migration status:** repo main carries `hlbos_0001–0031`; DB has `0001–0029` applied. `0030` (CEO Notebook) and `0031` (transformation intake) are **UNAPPLIED**. Migration `0029` (vstudio) is **applied** (6 tables, RLS forced, 5 permissions, 8 SECURITY DEFINER functions) — this contradicts stale “unapplied” text in `apps/venture-studio` (see Documentation drift).
- **Lineage discrepancy:** the `dma_*` migrations are **applied in production** (`dma_0001…0016`) and the `dma` schema is populated, but **no `dma_*` migration files exist in repo main** and `migration-lineage.json` counts only 31 `hlbos_*` files. Source of the applied `dma` schema is **UNKNOWN** from `main` — flagged for investigation.

## 7. Worker inventory (`supabase/functions/`, in repo)

`ai-gateway` · `billing-webhook` · `commerce-worker` · `discovery-blueprint-worker` · `discovery-website-worker` · `events-dispatcher` · `hlvs-factory-worker`. Shared: `_shared/hlvs/{readiness,conformance,adapter,prompt}.ts`. **None are deployed** (HL-BOS Core reports 0 edge functions). The two `discovery-*` workers serve **website/business assessment**, not opportunity ingestion (name collision with CAP-08).

## 8. PR history (HLVS-relevant)

| PR      | Title                                                                 | State       |
| ------- | --------------------------------------------------------------------- | ----------- |
| #20     | Herman Legacy Digital app + Software Factory foundation (Phases 1–6A) | merged      |
| #21     | HLVS V2 (V2-1): Venture Studio foundation                             | merged      |
| #22     | Reconcile production governance + deployment package (V2-1)           | merged      |
| #23     | Record internal tenant provisioning (V2-1)                            | open (docs) |
| #24     | HLVS-V2 program plan + first prompts (B1, B2)                         | open (docs) |
| #25     | CEO Notebook — B1                                                     | **merged**  |
| **#26** | **Opportunity Intelligence Pipeline — B2**                            | **open**    |
| #27     | HLD Operating Model V1                                                | open (docs) |
| #28     | Business Transformation Digital Intake V1 (migration 0031)            | merged      |

Adjacent (BTI/BTIC/HSCS/HLD): #30, #32, #33, #34, #37, #39–#46. Dependabot: #9, #12, #17, #38.

## 9. Duplication / overlap matrix

| Surface                                               | Concern                                                                                   | Do NOT collapse with                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `vstudio`                                             | Opportunity intelligence (system-of-record for opportunities)                             | `hlvs`, `catalog`                                                     |
| `hlvs`                                                | Software Factory (system-of-record for builds)                                            | `vstudio`, `catalog`                                                  |
| `@hl-bos/catalog`                                     | Reuse/module/factory/portfolio **modeling library**                                       | the schemas above                                                     |
| `@hl-bos/transformation-intelligence` (`src/hlvs.ts`) | Assessment → software-opportunity **bridge** (`SoftwareOpportunity`/`OpportunityVerdict`) | the `vstudio` opportunity funnel — **overlap requires clarification** |
| `discovery` schema + `discovery-*-worker`             | Website/business **assessment**                                                           | CAP-08 opportunity **connector ingestion** (name collision only)      |
| `dma.opportunity_scores`                              | Market analysis for existing HL offerings                                                 | `vstudio.evaluations`                                                 |
| HLD / BTI / BTIC                                      | Adjacent transformation/business intelligence product                                     | Venture Studio (not a replacement)                                    |

## 10. Maturity matrix

| Capability                                    | Status                                           | Recommended action |
| --------------------------------------------- | ------------------------------------------------ | ------------------ |
| CAP-01 Opportunity Capture & Catalog          | APPLIED (app built, undeployed; 0 rows)          | COMPLETE_EXISTING  |
| CAP-02 Reuse / Duplicate Analysis             | MERGED                                           | REUSE_AS_IS        |
| CAP-03 Evaluation Scoring                     | MERGED (table applied, empty)                    | REUSE_AS_IS        |
| CAP-04 Advisory Recommendation & CEO Decision | MERGED (tables applied, empty)                   | REUSE_AS_IS        |
| CAP-05 Factory Readiness Preview              | MERGED                                           | REUSE_AS_IS        |
| CAP-06 CEO Notebook                           | MERGED (migration 0030 **UNAPPLIED**)            | COMPLETE_EXISTING  |
| CAP-07 Opportunity Pipeline (B2)              | OPEN_PR (#26)                                    | COMPLETE_EXISTING  |
| CAP-08 Discovery / Connector Ingestion        | STUB                                             | NET_NEW_GAP        |
| CAP-09 HLVS Software Factory                  | PARTIAL (schema applied/seed; worker undeployed) | COMPLETE_EXISTING  |
| CAP-10 /HLVS Production Mounting              | PLANNED                                          | NET_NEW_GAP        |
| CAP-11 Portfolio & Application Registry       | MERGED (read-only; no economics)                 | EXTEND             |

## 11. Capability registry explanation

`.hlbos/hlvs-capability-registry.json` is the machine-readable source of truth. Every capability records `capability_id`, name, description, category, `canonical_implementation`, `application`, `package`, `schema`, `tables`, `functions`, `apis`, `workers`, `status`, `reusable_hlbos_dependencies`, `open_pr_dependencies`, `known_overlap`, `known_limitations`, `recommended_action`, `last_verified_date`, plus a `maturity_breakdown` per capability so a single `status` token never hides the layer-by-layer truth. Vocabularies for status and action are embedded in the file.

## 12. Architecture map

```
Discovery sources (STUB, CAP-08)  ─┐
                                   ▼
        vstudio  (Opportunity Intelligence — system of record)
   opportunities → evidence → evaluations(11-dim 0–100) → recommendations(advisory)
                                   │
                             CEO DECISION (authoritative)  ── vstudio.decisions
                                   │  factory_authorized
                                   ▼
   Factory Readiness Preview (read-only, CAP-05)
                                   ▼
        hlvs  (Software Factory — system of record, CAP-09)
   products → product_blueprints → software_creation_orders → factory_build_packages
                                   │  (hlvs-factory-worker — undeployed)
                                   ▼
        Portfolio / Application Registry (CAP-11, @hl-bos/catalog)

Reuse/Duplicate engine (@hl-bos/catalog, CAP-02) feeds evaluation & readiness.
Reusable HL-BOS: identity · audit · ai gateway · events · integrations · comms · billing · graph · platform.tenants.
Intended surface: hermanlegacydigital.com/HLVS (CAP-10, PLANNED) hosts apps/venture-studio.
```

## 13. Workflow map (intended, honest state)

`DISCOVER (stub)` → `CAPTURE (applied, empty)` → `EVALUATE (merged, empty)` → `RECOMMEND (advisory, merged)` → `CEO DECIDE (authoritative)` → `FACTORY READINESS (preview)` → `BUILD (hlvs, partial/seeded)` → `PORTFOLIO (read-only)`. No candidate has traversed any of it in production (0 rows end to end).

## 14. Genuine gaps

1. **Discovery ingestion (CAP-08):** connectors, persisted signal model, and cross-source (≥3 categories) validation are unbuilt; only a 13-source stub exists.
2. **/HLVS mounting (CAP-10):** no route, no host, no DNS; the host app itself is undeployed.
3. **Portfolio economics (CAP-11):** no live micro-product metrics (downloads/MRR/ARR/CAC/churn/margin) ingestion.
4. **Deployment:** 0 edge functions deployed; no app host chosen; `vstudio` not exposed over the API.
5. **Factory execution (CAP-09):** schema seeded but no build has run; autonomous codegen implied by `hlvs.order_status` is unauthorized and unbuilt.

## 15. Technical debt

- Worker fleet built but undeployed → drift risk between code and a future first deploy.
- `recommendation`/`decision` taxonomy (build/buy/partner/watch/ignore[/defer]) diverges from the CEO Phase-1 `BUILD/TEST/REJECT` model — a governance reconciliation, tracked so it is not silently resolved in code.
- 11-dimension evaluation set differs from the Phase-1 17-dimension list.
- `dma` schema applied to production without corresponding migration files in repo main (lineage gap).

## 16. Documentation drift (code/DB is authoritative)

- `apps/venture-studio` README + `lib/data.ts`: state the `vstudio` migration (0029) is “unapplied pending CEO approval.” **DB shows 0029 applied** (empty). → stale.
- `.hlbos/milestone.json`: describes CEO Notebook (B1) as “PR opened, not merged.” **PR #25 is merged** to main. → stale.
- Root `README.md`: “no application… apps/ none yet.” **7 apps and many packages exist.** → stale.
- `dma_*` migrations applied in production but **absent from repo main** and from `migration-lineage.json` (count 31, `hlbos_*` only). → source UNKNOWN, needs investigation.

## 17. ChatGPT / Claude operating protocol (mandatory preflight)

Before any future HLVS design or implementation, an AI (or human) agent must:

1. Check this Capability Registry (`.hlbos/hlvs-capability-registry.json`).
2. Check current `main` of `hl-bos-platform`.
3. Check relevant open PRs (esp. **#26** B2, and docs #23/#24/#27).
4. Check reusable HL-BOS capabilities (identity, tenancy, audit, ai gateway, events, integrations, comms, billing, graph).
5. Classify the proposed work as **REUSE / EXTEND / CONSOLIDATE / NET_NEW**.
6. Only then design the implementation.

**NET_NEW requires explicit evidence that no reusable implementation exists.** Assemble — do not rebuild. Honesty over appearance. One product.

## 18. CEO approval gates (open)

- Apply migration **0030** (CEO Notebook) — written/CI-verified, UNAPPLIED.
- Apply migration **0031** (transformation intake) — in main, UNAPPLIED.
- Merge **PR #26** (B2 Opportunity Pipeline).
- Deploy the Venture Studio app + expose `vstudio` over the API + choose `VSTUDIO_TENANT_ID`.
- Choose application hosting (no Vercel/Coolify) and deploy edge-function workers (0 deployed).
- Configure **/HLVS** mounting on hermanlegacydigital.com + DNS.
- Authorize discovery connectors / external ingestion (V2-2).
- Authorize any autonomous Software Factory codegen (implied by `hlvs.order_status`; **not** authorized).

---

_Persisted as a read-only knowledge baseline. No application code, package, migration, PR, CI, `canonical.json`, `milestone.json`, `migration-lineage.json`, infrastructure, DNS, or deployment was modified in producing this audit._
