# Herman Legacy Digital — Information Architecture (Executive Summary)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Status: Information architecture complete. 85/85 transformation-intelligence tests green.
Architecture only — no frontend, no CSS, no deployment. Awaits CEO approval before implementation.**

## What you asked for

Design the complete information architecture for **Herman Legacy Digital** — the flagship
customer-facing operating company and public face of the Business Transformation practice (not the
holding company; Herman Legacy Group remains the parent) — reusing existing Software Factory
capabilities. **Architecture, customer experience and IA only** — no visual design, no frontend,
no CSS, no deployment.

## What was produced (architecture as tested data)

One in-code module, `packages/transformation-intelligence/src/herman-legacy-digital.ts`, encodes
the IA as **tested, machine-checkable data** — so "reuse before creating" is proven, not asserted.
No frontend, no CSS, no deployment; just the architecture.

## The result in one screen

- **93% capability reuse:** 15 capabilities — **13 reuse HL-BOS, 1 cross-platform (documents), 1
  net-new** (the customer-facing dashboard _surface_; its data already exists).
- **Site map:** 14 surfaces, every one backed by an existing capability (`allNodesBacked = true`).
- **Customer journey:** the full Visitor → Renewal path — the same lifecycle the Customer
  Manufacturing System already validated, now given a public surface.
- **Innovation Marketplace:** three tiers (Public / Authenticated Client / Internal) as
  **projections of the existing portfolio**, not three systems.
- **Customer Portal:** seven sections, each backed by an existing engine, on the reused Executive
  Portal framework.

## Deliverables

| #   | Deliverable                          | Where                                                           |
| --- | ------------------------------------ | --------------------------------------------------------------- |
| 1   | Complete sitemap                     | `SITE_MAP` + [00](00-sitemap-journey-nav.md)                    |
| 2   | Customer journeys                    | `DIGITAL_JOURNEY` + [00](00-sitemap-journey-nav.md)             |
| 3   | Navigation hierarchy                 | `NAV_HIERARCHY` + [00](00-sitemap-journey-nav.md)               |
| 4   | Capability reuse assessment          | `digitalCapabilityReuse()` + [00](00-sitemap-journey-nav.md)    |
| 5   | Innovation Marketplace specification | `MARKETPLACE_EXPERIENCES` + [01](01-marketplace-and-portal.md)  |
| 6   | Customer Portal specification        | `CUSTOMER_PORTAL_SECTIONS` + [01](01-marketplace-and-portal.md) |
| 7   | Executive recommendations            | [02](02-recommendations-and-roadmap.md)                         |
| 8   | 90-day website rollout roadmap       | [02](02-recommendations-and-roadmap.md)                         |

## Engineering constraints honored

- **ASSEMBLE, DON'T REBUILD.** Authentication, CRM, VisibilityAI, HL-BTI, Marketing, Portfolio,
  Knowledge Graph, Documents, Workflow, Communications and the Portal framework are all reused.
- **Architecture only** — no visual design, no frontend construction, no CSS, no deployment,
  exactly as instructed. The IA is expressed as data + docs, not a website.
- **No new Supabase project, no production migration** — pure TypeScript in an existing package.
- **Honesty (Principle 10).** The one net-new capability (customer-facing dashboard surface) is
  named; the public marketplace is specified to expose zero internal metrics; case studies publish
  measured readiness, not fabricated traffic/ROI.

## What comes next

Per the brief, **work stops after the architecture and awaits CEO approval before implementation.**
The 90-day rollout roadmap in [02](02-recommendations-and-roadmap.md) sequences the build gate by
gate — the only decision that starts it is your approval of this IA.
