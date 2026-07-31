# The Herman Legacy Software Factory — Foundation (Executive Summary)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Status: Foundation operational. Awaiting CEO approval before assembling any product.**

## What you asked for

Build the operational Herman Legacy Software Factory **inside** the existing HL-BOS platform —
by assembling and extending what we already own, not by building a new platform, a new database,
or a duplicate of what exists. Make it able to answer, for any product idea: _which capabilities
already exist, on which platform, what's net-new, how it commercializes, and what returns to the
catalog._

## What was built

**One missing layer, added in code, fully reversible, with no database migration and no new
Supabase project.** Everything targets the canonical HL-BOS Core project
(`mvvtngiopdrgiedjmhfb`) — connection verified before any work.

Checkpoint 1 found that **most of the Factory already existed** in `@hl-bos/catalog` (the
capability library, reuse governance, product compositions, the assembler, the Knowledge Graph,
the Enterprise Catalog). So we did **not** rebuild it. We added the two concepts it could not
express — **Source Platform** and **Capability Implementation** — and the cross-platform
reasoning on top.

### The result in one screen

- **3 source platforms** registered: HL-BOS Core (operational), Venuewise (external, read-only
  reference), HSCS (planned placeholder).
- **49 capability implementations** mapped: 27 HL-BOS (derived from the verified library) + 22
  Venuewise (from the read-only harvest) + 0 HSCS. **43 are reusable today.**
- **2 contested capabilities** surfaced honestly (billing, communications — live on Venuewise,
  incomplete on HL-BOS) — real decisions, not hidden.
- **4 worked assembly blueprints** across 3 markets, including **HockeyIQ** — which the Factory
  shows is **~80% assembly, 2 net-new hockey-specific builds**.
- **117/117 catalog tests green.** Every claim above is asserted in code.

## The Definition of Done — met

> _Given a product idea, the Factory answers: which capabilities / platforms / adapters /
> net-new / commercialization / return-to-catalog._

Proven live by `factoryValidation()` and the four blueprints. See
[03-validation.md](03-validation.md) for the seven answers.

## Deliverables

| #   | Deliverable                                    | Where                                                                                         |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Reuse assessment (what already exists)         | [00-checkpoint1-reuse-assessment.md](00-checkpoint1-reuse-assessment.md)                      |
| 2   | Source Platform model + registry               | `factory-registry.ts` `SourcePlatform` / `SOURCE_PLATFORMS`                                   |
| 3   | Capability Implementation model                | `factory-registry.ts` `CapabilityImplementation`                                              |
| 4   | HL-BOS capability catalog (implementations)    | `HLBOS_IMPLEMENTATIONS` (derived from verified `CAPABILITIES`)                                |
| 5   | Venuewise capability catalog (implementations) | `VENUEWISE_IMPLEMENTATIONS` (from read-only harvest)                                          |
| 6   | Factory Master Registry (system of record)     | `CAPABILITY_IMPLEMENTATIONS` + [01-factory-master-registry.md](01-factory-master-registry.md) |
| 7   | Commercialization layer mapping (L1–L5)        | per-implementation `commercializationLayers` + validation Q6/Q7                               |
| 8   | Assembly blueprints (3 markets + HockeyIQ)     | `factory-blueprints.ts` + [02-assembly-blueprints.md](02-assembly-blueprints.md)              |
| 9   | The 12-step Factory Order Process              | `FACTORY_ORDER_PROCESS` + [02-assembly-blueprints.md](02-assembly-blueprints.md)              |
| 10  | Validation (the seven questions)               | `factoryValidation()` + [03-validation.md](03-validation.md)                                  |

## Engineering constraints honored

- **No new Supabase project.** HL-BOS Core only, connection verified first.
- **No production migration.** Pure TypeScript in `@hl-bos/catalog`; reversible by deleting two files.
- **No Venuewise data duplicated.** Capability metadata + object names from the read-only harvest only — never rows, never secrets, never a schema copy. Venuewise rows labeled `harvest_asserted`.
- **No existing HL-BOS functionality duplicated.** The catalog, capabilities, reuse engine, assembler and graph are imported and reused.
- **RLS / tenant / audit / entitlement models untouched** (no schema change at all).
- **Honesty (Principle 10).** Nothing invented; every implementation cites evidence; contested capabilities and net-new work are named, not smoothed over.

## The one decision that comes next

The foundation stops here, by design. Before the Factory assembles an actual product, the CEO
approves **which product to assemble first** and settles the two contested capabilities (adopt
Venuewise's live billing/messaging, or finish HL-BOS's). The blueprints in
[02](02-assembly-blueprints.md) make that a one-screen decision — **Venuewise Sports is the only
one of the four that is fully assemblable today with zero net-new engineering.**
