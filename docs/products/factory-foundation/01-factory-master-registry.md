# Factory Foundation · 01 — The Factory Master Registry

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `packages/catalog/src/factory-registry.ts` (+ tests). In-code, reversible,
**no database migration, no new Supabase project.** Targets HL-BOS Core `mvvtngiopdrgiedjmhfb`.

The Master Registry is the Factory's **system of record**. It does not replace the Enterprise
Catalog — it adds the one layer the catalog was missing: the ability to reason about the same
capability **across different source platforms**.

## What it records

| Record                         | Type                       | Count today | Source                                                |
| ------------------------------ | -------------------------- | ----------- | ----------------------------------------------------- |
| **Source Platforms**           | `SourcePlatform`           | **3**       | declared (HL-BOS, Venuewise, HSCS)                    |
| **Capability Implementations** | `CapabilityImplementation` | **49**      | 27 HL-BOS (derived) + 22 Venuewise (harvest) + 0 HSCS |
| Reusable-now implementations   | computed                   | **43**      | built (production/functional/partial)                 |
| Contested capabilities         | computed                   | **2**       | billing, communications                               |
| Dangling references            | integrity check            | **0**       | every linked capability id resolves                   |

Capabilities (the abstract things, 30 of them), reuse governance, products, the assembler, the
Knowledge Graph and the Enterprise Catalog are all **reused unchanged** from `@hl-bos/catalog`.

## The three source platforms

| Platform               | Kind      | Status         | Supabase ref           | Data residency      |
| ---------------------- | --------- | -------------- | ---------------------- | ------------------- |
| **HL-BOS Core**        | canonical | operational    | `mvvtngiopdrgiedjmhfb` | in HL-BOS           |
| **Venuewise Platform** | harvested | reference-only | `urwnbskrtoplgnkkxuvl` | external, read-only |
| **HSCS**               | planned   | planned        | — (none)               | not applicable      |

**Only HL-BOS Core is operational and holds data.** Venuewise is a read-only reference for
proven implementations — nothing is copied in. HSCS is a declared placeholder with zero
implementations; it does not pretend to exist.

## The Capability Implementation model

Each implementation records: the capability (linked to a canonical `Capability` id, or `null`
when no canonical capability exists yet), the platform, its **maturity** (production /
functional / partial / planned / unknown / retired), its backend anchors (schema/table/function
names only), the **commercialization layers** (L1–L5) it can support, a **canonical decision**
(canonical / alternate / reference / undecided), a **verification** flag, and evidence.

### Honesty controls (Principle 10)

- HL-BOS rows are **derived from the verified `CAPABILITIES` library** → they stay in sync and
  are marked `verified` (or `unverified` where the library says so).
- Venuewise rows are marked **`harvest_asserted`** — observed via the read-only backend harvest,
  not re-verified in this phase. Object names only; never rows, never secrets.
- A `partial` HL-BOS capability is **never** labeled the canonical system of record — it is
  `undecided`, because a live implementation on another platform may out-mature it (this is
  exactly what happens with billing and communications).

## The two contested capabilities (decisions the CEO/architecture still owns)

The registry does not paper over conflicts — it surfaces them:

| Capability         | HL-BOS Core                          | Venuewise Platform                   | The decision                                        |
| ------------------ | ------------------------------------ | ------------------------------------ | --------------------------------------------------- |
| **billing**        | partial (Stripe stubbed, undeployed) | **production** (live Stripe suite)   | Adopt Venuewise's live Stripe, or finish HL-BOS's?  |
| **communications** | partial (built, undeployed)          | **production** SMS + functional push | Adopt Venuewise's live SMS, or deploy HL-BOS comms? |

`contestedCapabilities()` returns exactly these two — capabilities implemented on more than one
platform with **no** settled canonical choice. Everything else has a clear home.

## How the registry answers a product idea

The Definition of Done — "given a product idea, the Factory says which capabilities exist, on
which platform, what's net-new, how it commercializes, and what returns to the catalog" — is
delivered by these functions (all in `factory-registry.ts` / `factory-blueprints.ts`):

- `findImplementations(term)` / `platformsProviding(term)` → **which platform provides X**
- `implementationsForCapability(id)` / `mostMatureImplementation(id)` → **which implementation to use**
- `contestedCapabilities()` → **what needs a canonical decision**
- `implementationsSupportingLayer(L)` / `independentlySellable()` → **how it commercializes**
- `assembleBlueprint(spec)` → **reuse / cross-platform / extend / net-new + the assembly steps**
- `factoryValidation()` → the seven validation questions (see [03](03-validation.md))

The worked blueprints (Logistics, Service, Sports, HockeyIQ) are in [02](02-assembly-blueprints.md).
