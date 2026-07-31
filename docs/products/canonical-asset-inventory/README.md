# Herman Legacy — Canonical Asset Inventory & Venuewise Reconciliation

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Author:** Claude (AI engineer)
**Status:** Executive reconciliation — **the canonical asset inventory for the Herman Legacy
Software Factory.** Discovery only; no code, no migrations, no architecture changes.
**This report concludes the Discovery Phase. Next: Execution.**

## How this was determined (and its honesty boundary)

Canonical HL-Cloud was inventoried **live** (production `mvvtngiopdrgiedjmhfb`, 2026-07-31).
The Supabase account (2 visible projects) and GitHub (12 repos) were enumerated directly. The
**legacy Herman Supabase project is unreachable** from these credentials and out of scope
(open security findings) — classified from documentation only, never touched. Vercel / Stripe
/ Twilio / AI-provider / DNS / cron have no direct tooling here and are reported from the
repo's registries, marked _documented, not directly verified_. **Nothing was invented.**

---

## 1. Everything HL-BOS (HL-Cloud) currently owns → **REUSE**

- **1 canonical Supabase project** (HL-BOS Core) with **18 business schemas / ~130 tables live
  on production** — identity, tenancy, audit, events, entitlements, workflows, billing, sales,
  storage, comms, integrations, AI, discovery, provisioning, visibility, bti, hlvs, graph.
- **7 edge functions** (ai-gateway, billing-webhook, commerce-worker, 2 discovery workers,
  events-dispatcher, hlvs-factory-worker) — built, **0 deployed**.
- **12 public RPCs** (`bti_*` ×5, `graph_*` ×7) + RLS enforced platform-wide.
- **4 apps** (control-center, executive-portal, hl-bti, hl-bti-alpha) and **4 packages**
  (catalog, bti-engine, transformation-intelligence, config).
- **19 reusable modules, 27 capabilities**, the Software Factory/Catalog, and the full
  documentation + governance registries (`.hlbos/*`).
- **Products living here:** HL-BTI (ready), VisibilityAI (prototype), SalonAI /
  TransportationAI (compositions), Knowledge Graph, Gov-Contracts Intelligence.

## 2. Everything in the legacy Venuewise ecosystem (outside HL-Cloud)

- **Parked Supabase project** `ywrzgursvdowzyhipsmt` ("keith@venuewise.net") — **empty**
  (0 business tables, verified).
- **Legacy Herman Supabase project** `bkfsjhhclbqrhaolvhmz` — **unreachable, quarantined**;
  holds legacy HLVS Venture Studio, HSCS Government Logistics, AI Asset Recovery (open security
  finding).
- **Abandoned preview** `hlbos-m1-portfolio` (`moftgnrbnsixeddcwdpz`).
- **11 external GitHub repos** — 1 prototype (HSCS-GLP), 1 live Vercel app
  (CoachesHuddle / Chris Mazzu), and **9 external marketing sites** (homehuddle, 5-star family,
  hermanlegacygroup, foundation, community networks, ddhhomeservices, herman-supply-chain).
- **External brands/domains** — Venuewise (`venuewise.net`), 5-Star Sports Media, HomeHuddle,
  CoachesHuddle.

## 3. Everything that should be MIGRATED → **none required now**

**No legacy asset must be migrated to execute the commercial roadmap.** Everything needed to
launch already lives in HL-Cloud. The legacy project stays quarantined; migrating it (or HSCS
Government Logistics) is a **separate, CEO-approved** future decision, not a blocker.

## 4. Everything that should remain independent → **LEAVE INDEPENDENT**

- The **parked Venuewise Supabase project** (keep; don't develop; don't delete — ADR-0001).
- The **legacy Herman project** (quarantined; RETIRE its AI Asset Recovery only under an
  approved security plan).
- **HSCS-GLP** prototype repo.
- All **9 external marketing sites** (they are live static marketing — leave them).
- The **CoachesHuddle** live Vercel app (real customer) — leave running; a **future MERGE**
  candidate into a CoachAI, not a current action.
- **RETIRE:** the abandoned `hlbos-m1-portfolio` preview; optionally `hl-bti-alpha` once the
  production `hl-bti` app ships.

## 5. Final Software Factory Asset Inventory

| Class                                | Count / status                                                                | Disposition                    |
| ------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| Supabase projects                    | 1 canonical + 1 parked (empty) + 1 legacy (unreachable) + 1 abandoned preview | REUSE / LEAVE / LEAVE / RETIRE |
| Schemas · tables (canonical)         | 18 · ~130, live on prod                                                       | **REUSE**                      |
| Edge functions                       | 7 built (0 deployed)                                                          | **REUSE** (deploy)             |
| Public RPCs · RLS                    | 12 RPCs · enforced                                                            | **REUSE**                      |
| Apps · packages                      | 4 · 4                                                                         | **REUSE**                      |
| Modules · capabilities               | 19 · 27                                                                       | **REUSE**                      |
| GitHub repos                         | 1 canonical + 11 external                                                     | REUSE / LEAVE INDEPENDENT      |
| External sites · Vercel app          | 9 · 1                                                                         | **LEAVE INDEPENDENT**          |
| Integrations (Stripe/Twilio/AI/cron) | built seams, un-ignited                                                       | **REUSE** (ignite)             |
| Shared UI library · standalone CRM   | **do not exist**                                                              | N/A (don't build)              |

Full detail: [01-reconciliation-inventory.md](01-reconciliation-inventory.md) ·
[02-product-reconciliation.md](02-product-reconciliation.md).

## 6. Final Commercialization Inventory

Every existing reusable capability, mapped across the five layers (L1 internal · L2 BTI
engagement · L3 SaaS · L4 license/API/white-label · L5 Factory assembly). Highlights (full
matrix in [03-commercialization-inventory.md](03-commercialization-inventory.md)):

- **Every capability supports L5 (Factory assembly)** and **L1 (internal ops)** today.
- **L2 (paid, now):** BTI + Scoring + Discovery + Knowledge Graph + Gov-Contracts → **HL-BTI**.
- **L3 (recurring SaaS, next):** Discovery/Website/Reviews → VisibilityAI, Review Management,
  Reputation Recovery, SalonAI.
- **L4 (license/API/white-label, later):** AI Gateway, Scoring, Discovery, Knowledge Graph,
  Factory, Gov-Contracts — sellable as APIs once proven in L2/L3.
- **Infrastructure** (identity, billing, entitlements, audit, comms, workflows) stays internal
  (L1/L5) — correctly not standalone products.

---

## Product reconciliation at a glance

| Disposition                      | Products                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **REUSE** (in HL-Cloud)          | HL-BTI, VisibilityAI, Discovery Engine, SalonAI, TransportationAI                                                                    |
| **LEAVE INDEPENDENT**            | Venuewise (brand), HomeHuddle (site), CoachesHuddle (live app — MERGE candidate), 5-Star Sports Media, HSCS-GLP, all marketing sites |
| **RETIRE** (approved plan)       | AI Asset Recovery (legacy, security finding), abandoned preview branch                                                               |
| **No asset (future greenfield)** | CoachAI, FleetHuddle, AthleteHuddle, FacilityHuddle, TournamentHuddle, BroadcastAI, HighlightAI                                      |

## The Discovery Phase conclusion

Herman Legacy's commercial future is **already built and already in HL-Cloud.** The legacy
Venuewise ecosystem contributes **brands, marketing sites, and one live customer app** — worth
keeping, but **nothing that must be migrated to earn revenue.** Six named "products" don't
exist yet and are future Factory work, not reconciliation items.

**No further architectural audits are needed.** Execution priorities from here — per your
directive — are **deployment, product completion, customer acquisition, commercialization, and
revenue**, starting with **HL-BTI** (see [`../first-commercial-launch/`](../first-commercial-launch/README.md)
and [`../factory-commercialization-audit/`](../factory-commercialization-audit/README.md)).

## Documents

| #   | Document                                                               | Contents                                                                        |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | [01-reconciliation-inventory.md](01-reconciliation-inventory.md)       | Every asset class: name, location, product, maturity, dependencies, disposition |
| 2   | [02-product-reconciliation.md](02-product-reconciliation.md)           | Every named product reconciled to a disposition                                 |
| 3   | [03-commercialization-inventory.md](03-commercialization-inventory.md) | Every reusable capability × the 5 commercialization layers                      |
