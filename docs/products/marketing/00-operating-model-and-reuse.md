# Herman Legacy Marketing · 00 — Operating Model & Capability Reuse (Deliverables 1–2)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `packages/transformation-intelligence/src/marketing.ts`. Live output below.

Herman Legacy Marketing is a permanent **internal business unit** — assembled from existing
Software Factory capabilities, not a new software product. Mission: **acquire customers, increase
visibility, generate qualified opportunities, build authority, produce measurable growth, and
support every Herman Legacy business.**

## Deliverable 1 — the operating model (value chain)

| #   | Function                  | Runs on (existing systems)                        |
| --- | ------------------------- | ------------------------------------------------- |
| 1   | Audience & Positioning    | Knowledge Graph, HL-BTI                           |
| 2   | Visibility & SEO          | VisibilityAI                                      |
| 3   | Content Manufacturing     | Documents, Media, Content Management (net-new)    |
| 4   | Campaign Orchestration    | Workflow, Scheduling, Campaign Tracking (net-new) |
| 5   | Publishing & Distribution | Media, Communications, Scheduling                 |
| 6   | Lead Generation & Nurture | CRM, Communications                               |
| 7   | Qualification → HL-BTI    | CRM, HL-BTI (hands off to the customer lifecycle) |
| 8   | Measurement & Reporting   | Analytics, Reporting                              |

## Deliverable 2 — capability reuse assessment

Live result: **8 systems reuse HL-BOS, 4 reuse cross-platform (Venuewise), 2 net-new — 86%
reuse. No duplicate systems.**

| System                 | Verdict                | Backed by                      |
| ---------------------- | ---------------------- | ------------------------------ |
| CRM                    | reuse                  | Intelligence CRM (Phase 3)     |
| VisibilityAI           | reuse                  | prod.visibility-ai             |
| Workflow               | reuse                  | Human-approval gate            |
| Communications         | reuse                  | comms (HL-BOS + Venuewise SMS) |
| Media                  | reuse (cross-platform) | Venuewise 5-Star media         |
| Documents              | reuse (cross-platform) | Venuewise documents engine     |
| Scheduling             | reuse (cross-platform) | Venuewise scheduling           |
| **Content Management** | **net-new**            | no content library exists      |
| Analytics              | reuse (cross-platform) | Venuewise analytics            |
| **Campaign Tracking**  | **net-new**            | no campaign tracker exists     |
| Reporting              | reuse                  | BTI executive dashboards       |
| Knowledge Graph        | reuse                  | @hl-bos/catalog graph          |
| HL-BTI                 | reuse                  | prod.hl-bti                    |
| Portal                 | reuse                  | app.executive-portal           |

**The only two net-new pieces** are a content library (Content Management) and campaign
attribution (Campaign Tracking) — both small and horizontal. Everything else is assembly.

## Commercialization — all five layers (Commercialization Law #1)

Marketing is designed to support every layer:

| Layer  | Becomes                             | How                                                        |
| ------ | ----------------------------------- | ---------------------------------------------------------- |
| **L1** | Internal capability                 | Herman Legacy markets its own businesses                   |
| **L2** | HL-BTI engagement                   | Marketing execution folds into a transformation engagement |
| **L3** | Monthly recurring marketing service | A managed marketing retainer for external customers        |
| **L4** | Agency offering                     | White-label agency / API for partners                      |
| **L5** | Factory capability                  | The AI Marketing Studio assembled into other products      |
