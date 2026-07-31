# Customer Manufacturing · 01 — Lifecycle, VisibilityAI & Intelligence CRM (CP2–CP3)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `packages/transformation-intelligence/src/{customer-lifecycle,visibility-ai,crm}.ts`.
Live output below. All figures reproducible from `customerManufacturingSystem()`.

## CP2 — the Customer Manufacturing lifecycle (21 stages, assembled)

The lifecycle rides on the **reused** `bti-engine` engagement machine — it is not a new engine.
Each stage names the engagement stage it rides on and the existing catalog assets that back it.

**Live result:** 21 stages · 10 operational · 9 assemblable · 2 partial · **0 hard gaps** ·
**90% assemblable** · engagement path **valid** · net-new: **customer success desk, referral
program**.

| #   | Stage                            | Engagement stage    | Readiness   | Net-new               |
| --- | -------------------------------- | ------------------- | ----------- | --------------------- |
| 1   | Lead Discovery                   | Prospect            | assemblable |                       |
| 2   | Lead Qualification               | Lead Qualification  | operational |                       |
| 3   | Visibility Assessment            | Business Discovery  | assemblable |                       |
| 4   | Business Intelligence Assessment | Business Discovery  | operational |                       |
| 5   | HL-BTI Assessment                | Assessment          | operational |                       |
| 6   | Executive Report                 | Executive Analysis  | operational |                       |
| 7   | Proposal Generation              | Proposal            | assemblable |                       |
| 8   | Proposal Approval                | Customer Approval   | assemblable |                       |
| 9   | Agreement                        | Customer Approval   | assemblable |                       |
| 10  | Project Creation                 | Implementation      | assemblable |                       |
| 11  | Assembly Planning                | Implementation      | operational |                       |
| 12  | Capability Selection             | Implementation      | operational |                       |
| 13  | Transformation Execution         | Implementation      | operational |                       |
| 14  | Deployment                       | Project Management  | operational |                       |
| 15  | Customer Training                | Project Management  | assemblable |                       |
| 16  | Subscription Activation          | Project Management  | assemblable |                       |
| 17  | Customer Success                 | ROI Tracking        | **partial** | customer success desk |
| 18  | Quarterly Business Reviews       | ROI Tracking        | operational |                       |
| 19  | Expansion Opportunities          | Monthly Partnership | operational |                       |
| 20  | Renewal                          | Monthly Partnership | assemblable |                       |
| 21  | Referral Program                 | Monthly Partnership | **partial** | referral program      |

**No duplicate systems:** every stage is backed by one of **20 existing catalog assets**;
`noDuplicateSystems()` returns `ok` with zero unknown assets. The lifecycle introduces no new
system.

**Analysis-only honesty:** in `analysis_only` mode the lifecycle is honestly reported as invalid
past the blueprint cap — an analysis-only engagement does not run the delivery stages. This
reuses the engine's real cap, not a new rule.

## VisibilityAI — evaluated, not redesigned

The brief asks whether the current VisibilityAI already supports nine functions. Live result:
**8 of 9 supported directly; 0 assemble; 1 net-new (Competitive Analysis). No redesign required.**

| Function                       | Verdict     | Backing                                                    |
| ------------------------------ | ----------- | ---------------------------------------------------------- |
| Business Discovery             | supported   | Discovery engine                                           |
| Website Analysis               | supported   | Website Scanner                                            |
| SEO Analysis                   | supported   | Website Scanner (SEO evidence)                             |
| Review Analysis                | supported   | Reputation & Review Management                             |
| **Competitive Analysis**       | **net-new** | assemble from discovery + scoring (no distinct capability) |
| Visibility Scoring             | supported   | Deterministic Scoring (Business Growth Score)              |
| Proposal Inputs                | supported   | Recommendation engine → Commerce line items                |
| Lead Qualification             | supported   | Discovery + Deterministic Scoring                          |
| Transformation Recommendations | supported   | HL-BTI (transformation-intelligence)                       |

## CP3 — the Intelligence CRM (assembled, no new database)

The Intelligence CRM is the operational center — modeled as a **view over existing systems**,
not a new store. Live result: **17 entities · 15 reuse · 1 assemble · 1 net-new (Customer
Health) · 14 existing systems · no new CRM database.**

| Entity                   | Verdict     | Backed by                              |
| ------------------------ | ----------- | -------------------------------------- |
| Prospects                | reuse       | Discovery + VisibilityAI               |
| Organizations            | reuse       | Identity & Tenancy                     |
| Contacts                 | reuse       | Identity                               |
| Activities               | reuse       | Event Bus + Audit                      |
| Communications           | reuse       | Communications                         |
| Meetings                 | assemble    | Scheduling (Venuewise, cross-platform) |
| Tasks                    | reuse       | Workflows                              |
| Opportunities            | reuse       | Commerce + Portfolio                   |
| Proposals                | reuse       | Commerce (sales.proposals)             |
| Projects                 | reuse       | Provisioning (work orders)             |
| Subscriptions            | reuse       | Billing                                |
| **Customer Health**      | **net-new** | Customer-success desk (Phase 2 gap)    |
| Renewals                 | reuse       | Billing + Communications               |
| Cross-selling            | reuse       | Portfolio (evaluateIdea)               |
| Upselling                | reuse       | Entitlements + Portfolio               |
| Executive Notes          | reuse       | Storage / Documents                    |
| Factory Assembly History | reuse       | Software Factory + Portfolio           |

The three connected systems — VisibilityAI, HL-BTI and the Intelligence CRM — share one
lifecycle, one identity, one billing, one workflow gate, and one Factory. They operate as one
integrated system, which Checkpoint 5 validates end to end.
