# Herman Legacy Digital · 01 — Innovation Marketplace & Customer Portal (Deliverables 5–6)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Architecture only.** Specifications encoded as tested data in `herman-legacy-digital.ts`.

## Deliverable 5 — the Innovation Marketplace (three experiences)

The marketplace surfaces the **existing portfolio** at three trust levels. Same data, three
projections — no new product store.

### 1. Public Marketplace

- **Audience:** any visitor.
- **Shows:** general product discovery · outcomes and industries · a book-assessment CTA.
- **Backed by:** the Portfolio `productCatalog`, **public projection only** — no internal metrics
  (assembly %, maturity, net-new) leak to the public.

### 2. Authenticated Client Marketplace

- **Audience:** signed-in customers.
- **Shows:** personalized recommendations · their transformation roadmap · products already
  owned · suggested next capabilities.
- **Backed by:** Portfolio `evaluateIdea` + Customer Manufacturing + CRM, scoped per account.

### 3. Internal Marketplace

- **Audience:** Herman Legacy staff.
- **Shows:** product maturity · commercialization layers · **assembly percentage** · **Factory
  readiness**.
- **Backed by:** Portfolio `productCatalog` + the Factory registry — the full internal metrics
  (this is the same data the Executive Portal already exposes to staff).

**The tiering is a data-projection + authz concern, not three separate systems.** The public tier
must never expose the internal metrics — a projection rule the portfolio already supports.

## Deliverable 6 — the Customer Portal specification

The authenticated client home. Every section is backed by an existing system:

| Section                | Purpose                                       | Backed by                                           |
| ---------------------- | --------------------------------------------- | --------------------------------------------------- |
| Overview               | Engagement status + next step                 | Customer Manufacturing lifecycle                    |
| My Products            | Products owned + entitlements                 | Portfolio + Entitlements                            |
| Transformation Roadmap | The HL-BTI blueprint + progress               | HL-BTI                                              |
| Marketplace            | Authenticated marketplace (next capabilities) | Portfolio `evaluateIdea`                            |
| Documents              | Proposals, agreements, reports                | Documents (Venuewise)                               |
| Dashboards             | Client-facing growth/ROI dashboards           | Executive dashboards (**customer surface net-new**) |
| Support                | Requests + communications                     | Communications + Workflow                           |

**The one net-new element** across the marketplace and portal is the _client-facing dashboard
surface_ — the dashboard **data** already exists (the CEO Operations and Growth dashboards); only
its customer-facing presentation is new, and this phase defers all presentation build.

## Reuse verdict

Marketplace and portal are **assembly, not new systems**. The portfolio, CRM, HL-BTI, customer
manufacturing, documents, entitlements, communications and workflow engines already exist and are
surfaced here — governed by projection + authz, exactly as the Executive Portal already
demonstrates.
