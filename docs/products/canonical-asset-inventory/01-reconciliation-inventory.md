# Canonical Asset Inventory · 01 — Reconciliation inventory

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Author:** Claude (AI engineer)
**Discovery / reconciliation only. No code, no migrations, no architecture changes. Engineering
Law #1 (assemble, don't rebuild) upheld.**

Disposition is exactly one of: **REUSE · MIGRATE · MERGE · LEAVE INDEPENDENT · RETIRE.**

## Method & honesty boundary

- **Canonical HL-Cloud (HL-BOS Core `mvvtngiopdrgiedjmhfb`)** — inventoried **live** on
  2026-07-31 (schemas, tables, functions, RPCs).
- **Supabase estate** — enumerated via the account token (only 2 projects are visible to it).
- **GitHub estate** — enumerated live (12 repos, with last-push dates).
- **Legacy Herman Supabase project (`bkfsjhhclbqrhaolvhmz`)** — **NOT reachable** from these
  credentials (confirmed: absent from the token's project list) and **out of scope** per the
  operating contract (open security findings). Classified from documentation only; **not
  inspected, not touched.**
- **Vercel, Stripe, Twilio, AI providers, DNS/domains, cron** — no direct tooling in this
  session; reported from the repo's application registry + docs and marked **"documented, not
  directly verified."** No values invented.

---

## A. Supabase projects

| Name                              | Location                           | Product association                                        | Maturity                                                     | Dependencies               | Disposition                                                                      |
| --------------------------------- | ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------- |
| **HL-BOS Core**                   | `mvvtngiopdrgiedjmhfb` (us-west-2) | The whole HL-Cloud (all products)                          | **Live** — 28 migrations, 18 schemas, ~130 tables            | Anthropic key, edge deploy | **REUSE** (canonical)                                                            |
| **keith@venuewise.net's Project** | `ywrzgursvdowzyhipsmt` (us-east-1) | Venuewise (parked)                                         | **Empty** — 0 business tables (verified today), 0 migrations | none                       | **LEAVE INDEPENDENT** (parked; ADR-0001 keep/don't-delete)                       |
| hlbos-m1-portfolio (preview)      | `moftgnrbnsixeddcwdpz`             | Superseded portfolio/govcon preview                        | Abandoned; not in current project list                       | —                          | **RETIRE** (archive then delete — authorized step)                               |
| legacy-herman-platform            | `bkfsjhhclbqrhaolvhmz`             | HLVS Venture Studio, HSCS Gov Logistics, AI Asset Recovery | **Unreachable** (out of scope; open security findings)       | —                          | **LEAVE INDEPENDENT** (quarantined; RETIRE only under an approved security plan) |

## B. Schemas / tables (canonical HL-BOS Core — all live on prod)

18 business schemas / ~130 tables — **all REUSE** (the canonical data model):

| Schema         | Tables | Capability                          | Disposition |
| -------------- | :----: | ----------------------------------- | ----------- |
| `identity`     |   8    | Identity / tenancy / auth           | REUSE       |
| `platform`     |   1    | Tenants root                        | REUSE       |
| `audit`        |   2    | Audit logging                       | REUSE       |
| `events`       |   4    | Event bus                           | REUSE       |
| `entitlements` |   4    | Feature gating                      | REUSE       |
| `workflows`    |   3    | Human approval                      | REUSE       |
| `billing`      |   8    | Billing (Stripe stubbed)            | REUSE       |
| `sales`        |   7    | Pricing / commercial terms          | REUSE       |
| `storage_meta` |   1    | Storage metadata                    | REUSE       |
| `comms`        |   7    | Communications                      | REUSE       |
| `integrations` |   5    | Connector framework                 | REUSE       |
| `ai`           |   7    | AI gateway                          | REUSE       |
| `discovery`    |   19   | Discovery / website analysis / SEO  | REUSE       |
| `provisioning` |   7    | Sell→provision                      | REUSE       |
| `visibility`   |   8    | VisibilityAI / reviews / reputation | REUSE       |
| `bti`          |   14   | HL-BTI                              | REUSE       |
| `hlvs`         |   19   | HLVS factory patterns (generalized) | REUSE       |
| `graph`        |   6    | Knowledge Graph (sealed)            | REUSE       |

## C. Views / functions / RLS (canonical)

| Asset                                                                     | Location        | Maturity       | Disposition                         |
| ------------------------------------------------------------------------- | --------------- | -------------- | ----------------------------------- |
| Public RPCs `bti_*` (5) + `graph_*` (7)                                   | `public` (prod) | Live           | **REUSE**                           |
| SECURITY DEFINER functions, `_can_see`, publisher, scoring, discovery fns | per schema      | Live           | **REUSE**                           |
| RLS policies (enable + force across schemas incl. all 6 graph tables)     | prod            | Live, enforced | **REUSE**                           |
| Legacy views/functions in `bkfsjhhclbqrhaolvhmz`                          | legacy project  | Unreachable    | **LEAVE INDEPENDENT** (quarantined) |

## D. Edge functions (canonical — built, 0 deployed)

| Function                     | Location             | Product association   | Maturity                   | Disposition                  |
| ---------------------------- | -------------------- | --------------------- | -------------------------- | ---------------------------- |
| `ai-gateway`                 | `supabase/functions` | AI Gateway            | Built, undeployed, keyless | **REUSE** (deploy + key)     |
| `billing-webhook`            | ”                    | Billing               | Built, undeployed          | **REUSE**                    |
| `commerce-worker`            | ”                    | Commerce/provisioning | Built, undeployed          | **REUSE**                    |
| `discovery-website-worker`   | ”                    | Website analysis      | Built, mock egress         | **REUSE** (needs SSRF guard) |
| `discovery-blueprint-worker` | ”                    | Discovery/blueprint   | Built, undeployed          | **REUSE**                    |
| `events-dispatcher`          | ”                    | Event bus             | Built, undeployed          | **REUSE**                    |
| `hlvs-factory-worker`        | ”                    | Software Factory      | Built, undeployed          | **REUSE**                    |

## E. Storage buckets / Authentication

| Asset                                             | Location       | Maturity    | Disposition           |
| ------------------------------------------------- | -------------- | ----------- | --------------------- |
| Storage (module `storage`, `storage_meta` schema) | HL-BOS Core    | Built       | **REUSE**             |
| Supabase Auth (`auth.users` ⋈ `identity`)         | HL-BOS Core    | Live        | **REUSE**             |
| Legacy auth realms                                | legacy project | Unreachable | **LEAVE INDEPENDENT** |

## F. GitHub repositories (12, all `KeithVenuewise73`)

| Repo                                   | Product association                                 | Maturity                                     | Disposition                                                         |
| -------------------------------------- | --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **hl-bos-platform** (private)          | HL-Cloud (canonical)                                | Active, live backend                         | **REUSE** (canonical)                                               |
| **HSCS-GLP** (private)                 | HSCS Government Logistics                           | Prototype (separate)                         | **LEAVE INDEPENDENT** (converge later only if pursued)              |
| **coaches-huddle-chrismazzu** (public) | CoachesHuddle (Chris Mazzu), "powered by Venuewise" | **Live external Vercel app** (real customer) | **LEAVE INDEPENDENT** (live; MERGE candidate into a future CoachAI) |
| homehuddle (public)                    | HomeHuddle                                          | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| 5star-sports-media (public)            | 5-Star Sports Media                                 | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| 5starcommunityevents (public)          | 5 Star Community Events                             | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| 5stargrowthsolutions (public)          | 5 Star Growth Solutions                             | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| hermanlegacygroup (public)             | Herman Legacy Group                                 | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| hermanlegacyfoundation (public)        | Herman Legacy Foundation                            | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| laurieandlewcommunitynetwork (public)  | Community network                                   | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| ddhhomeservices.com (public)           | DDH Home Services                                   | External marketing site                      | **LEAVE INDEPENDENT**                                               |
| herman-supply-chain (public)           | Herman Supply Chain (HSCS marketing)                | External marketing site                      | **LEAVE INDEPENDENT**                                               |

## G. Vercel projects / Domains (documented — not directly verified)

| Asset                                                    | Location                                  | Product              | Maturity         | Disposition               |
| -------------------------------------------------------- | ----------------------------------------- | -------------------- | ---------------- | ------------------------- |
| CoachesHuddle app                                        | Vercel (from `coaches-huddle-chrismazzu`) | CoachesHuddle        | Live             | **LEAVE INDEPENDENT**     |
| Marketing sites                                          | GitHub Pages                              | Various              | Live static      | **LEAVE INDEPENDENT**     |
| `venuewise.net`                                          | DNS (HomeHuddle CNAME)                    | Venuewise/HomeHuddle | Live             | **LEAVE INDEPENDENT**     |
| `5starsportsmedia.com`, `5starcommunityevents.com`, etc. | DNS                                       | 5-Star family        | Live             | **LEAVE INDEPENDENT**     |
| `bti.hermanlegacygroup.com` (planned)                    | DNS (target for `apps/hl-bti`)            | HL-BTI               | Planned          | **REUSE** (deploy target) |
| `control.hermanlegacygroup.com` (planned)                | DNS (Control Center)                      | HL-BOS               | Planned/internal | **REUSE** (internal)      |

## H. API integrations (HL-Cloud seams — ignition points, not separate legacy assets)

| Integration                  | Location                              | Maturity                                       | Disposition                                        |
| ---------------------------- | ------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| **Stripe**                   | `billing` schema + `billing-webhook`  | **Adapter stubbed (501)** — not connected      | **REUSE** (finish adapter to enable subscriptions) |
| **Twilio / telephony**       | `comms` module (SMS/voice references) | Built-undeployed; **no live account verified** | **REUSE** (wire when a product needs it)           |
| **AI providers (Anthropic)** | `ai-gateway`                          | **Keyless** — key not granted                  | **REUSE** (grant key to ignite)                    |
| **Integrations framework**   | `integrations` schema (5 tables)      | Live framework, **no live connectors**         | **REUSE**                                          |

## I. Cron / scheduled tasks

| Asset                                          | Location                    | Maturity                                  | Disposition                    |
| ---------------------------------------------- | --------------------------- | ----------------------------------------- | ------------------------------ |
| Discovery scan scheduler                       | `discovery` + worker        | Built, **inert** (not scheduled/deployed) | **REUSE** (enable post-deploy) |
| Events dispatcher                              | `events-dispatcher` edge fn | Built, undeployed                         | **REUSE**                      |
| _(No live cron jobs verified on any project.)_ | —                           | —                                         | —                              |

## J. Applications / packages / shared libraries / UI

| Asset                                 | Location | Product                    | Maturity                                             | Disposition                                                          |
| ------------------------------------- | -------- | -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/control-center`                 | repo     | HL-BOS internal console    | Live (local)                                         | **REUSE**                                                            |
| `apps/executive-portal`               | repo     | Executive Portal           | Built-undeployed                                     | **REUSE**                                                            |
| `apps/hl-bti`                         | repo     | HL-BTI (deployment build)  | Built-undeployed (auth+Docker+domain)                | **REUSE**                                                            |
| `apps/hl-bti-alpha`                   | repo     | HL-BTI (demo)              | Built, local-only                                    | **REUSE** (or RETIRE once `hl-bti` ships)                            |
| `@hl-bos/catalog`                     | repo     | Software Factory / catalog | Live                                                 | **REUSE**                                                            |
| `@hl-bos/bti-engine`                  | repo     | HL-BTI scoring             | Live                                                 | **REUSE**                                                            |
| `@hl-bos/transformation-intelligence` | repo     | BTI v2 / gov-contracts     | Built (sample-only)                                  | **REUSE**                                                            |
| `@hl-bos/config`                      | repo     | Shared config              | Live                                                 | **REUSE**                                                            |
| **Shared UI library**                 | —        | —                          | **Does not exist**                                   | **N/A** (do not build speculatively; extract only when ≥2 apps ship) |
| **Standalone CRM**                    | —        | —                          | **Does not exist** (covered by discovery + identity) | **N/A** (do not build)                                               |

## K. Documentation

| Asset                                                                         | Location    | Maturity       | Disposition                  |
| ----------------------------------------------------------------------------- | ----------- | -------------- | ---------------------------- |
| `docs/architecture-audit/*` (Phases 1–XI-2L)                                  | repo        | Complete       | **REUSE** (canonical record) |
| `docs/products/*` (BTI, VisibilityAI, first-commercial-launch, factory audit) | repo        | Complete       | **REUSE**                    |
| `.hlbos/*` (canonical, lineage, milestone registries)                         | repo        | Live, governed | **REUSE**                    |
| Legacy product docs (in legacy project)                                       | unreachable | —              | **LEAVE INDEPENDENT**        |

---

### Summary of dispositions

- **REUSE** — the entire canonical HL-Cloud (1 Supabase project, 18 schemas/~130 tables, RPCs,
  RLS, 7 edge functions, 4 apps, 4 packages, all docs/registries) and the ignition seams
  (Stripe, AI key, Twilio, cron).
- **LEAVE INDEPENDENT** — the parked Venuewise Supabase project, the legacy Herman project
  (quarantined), HSCS-GLP prototype, all external marketing sites, and the live CoachesHuddle
  Vercel app (a MERGE candidate later).
- **RETIRE** — the abandoned `hlbos-m1-portfolio` preview branch (archive then delete);
  optionally `apps/hl-bti-alpha` once the production `hl-bti` app ships.
- **MIGRATE / MERGE** — **none required now.** No legacy asset must be migrated to ship the
  commercial roadmap; CoachesHuddle is a _future_ MERGE candidate, not a current action.
