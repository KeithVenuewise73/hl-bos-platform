# Software Factory · 00 — HLVS Restoration Inventory (Part 2)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**ASSEMBLE, DON'T REBUILD.** This is the mandatory analysis before any portfolio code: what
HLVS and the Factory **already provide**. Everything below already exists in the repository or
the live HL-BOS Core database. The Product Portfolio engine (Parts 3–6) is built **on top of
these**, not instead of them.

## The question

> "Before extending HLVS into the Product Portfolio Management System — what does HLVS already
> do, so we reuse it and rebuild nothing?"

## The inventory — every capability the brief asks about already exists

| Brief item                     | Already exists as                                                                                          | Evidence                                                                                             | Reuse decision                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Opportunity discovery**      | Discovery engine (collectors → unified profile → scored assessment)                                        | `svc.discovery` / `mod.discovery-engine`; `discovery` schema (19 tables)                             | **REUSE**                                                     |
| **Software recommendations**   | Recommendation engine (rules-as-data, each cites its rule + evidence)                                      | `ai.recommendation-engine`; migration 0023; `pkg.transformation-intelligence`                        | **REUSE**                                                     |
| **Scoring engines**            | Deterministic scoring (Digital Maturity, Business Health, BTI executive, Growth)                           | `ai.deterministic-scoring`; `@hl-bos/bti-engine`; migrations 0020/0023/0026                          | **REUSE**                                                     |
| **Recommendation engines**     | `@hl-bos/transformation-intelligence` (impact, factory-reuse %, approval gating)                           | `packages/transformation-intelligence` (Phase VIII)                                                  | **REUSE**                                                     |
| **Portfolio management**       | Enterprise Catalog + Factory registry + assembler + compositions                                           | `@hl-bos/catalog` (`registry.ts`, `factory-registry.ts`, `factory-blueprints.ts`, `compositions.ts`) | **REUSE + EXTEND**                                            |
| **Market analysis**            | Discovery assessment + HL-BTI engagement (customer-level). Standing market-size research is **not** built. | `discovery`/`bti` schemas                                                                            | **REUSE (customer); market-size stays `not_estimated`)**      |
| **Commercialization analysis** | Commercialization Law L1–L5 layer mapping across every implementation                                      | `factory-registry.ts` `commercializationLayers`; harvest doc 03                                      | **REUSE**                                                     |
| **Approval workflows**         | Human-approval gate (instances/tasks/approvals) + catalog governance                                       | `wf.human-approval-gate`; `svc.workflows`; `wf.catalog-governance`                                   | **REUSE**                                                     |
| **Launch workflows**           | Factory lifecycle (creation order → prompt package → build package) + provisioning readiness + conformance | `wf.factory-lifecycle`, `wf.provisioning-readiness`, `wf.conformance-review`; migration 0025         | **REUSE**                                                     |
| **Monitoring**                 | Factory readiness engine + conformance engine + platform status (deterministic verdicts)                   | `ai.readiness-engine`, `ai.conformance-engine`; `platform_status`                                    | **REUSE** (runtime monitoring is gated — 0 edge fns deployed) |

## The Factory anti-duplication engine (already enforceable)

HLVS already makes "reuse before rebuild" enforceable, not a slogan:

- **`duplicateCheck` / `evaluateReuse` / `canRegister`** (`capability-reuse.ts`) — deterministic
  REUSE / EXTEND / CONSOLIDATE / OVERLAP / BUILD verdicts, no AI in the decision.
- **`assembleProduct` / `assembleBlueprint`** — the real assembler that computes reuse %,
  missing modules and net-new work.
- **`softwareOpportunities()`** (`transformation-intelligence/hlvs.ts`) — already rolls a
  customer assessment up into per-customer software opportunities with a Factory reuse picture.

## What was genuinely missing (the only gap the portfolio engine fills)

HLVS could evaluate opportunities **per customer assessment**, and the Factory foundation
(Execution Phase 1) could reason **per product idea across platforms**. What did not exist was
the **standing, permanent portfolio layer** that:

1. Puts **every** known software opportunity into **one** master catalog (not just those a
   customer assessment surfaced).
2. Moves every idea through **one** standard lifecycle.
3. Gives the CEO a **single dashboard** and a **single `evaluateIdea` entry point**.

That — and only that — is what Parts 3–6 add, reusing every engine above. No scoring engine,
recommendation engine, approval workflow, or assembler was rebuilt.

## Honesty note (Principle 10)

Two items above are deliberately **not** claimed as complete:

- **Market analysis / market size** — customer-level assessment exists; standing market-size
  numbers do not, so every product's market size is `not_estimated`, never invented.
- **Runtime monitoring** — the deterministic readiness/conformance verdicts exist in code, but
  0 edge functions are deployed to HL-BOS Core, so live runtime monitoring is gated, not
  operational. The portfolio reports this honestly rather than showing a green light.
