# Herman Legacy Digital · Release 1 — Implementation Reuse Map (Checkpoint 1)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implementation-specific** (not the Phase 5 architecture re-run). Target verification and the
concrete reuse-vs-net-new map for the code in `apps/herman-legacy-digital`.

## Target verification (done before any change)

| Check                            | Result                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| Repository                       | `KeithVenuewise73/hl-bos-platform` ✅                              |
| Branch                           | `claude/hlvs-architectural-assessment-ltqs1b` ✅                   |
| Canonical Supabase project       | `mvvtngiopdrgiedjmhfb` (HL-BOS Core) — reachable, healthy ✅       |
| Venuewise `urwnbskrtoplgnkkxuvl` | **not reachable** from this session — cannot be written to ✅      |
| App location                     | `apps/herman-legacy-digital` (new app in the existing monorepo) ✅ |
| Deployment pattern               | Reuses the Executive Portal Dockerfile / Herman Legacy Cloud ✅    |
| Duplicate customer-facing app?   | None (executive-portal is internal read-only; hl-bti is a demo) ✅ |

No SQL was executed and no migration was applied; this phase is application code only.

## The reuse map

| Existing component          | Existing route/app                                       | Backend capability               | HL-Digital usage                             | Thin adapter                                                             | Net-new presentation |
| --------------------------- | -------------------------------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ | -------------------- |
| Supabase SSR auth           | executive-portal `session/middleware/browser`            | HL-BOS identity (Supabase Auth)  | Client login + `/portal` gate                | `src/lib/{session,access,browser}.ts` (client role, `/portal`-only gate) | Login page copy      |
| Product catalog / portfolio | `@hl-bos/catalog` `productCatalog`                       | Portfolio engine (Phase 2)       | Solutions, Industries, Marketplace           | `public-data.ts` public projection (strips internal metrics)             | Public pages         |
| Reference implementations   | `@hl-bos/transformation-intelligence` `referenceLibrary` | Reference engine (Phase 4)       | Resources / case-study cards (honest labels) | `public-data.ts` `referenceBusinesses`                                   | Resources page       |
| Customer lifecycle          | `@hl-bos/transformation-intelligence`                    | Customer Manufacturing (Phase 3) | Portal sections + intake → lifecycle stage   | `intake.ts` builds a lifecycle lead record                               | Portal + intake UI   |
| VisibilityAI / HL-BTI       | catalog capability terms                                 | VisibilityAI, HL-BTI             | Assessment intake + methodology copy         | `intake.ts` (kind=visibility_assessment)                                 | Assessment page      |
| Workflow / comms            | `svc.workflows`, `svc.comms`                             | Human-approval gate, comms       | Intake follow-up + support                   | `persist.ts` delivery webhook (deploy-time)                              | —                    |
| Deployment (Docker/Coolify) | executive-portal `Dockerfile`                            | Herman Legacy Cloud              | Same standalone Node SSR pattern             | `Dockerfile` (port 4400)                                                 | —                    |

**No duplicate systems introduced:** no new identity, CRM, workflow, billing, or portal engine.
Identity is HL-BOS Supabase Auth; the "CRM" is the existing customer lifecycle reached via the
intake lead record; the marketplace/solutions are the existing portfolio, publicly projected.

## Net-new presentation (the approved Phase 5 gap)

The only genuinely new code is **presentation**: the public marketing pages, the assessment/
consultation intake UI + validation, and the authenticated client-portal surface. All of it sits
on top of existing capabilities — assembly, not rebuild.
