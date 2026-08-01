# Factory Foundation · Checkpoint 1 — Reuse Assessment

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Scope:** Build the operational Herman Legacy Software Factory _inside_ the existing HL-BOS
platform by assembling and extending what is already there. **This checkpoint answers one
question before any code is written:**

> **Does a major Factory mechanism already exist in HL-BOS — and if so, exactly what do we
> reuse, and what is the precise gap we must fill?**

**Answer: yes, most of the Factory already exists.** It lives in the `@hl-bos/catalog`
package. We do **not** rebuild it. We add one missing layer on top of it.

---

## 1. What already exists (REUSE — do not rebuild)

Every piece below is real, tested code in `packages/catalog/src`. This is the Factory's engine.

| Factory concept the prompt asks for   | Already built as                                                                                             | Where                                       | Reuse decision     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------ |
| **Capability** (the abstract thing)   | `Capability` model — 30 canonical, evidence-backed capabilities                                              | `capabilities.ts`                           | **REUSE as-is**    |
| Reuse-before-rebuild governance       | `duplicateCheck` / `evaluateReuse` / `canRegister` (deterministic, no AI)                                    | `capability-reuse.ts`                       | **REUSE as-is**    |
| **Product** (the thing sold)          | `ProductComposition` + `CommercialMetadata` (8 products)                                                     | `compositions.ts`                           | **REUSE as-is**    |
| **Product Assembly** (the build)      | `assembleProduct` / `assembleAll` — resolves a product to its modules, computes readiness, emits a blueprint | `factory.ts`                                | **REUSE + extend** |
| Executive readiness scoring           | `executiveReadiness`, `FACTORY_CHECKLIST`                                                                    | `factory.ts`                                | **REUSE as-is**    |
| Engineering module inventory          | `MODULE_REGISTRY` (the built HL-BOS modules)                                                                 | `modules.ts`                                | **REUSE as-is**    |
| Knowledge Graph (capabilities → deps) | `graph-model` / `graph-projection` / `graph-traverse` / `graph-serialize`                                    | `graph-*.ts`                                | **REUSE as-is**    |
| Application/deployment registry       | `APPLICATIONS`                                                                                               | `app-registry.ts`                           | **REUSE as-is**    |
| Enterprise Catalog (system of record) | `CATALOG` + completeness/scan                                                                                | `registry.ts`, `completeness.ts`, `scan.ts` | **REUSE as-is**    |
| Commercialization Law #1 (L1–L5)      | Documented + applied in the Venuewise harvest + audit docs                                                   | `docs/products/*`                           | **REUSE as-is**    |

**Verdict from the prompt's Checkpoint 1 instruction** ("stop for review if a major duplicate
Factory mechanism already exists"): **it does.** The correct action is to **extend it in
code**, not to build a parallel Factory, and **not** to create a `factory` schema or a new
Supabase project. This assessment _is_ that review surface.

---

## 2. The precise gap (BUILD — the one missing layer)

The existing Capability model has a blind spot that is exactly the thing the Software Factory
needs. Its `sourceSystems` field looks like it tracks "where a capability comes from" — but its
allowed values are:

```
MODULE_REGISTRY · business_capability · hlvs.capabilities · discovery.module_catalog ·
discovery.service_catalog · package
```

**Every one of those is an _internal HL-BOS registry_.** None of them is a **platform**. The
model cannot currently express:

- "**Scheduling** is _planned_ on HL-BOS but _in production_ on **Venuewise**."
- "**CRM** does not exist on HL-BOS at all; **Venuewise** has a functional one."
- "**Billing** exists on _both_ platforms — which implementation is canonical?"

That is the missing distinction the prompt names explicitly. It asks for **five** concepts; we
have three-and-a-half:

| #   | Concept                                                               | Status in HL-BOS today                                                               |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | **Source Platform**                                                   | ❌ **MISSING** — no notion of HL-BOS Core vs Venuewise vs HSCS as distinct platforms |
| 2   | **Capability** (abstract)                                             | ✅ exists (`Capability`)                                                             |
| 3   | **Capability Implementation** (a capability _on a specific platform_) | ❌ **MISSING** — the key gap                                                         |
| 4   | **Product**                                                           | ✅ exists (`ProductComposition`)                                                     |
| 5   | **Product Assembly**                                                  | ✅ exists (`factory.ts`) — but only over HL-BOS modules, not cross-platform          |

**So the entire net-new surface is two types and their seed data:**

1. **`SourcePlatform`** — HL-BOS Core (canonical, operational), Venuewise Platform (harvested,
   external read-only), HSCS (planned placeholder). A logical registry only — **no
   source-platform data is copied into HL-BOS.**
2. **`CapabilityImplementation`** — a capability as realized on one platform, with its maturity,
   its backend anchors (schemas/tables/functions), the commercialization layers (L1–L5) it can
   support, a canonical/alternate/reference decision, and a verification flag. Seeded from the
   **verified HL-BOS capability library** and the **read-only Venuewise backend harvest**.

Everything else — reuse governance, assembly, readiness, the graph — is reused unchanged. The
cross-platform assembler is a thin function that sits _on top of_ the existing `assembleProduct`
logic and resolves each required capability to its **best available implementation across
platforms**, flagging what is net-new.

---

## 3. Why this is safe (engineering constraints honored)

- **No new Supabase project.** Target is HL-BOS Core `mvvtngiopdrgiedjmhfb` only.
- **No production migration.** This is a TypeScript extension of `@hl-bos/catalog`, pure
  logic + curated data. Fully reversible by deleting two files.
- **No Venuewise data duplicated.** The Venuewise registry stores _capability metadata and
  object names_ from the read-only harvest — never rows, never secrets, never a schema copy.
- **No existing functionality duplicated.** We import and reuse `Capability`,
  `ProductComposition`, `assembleProduct`, `evaluateReuse`, the graph, and the catalog. The new
  file only _adds_ the platform/implementation layer.
- **RLS / tenant / audit / entitlement models are untouched** — no schema change at all.
- **Honesty (Principle 10).** Every implementation cites evidence. Venuewise rows are labeled
  `harvest_asserted` (observed via read-only harvest, not re-verified in this phase). HSCS is
  labeled `planned` with zero implementations — it does not pretend to exist.

---

## 4. What Checkpoint 1 authorizes

Proceed to build, in `packages/catalog`:

- **CP2 — Registry foundation:** `factory-registry.ts` — `SourcePlatform` +
  `CapabilityImplementation` types + accessors, extending (importing) the existing catalog.
- **CP3 — Seed:** HL-BOS implementations _derived_ from the existing `CAPABILITIES` (single
  source of truth, stays in sync); Venuewise implementations from the verified backend harvest;
  HSCS declared but empty.
- **CP4 — Blueprints:** cross-platform assembly blueprints for the three markets, including a
  worked **HockeyIQ** example, reusing `assembleProduct`.
- **CP5 — Validation:** the seven validation questions answered _in code_ (a test) and in a
  document, proving the Factory can reason across platforms.

Then **stop and wait for CEO approval** before assembling any actual product.
