# Remaining Critical Tasks

The precise, ordered list of what stands between the completed platform and commercial production. Each is tagged ⚙️ (engineering — the AI engineer does it) or 🔑 (CEO decision / access grant). None requires a redesign.

## Blocking commercial production

| #   | Task                                                                                            | Type    | Why it blocks                                                                                  | Unblocks                                   |
| --- | ----------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | **Set pricing, licensing, and module ownership**                                                | 🔑      | Commercial readiness is 0% until terms exist; the Factory can produce software it cannot price | All selling; commercial metadata completes |
| 2   | **Grant the Anthropic key + deploy the edge runtime** (gateway, dispatcher, workers, scheduler) | 🔑 + ⚙️ | The spine is built but inert; no product can run or use real AI                                | Live products; real AI                     |
| 3   | **Implement the Stripe adapter + deploy the billing webhook**                                   | ⚙️      | No product can charge a customer                                                               | Real payments                              |
| 4   | **Stand up a governed deploy path**                                                             | ⚙️      | Deploying by hand isn't repeatable or auditable                                                | Safe, repeatable releases                  |

## Completing the Factory (non-blocking, high value)

| #   | Task                                                                                    | Type    | Effect                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | **Approve & apply the module-registry seed** (`proposed/0029-module-registry-seed.sql`) | 🔑 + ⚙️ | Persists `hlvs.modules` (0 rows today) so the factory's own RPCs can reason over the registry; moves the checklist item from "code done / gated" to "in place" |
| 6   | **Decide development-agent wiring** (`external_execution`)                              | 🔑      | Chooses governed vs. automated builds — the difference between a factory you run by hand and one that assembles on command                                     |
| 7   | **Build the reporting/analytics shared service**                                        | ⚙️      | The one missing shared service; unlocks the executive revenue view and factory-throughput metrics                                                              |
| 8   | **Wire the registry scan into CI**                                                      | ⚙️      | An unregistered new asset fails the build — mechanical "register before you build"                                                                             |

## First product to production (parallel with the above)

| #   | Task                                         | Type | Effect                                                                 |
| --- | -------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| 9   | **Finish HL-BTI to first live customer**     | ⚙️   | 80% done, ready-to-launch, fastest revenue                             |
| 10  | **Finish VisibilityAI** (UI + scan worker)   | ⚙️   | The lead-generation funnel for the whole portfolio                     |
| 11  | **Assemble SalonAI** from registered modules | ⚙️   | Proves the assembly line at product scale (the Factory demo made real) |

## What is explicitly NOT on this list

- **No new foundational modules** — every product's foundation already exists (proven by the assembler).
- **No architecture changes** — the platform is not redesigned.
- **No video/broadcast AI** — the only genuinely greenfield work; a separate, CEO-funded frontier, not platform completion.
- **No legacy migration** — a separate approved program.

## The critical path in one line

**Set commercial terms (🔑) + switch on the runtime (🔑/⚙️) → HL-BTI live → VisibilityAI live → SalonAI assembled.** Everything else is parallelizable or deferrable.
