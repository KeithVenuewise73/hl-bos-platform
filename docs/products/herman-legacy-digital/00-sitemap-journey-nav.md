# Herman Legacy Digital · 00 — Site Map, Journey, Navigation & Reuse (Deliverables 1–4)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Architecture only** — no visual design, no frontend, no CSS, no deployment. Encoded as tested
data in `packages/transformation-intelligence/src/herman-legacy-digital.ts`. Live output below.

Herman Legacy Digital is the flagship **customer-facing operating company** — the public face of
the Business Transformation practice. **It is not the holding company;** Herman Legacy Group
remains the parent.

## Deliverable 4 — capability reuse assessment (the foundation)

Before designing a single page: what already exists? Live result — **15 capabilities, 93%
reuse**: 13 reuse HL-BOS, 1 reuse cross-platform (Venuewise documents), **1 net-new**.

| Capability              | Verdict                | Backed by                                                  |
| ----------------------- | ---------------------- | ---------------------------------------------------------- |
| Customer authentication | reuse                  | Identity & Auth                                            |
| CRM                     | reuse                  | Intelligence CRM (Phase 3)                                 |
| Customer Manufacturing  | reuse                  | Customer Manufacturing System (Phase 3)                    |
| VisibilityAI            | reuse                  | VisibilityAI                                               |
| HL-BTI                  | reuse                  | HL-BTI                                                     |
| Marketing               | reuse                  | Herman Legacy Marketing (Phase 3A)                         |
| Portfolio               | reuse                  | Portfolio engine (Phase 2)                                 |
| Knowledge Graph         | reuse                  | Knowledge Graph                                            |
| Innovation Marketplace  | reuse                  | Portfolio productCatalog surfaced                          |
| **Customer dashboards** | **net-new**            | data exists; customer-facing surface is net-new (deferred) |
| Executive dashboards    | reuse                  | BTI executive dashboards                                   |
| Documents               | reuse (cross-platform) | Venuewise documents engine                                 |
| Workflow                | reuse                  | Workflows human-approval gate                              |
| Communications          | reuse                  | Communications                                             |
| Portal framework        | reuse                  | Executive Portal (Next.js) framework                       |

**The only net-new capability is the customer-facing dashboard surface** — and building any
surface is explicitly deferred by this phase. Every capability's _backing_ already exists.

## Deliverable 1 — the site map

14 surfaces, each backed by an existing capability (`allNodesBacked = true`):

| Page                    | Path              | Auth          | Backed by              |
| ----------------------- | ----------------- | ------------- | ---------------------- |
| Home                    | `/`               | public        | Marketing              |
| About                   | `/about`          | public        | Marketing              |
| Industries              | `/industries`     | public        | Portfolio              |
| Solutions               | `/solutions`      | public        | Portfolio              |
| Business Transformation | `/transformation` | public        | HL-BTI                 |
| VisibilityAI            | `/visibility-ai`  | public        | VisibilityAI           |
| Marketing & Growth      | `/marketing`      | public        | Marketing              |
| Innovation Marketplace  | `/marketplace`    | public        | Innovation Marketplace |
| Customer Portal         | `/portal`         | authenticated | Customer Manufacturing |
| Book Assessment         | `/book`           | public        | Workflow               |
| Resources               | `/resources`      | public        | Knowledge Graph        |
| Case Studies            | `/case-studies`   | public        | Documents              |
| Contact                 | `/contact`        | public        | Communications         |
| AI Assistant            | `/assistant`      | public        | HL-BTI                 |

## Deliverable 2 — the customer journey

Visitor → Renewal, each stage mapped to its surface and the existing system that performs it:

| #   | Stage                  | Surface                     | Backing                  |
| --- | ---------------------- | --------------------------- | ------------------------ |
| 1   | Visitor                | Home / Solutions            | Marketing                |
| 2   | Visibility Assessment  | VisibilityAI / Book         | VisibilityAI             |
| 3   | CRM                    | (captured) Customer Portal  | Intelligence CRM         |
| 4   | HL-BTI                 | Business Transformation     | HL-BTI                   |
| 5   | Proposal               | Customer Portal             | Commerce & Provisioning  |
| 6   | Transformation         | Customer Portal             | Customer Manufacturing   |
| 7   | Customer Portal        | Customer Portal             | Portal framework         |
| 8   | Innovation Marketplace | Marketplace (authenticated) | Portfolio                |
| 9   | Expansion              | Marketplace / Portal        | Portfolio (evaluateIdea) |
| 10  | Renewal                | Customer Portal             | Billing                  |

This is the same lifecycle the Customer Manufacturing System already validated end-to-end
(Phase 3) — now given a public surface.

## Deliverable 3 — the navigation hierarchy

| Group     | Items                                                                  |
| --------- | ---------------------------------------------------------------------- |
| Primary   | Home · Business Transformation · VisibilityAI · Innovation Marketplace |
| Company   | About · Industries · Solutions · Marketing & Growth                    |
| Client    | Customer Portal · Book Assessment                                      |
| Knowledge | Resources · Case Studies · AI Assistant                                |
| Utility   | Contact                                                                |
