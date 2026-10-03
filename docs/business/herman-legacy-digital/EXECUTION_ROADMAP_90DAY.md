# Herman Legacy Digital — Prioritized 90-Day Execution Roadmap

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Documentation only. Sequenced by dependency and evidence, not optimism.**

## The one dependency that gates almost everything

**Nothing is deployed.** HLD site + client portal, Executive Portal, and Venture Studio are all built-undeployed; the CEO Notebook (0030) and Opportunity Pipeline (0031) are unapplied. Until the deployment path is exercised (Workstream A — CEO-controlled infra), Operations cannot earn and R&D cannot measure on live data. **Deployment is priority zero.**

## Prioritized plan (both divisions, one timeline)

### Days 1–30 — Deploy the operating surface (Operations + R&D)

| Priority | Action                                                                                    | Division   | Gate            |
| -------- | ----------------------------------------------------------------------------------------- | ---------- | --------------- |
| P0       | Merge PR #26 (Opportunity Pipeline); apply migrations 0030 + 0031                         | R&D        | **CEO**         |
| P0       | Expose `vstudio`; deploy Venture Studio; deploy Executive Portal + HLD app (Workstream A) | R&D→Ops    | **CEO / infra** |
| P1       | Wire VisibilityAI assessment as HLD's public lead magnet                                  | Operations | —               |
| P1       | Baseline all three reference businesses with the BT methodology (real CEO inputs)         | Operations | —               |
| P2       | Stand up the weekly Knowledge Loop (Inbox + priority queue + meeting)                     | Both       | —               |

**30-day definition of done:** a real prospect can complete a VisibilityAI assessment on a live HLD; the CEO can use the Notebook + Pipeline on live data; three baselines documented.

### Days 31–60 — First revenue + first reusable loop

| Priority | Action                                                                               | Division   | Gate          |
| -------- | ------------------------------------------------------------------------------------ | ---------- | ------------- |
| P0       | Assessment → proposal → `billing` subscription; onboard **first paying HLD client**  | Operations | CEO (pricing) |
| P1       | HSCS: stand up Grant Intelligence workflow (manual/stubbed ingestion)                | Operations | —             |
| P1       | Venuewise: ship the single highest-ROI improvement the baseline surfaced             | R&D→Ops    | —             |
| P2       | First Knowledge-Loop graduation: one R&D capability adopted by ≥1 reference business | Both       | —             |

**60-day definition of done:** first recurring-revenue client (real); one capability graduated across the loop; HSCS pipeline usable manually.

### Days 61–90 — Measure, prove, and decide on live sources

| Priority | Action                                                                                              | Division   | Gate                 |
| -------- | --------------------------------------------------------------------------------------------------- | ---------- | -------------------- |
| P0       | Measure the first client outcome (HL-BTI evidence-gated); publish the **first case study**          | Operations | —                    |
| P1       | On CEO approval, activate **one** live connector (e.g. Grants.gov for HSCS) with a Vault credential | R&D        | **CEO / credential** |
| P1       | Outcome/KPI dashboard (Executive Portal) showing **real** data for all three businesses             | Both       | —                    |
| P2       | Quarterly portfolio review: what graduated to all 3; what (if anything) is ready for external sale  | Both       | CEO                  |

**90-day definition of done:** one measured client outcome + case study; one live intelligence source; a KPI dashboard with real numbers; an evidence-based decision on external commercialization.

## Sequencing rationale (honest)

1. **Deploy before build.** A large body of verified work is dormant; the highest ROI is making it live, not adding features. (This matches the Phase C recommendation: Workstream A.)
2. **Revenue before connectors.** The BT assessment→subscription motion earns with capability that already exists; live external connectors (B3-class) come later and carry credential/trust risk.
3. **Internal-first.** Every capability is proven across HLD, Venuewise, and HSCS before any external commercialization — per the Knowledge Loop graduation gate.

## What this roadmap will not do

- No new division, company, lab, tenant, schema, or app.
- No fabricated revenue, pipeline, or outcome numbers — each "done" is defined by a **real** event.
- No production change, deploy, migration, connector activation, or credential registration from this document — each is a separate CEO gate.

## CEO decisions this roadmap needs (in order)

1. Merge PR #26 + apply 0030/0031.
2. Unblock Workstream A (Supabase API exposure + Coolify + DNS, or grant the access).
3. Approve pricing for the first HLD subscription.
4. Approve the first live connector credential (Grants.gov) — Day 61+.
