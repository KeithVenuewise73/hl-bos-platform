# HLVS V2 — Ownership & Architectural Boundary Audit

**Status:** Read-only audit, persisted as canonical governance under CEO approval.
**Verification date:** 2026-08-13
**Author:** Claude (AI engineer)
**Base:** `KeithVenuewise73/hl-bos-platform` @ `main` HEAD `30d6ad168fc0ad993db10765576515c3d357ff1b`
**Companion artifacts:** [`.hlbos/hlvs-capability-registry.json`](../hlvs-capability-registry.json) · [`.hlbos/audits/2026-08-13-hlvs-master-audit.md`](2026-08-13-hlvs-master-audit.md)

> **Authority rule.** Repository code, live database introspection, and deployment
> configuration are authoritative over prose/planning docs. Maturity is never
> inflated: **BUILT ≠ MERGED ≠ APPLIED ≠ DEPLOYED ≠ VERIFIED FUNCTIONAL.** Unknown
> stays UNKNOWN. This audit answers _who owns each responsibility_; the Master
> Audit already answers _what exists_.
>
> **Evidence:** current `main` (`30d6ad1`) read first-hand (HEAD, PR #26 topology, migration ordinal collision), plus five parallel read-only code investigators over `vstudio` / `hlvs` / `@hl-bos/catalog` / `@hl-bos/transformation-intelligence` / `integrations` / `discovery` / `ai` / `events` and PR #26 (`pr26`, tip `20e3b69`, true base `pr26~2` = `7fbc39f`). Load-bearing conclusions were cross-corroborated by ≥2 independent investigators.

---

## 1. Analysis

The architecture is already well-separated. The four Software-Factory responsibilities have distinct owners; reuse/duplicate has one real engine plus two legitimately-different consumers; `vstudio` is the uncontested opportunity system-of-record; the "HLVS" surface inside `transformation-intelligence` is **misnaming, not duplication**. The genuine issues are three: (1) a **migration ordinal collision** (`0031`) that blocks PR #26 rebase; (2) **two parallel in-code source registries** (`sources.ts` vs PR #26 `OPPORTUNITY_CONNECTORS`) that must not spawn a third in B3; and (3) the **Executive-Intelligence → Factory handoff is a single missing stitch** (an unread boolean where a function should be). Notably, **most of PR #26 fills real `vstudio` gaps** (priority, relationships) rather than duplicating anything.

## 2. Capability Registry Preflight

Read from current `main`: `.hlbos/hlvs-capability-registry.json` (11 capabilities, IDs unique) and `.hlbos/audits/2026-08-13-hlvs-master-audit.md`. HEAD confirmed `30d6ad1`. Relevant HLVS-CAP IDs: CAP-01 (Opportunity Capture/SoR), CAP-02 (Reuse/Duplicate engine), CAP-04 (Recommendation & CEO Decision), CAP-05 (Factory Readiness), CAP-07 (Opportunity Pipeline / B2, OPEN_PR), CAP-08 (Discovery/Connector, STUB), CAP-09 (Software Factory, PARTIAL); CAP-03/06/10/11 as supporting context.

## 3. Architectural Layer Ownership

| Layer                                   | Authoritative owner                                                                                                            | Supporting systems                                                   | Must NOT become alternate owner                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **A — Executive Intelligence**          | `vstudio` + `@hl-bos/venture-studio`                                                                                           | `ai.runs`, `events`, `storage_meta`, `@hl-bos/catalog` (reuse input) | `hlvs`, `@hl-bos/catalog`, `transformation-intelligence`                                                     |
| **B — Reuse Intelligence**              | `@hl-bos/catalog` (`capability-reuse.ts`, `factory-registry.ts`, `MODULE_REGISTRY`)                                            | `graph` read-model, `capabilities`/`modules`                         | `hlvs.duplicate_check` rule logic; `venture-studio/reuse.ts` (consumer only)                                 |
| **C — Software Factory**                | `hlvs` schema (SoR) + `hlvs-factory-worker` (execution, **inert**)                                                             | `@hl-bos/catalog` (modeling), `workflows`, `provisioning`, `ai`      | `vstudio` (never writes factory); `@hl-bos/catalog` (models, never authorizes)                               |
| **D — Transformation Intelligence**     | `@hl-bos/transformation-intelligence` + `apps/herman-legacy-digital` + `bti-*`/`bte-pipeline`                                  | `@hl-bos/catalog` (shared factory), `discovery`, `visibility`        | Venture Studio / `vstudio` (BTI must not become a second venture funnel)                                     |
| **E — External Intelligence Ingestion** | `integrations` (connectors/credentials/sync) + `ai` (enrichment) + `events` (bus); normalized output → `vstudio.opportunities` | `venture-studio/sources.ts` (display catalog only)                   | `discovery` schema (customer assessment, wrong domain); any second in-code connector framework (PR #26 / B3) |

All five layers are supported by evidence: zero cross-imports between `venture-studio` and `transformation-intelligence`; the `hlvs` migration header reuses identity/events/workflows/ai but **not** `vstudio`.

## 4. Duplicate Detection Ownership

| #   | Implementation                                                             | Operation                                                                                                                      | Verdict                                                                                     |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| (a) | `@hl-bos/catalog` `capability-reuse.ts` (`evaluateReuse`/`duplicateCheck`) | Proposed **capability** vs canonical Capability Library — weighted alias+Jaccard+domain scoring, 6-verdict taxonomy, stateless | **Canonical reusable engine**                                                               |
| (b) | `hlvs.duplicate_check(...)` SQL fn + `hlvs.duplicate_checks` table         | Factory **requirement** vs DB catalog — crude `ilike` rules, **persists** a record + human approval                            | Fn **DELEGATE** to (a); **table REMAINS** for the durable determination + approval audit    |
| (c) | PR #26 `detectDuplicates`                                                  | Candidate **opportunity** vs other opportunities — Jaccard over opportunity corpus → `duplicate_of`/`related_to`               | **REMAIN SPECIALIZED** (different entity space; writes `vstudio.opportunity_relationships`) |

(a) and (b) are the same conceptual operation at divergent fidelity; (c) is a genuinely different operation. Canonical engine = `@hl-bos/catalog`. `venture-studio/reuse.ts` is a thin multiplier over (a), not a fourth implementation.

## 5. Software Factory Ownership

| Responsibility                                | Canonical owner                                                                              | Evidence                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modeling** ("what could we assemble?")      | `@hl-bos/catalog` (design-time, in-code)                                                     | `MODULE_REGISTRY`, `PRODUCT_COMPOSITIONS`, `assembleProduct()`, `factory-registry.ts`                                                                             |
| **Readiness (opportunity→build eligibility)** | `@hl-bos/venture-studio` `computeFactoryReadiness`                                           | gates on CEO `decision='build'`; hard-wired `executable:false`                                                                                                    |
| **Readiness (package→HL-BOS handoff)**        | `hlvs.evaluate_package_readiness` (SQL) + sanctioned edge mirror `_shared/hlvs/readiness.ts` | `readiness ∈ {ready,blocked,needs_review}`                                                                                                                        |
| **System of Record**                          | `hlvs` schema                                                                                | `product_blueprints → software_creation_orders → factory_build_packages`; `hlvs.order_status` state machine; immutable-blueprint freeze; FORCE RLS + `audit.emit` |
| **Execution**                                 | `hlvs-factory-worker` + `_shared/hlvs/adapter.ts`                                            | **BUILT but INERT/undeployed**; `external_execution` permanently `false`; 0 edge functions deployed                                                               |

No improper duplication. Catalog modeling vs empty `hlvs.modules`/`hlvs.capabilities` seed tables is **intended** (code = design-time source of truth, DB = runtime mirror linked by `discovery_module_key`); the risk is **drift**, not competing authority.

## 6. Transformation Intelligence Boundary

`transformation-intelligence/src/hlvs.ts` = **historical / misleading naming** over transformation-specific logic. It imports `./factory`, `./recommendations`, `@hl-bos/catalog` — **never** `@hl-bos/venture-studio`, and holds **zero `vstudio` references**. It returns an advisory `SoftwareOpportunity[]` rollup (no status, no lifecycle, no persistence) that terminates on the **executive-portal** dashboard. It neither duplicates nor currently feeds the `vstudio` funnel. The correct seam: a **human** promotes a BTI `SoftwareOpportunity` into a new `vstudio.opportunity` at status `inbox` — an edge that **deliberately does not exist** today. If ever built it must land in `inbox` for CEO triage, never auto-`approved`. BTI/HLD diagnoses an _existing customer's_ business (intake is a **request**, never a completed assessment); HLVS decides whether _Herman Legacy itself_ builds a new venture. (Correction to a prior premise: `transformation-intelligence` has **no `types.ts`** — types are inline per module.)

## 7. Opportunity System of Record

`vstudio` (migration `hlbos_0029`) is the uncontested authoritative store: 6 tables, FORCE RLS, definer-only writes, `decision.create` granted to `platform_owner` only, `recommendations.authoritative` CHECK-locked `false`.

| Concern                                                                  | Home in `vstudio`?                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Opportunities · Evidence · Evaluations · Recommendations · CEO Decisions | ✅ authoritative                                                                                                     |
| Research state                                                           | ⚠️ partial — only `researching` status + notebook `research_request` tasks (0030); no first-class research-run table |
| **Relationships**                                                        | ❌ **GAP on main** — no opportunity↔opportunity table (only scalar `related_product`)                                |
| **Priority**                                                             | ❌ **GAP on main** — no priority column/table                                                                        |

**Cross-finding:** PR #26 fills both gaps (`vstudio.opportunity_relationships`, `opportunities.priority_score`/`priority_tier`). `vstudio` should remain authoritative; no other schema owns these more appropriately.

## 8. Discovery / Connector Ownership

| Concern                | Correct owner                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connector registration | `integrations.connectors`                                                                                                                                           |
| Credential references  | `integrations.connections.credential_ref` — **`vault:` reference only** (CHECK-enforced)                                                                            |
| Collection execution   | `integrations.sync_runs` (`begin_sync`/`finish_sync`)                                                                                                               |
| **Raw discoveries**    | ❌ **GAP** — no venture-side raw-ingestion store; `discovery` schema is customer-business assessment (VisibilityAI), wrong domain; `integrations` is transport only |
| Normalized → promotion | `vstudio.opportunities` via `vstudio.create_opportunity`                                                                                                            |
| AI enrichment          | `ai.runs` + `vstudio.recommendations.ai_run_id`                                                                                                                     |
| Choreography           | `events.emit`                                                                                                                                                       |

`venture-studio/sources.ts` is a **display catalog only**. PR #26's `OPPORTUNITY_CONNECTORS` (11) is a **second** in-code registry overlapping `sources.ts` (13) with incompatible shapes; neither should persist — both consolidate onto `integrations.connectors`. **B3 must not build a third registry.**

## 9. PR #26 Reconciliation Matrix

True footprint = 17 files (base `pr26~2`). (The misleading 174-file diff came from unrelated already-merged `bti-*` PRs — not PR #26.)

| Capability                                                                                       | Classification                               | Rationale                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opportunity Inbox                                                                                | **REUSE_CURRENT_MAIN** (keep B2 UI)          | filter over existing `status='inbox'` (0029)                                                                                                                |
| Research Queue                                                                                   | **REUSE_CURRENT_MAIN** (keep B2 UI)          | filter over `researching` + notebook `research_request`                                                                                                     |
| Source connector registry (`OPPORTUNITY_CONNECTORS`)                                             | **ADAPT_B2 → DELEGATE_TO_EXISTING**          | duplicates `sources.ts`; consolidate onto `integrations.connectors`                                                                                         |
| Duplicate detection (`detectDuplicates`)                                                         | **KEEP_B2**                                  | specialized opportunity-vs-opportunity dedup                                                                                                                |
| Opportunity relationships                                                                        | **KEEP_B2**                                  | fills `vstudio` relationships GAP                                                                                                                           |
| AI summaries (`opportunity_summaries`)                                                           | **KEEP_B2**                                  | net-new; reuses `ai.runs`, `authoritative=false`                                                                                                            |
| Priority score                                                                                   | **KEEP_B2**                                  | fills `vstudio` priority GAP                                                                                                                                |
| Priority tier                                                                                    | **KEEP_B2**                                  | fills priority GAP                                                                                                                                          |
| External reference dedup                                                                         | **KEEP_B2**                                  | net-new idempotency support                                                                                                                                 |
| Pipeline page + `/api/pipeline/relate`                                                           | **KEEP_B2**                                  | net-new UI/API                                                                                                                                              |
| Pipeline RPCs (`relate_opportunities`, `record_opportunity_summary`, `set_opportunity_priority`) | **KEEP_B2**                                  | net-new, permission-gated, emit events                                                                                                                      |
| Reuse usage (`analyzeReuse`)                                                                     | **REUSE_CURRENT_MAIN**                       | already delegates to `@hl-bos/catalog`                                                                                                                      |
| Migration `hlbos_0031_opportunity_pipeline`                                                      | **BLOCKER → ADAPT (renumber) + INVESTIGATE** | ordinal collision with merged `hlbos_0031_transformation_intake`; next safe ordinal is **0032**; PR also rewrites `migration-lineage.json`/`milestone.json` |

Net: 8 KEEP_B2 (2 fill SoR gaps), 2 REUSE_CURRENT_MAIN, 1 CONSOLIDATE (connectors), 1 BLOCKER (ordinal → 0032). B2 is fundamentally sound and mostly additive.

## 10. Executive Intelligence → Factory Handoff

| Transition                                      | Exists today                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opportunity → … → CEO Decision=BUILD            | ✅ fully in `vstudio`                                                                                                                                                                                                                                                      |
| Reuse analysis computed                         | ✅ `analyzeReuse` → `vstudio.recommendations.reuse_snapshot`                                                                                                                                                                                                               |
| **CEO BUILD → first factory artifact**          | ❌ **the gap** — no FK, no function, no shared column links `vstudio.decisions` to `hlvs.product_blueprints`/`software_creation_orders`. `factory_authorized` is an **unread boolean**; `computeFactoryReadiness` is a read-only preview; `reuse_snapshot` is **stranded** |
| Blueprint → order → run → conformance → package | ✅ fully modeled in `hlvs`                                                                                                                                                                                                                                                 |

Data that must cross: opportunity/decision id, product key, blueprint content, `reuse_snapshot` (→ `software_creation_orders.build_scope`). **Smallest conceptual future bridge (NOT to be built now):** CEO BUILD decision → authorized factory blueprint/order provenance (one nullable origin FK on `hlvs.product_blueprints` + one authorizing function). Everything downstream already works.

## 11. Canonical Ownership Matrix

| Capability / Responsibility      | Canonical Owner                         | Supporting                       | System of Record                    | Reusable Engine     | Execution Layer    | Current Overlap                         | Required Future Action                                         |
| -------------------------------- | --------------------------------------- | -------------------------------- | ----------------------------------- | ------------------- | ------------------ | --------------------------------------- | -------------------------------------------------------------- |
| Opportunity intelligence         | `vstudio` + `@hl-bos/venture-studio`    | `ai`,`events`,`storage_meta`     | `vstudio.*`                         | consumes catalog    | n/a                | none                                    | REUSE_AS_IS; COMPLETE_EXISTING (priority/relationships via B2) |
| Capability reuse/duplicate       | `@hl-bos/catalog`                       | `capabilities`,`modules`,`graph` | —                                   | **catalog**         | n/a                | `hlvs.duplicate_check` rules            | DELEGATE (b)→(a)                                               |
| Opportunity-vs-opportunity dedup | PR #26 `detectDuplicates` (`vstudio`)   | —                                | `vstudio.opportunity_relationships` | shared jaccard util | n/a                | none                                    | KEEP_B2                                                        |
| Factory modeling                 | `@hl-bos/catalog`                       | `factory-registry`               | code (design-time)                  | catalog             | n/a                | empty `hlvs.modules` seed               | REUSE_AS_IS (guard drift)                                      |
| Factory readiness (opportunity)  | `@hl-bos/venture-studio`                | catalog `reuse`                  | —                                   | —                   | n/a                | none                                    | REUSE_AS_IS                                                    |
| Factory SoR                      | `hlvs` schema                           | `workflows`,`provisioning`,`ai`  | `hlvs.*` (`order_status`)           | —                   | —                  | none                                    | COMPLETE_EXISTING                                              |
| Factory execution                | `hlvs-factory-worker`                   | `_shared/hlvs`,`events`          | `hlvs.development_runs`             | —                   | worker (**inert**) | none                                    | COMPLETE_EXISTING (deploy = CEO gate)                          |
| Connector registration           | `integrations.connectors`               | `events`                         | `integrations.*`                    | —                   | `sync_runs`        | `sources.ts` + `OPPORTUNITY_CONNECTORS` | CONSOLIDATE → REMOVE_DUPLICATE_LATER                           |
| Credential references            | `integrations.connections` (`vault:`)   | vault                            | `integrations`                      | —                   | —                  | none                                    | REUSE_AS_IS                                                    |
| Raw discovery ingestion          | **unowned**                             | `integrations`,`ai`,`events`     | —                                   | —                   | —                  | `discovery` (wrong domain)              | NET_NEW_GAP / INVESTIGATE (V2-2)                               |
| AI enrichment provenance         | `ai.runs`                               | —                                | `ai.runs`                           | —                   | —                  | none                                    | REUSE_AS_IS                                                    |
| Transformation intelligence      | `transformation-intelligence` + HLD/BTI | catalog,`discovery`,`visibility` | BTI stores                          | —                   | —                  | `hlvs.ts` misnomer                      | RENAME_CLARIFY                                                 |
| Exec-Intel → Factory handoff     | (unowned stitch)                        | `vstudio`,`hlvs`                 | —                                   | —                   | —                  | `factory_authorized` unread             | NET_NEW_GAP (bridge)                                           |

## 12. Proposed Architectural Ownership Rules (evidence-backed)

1. `vstudio` owns opportunity intelligence (opportunities, evidence, evaluations, recommendations, decisions, relationships, priority, research state); it **never writes to `hlvs`**.
2. `@hl-bos/catalog` owns reusable capability/reuse/duplicate analysis; all other reuse/duplicate logic **delegates** to it and may only _persist_ results.
3. `hlvs` owns authorized software-factory records and execution; nothing but a CEO `build` decision may originate a blueprint; `hlvs` never owns opportunity intelligence.
4. `integrations` owns connector registration, credentials (`vault:` refs), and collection execution; ingestion **normalizes into `vstudio.opportunities`**; there is exactly one connector framework.
5. `ai.runs` owns AI-call provenance; every AI enrichment attaches an `ai_run_id`.
6. `events.emit` owns cross-schema choreography; schemas integrate via topics, not cross-boundary FKs.
7. Venture Studio consumes transformation intelligence only via explicit human promotion of a BTI `SoftwareOpportunity` into an `inbox` opportunity; BTI never auto-creates ventures.
8. The CEO `Decision` (`platform_owner` only) is the single authoritative act; recommendations are always `authoritative=false`.
9. The `discovery` schema owns customer-business assessment (VisibilityAI), not venture-opportunity ingestion.
10. `@hl-bos/catalog` is the design-time source of truth for modules/capabilities; `hlvs.modules`/`hlvs.capabilities` are its runtime mirror — they sync, never compete.

## 13. Risks and Unknowns

- **Migration 0031 collision (high, blocking):** PR #26 rebase yields two `hlbos_0031` migrations + conflicting `migration-lineage.json`/`milestone.json`. Renumber to 0032 required but currently a **closed CEO gate**.
- **Second connector framework (high):** if B3 proceeds before `OPPORTUNITY_CONNECTORS`/`sources.ts` consolidate onto `integrations.connectors`, a third registry is likely.
- **Raw-ingestion ownership (medium, unowned):** no home for raw venture discoveries; risk of misusing the `discovery` (customer-assessment) schema.
- **Catalog↔hlvs drift (medium):** in-code `MODULE_REGISTRY` vs empty `hlvs.modules` seeds can diverge silently.
- **`hlvs.ts` misnomer (low, real):** the "HLVS" name inside `transformation-intelligence` invites the collapse this audit warns against.
- **Evidence provenance:** load-bearing facts (`factory_authorized` informational; catalog as canonical engine; 0031 collision; no `vstudio↔hlvs` FK) cross-corroborated by ≥2 investigators; PR #26 topology + collision verified first-hand. Exact RPC line numbers are investigator-reported, not each re-read line-by-line here. **DMA lineage remains an untouched separate backlog item** — it affected no ownership conclusion.

## 14. Capability Registry Changes

Recorded in this same commit into `.hlbos/hlvs-capability-registry.json` (governance-only, no maturity inflation): a top-level `ownershipModel` (five layers + factory sub-owners + connector architecture + handoff), a documented `overlapDispositionVocabulary`, an `ownershipAudit` reference, and per-capability `ownership` objects on CAP-01/02/05/07/08/09. Textual `known_overlap`/`known_limitations` on CAP-02/05/07/08/09 updated to reflect ownership findings; the `transformation-intelligence/src/hlvs.ts` misnomer flagged `RENAME_CLARIFY` in `architecturalDistinctions` (not renamed here). Status/`recommended_action` vocabularies and all capability IDs are unchanged.

## 15. CEO Decisions Required

1. **Open the migration-numbering gate** so PR #26's `0031_opportunity_pipeline` renumbers to **0032** (lineage/milestone reconciled) — the single hard blocker to PR #26 reconciliation.
2. **Ratify connector ownership:** `integrations.connectors` canonical; `sources.ts` + `OPPORTUNITY_CONNECTORS` consolidate into it; **B3 may not create a third registry.**
3. **Approve (later) the handoff bridge** (origin FK + authorizing function) as the smallest stitch — not to be built yet.
4. **Approve the `transformation-intelligence/hlvs.ts` rename/clarify** to remove the misnomer.
5. **Confirm** DMA lineage stays a separate backlog item.

## 16. Recommended Next Step

**Author a docs-only "PR #26 Reconciliation Blueprint" ADR** (under `docs/products/hlvs-v2/` or `.hlbos/audits/`) encoding this ownership matrix and the Part-9 disposition — KEEP_B2 for the 8 net-new items, CONSOLIDATE the connector registry onto `integrations`, and the required `0031→0032` renumber — so PR #26 reconciliation becomes mechanical the moment the numbering gate opens. Read-only/documentation; touches no code, migration, PR #26, or gate.

---

_Persisted as a read-only governance baseline. No application code, package, migration, PR #26, CI, `canonical.json`, `milestone.json`, `migration-lineage.json`, infrastructure, DNS, or deployment was modified in producing this audit._
