# Canonical Asset Inventory · 02 — Product reconciliation

**Reconciliation only. No code.** Every named Herman Legacy product, reconciled against the
canonical HL-Cloud and the legacy/external estate. Disposition ∈ {REUSE, MIGRATE, MERGE,
LEAVE INDEPENDENT, RETIRE}. Where a name has **no discoverable asset**, that is stated plainly
— a name is not an asset and cannot be reused, migrated, or retired.

| Product                 | Where it actually exists                                                                              | Product association / kind            | Maturity                                                           | Dependencies                     | Disposition                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| **HL-BTI**              | HL-Cloud — `bti` schema (14 tables, 5 RPCs) **live on prod**; `apps/hl-bti` build                     | Commercial product (#1)               | Ready-to-launch (deploy + terms)                                   | AI key, deploy, terms            | **REUSE** (deploy)                                                                  |
| **VisibilityAI**        | HL-Cloud — `visibility`(8)+`discovery`(19) **live on prod**                                           | Commercial product / funnel (#2)      | Prototype; mock-only; SSRF gate open                               | Live-egress security, UI         | **REUSE** (assemble + secure)                                                       |
| **Discovery Engine**    | HL-Cloud — `discovery` schema + workers                                                               | Internal capability (powers products) | Engine built; egress mock                                          | AI key, egress                   | **REUSE**                                                                           |
| **SalonAI**             | HL-Cloud — `salon_ai` composition (modules built)                                                     | Vertical product                      | Needs assembly (no app)                                            | Salon domain + app surfaces      | **REUSE** (assemble)                                                                |
| **TransportationAI**    | HL-Cloud — `transportation_ai` composition                                                            | Vertical product                      | Not yet (needs route engine)                                       | Route-assessment engine + app    | **REUSE** (assemble + 1 engine)                                                     |
| **HomeHuddle**          | External site (`homehuddle` repo, `venuewise.net`) **+** HL-Cloud `home_huddle` composition (not_yet) | Venuewise "Huddle" line               | Site live; HL-BOS product not built; blocked on Venuewise decision | Venuewise convergence decision   | **LEAVE INDEPENDENT** (site) — future assemble in HL-Cloud                          |
| **CoachesHuddle**       | External **live Vercel app** (`coaches-huddle-chrismazzu`, Chris Mazzu), "powered by Venuewise"       | Venuewise "Huddle" line               | Live, real customer                                                | Venuewise brand                  | **LEAVE INDEPENDENT** (live) — **MERGE** candidate into a future CoachAI            |
| **Venuewise**           | External brand: `venuewise.net`, parked Supabase project, branding on HomeHuddle/CoachesHuddle        | Brand / platform-of-origin            | Brand live; no HL-BOS product code                                 | —                                | **LEAVE INDEPENDENT** (business "convergence decision," not an engineering asset)   |
| **5-Star Sports Media** | External sites (`5star-sports-media`, `5starsportsmedia.com`, `5starcommunityevents`)                 | Marketing / media brand               | External static sites only                                         | —                                | **LEAVE INDEPENDENT**                                                               |
| **CoachAI**             | **No HL-BOS code** (name-only stub). Closest real asset = the external CoachesHuddle app              | Future vertical                       | 0% (no code)                                                       | Would assemble from spine        | **No asset today** — future Software Factory assembly (see CoachesHuddle for MERGE) |
| **FleetHuddle**         | **No code** (registry `not-started`; one legacy integration point in prose)                           | Future vertical                       | 0%                                                                 | —                                | **No asset today** — future greenfield                                              |
| **AthleteHuddle**       | **Not found anywhere** (no repo, schema, composition, or registry entry)                              | Name only                             | 0%                                                                 | —                                | **No asset** — does not exist                                                       |
| **FacilityHuddle**      | **Not found anywhere**                                                                                | Name only                             | 0%                                                                 | —                                | **No asset** — does not exist                                                       |
| **TournamentHuddle**    | **Not found anywhere**                                                                                | Name only                             | 0%                                                                 | —                                | **No asset** — does not exist                                                       |
| **BroadcastAI**         | **No code** — documented as "greenfield, separately-funded frontier" (Phase V closeout)               | Future frontier                       | 0%                                                                 | Net-new video/broadcast platform | **No asset today** — future greenfield (separately funded)                          |
| **HighlightAI**         | **No code** — same greenfield frontier note                                                           | Future frontier                       | 0%                                                                 | Net-new video platform           | **No asset today** — future greenfield (separately funded)                          |

## Legacy products (in the unreachable legacy Supabase project — documented only)

| Product                       | Where                                                              | Maturity                                                            | Disposition                                                                             |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **HLVS Venture Studio**       | legacy project (`hlvs` schema, 59 tables)                          | Legacy live; patterns already generalized into HL-BOS `hlvs` schema | **LEAVE INDEPENDENT** (quarantined) — its _patterns_ are already **REUSE**d in HL-Cloud |
| **HSCS Government Logistics** | legacy project (`hscs_glp`, 74 tables) + `HSCS-GLP` prototype repo | Legacy live; unreachable                                            | **LEAVE INDEPENDENT** (keep running; MIGRATE only under an approved plan)               |
| **AI Asset Recovery**         | legacy project                                                     | Legacy, deprecated, **open cross-tenant security finding**          | **RETIRE** (under an approved security-remediation plan)                                |
| **HSCS Consulting**           | The services business; its software tool is **HL-BTI**             | Practice + HL-BTI tool                                              | **REUSE** HL-BTI (no separate product to build)                                         |

## The honest headline

- **Everything needed to commercialize already lives in HL-Cloud** (HL-BTI, VisibilityAI,
  Discovery, SalonAI/Transportation compositions). Disposition: **REUSE / assemble.**
- **The Venuewise "Huddle" line and 5-Star family are external brands and sites**, plus one
  live external app (CoachesHuddle). Disposition: **LEAVE INDEPENDENT**, with CoachesHuddle a
  future **MERGE** candidate. The "Venuewise convergence decision" is a **business** call.
- **Six named products do not exist as assets** (AthleteHuddle, FacilityHuddle,
  TournamentHuddle, FleetHuddle, BroadcastAI, HighlightAI). They are future Software Factory
  work, not reconciliation items — naming them as non-existent is the point of a true
  inventory.
- **No MIGRATE is required to execute the commercial roadmap.** The legacy project stays
  quarantined; nothing blocks launch.
