# 07 · Executive Priority Roadmap

The sequenced, reuse-first path to completing the platform and the vision. Ordered so each step unlocks the next and so the cheapest, highest-value wins come first. This is a **completion** plan — it builds nothing that already exists.

**Type:** ⚙️ Engineering · 🔑 CEO decision/trust · 🔀 both. **Effort:** S/M/L/XL.

## Wave 0 — Ignition (unlocks everything; mostly wiring)

| #   | Step                                                                                                                        | Type | Effort |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| 0.1 | Switch on the runtime — deploy gateway + dispatcher + workers, install scheduler, grant the Anthropic key (Phase I Stage 1) | 🔀   | M      |
| 0.2 | Populate `hlvs.modules` from the Phase II catalog (approval) so the factory's record matches reality                        | 🔀   | S      |
| 0.3 | Stand up a governed deploy path (so all of the above is repeatable/audited)                                                 | ⚙️   | M      |

## Wave 1 — Commercialize what is already built (fastest revenue)

| #   | Step                                                                                                       | Type | Effort |
| --- | ---------------------------------------------------------------------------------------------------------- | ---- | ------ |
| 1.1 | **Set pricing, licensing, and module ownership** (unblocks all selling)                                    | 🔑   | M      |
| 1.2 | Implement the Stripe adapter + deploy the billing webhook                                                  | ⚙️   | M      |
| 1.3 | **Finish HL-BTI to first live customer** — deploy the app + `bti` schema; it is 80% done                   | ⚙️   | M      |
| 1.4 | **Finish VisibilityAI** — customer UI + scanning worker over the existing engine (the lead-gen front door) | ⚙️   | L      |

## Wave 2 — The reporting gap + the first assembled vertical

| #   | Step                                                                                                                 | Type | Effort |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| 2.1 | Build the **reporting/analytics** shared service (the one missing shared service); wire the executive revenue view   | ⚙️   | M      |
| 2.2 | **Assemble SalonAI** from existing modules via the Factory — the proof that the assembly line works at product scale | ⚙️   | L      |
| 2.3 | Decide the development-agent wiring (governed vs automated builds)                                                   | 🔑   | S      |

## Wave 3 — Strategic consolidation (Venuewise)

| #   | Step                                                                                                                                                                                | Type | Effort |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| 3.1 | **Convergence vs. coexistence decision for Venuewise Core** (engineering recommends convergence)                                                                                    | 🔑   | M      |
| 3.2 | If converging: register → adopt HL-BOS platform plane → re-implement Huddles/community/facility/media domains page-by-page → one-time approved data migration → decommission legacy | ⚙️   | XL     |
| 3.3 | Authorize the four manual verifications of the legacy estate (HighlightAI/BroadcastAI/HSCS-GLP/private repos) before declaring them nonexistent                                     | 🔑   | S      |

## Wave 4 — The genuinely new frontier (only after the above pays for it)

| #   | Step                                                                                                   | Type | Effort |
| --- | ------------------------------------------------------------------------------------------------------ | ---- | ------ |
| 4.1 | Decide whether to build **HighlightAI** (greenfield video-AI) — real investment; no reuse dividend     | 🔑   | S      |
| 4.2 | If yes: build HighlightAI on the deterministic-engine + advisory-AI pattern (ingest/transcode/CV/clip) | ⚙️   | XL     |
| 4.3 | **BroadcastAI** — only after HighlightAI proves the media stack                                        | 🔀   | XL     |

## Wave 5 — Fill out the vertical catalog (assembly, on demand)

| #   | Step                                                                                                         | Type | Effort |
| --- | ------------------------------------------------------------------------------------------------------------ | ---- | ------ |
| 5.1 | Assemble HomeHuddle / ReceptionAI / Review Management / Reputation Recovery from modules as demand justifies | ⚙️   | L each |
| 5.2 | Extract a shared `crm` only when a third product needs it (Rule of Three)                                    | ⚙️   | M      |
| 5.3 | Reconsider legacy migration (HSCS-GLP) under a separate approved plan                                        | 🔑   | XL     |

## The decisions only the CEO can make (collected)

| Decision                                   | Blocks                        | Wave  |
| ------------------------------------------ | ----------------------------- | ----- |
| Grant the Anthropic key                    | real AI                       | 0     |
| Set pricing / licensing / module ownership | all selling                   | 1     |
| Development-agent wiring                   | automated builds              | 2     |
| Venuewise convergence vs. coexistence      | the biggest strategic overlap | 3     |
| Build HighlightAI/BroadcastAI?             | media frontier                | 4     |
| Authorize legacy verifications / migration | legacy revenue                | 3 / 5 |

## The through-line

**Ignite → commercialize the built → close the reporting gap → assemble the first vertical → resolve Venuewise → then, and only then, invest in the greenfield frontier.** Every wave before Wave 4 spends mostly _reuse_; Wave 4 is the first place real new capability is built. That ordering maximizes revenue-per-effort and honors reuse-before-rebuild.
