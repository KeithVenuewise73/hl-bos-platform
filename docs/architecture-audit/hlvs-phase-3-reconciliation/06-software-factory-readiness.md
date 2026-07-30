# 06 · Software Factory Readiness Assessment

Does Herman Legacy now possess every core capability required to operate as a **reusable AI Software Factory** — a system that turns an approved product idea into governed, validated, deployable software assembled from shared modules? This assesses the foundational capabilities and names what must be in place before more products are created.

## The verdict

**Yes on design and governance; not yet on execution.** Every _structural_ capability of a software factory exists and is tested. What is missing is **execution wiring**: the runtime is not switched on, the engineering module registry is empty, and the development agent is not connected. None of these is a redesign — they are the ignition steps Phase I already sequenced.

## Core capability checklist

| Factory capability                                                                | Required for                        | Status                                      | Evidence                                                            |
| --------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| **Catalog of what we own** (capabilities, modules, products, editions, templates) | Knowing what to reuse               | ✅ Built (content partly seeded)            | `hlvs.*` + Enterprise Catalog                                       |
| **Duplicate-risk prevention**                                                     | Reuse before rebuild                | ✅ Built                                    | `hlvs.duplicate_check` (deterministic, human-approved)              |
| **Capability extraction framework**                                               | Harvesting legacy IP                | ⚠️ Built, unused                            | `hlvs.extraction_candidates` = 12 candidates, all still "candidate" |
| **Product technical blueprint → creation order → prompt package**                 | Authorizing a build                 | ✅ Built                                    | migration 0025; immutable approved blueprints                       |
| **Governed development run tracking**                                             | Running a build safely              | ✅ Built (agent-neutral, inert)             | `hlvs.development_runs`                                             |
| **Conformance validation**                                                        | Proving the build matches the order | ✅ Built (deterministic, non-waivable list) | conformance engine                                                  |
| **Readiness gate → build package → HL-BOS intake**                                | Handing off a validated product     | ✅ Built                                    | `hlvs.factory_build_packages`, `hlbos_intake`                       |
| **Shared spine to assemble from**                                                 | Not rebuilding foundations          | ✅ Built (14 domains)                       | live schemas, 100% RLS                                              |
| **Human approval gates on everything risky**                                      | Safety                              | ✅ Built                                    | `workflows`; "AI approves nothing"                                  |
| **Reuse governance surface (the catalog)**                                        | Executive oversight                 | ✅ Built (Phase II)                         | `/catalog` console                                                  |
| **Engineering module registry populated**                                         | The factory's authoritative record  | 🔴 Dormant                                  | `hlvs.modules` = **0 rows**                                         |
| **Runtime switched on** (gateway, dispatcher, workers, scheduler, AI key)         | Actually executing builds/AI        | 🔴 Not deployed                             | 0 edge functions deployed                                           |
| **Development agent wired** (`external_execution`)                                | Autonomous (gated) building         | 🔴 Deliberately off                         | always `external_execution:false` — a CEO decision                  |
| **Pricing / licensing / ownership set**                                           | Commercializing factory output      | 🔴 Unset                                    | `pending-ceo:*`; 0 editions                                         |
| **Reporting on factory output**                                                   | Measuring throughput                | 🔴 Missing                                  | no reporting service                                                |

**Score: 10 of 15 core capabilities fully in place; 5 are ignition/decision items, none requiring redesign.**

## The five things to put in place before making more products

1. **Populate `hlvs.modules`** (with approval) so the factory's engineering record matches reality — otherwise it can't reason about reuse. _(Data entry via existing RPCs; the modules are already catalogued in Phase II.)_
2. **Switch on the runtime** (Phase I roadmap Stage 1): deploy the gateway + dispatcher + workers, install the scheduler, grant the AI key. Until then the factory can model a build but not execute one.
3. **Decide the development-agent wiring** — whether Claude executes approved creation orders (gated) or builds stay human-driven. This is the difference between a _governed_ factory and an _automated_ one.
4. **Set commercialization inputs** — pricing, licensing, module ownership. The factory can produce software it cannot yet sell.
5. **Stand up the reporting service** so factory throughput and product readiness are visible (this assessment is a static substitute).

## Is Herman Legacy a reusable AI Software Factory today?

**It is a fully-designed, governed factory whose machinery is built and tested but not powered on.** The blueprint → creation order → conformance → build-package → intake loop exists end to end; the shared spine to assemble from exists; the anti-duplication and human-gate governance exists. Turn on the runtime, fill the module registry, and set the commercial terms, and it operates as a factory — assembling verticals like SalonAI from existing modules rather than hand-building them. No foundational capability is _missing by design_; the gaps are ignition and decisions.
