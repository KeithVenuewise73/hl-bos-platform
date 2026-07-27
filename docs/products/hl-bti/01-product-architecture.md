# HL-BTI — Product Architecture (Deliverable 1)

**Product:** Herman Legacy Business Transformation Intelligence Platform · **PCO #1** · Local development only.

## 1. What HL-BTI is

HL-BTI is an **AI-powered Business Transformation Operating System** delivered as **another reusable platform inside HL-BOS** — not a bespoke app, not a CRM, not an SEO tool. It is the operational platform HSCS Consulting uses to acquire prospects, assess businesses across six intelligence domains, generate executive Business Transformation Blueprints, produce proposals, manage implementations, and track ROI.

It is implemented as the `bti` schema plus a small deterministic edge engine (`_shared/bti/*`), sitting on top of the already-built HL-BOS pipeline.

## 2. Layered architecture

```
                ┌─────────────────────── CEO Dashboard (cross-business) ──────────────────────┐
                │              bti.ceo_dashboard()  (platform-permission gated)                │
                └──────────────────────────────────────────────────────────────────────────────┘
   ┌───────────────────────────────────  HL-BTI product layer (bti schema)  ───────────────────────────────────┐
   │  businesses → engagements (13-stage lifecycle) → assessments (6 domains, 7 scores) →                        │
   │  delivery (projects/milestones/tasks) + roi_metrics                                                          │
   └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   ┌──────────────────────────  Reused HL-BOS pipeline (unchanged)  ──────────────────────────┐
   │  discovery (profiles/evidence/assessments/scoring/blueprints/recommendations)             │
   │  → blueprint engine (0023) → sales/proposals (0024) → provisioning (0024)                  │
   └──────────────────────────────────────────────────────────────────────────────────────────┘
   ┌──────────────────────────  Reused HL-BOS spine (unchanged)  ─────────────────────────────┐
   │  identity · permissions · tenancy · audit · events + dispatcher · workflows · ai · billing │
   │  · comms · storage_meta                                                                     │
   └──────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Core design principles (inherited from HL-BOS)

- **Deterministic engines, advisory AI.** The 7 executive scores, the stage machine, the analysis-only cap, growth intelligence, ROI math and dashboard aggregation are deterministic. The DB is the authority; `_shared/bti` mirrors it exactly (same numbers or it's a bug). AI drafts narrative only and approves nothing.
- **Honest by construction.** Any domain with no ratings scores `null`, never a fabricated number. Blueprint sections with no data are emitted as empty-with-a-reason. The dashboard shows real state or says it has none.
- **Tenant-isolated + permission-gated.** Every `bti` table has RLS **+ FORCE**; every write goes through a `SECURITY DEFINER` RPC that checks `identity.has_permission`. No tenant write path exists outside the RPCs.
- **Human gates reused.** Assessment completion requires an approved `workflows` instance — AI/automation cannot self-approve.
- **Extensible, not forked.** Domains, dimensions and industry packs are catalog rows. New industries (transportation, sports, salon, …) extend the engine by adding rows, never by replacing it.

## 4. The customer lifecycle (13 stages)

`prospect → lead_qualification → business_discovery → assessment → executive_analysis → blueprint → proposal → customer_approval → implementation → project_management → roi_tracking → monthly_partnership` (+ `declined` / `on_hold` side states). The `bti.advance_stage` RPC enforces single-step forward movement and the Venuewise analysis-only cap deterministically.

## 5. What is deterministic vs. AI

| Concern                           | Mechanism                                    | Authority                                             |
| --------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| 7 executive scores                | weighted rollup of 0–5 ratings, honest nulls | `bti.compute_scores` (DB) + `_shared/bti/scoring.ts`  |
| Stage machine + analysis-only cap | ordered ranks + cap rank                     | `bti.advance_stage` (DB) + `_shared/bti/lifecycle.ts` |
| Growth intelligence               | data-mapped priority + ROI band + service    | `_shared/bti/growth.ts`                               |
| Blueprint assembly                | structured section assembly, honest empties  | `_shared/bti/blueprint.ts`                            |
| ROI tracking                      | baseline → projected → realized              | `bti.roi_metrics` + RPCs                              |
| CEO dashboard                     | cross-business aggregation                   | `bti.ceo_dashboard()`                                 |
| Narrative summaries               | advisory only, fenced, redacted              | reused `ai` gateway + `_shared/ai`                    |

## 6. Boundaries

Local stack only; nothing applied to a live project; no billing activated; no legacy asset touched. Venuewise is analysis-only (see [Venuewise Configuration](10-venuewise-configuration.md)). HL-BTI is registrable through the HLVS factory as a product; it does not re-implement factory governance.
