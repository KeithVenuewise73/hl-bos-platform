# Venuewise Capability Harvest — Executive Summary

**For:** Keith Herman, CEO · **Author:** Claude (AI engineer) · **Date:** 2026-07-31
**Read-only harvest. Nothing was modified, written, deployed, or migrated.** Engineering Law #1
upheld — this task only _discovers and documents_ Venuewise/Huddle capabilities for reuse.

## The question this answers

> _"What functional software has already been created inside Venuewise/Huddle, and which pieces
> can the Software Factory reuse without rebuilding them?"_

## The answer, in one paragraph

**More than the earlier reconciliation could see.** With read access, HomeHuddle turns out to be
**"Venuewise Core" — a real, live, multi-tenant youth-sports/family coordination platform** (its
own docs call HomeHuddle "production Priority #1," with a smoke suite running against
`venuewise.net`). It is built on the _same philosophy as HL-BOS_ (engines-not-products,
workspace+RLS, config-over-code) and already implements a **whole sports/family domain HL-BOS
does not have**: a **merged family/athlete calendar**, **athlete development** (profiles, goals,
stats, videos), **coaching** (directory, connections, spotlight), **family CRM & rosters**,
**clinic registration**, **facility/org management**, a **forms engine**, and — notably — a
**working Stripe subscription flow** where HL-BOS has only a stub. **The Factory can reuse that
sports/family domain and the Stripe flow without rebuilding them.** It should _not_ re-adopt
Venuewise's plumbing (identity/tenancy/workflows/comms), because HL-BOS already has more governed
versions of those.

## What's real vs. not (honest maturity)

|                                                      |                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Production (verified front-end + repo says prod)** | HomeHuddle core: family CRM, merged calendar, registration, **Stripe subscriptions**, PIN login, athlete roster                      |
| **Functional, backend inferred**                     | notifications/SMS, athlete profiles, coaching, schedule sync                                                                         |
| **Prototype / scaffold**                             | FacilityHuddle, OrganizationHuddle, spotlight, forms sandbox, the Venuewise Core _platform_ layer (workspaces/admin)                 |
| **Unknown (backend unreachable)**                    | the two AI edge functions (`smart-task`, `super-processor`)                                                                          |
| **Not software**                                     | the standalone `coaches-huddle-chrismazzu` repo (a bare demo scaffold); the `5star-*`/`hermanlegacy*` repos (static marketing sites) |

⚠️ **Honesty boundary:** the Huddle **backend** (Supabase project `urwnbskrtoplgnkkxuvl`) is
**not reachable** by my credentials. I harvested the capability _surface_ from the front-end
(~30 tables, 8 edge functions, 12 RPCs, Stripe — all named in the code) and the repo's own
status docs; I could **not** read or run the database. The one _reachable_ Venuewise Supabase
project is **empty** — it is not the backend. Full detail: [00-evidence-and-scope.md](00-evidence-and-scope.md).

## Which pieces the Factory can reuse without rebuilding

| Reuse tier                                                                  | Capabilities                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Refactor into a shared HL-BOS module** (no equivalent exists — pure gain) | Merged family/athlete **calendar** ⭐ · **athlete development** · **coaching** · **family roster/CRM** · **registration** · **forms engine** · facility/org management · public athlete profiles |
| **Reuse with adapter** (fills a real HL-BOS gap)                            | **Working Stripe subscription flow** ⭐ (HL-BOS billing is a 501 stub) · SMS · web-push · lead capture                                                                                           |
| **Do NOT re-adopt** (HL-BOS already has it, more governed)                  | Venuewise identity/tenancy/workflows/comms/admin/backend                                                                                                                                         |
| **Investigate first**                                                       | the two AI edge functions (need backend access)                                                                                                                                                  |
| **Ignore**                                                                  | the demo scaffold + marketing sites                                                                                                                                                              |

## Venuewise vs HL-BOS (the four buckets)

- **In both (overlapping plumbing → future decision):** identity, tenancy, workflows, comms,
  billing, admin, AI edge layer.
- **Only Venuewise (the harvest prize):** sports/family/athlete/coaching domain + working Stripe.
- **Only HL-BOS:** HL-BTI, VisibilityAI/discovery, Knowledge Graph, gov-contracts, the Software
  Factory/Catalog, entitlements, governed production.
- **Overlapping → decide later (not now):** which implementation is canonical for each shared
  engine (recommendation to _weigh_: HL-BOS for plumbing; harvest Venuewise's Stripe flow).

Detail: [02-hlbos-comparison.md](02-hlbos-comparison.md).

## Why this matters commercially (ties to the execution plan)

- It reveals a **ready-made youth-sports vertical** (AthleteHuddle / CoachesHuddle /
  FacilityHuddle as _real_ software) the Factory could assemble onto the HL-BOS spine — a
  Level-3/Level-5 opportunity that did **not** exist in the prior "name-only stubs" picture.
- Venuewise's **working Stripe flow** is a candidate fix for the exact billing gap flagged as a
  blocker in the [Execution Phase 1 plan](../execution-phase-1/README.md) (HL-BOS Stripe = 501
  stub). Harvesting it (reuse-with-adapter) could accelerate self-serve recurring revenue.

## What I did NOT do (per task boundaries)

No writes to any Supabase project · no schema/migration/deploy/env changes · no redesign · **no
migration recommended or executed.** This is discovery and documentation only. Any decision to
harvest, migrate, or converge is a **separate, CEO-approved** step.

## Documents

| #   | Document                                                           | Contents                                                                                   |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 0   | [00-evidence-and-scope.md](00-evidence-and-scope.md)               | Exactly what was inspected / not reachable; backend shape; honesty boundary; security note |
| 1   | [01-capability-harvest-matrix.md](01-capability-harvest-matrix.md) | The Capability Harvest Matrix — 13 categories, 11 fields per capability                    |
| 2   | [02-hlbos-comparison.md](02-hlbos-comparison.md)                   | Both / Venuewise-only / HL-BOS-only / overlapping-decision + Factory classification        |
