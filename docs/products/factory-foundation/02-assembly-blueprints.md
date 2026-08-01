# Factory Foundation · 02 — Assembly Blueprints & the Factory Order Process

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `packages/catalog/src/factory-blueprints.ts` (+ tests). Reuses the existing
`assembleProduct` engine and adds the **cross-platform** view. Deterministic; nothing asserted.

## The 12-step Factory Order Process

Each step names the **existing HL-BOS mechanism** that performs it — the Factory is an assembly
of what we already own, not a new machine. Steps 8–12 are human-gated.

| #   | Step                                   | Mechanism (reused)                                 | Gated |
| --- | -------------------------------------- | -------------------------------------------------- | :---: |
| 1   | Capture product idea                   | `FactoryProductSpec`                               |       |
| 2   | Reuse-before-rebuild check             | `capability-reuse.ts` `evaluateReuse`              |       |
| 3   | Resolve capabilities → implementations | `factory-registry.ts` `findImplementations`        |       |
| 4   | Classify each slot                     | `resolveCapabilitySlot`                            |       |
| 5   | Identify net-new work                  | `FactoryAssemblyBlueprint.netNewCapabilities`      |       |
| 6   | Single-platform assembly check         | `factory.ts` `assembleProduct` (reused)            |       |
| 7   | Determine commercialization layers     | `FactoryAssemblyBlueprint.commercializationLayers` |       |
| 8   | Resolve cross-platform decisions       | `contestedCapabilities` + `canonicalDecision`      |   ✔   |
| 9   | CEO commercialization approval         | `CommercialMetadata` (pending-ceo)                 |   ✔   |
| 10  | Create the build order                 | `hlvs_factory` (software_factory capability)       |   ✔   |
| 11  | Assemble & deploy                      | `factory.ts` blueprint + gated `db-migrate`        |   ✔   |
| 12  | Return to catalog                      | register new `CapabilityImplementation`            |   ✔   |

## Each slot's disposition

For every capability a product needs, the Factory resolves it to exactly one of:

- **reuse** — built on the target platform (HL-BOS). Use as-is.
- **reuse cross-platform** — built on another platform (e.g. Venuewise). Adopt / port / reference — a cross-platform decision.
- **extend** — exists but only `partial`; finish it before launch.
- **net-new** — no built implementation anywhere. This is the real build queue.

## The three markets + HockeyIQ

Live output of `assembleBlueprint` (2026-07-31):

| Product              | Market    | reuse | cross-platform | extend |                        **net-new**                        | Assemblable? |
| -------------------- | --------- | :---: | :------------: | :----: | :-------------------------------------------------------: | :----------: |
| **TransportationAI** | Logistics |   3   |       0        |   2    |                 **1** — route assessment                  |      no      |
| **SalonAI**          | Service   |   1   |       1        |   4    |                  **1** — ai receptionist                  |      no      |
| **Venuewise Sports** | Sports    |   1   |       8        |   1    |                           **0**                           |   **yes**    |
| **HockeyIQ**         | Sports    |   1   |       6        |   1    | **2** — hockey analytics engine, player development index |      no      |

### What each blueprint tells the CEO

- **TransportationAI (Logistics):** almost entirely HL-BOS (identity, billing, discovery,
  scoring, communications). The only genuine build is the **route-assessment engine**. Cheapest
  net-new bill of the four.
- **SalonAI (Service):** the spine is HL-BOS, scheduling comes **cross-platform from Venuewise**,
  and the only net-new build is the **AI receptionist**. Four capabilities are `partial` and need
  finishing (visibility, reputation, comms, discovery).
- **Venuewise Sports (Sports):** **fully assemblable from existing implementations — zero
  net-new.** Eight capabilities are proven Venuewise implementations (family, athlete, coach,
  team, facility, media, scheduling, messaging); the spine is HL-BOS. The work is a cross-platform
  adoption decision, not engineering.
- **HockeyIQ (Sports):** reuses the same sports capabilities as Venuewise Sports (6 cross-platform
  - identity on HL-BOS + payments to extend), and needs **only two net-new, hockey-specific
    builds**: a **hockey analytics engine** and a **player development index**. Everything else
    already exists. This is the Factory's headline result — a new sports product is ~80% assembly.

### A note on whole-product commercialization layers

Each blueprint reports the layers the **whole product** can support — the layers **every** one of
its capabilities supports (the intersection). For all four products that comes out to **L1
(internal ops) + L5 (factory assembly)**, because each product includes at least one capability
(identity, payments) that is an enabling engine rather than a standalone SaaS. That is honest: a
product can only be sold at a layer that its _least-flexible_ capability also supports. Individual
capabilities support far more layers (see [03](03-validation.md), Q7) — 20 can stand alone as SaaS
(L3), 27 are licensable engines (L4).

## Why this is the assembly answer, not a launch

These blueprints are the Factory's **reasoning output**. They do not set pricing, do not create a
build order, and do not deploy — steps 9–12 are gated and await CEO approval. The blueprint's job
is to answer, deterministically and honestly, _"if we wanted this product, what would it actually
take?"_ — and it does.
