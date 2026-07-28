# Checkpoint 8 — HLVS Factory Interface Reuse Analysis

**Date:** 2026-07-27 · **Checkpoint:** 8 · Completed **before** authoring any migration, type, worker, RPC, schema, table, API, or UI structure.

Checkpoint 8 builds the governed interface that turns an approved software **opportunity** into an executable development blueprint for Claude, validates the resulting work, and hands an approved **Factory Build Package** to HL-BOS. This document inventories what already exists so nothing is duplicated.

## 1. Existing assets inventory

| Asset area                                   | Exists today?                                          | Location / object                                                                         |
| -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| HLVS opportunity discovery / scoring         | **No** HLVS-specific pipeline                          | (Business Discovery `discovery.*` scores _customers_, not HL software)                    |
| Innovation items / BUILD·CONSIDER·IGNORE     | **No**                                                 | —                                                                                         |
| Capability catalog                           | **No** (capability as a first-class object)            | —                                                                                         |
| Module catalog (commercial)                  | **Yes**                                                | `discovery.module_catalog` (CP6) — recommend-able modules + entitlement                   |
| Service catalog                              | **Yes**                                                | `discovery.service_catalog` (CP6)                                                         |
| Product definitions / editions / templates   | **No**                                                 | —                                                                                         |
| Blueprint versions (customer transformation) | **Yes**                                                | `discovery.blueprints` (CP6) — _customer_ blueprints, not _product technical_             |
| Recommendations                              | **Yes**                                                | `discovery.recommendations` (CP6)                                                         |
| HL-BOS module registry (engineering)         | **No** (engineering-grade: repo/schema/APIs/lifecycle) | —                                                                                         |
| Architecture-impact / extraction reporting   | **No**                                                 | —                                                                                         |
| No-duplication governance                    | Partial (CP6 `dedupe_group`; CP7 readiness)            | —                                                                                         |
| Workflow approvals                           | **Yes**                                                | `workflows.request_approval` / `decide` / `is_approved`                                   |
| Event envelopes + dispatch                   | **Yes**                                                | `events.emit` + CP5 shared dispatcher (`handlers`/`claim_deliveries`/`complete_delivery`) |
| Audit events                                 | **Yes**                                                | `audit.emit` / `audit.log_security_event`                                                 |
| Document + file storage                      | **Yes**                                                | `storage_meta.files`                                                                      |
| AI gateway + model governance                | **Yes**                                                | `ai` schema + `_shared/ai` + discovery injection fence                                    |
| Proposal / provisioning (CP7)                | **Yes**                                                | `sales.*`, `provisioning.*` (incl. `provisioning.factory_authorizations`)                 |
| Tenant provisioning                          | **Yes**                                                | `platform.provision_tenant`                                                               |
| Entitlements                                 | **Yes**                                                | `entitlements.*`                                                                          |
| Billing                                      | **Yes**                                                | `billing.*`                                                                               |
| Repos / branches / build metadata            | **No** structured record                               | —                                                                                         |
| Claude prompt generation / dev-run           | **No**                                                 | —                                                                                         |

A repository-wide search for `hlvs`, `opportunity`, `innovation`, `prompt_package`, `creation_order`, `development_run`, `conformance`, `factory_build`, and `extraction_candidate` schema objects returned **none**. HLVS is greenfield **for these objects**, built on the reusable spine above.

## 2. Reused unchanged

`workflows` (all approvals), `events` + the CP5 shared dispatcher (all HLVS↔HL-BOS events — **no second bus**), `audit`, `storage_meta` (artifact references), the `ai` gateway + `_shared/ai` + the injection fence (advisory AI only), `identity`/permissions/tenancy spine, and the CP7 `provisioning.factory_authorizations` (the **commercial** authorization the HL-BOS intake compares the technical package against).

## 3. Extended (by explicit reference, not duplication)

- `discovery.module_catalog` (CP6) stays the **commercial / recommend-able** catalog (availability, entitlement, effort) consumed by the blueprint engine. The new `hlvs.modules` **engineering registry** references it 1:1 by key (`discovery_module_key`) where a module is both recommendable and engineered. This separation is deliberate — see §5.
- `discovery.service_catalog` (CP6) is referenced by product/edition compositions; HLVS adds no competing service catalog.

## 4. Genuinely missing → built in the new `hlvs` schema

Capabilities, engineering modules registry, products, industry templates, product editions, extraction candidates, deterministic duplicate-risk determinations, product **technical** blueprints (immutable once approved), software creation orders, Claude prompt packages, development runs, checkpoint reports, build completion reports, deterministic blueprint conformance results + exceptions, catalog update proposals, factory build packages, HL-BOS intake, and HL-BOS feedback.

## 5. Prohibited duplication + schema ownership

**Prohibited:** a second identity, tenancy, billing, entitlement, event bus, workflow engine, or file system. HLVS **references** each. The one catalog nuance, documented as necessary:

| Concept                     | Owner                            | Why not merged                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commercial module catalog   | `discovery.module_catalog` (CP6) | Consumed by the customer blueprint/recommendation engine; carries availability, entitlement_key, effort                                                                                                                                   |
| Engineering module registry | `hlvs.modules` (new)             | The factory's authoritative record: source repo/path, schema ownership, APIs/RPCs/UI/workers, lifecycle draft→retired, production-eligibility, licensing, maturity — none of which belong in a recommendation catalog. Linked 1:1 by key. |

Every new object lives in the **`hlvs`** schema. No new object is added to `discovery`, `sales`, `provisioning`, `billing`, `entitlements`, `identity`, `events`, `workflows`, `audit`, or `storage_meta`.

## 6. Boundaries

**HLVS vs HL-BOS.** HLVS is the technical blueprint + engineering intelligence + software catalog: it decides _what_ software to create, governs its creation by Claude, validates conformance, and issues a **Factory Build Package** (what technically exists + how composed). HL-BOS is the production facility: it receives the package, applies production gates, provisions, deploys, operates, and reports back. This checkpoint builds the HLVS side + the inert HL-BOS **intake** records + feedback contracts; it does **not** deploy, provision, bill, or message.

**Catalog definition vs development execution vs production execution.** Catalog definition (capabilities/modules/products) is governed metadata. Development execution is a governed Claude **development run** driven by an approved Software Creation Order — Claude is agent-neutral in the schema, human-controlled, never called automatically (`external_execution: false`). Production execution belongs to HL-BOS and remains entirely out of scope; the Factory Build Package and HL-BOS intake are **inert** (furthest status `accepted_for_controlled_deployment_review`).

## 7. Hard boundaries (what stays inert / never happens)

No production deploy, no canonical-project migration, no customer tenant, no billing activation, no customer message, no automatic Claude call, no external development-agent API, no external repo write, no production branch, no secret exposure, no weakened RLS. AI is advisory only and can approve/authorize/publish/certify nothing.
