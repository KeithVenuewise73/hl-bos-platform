# Herman Legacy Digital · 02 — Executive Recommendations & Rollout Roadmap (Deliverables 7–8)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Architecture only** — the roadmap sequences a future build; nothing is built or deployed here.

## Deliverable 7 — executive recommendations

1. **Build the presentation layer, not the platform.** 93% of Herman Legacy Digital's capabilities
   already exist. The work ahead is a public-facing surface over them — a website + client portal
   that reuse the Portfolio, CRM, HL-BTI, VisibilityAI, Marketing, Documents, Workflow and the
   Portal framework. Do not rebuild any of these.

2. **Reuse the Executive Portal framework for the authenticated surfaces.** The Customer Portal
   and Internal Marketplace are the same shape as the existing portal (authz-gated views over
   `@hl-bos/catalog` and `@hl-bos/transformation-intelligence`). The public site is the only truly
   new surface.

3. **Enforce the marketplace projection boundary.** The public marketplace must expose **zero**
   internal metrics (assembly %, maturity, net-new). Model it as a `public` projection of the
   portfolio with an explicit allow-list, mirroring the portal's `sensitive` authz.

4. **The one net-new capability is the client-facing dashboard surface.** The dashboard _data_
   exists (CEO Operations, Growth, Reference Implementation dashboards); scope only the customer
   presentation of it.

5. **Lead with VisibilityAI as the front door.** The journey (Visitor → Visibility Assessment →
   CRM → HL-BTI) already validated in Phase 3 becomes the site's primary conversion path; the
   free assessment is the highest-intent entry point.

6. **Gate the AI Assistant behind the AI Gateway.** Reuse the metered gateway; keep providers
   deferred (consistent with the Marketing phase) until CEO approval.

7. **Honesty on the public site.** Case Studies use the Reference Implementations — which report
   Factory-internal readiness as measured and external metrics as Unknown pending scans. Do not
   publish fabricated visibility/traffic/ROI numbers; publish measured readiness and named
   outcomes.

## Deliverable 8 — 90-day website rollout roadmap

Architecture is done; this sequences the future build, gate by gate. **No build starts until CEO
approval.**

| Window         | Focus                                                                                                                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Days 1–30**  | Approve the IA. Stand up the public site shell (Home, Business Transformation, VisibilityAI, Solutions, Case Studies) reusing Marketing + Portfolio + Reference Implementations. Wire the public marketplace projection (no internal metrics). **Gate:** CEO approval of copy + the VisibilityAI front-door flow. |
| **Days 31–60** | Build the authenticated Customer Portal on the Executive Portal framework (Overview, My Products, Roadmap, Documents, Support) — all reusing existing engines. Add the authenticated-client marketplace (`evaluateIdea`). **Gate:** CEO approval to connect live CRM capture + booking.                           |
| **Days 61–90** | Add the client-facing dashboard surface (the one net-new element) over existing dashboard data; enable the AI Assistant via the metered gateway (providers still gated). Launch publicly alongside the approved marketing campaigns. **Gate:** CEO approval to go live.                                           |

## Definition of Done — met

Herman Legacy Digital has a **complete information architecture** — site map, customer journeys,
navigation hierarchy, capability reuse assessment (93%), Innovation Marketplace specification
(three tiers), Customer Portal specification, executive recommendations, and a 90-day rollout
roadmap — capable of serving as the public operating company for the Business Transformation
business **while reusing existing Software Factory capabilities**.

**Per the brief, work stops after the architecture and awaits CEO approval before implementation.**
The one decision that starts the build is approval of this IA; the one net-new capability is the
customer-facing dashboard surface — everything else is assembly.
