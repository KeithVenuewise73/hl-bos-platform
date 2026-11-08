# Herman Legacy Digital — Operating Model V1

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Documentation only — no code, no deployment, no org changes.**

## What this is (and is not)

Herman Legacy Digital (**HLD**) is the **commercial operating business** of Herman Legacy Group. This document defines how it runs. It **does not** create any new division, laboratory, company, tenant, schema, or app. HLD contains **two permanent departments** that operate simultaneously inside one business:

1. **Operations Division** — generates recurring revenue and delivers Business Transformation services.
2. **R&D Division** — continuously improves Herman Legacy's operating system (HL-BOS).

**Engineering Law #1 — Assemble, do not rebuild.** Every capability below maps to something HL-BOS already has; nothing here proposes a new platform.
**Engineering Law #2 — Honesty over appearance.** Where a business fact (revenue, customer counts, channel performance) is not verifiable from the repository, it is marked **"requires CEO input"** and never invented.

## Honest starting position

The tooling both departments depend on is **built but largely undeployed** (verified from `packages/catalog/src/app-registry.ts`):

| Asset                                          | Purpose                                                                                                           | Status (verified)                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Herman Legacy Digital app                      | Public BT marketing + assessment-intake site + client portal                                                      | **built, not deployed**                            |
| HL-BTI (`@hl-bos/transformation-intelligence`) | Business Transformation Intelligence (scoring, evidence-gated impact/ROI, factory reuse, government intelligence) | built (engine)                                     |
| VisibilityAI / `discovery` (0020)              | Digital-maturity + business-health assessment engine                                                              | schema live; app surface built                     |
| Executive Portal                               | CEO daily read-only operating interface                                                                           | **built, not deployed**                            |
| Venture Studio (HLVS V2)                       | R&D opportunity intelligence                                                                                      | 0029 live; app **undeployed**; 0030/0031 unapplied |
| HL-BOS Core (0001–0029)                        | Identity, tenancy, permissions, audit, events, ai, integrations, workflows, billing, comms, catalog, graph        | **database live** in production                    |

**Implication:** HLD's first job is not to build more — it is to **deploy what exists** so Operations can begin generating revenue and R&D can begin measuring. This model is designed to be true both before and after deployment.

## The two departments

### Operations Division — "earn"

Purpose: generate recurring revenue and deliver Business Transformation services.

| Responsibility                      | Assembled on (existing HL-BOS capability)                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Lead generation                     | HLD public site + assessment intake; `discovery` (VisibilityAI) as the lead magnet            |
| Marketing                           | HLD site content; `comms` (0019) for outbound; `ai` gateway for drafting (advisory)           |
| Sales                               | Client portal + intake → `billing` (0015/0016) subscriptions; Executive Portal pipeline views |
| Business Transformation Assessments | **HL-BTI** + VisibilityAI — evidence-gated scoring, impact/ROI                                |
| Customer onboarding                 | `platform.provision_tenant` (canonical), `identity` invitations (0006)                        |
| Customer success                    | Client portal; `workflows` (0013) for review/approval; `events` trail                         |
| Monthly recurring services          | `billing.subscriptions` (0016); `entitlements` (0010) for plan gating                         |
| Case studies                        | Assessment outcomes captured as evidence; reference-implementation engine                     |
| KPI reporting                       | Executive Portal + catalog metrics; **real data only**                                        |
| Client outcome measurement          | HL-BTI evidence-gated impact vs. baseline; measured/estimated/unknown status                  |

### R&D Division — "improve"

Purpose: continuously improve Herman Legacy's operating system. Reuse HL-BOS wherever possible.

| Responsibility             | Assembled on (existing HL-BOS capability)                               |
| -------------------------- | ----------------------------------------------------------------------- |
| Venture Studio             | HLVS V2 (`vstudio`, CEO Notebook, Opportunity Pipeline)                 |
| HL-BOS enhancement         | The monorepo + migration lineage + CI governance                        |
| Executive Intelligence     | Venture Studio Intelligence Programs; Executive Portal                  |
| Productization             | `@hl-bos/catalog` reuse engine + Software Factory (`hlvs` schema, 0025) |
| Automation                 | `workflows` (0013), `events` handlers (0021), `ai` gateway (0012)       |
| AI capabilities            | `ai` gateway + `ai.runs` ledger (metered, provenance)                   |
| Vertical Operating Systems | Factory compositions over shared modules (e.g. HL-BTI, HSCS-GLP)        |
| Software Factory           | `hlvs` Factory (module registry, compositions, readiness)               |

**Boundary:** R&D produces reusable capabilities; Operations consumes them. Neither owns a separate identity, CRM, billing, or workflow system — both use the **one** HL-BOS spine.

## Operating principles

1. **One platform, two rhythms.** Operations runs a weekly delivery/revenue rhythm; R&D runs a build/measure rhythm. Both commit to the same repo and the same governance.
2. **Reuse-first.** No new capability is built until R&D confirms nothing existing covers it (the `@hl-bos/catalog` duplicate/reuse gate is the arbiter).
3. **Internal-first commercialization.** Every enhancement is proven across the three reference businesses **before** external sale (see the Knowledge Loop).
4. **Honesty in the numbers.** KPI and outcome reporting shows real data or an explicit "no data" — never a fabricated metric.
5. **CEO approval stays the authoritative act** for anything that touches production, spends money, or exposes data.

## Governance & cadence (summary)

- **Weekly Knowledge-Loop meeting** (see `OPERATING_MODEL_V1.md` §Knowledge Loop below and the interaction model).
- **Monthly business review:** Operations reports revenue/KPIs (real); R&D reports capabilities shipped and reuse achieved.
- **Quarterly portfolio review:** which R&D output graduated to all three reference businesses; which is ready for external commercialization.

---

## Knowledge Loop — the weekly feedback process

The loop is the mechanism that keeps Operations and R&D one business rather than two.

```
        ┌───────────────────────────── weekly ─────────────────────────────┐
        │                                                                   │
  OPERATIONS ──▶  demand signals  ──▶  R&D intake (Venture Studio Inbox)    │
   (earn)         • customer requests      • capture as opportunities        │
                  • lost opportunities     • dedup + reuse-score (catalog)   │
                  • marketing data         • prioritise (Executive Queue)    │
                  • sales data                                               │
                  • operational pain points                                  │
        ▲                                                                   ▼
        │   R&D output  ◀── evaluate for all 3 reference businesses ◀── R&D  │
   OPERATIONS         • new reusable capabilities   (build/measure)          │
   adopts             • product enhancements                                 │
                      • automation                                           │
                      • Venture Studio discoveries                           │
                      • recommended implementations                          │
        └───────────────────────────────────────────────────────────────────┘
```

**Operations → R&D (demand):** customer requests, lost opportunities, marketing data, sales data, operational pain points. These enter the **Venture Studio Opportunity Inbox** (an existing capability) as opportunities, are **deduplicated and reuse-scored** by `@hl-bos/catalog`, and prioritised in the **Executive Priority Queue**.

**R&D → Operations (supply):** new reusable capabilities, product enhancements, automation, Venture Studio discoveries, recommended implementations. Each is delivered as a merge-ready capability with a plain-English adoption note.

**The graduation gate (internal-first):** every enhancement is evaluated for deployment across **Herman Legacy Digital, Venuewise, and HSCS Consulting** — and proven in at least one — **before** external commercialization is considered. R&D records the graduation status; Operations confirms the outcome with real data.

**Cadence:** one 60-minute weekly meeting. Inputs are prepared in advance (Operations posts demand signals to the Inbox; R&D posts shipped capabilities). The meeting decides: what R&D builds next (top of the priority queue) and what Operations adopts this week.

## What this model deliberately avoids

- No new company, division-as-legal-entity, lab, or brand.
- No new identity/CRM/billing/workflow/portal system — HL-BOS provides all of them once.
- No fabricated revenue, pipeline, or outcome numbers.
- No production change from this document — it is a plan, approved by the CEO before anything runs.
