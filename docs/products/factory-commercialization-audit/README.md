# Herman Legacy Software Factory Audit — Assemble, Don't Rebuild

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Author:** Claude (AI engineer)
**Status:** Executive commercialization audit. **No implementation, no new code, no new
schemas, no new infrastructure.** Engineering Law #1 upheld throughout.

## The one-paragraph finding

Herman Legacy has already **built almost everything** it needs to commercialize. The **entire
HL-BOS backend is live on production** at the database layer — 18 schemas, ~130 tables
(identity, billing, discovery, comms, AI gateway, workflows, reviews, HL-BTI, VisibilityAI,
Knowledge Graph, and more) — with **no customer data** yet. 19 reusable modules, 27
capabilities, and 8 edge functions exist. What is _not_ done is **deployment, ignition (keys),
and commercial terms** — plus a small, well-scoped amount of product-surface assembly per
product. **For the top five commercial candidates, zero platform rebuilds are required.**

## What already exists (the reuse dividend)

- **A 9-module shared spine** (identity, tenancy, audit, events, entitlements, workflows,
  billing-core, storage, comms) under **every** product — already built and on production.
- **HL-BTI** — backend live on prod (`bti` schema, 14 tables, 5 public RPCs); the only product
  the code marks `ready_to_launch`.
- **VisibilityAI** — backend live on prod (`visibility` + `discovery`); the lead-gen funnel;
  mock-only, behind one security gate.
- **Knowledge Graph** — live on prod (sealed, fail-closed); cross-product impact analysis.
- **Discovery, Website/SEO, Reviews/Reputation, Scoring, Commerce/Provisioning, AI Gateway** —
  all built; some need the runtime turned on.

## What does NOT exist (named honestly)

- **No shared-UI library** and **no standalone CRM** (contacts live in discovery + identity —
  do not build a new CRM).
- **AthleteHuddle** — not found in the codebase at all. **5-Star Sports Media** — external
  marketing sites only. **FleetHuddle / CoachAI** — name-only stubs. **HomeHuddle / Venuewise**
  — external sites + an unresolved business decision. **None of these are HL-BOS products; none
  can be "reused" because none were built here.**

## The Assembly Matrix (headline)

Every viable product composes from the same built capabilities; the only real work is the
small **net-new** column + deployment (full grid in [03-assembly-matrix.md](03-assembly-matrix.md)):

| Product                           | Platform rebuilds | Net-new engines | Real delta to ship          |
| --------------------------------- | :---------------: | :-------------: | --------------------------- |
| HL-BTI                            |         0         |        0        | deploy + 3 evidence bridges |
| VisibilityAI                      |         0         |        0        | live-egress security + UI   |
| Review Mgmt / Reputation Recovery |         0         |        0        | thin UI                     |
| SalonAI                           |         0         |        0        | salon domain + app surfaces |
| TransportationAI / ReceptionAI    |         0         |     1 each      | one engine + app            |

## Recommended commercial launch sequence

Optimized for **minimum new engineering × maximum recurring revenue** (detail in
[04-launch-sequence.md](04-launch-sequence.md)):

1. **HL-BTI** (consultant-operated) — deploy-only; engagement fees now; funds the rest.
2. **VisibilityAI** — the subscription **funnel**; turns on recurring revenue and the upsell pipeline.
3. **Review Management + Reputation Recovery** — thinnest wraps; recurring subscription; upsell from #2.
4. **SalonAI** — first full Factory vertical (pilot: Canvas Hair Co.); vertical SaaS.
5. **TransportationAI / ReceptionAI / new verticals** — only when a named customer justifies the one net-new engine.

## What unlocks all of it (your decisions — not more building)

1. 🔑 Grant the **Anthropic API key**. 2. 🔑 Authorize **deploy** (edge runtime + first app).
2. 🔑 Set **commercial terms** (every price is `pending-ceo`). 4. 🔑 **Billing:** out-of-band
   first, or finish the Stripe adapter. 5. 🔑 Approve **VisibilityAI security hardening** before
   any real-site scan.

## Documents

| #   | Document                                                 | Contents                                                                                             |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | [01-capability-inventory.md](01-capability-inventory.md) | Every capability: maturity, code, prod-readiness, who uses / should reuse it, internal-vs-commercial |
| 2   | [02-product-evaluations.md](02-product-evaluations.md)   | Every product: what exists, % complete, reuse, missing, must-not-rebuild                             |
| 3   | [03-assembly-matrix.md](03-assembly-matrix.md)           | The Software Factory Assembly Matrix (product × capability)                                          |
| 4   | [04-launch-sequence.md](04-launch-sequence.md)           | Launch sequence: min engineering × max recurring                                                     |

## Grounding & honesty

Every capability, product, schema, and readiness signal here is taken from the codebase
(`packages/catalog` registries, `MODULE_REGISTRY`, `compositions`, `supabase/functions`) and a
**live production check on 2026-07-31** (18 schemas / ~130 tables confirmed applied). **No
prices, customers, metrics, or product maturities were invented**; where a name has no code,
this audit says so. Platform Foundation v1.0 stands complete and frozen — **nothing here
proposes expanding it.**
