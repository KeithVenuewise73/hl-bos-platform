# 12 · Prioritized Implementation Roadmap

A sequenced, **reuse-first** path from where the platform is today to a working Enterprise Catalog. Every step either _deploys_, _surfaces_, or _decides_ — **none rebuilds.** The order is chosen so that each step de-risks the next and produces something demonstrable, in keeping with the operating contract (every session ends in a working capability or a merge-ready change, never a plan).

> This roadmap **does not** begin building the Enterprise Catalog. Designing it is the next phase; this sprint's job was to establish that it can be _extended_ into existence, and to sequence the groundwork.

---

## Legend

- **Type:** ⚙️ Engineering (the engineer does it) · 🔑 Decision (CEO grants access or sets terms) · 🔀 Both
- **Effort:** S (days) · M (1–2 weeks) · L (weeks)

## Stage 0 — Ratify and record (now)

| #   | Step                                                                         | Type | Effort | Why first                              |
| --- | ---------------------------------------------------------------------------- | ---- | ------ | -------------------------------------- |
| 0.1 | Bless this assessment; adopt "extend, don't rebuild" as the Phase II mandate | 🔑   | S      | Everything below assumes it            |
| 0.2 | Confirm the canonical project (HL-BOS Core) and legacy out-of-scope status   | 🔑   | S      | Already decided in ADR-0001; re-affirm |

## Stage 1 — Switch on the runtime (highest leverage)

_Turns a tested-but-inert platform into a running one. All wiring, no new logic._

| #   | Step                                                                                                                        | Type | Effort | Unlocks                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | -------------------------------------------------- |
| 1.1 | Stand up a **governed deploy path** (migrations + edge functions) so this stage is repeatable and audited, not done by hand | ⚙️   | M      | Safe, repeatable everything                        |
| 1.2 | Deploy `ai-gateway` and `events-dispatcher`                                                                                 | ⚙️   | S      | The door and the backbone                          |
| 1.3 | Install `pg_cron` + `pg_net`; schedule the dispatcher                                                                       | ⚙️   | S      | Background work runs on a timer                    |
| 1.4 | **Grant the Anthropic key** into the Vault; flip the provider to active                                                     | 🔑   | S      | Real AI (currently mock only)                      |
| 1.5 | Deploy the workers (`discovery-*`, `commerce-worker`, `hlvs-factory-worker`)                                                | ⚙️   | M      | Discovery, commerce, and factory loops become live |
| 1.6 | Tidy the small hardening items (search_path on one function; leaked-password toggle before public signup)                   | 🔀   | S      | Clean advisor board                                |

**Exit criteria:** a real website scan runs end-to-end, produces a scored assessment and a blueprint, and every AI call shows a real cost in `ai.runs`. Demonstrable in the Console.

## Stage 2 — Put a face on what exists

_Surfaces the catalog and factory that are currently database-only. Reuses the Control Center UI kit and the HL-BTI RPC-client shape._

| #   | Step                                                                                                                                            | Type | Effort | Unlocks                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ----------------------------------- |
| 2.1 | **Enterprise Catalog Console (read-only first)** — browse capabilities, modules, products, editions, templates, and the service/module catalogs | ⚙️   | M      | Leadership can _see_ the owned IP   |
| 2.2 | Add governance actions (approve capability/module/product; review extraction candidates) behind existing permission gates                       | ⚙️   | M      | Govern the catalog without SQL      |
| 2.3 | Factory operator view — creation order → conformance → build package status                                                                     | ⚙️   | M      | The factory loop becomes observable |

**Exit criteria:** the CEO can browse the catalog and approve a catalog change from a screen, with no terminal and no SQL.

## Stage 3 — Prove the full factory loop once

_Exercises the governed path from a catalog entry to a validated (still inert) build package, end-to-end, with a human at each gate._

| #   | Step                                                                                                                                                                                | Type | Effort | Unlocks                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ----------------------------------------------------------------------------- |
| 3.1 | Run one real Software Creation Order through the loop (approve blueprint → order → prompt package → dev run → checkpoint/completion reports → conformance → build package → intake) | 🔀   | M      | Confidence the factory works for real                                         |
| 3.2 | **Decide** whether/how to wire the governed development agent (Claude) to execute orders (`external_execution`)                                                                     | 🔑   | S      | Whether the factory can build autonomously (with gates) or stays human-driven |

**Exit criteria:** one build package reaches `accepted_for_controlled_deployment_review`, validated by the deterministic conformance engine, with a documented human decision at each gate.

## Stage 4 — Complete the commercial path (as needed)

| #   | Step                                                                                       | Type | Effort | Unlocks                                            |
| --- | ------------------------------------------------------------------------------------------ | ---- | ------ | -------------------------------------------------- |
| 4.1 | Implement the **Stripe adapter** + deploy `billing-webhook`                                | ⚙️   | M      | Real payments (only before charging anyone)        |
| 4.2 | **Set** pricing, licensing, and module-ownership terms (the fields the Factory left blank) | 🔑   | M      | The catalog can quote and sell                     |
| 4.3 | Implement live integration connectors as specific needs arise                              | ⚙️   | M      | Real external data (PageSpeed, Google Business, …) |

## Stage 5 — Extend products (assemble, don't invent)

| #   | Step                                                                                                                   | Type | Effort | Unlocks                            |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ---------------------------------- |
| 5.1 | Finish **VisibilityAI** (customer UI + scanning worker over the existing engine)                                       | ⚙️   | L      | The first customer-facing vertical |
| 5.2 | Assemble the next vertical (e.g. SalonAI) from existing modules via the Factory                                        | ⚙️   | L      | Proves the assembly line at scale  |
| 5.3 | Reconsider deferred shared services (reporting; shared CRM) only when a real requirement pulls them in (Rule of Three) | ⚙️   | M      | Avoids premature abstraction       |

## Stage 6 — Legacy convergence (separate, gated program)

| #   | Step                                                                                                                         | Type | Effort | Unlocks                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ------------------------------------ |
| 6.1 | **Decide** convergence vs. coexistence for legacy products (Venuewise et al.)                                                | 🔑   | M      | Direction for the legacy estate      |
| 6.2 | If converging: register → adopt platform plane → re-implement page-by-page → one-time approved data migration → decommission | ⚙️   | L      | Retire the legacy duplication safely |

## The decisions only the CEO can make (collected)

These gate specific stages and are business-trust choices, not engineering chores:

| Decision                                     | Gates             | Report |
| -------------------------------------------- | ----------------- | ------ |
| Grant the Anthropic key                      | Stage 1 (real AI) | 07     |
| Wire the development agent to execute orders | Stage 3           | 09     |
| Set pricing / licensing / module ownership   | Stage 4           | 09     |
| Stripe / real-payments go-ahead              | Stage 4           | 05     |
| Legacy convergence vs. coexistence           | Stage 6           | 11     |

## What this roadmap deliberately refuses to do

- Rebuild any existing capability.
- Create empty schemas, packages, or catalog storage "to look complete."
- Touch the legacy project without an approved plan.
- Deploy anything to production without the governed path (Stage 1.1) in place.
- Fabricate a metric, run, or payment to make a screen look finished.

**The through-line:** the platform's value is already built. This roadmap turns it on, shows it, proves it once, and then assembles on top of it — in that order, with the CEO holding the few decisions that are genuinely his to hold.
