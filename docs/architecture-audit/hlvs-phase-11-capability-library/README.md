# Phase XI-1 · Canonical Capability Library — Completion Report

**For:** Keith Herman, CEO · **Date:** 2026-07-30 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Status:** Implemented, tested, **not merged, not deployed, no migration** — awaiting CEO review.

---

## What existed

Six capability-like registries, overlapping and unlinked (full detail in [01-reconnaissance-report.md](01-reconnaissance-report.md)):

- `MODULE_REGISTRY` (19, in-code) · `business_capability` catalog assets (10, in-code)
- `hlvs.capabilities` (10, DB) · `hlvs.modules` (0 — dormant, DB)
- `discovery.module_catalog` (23, DB) · `discovery.service_catalog` (25, DB)

"Reuse before rebuild" was a guideline with **no enforcement point**.

## What changed

One **canonical Capability Library** inside `@hl-bos/catalog` — not a new app, repo, or second catalog:

- `packages/catalog/src/capabilities.ts` — the canonical `Capability` model + evidence-backed inventory + relationship/reconciliation helpers.
- `packages/catalog/src/capability-reuse.ts` — deterministic `duplicateCheck`, the `evaluateReuse` decision contract, and the `canRegister` anti-duplication guard.
- Legacy registries are **preserved and mapped in** (aliases + consolidation), never collapsed. All existing consumers are untouched.
- Minimal read-only portal view at **`/capabilities`** (list, filters, detail, reconciliation status, live duplicate-gate demo), with ownership/risk/security/evidence **role-gated** to executive roles.

Design decisions are recorded in [02-adr-capability-library.md](02-adr-capability-library.md).

## What was inventoried (evidence-backed, nothing fabricated)

| Status          | Count  | Notes                                                                                                                                                                      |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implemented** | 15     | built + reusable now (identity, audit, events, workflows, storage, discovery, scoring, dashboards, factory, catalog, registry, transformation- & government-intelligence…) |
| **Partial**     | 7      | foundation built, runtime/adapter pending (ai_gateway, billing, communications, integrations, digital_visibility, reputation_management, commerce_provisioning)            |
| **Planned**     | 5      | reference only, **no built module** — not counted as reusable (ai_receptionist, scheduling, route_assessment, event_management, document_extraction)                       |
| **Deprecated**  | 0      | —                                                                                                                                                                          |
| **Total**       | **27** | 15 legacy keys consolidated across the registries                                                                                                                          |

## What the duplicate gate does (representative outcomes)

| Proposal                                               | Verdict                                             | May build? | Human review? |
| ------------------------------------------------------ | --------------------------------------------------- | ---------- | ------------- |
| "communications"                                       | **REUSE_EXISTING**                                  | no         | no            |
| "appointment booking" (schedule customer appointments) | **MANUAL_REVIEW_REQUIRED** (best match: Scheduling) | no         | yes           |
| proposal aliasing two distinct caps                    | **CONSOLIDATE_DUPLICATES**                          | no         | yes           |
| "fleet telematics" (transportation, net-new)           | **BUILD_NEW**                                       | **yes**    | yes           |
| exact "scheduling" via `canRegister`                   | **refused** — cannot silently re-register           | —          | —             |

Deterministic and explainable (reason codes); **no AI required** — verdicts are identical on repeat and need no model call.

## What remains untouched (confirmed)

- **No production migration** — the library is in-code; `hlvs.*`/`discovery.*` schemas unchanged.
- **No deployment, no DNS, no authentication change, no customer data touched.**
- **No branch merged.**
- **Legacy registries preserved** — `MODULE_REGISTRY`, `business_capability` assets, and the DB catalogs are unchanged; all existing imports keep working.
- **Later Phase XI stages not begun** — no Discovery Engine, no Transportation Intelligence, no XI-2.

## Quality gates (exact results)

| Gate                                           | Result                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `pnpm format:check`                            | ✅ clean                                                    |
| `pnpm lint`                                    | ✅ clean                                                    |
| `pnpm typecheck` (8 projects, TS 6.0.3 strict) | ✅ clean                                                    |
| `pnpm test`                                    | ✅ **207/207** (21 new capability tests + 1 new authz test) |
| Executive Portal production build              | ✅ 23 routes compile (incl. `/capabilities`)                |

The 14 required test proofs — registration, stable identity, app/product/module references, dependencies, planned-vs-implemented, deterministic duplicate verdicts, exact-duplicate refusal, legacy mapping, consumer preservation, unauthorized-role gating, no-registry-bypass reconciliation, evidence retention, green build — are all covered.

## Executive decisions required

1. **Approve Phase XI-2** (recommended below). _No other decision blocks progress._
2. **Prioritize the 5 planned capabilities** — `ai_receptionist`, `scheduling`, `route_assessment`, `event_management`, `document_extraction` are real demand signals with no built module. Which (if any) should enter the future Build Queue is a CEO priority call — not required now.

## Recommended next phase (do not begin)

**Phase XI-2 — Catalog & Capability read-model persistence.** Project the in-code Enterprise Catalog + Application Registry + Capability Library into a proposed `catalog` schema (read model) so subsystems and RPCs can query capabilities at runtime, and wire the duplicate gate into the Software Factory / (future) Build Queue as the mandatory pre-build check. It is **migration-gated** (needs CEO approval to apply) and builds directly on this phase. I recommend it as the next step but will not start it without your authorization.

---

### Deliverables index

| #   | Deliverable                                  | Where                                                                  |
| --- | -------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Live-registry reconnaissance report          | [01-reconnaissance-report.md](01-reconnaissance-report.md)             |
| 2   | Canonical Capability domain model            | `packages/catalog/src/capabilities.ts`                                 |
| 3   | Capability Library implementation            | `capabilities.ts`                                                      |
| 4   | Duplicate-check implementation               | `packages/catalog/src/capability-reuse.ts`                             |
| 5   | Reuse decision contract                      | `capability-reuse.ts` (`evaluateReuse`)                                |
| 6   | Legacy compatibility mapping                 | [01](01-reconnaissance-report.md) + `aliases`/`duplicatesConsolidated` |
| 7   | Catalog & Application Registry relationships | `productsForCapability` / `applicationsForCapability`                  |
| 8   | Initial evidence-backed inventory            | `CAPABILITIES` (27, each with evidence)                                |
| 9   | Minimal read-only portal view                | `apps/executive-portal/src/app/capabilities/page.tsx`                  |
| 10  | Governance & authorization tests             | `capabilities.test.ts` + `authz.test.ts`                               |
| 11  | Architecture decision record                 | [02-adr-capability-library.md](02-adr-capability-library.md)           |
| 12  | Completion report                            | this file                                                              |
| 13  | Phase XI-2 recommendation                    | this file (above)                                                      |
