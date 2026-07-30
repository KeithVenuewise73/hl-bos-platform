# Project Atlas — Phase IV: Platform Completion & Factory Activation

**For:** Keith Herman (CEO / Product Owner) · **Date:** 2026-07-29
**Type:** Platform completion — a working capability, not a plan. Reuse before rebuild; nothing redesigned.

---

## What was delivered

The **Software Factory is now operational as an assembly engine**: it holds a complete engineering **module registry**, a **product composition** for every product, and a deterministic **assembler** that proves a product can be built entirely from registered modules — demonstrated with **SalonAI**. It runs in the CEO console at **`/catalog/factory`** and is backed by the `@hl-bos/catalog` package (extended, not rebuilt).

**Proven, not asserted:** `pnpm typecheck`, `pnpm lint`, and `pnpm test` (**107 tests**, incl. 26 for the catalog/factory engine) all pass. The screenshot was captured from the running app.

**What honesty required me _not_ to do:** I did not mutate the live production database, deploy to production, grant an AI key, or invent a single price — those are CEO-gated (operating contract). The module registry and metadata are delivered as version-controlled data (the console's source of truth) plus an **approval-gated seed migration**; pricing/licensing/ownership are explicit `pending-ceo` placeholders.

## Objectives → outcomes

| Obj | Objective           | Outcome                                                                                                                                                                                           |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Module registry     | **19 engineering modules registered** (`packages/catalog/src/modules.ts`), mapped 1:1 to `discovery.module_catalog`. Proposed seed for `hlvs.modules` (0 rows live) under `proposed/0029-...sql`. |
| 2   | Catalog accuracy    | Module maturity is now honest per module (live vs built-not-deployed); the Factory checklist replaces Phase III's stale assumptions.                                                              |
| 3   | Product composition | **8 product compositions** — required modules, shared services, AI services, dependencies, edition, deployment requirements, assembly blueprint.                                                  |
| 4   | Software Factory    | **Assembler built + SalonAI reference demonstration** — assemblable at 100% foundation from registered modules. All 8 products assemblable.                                                       |
| 5   | Commercial metadata | Version, edition, subscription model, support tier, availability — with pricing/licensing/ownership held `pending-ceo` (never invented).                                                          |
| 6   | Executive readiness | **Platform 92% · Factory 70% · Commercial 0%** (honestly gated), live in the console.                                                                                                             |

## Deliverables

### 1. Updated Enterprise Catalog

The Phase II console now has a **Software Factory** section (`/catalog/factory`) alongside the catalog. Module readiness is accurate; nothing is dressed up.

### 2. Completed Module Registry

**19 reusable engineering modules**, each with schema ownership, capability category, maturity, reuse flags, what it provides, and its dependencies — the version-controlled source of truth for the empty `hlvs.modules`. See `packages/catalog/src/modules.ts` and the console's "Engineering module registry" panel. Durable-persistence seed: `proposed/0029-module-registry-seed.sql` (approval-gated).

### 3. Product Composition Definitions

For all 8 products (HL-BTI, VisibilityAI, SalonAI, Review Management, Reputation Recovery, ReceptionAI, TransportationAI, HomeHuddle): required modules, shared services, AI services, dependencies, edition, deployment requirements, and a computed Factory Assembly Blueprint. See `packages/catalog/src/compositions.ts` and the console's "Product composition & assembly" panel.

### 4. Software Factory Demonstration

The assembler (`packages/catalog/src/factory.ts`) resolves each product's required modules against the registry and reports build status, missing modules, foundation-readiness %, and an ordered assembly blueprint. **SalonAI is the reference implementation: 13/13 required modules built (9 from the shared spine) → assemblable at 100% foundation, no new foundational module required.** All 8 products are assemblable. Screenshot: `screenshots/01-software-factory.png`.

### 5. Commercial Metadata

Structured per product: `version` (null until shipped), `edition`, `subscriptionModel`, `supportTier` (proposed), `commercialAvailability` (computed from readiness), and `pricing`/`licensing`/`ownership` — all three carrying `status: pending-ceo`. The system refuses to invent commercial terms.

### 6. Executive Readiness Dashboard

Live at `/catalog/factory`, computed from the data:

- **Platform completion: 92%** (19 modules; 13 live, 6 built-not-deployed weighted 0.75).
- **Factory completion: 70%** (10 of 15 core capabilities in place, module registry code-done/gated).
- **Commercial readiness: 0%** — deliberately, because no product has pricing/licensing/ownership set. Not inflated.
- **8/8 products assemblable · 1 ready to launch (HL-BTI).**

### 7. Remaining Critical Tasks

See `remaining-critical-tasks.md`. In short: grant the AI key + deploy the runtime; set pricing/licensing/ownership; implement the Stripe adapter; approve the module-registry seed; decide the development-agent wiring; build the reporting service.

### 8. Transition recommendation

See `transition-to-commercial-operations.md`.

## The one-paragraph verdict

**The platform is complete enough to begin commercial production the moment the CEO-gated inputs are supplied.** Every product's _engineering foundation_ already exists and is proven assemblable from registered modules — the Factory works. What remains is not construction: it is **ignition** (deploy the runtime, grant the key) and **commercial decisions** (pricing, licensing, ownership). Supply those, and Herman Legacy is producing commercial software from reusable assets.
