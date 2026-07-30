# CEO Commercial Decision Package

**For:** Keith Herman, CEO · **Date:** 2026-07-29
**Purpose:** Everything you need to set commercial terms for the eight registered products — in one place, without touching source code. Fill in the decision form at the end; the engineer applies your values.

> **No pricing, ownership, or licensing has been invented.** Every such field is labelled **PENDING CEO DECISION**. Foundation completion and remaining work are real, computed figures.

---

## How to use this

1. Read each product card below.
2. Fill in the **Decision Form** (last section) with your values — edition names/prices, ownership, licensing, support tiers.
3. Hand it back. The engineer writes your values into `packages/catalog/src/compositions.ts` (and, when approved, the database). **You never edit code.**

## Product cards

### 1. HL-BTI (Business Transformation Intelligence)

- **Purpose:** AI-assisted business transformation — assess → blueprint → proposal → implement → ROI.
- **Target customer:** HSCS Consulting's clients; mid-market businesses undergoing transformation.
- **Foundation completion:** ~80% (built, tested; not deployed; no live customer).
- **Product-specific work remaining:** deploy app + DB; first live customer.
- **Proposed edition structure:** Professional (single tier today). _PENDING CEO DECISION._
- **Subscription model:** managed service (proposed). _PENDING CEO DECISION._
- **Support-tier options:** Standard / Managed / Enterprise (proposed). _PENDING CEO DECISION._
- **Ownership / Licensing / Pricing:** **PENDING CEO DECISION.**
- **Deployment status:** BUILT — NOT DEPLOYED.
- **Recommended next action:** Launch first (fastest revenue) once terms + deploy.

### 2. VisibilityAI

- **Purpose:** Discovery → website assessment → Business Growth Score → recommendations (the lead-gen funnel).
- **Target customer:** SMBs; the top of the funnel for every other product.
- **Foundation completion:** ~40% (DB + workflow; no UI/scan worker).
- **Product-specific work remaining:** customer UI + scan worker over the existing engine.
- **Edition:** Professional (proposed). **Ownership/Licensing/Pricing: PENDING CEO DECISION.**
- **Subscription model:** subscription (proposed). **Support tiers: PENDING CEO DECISION.**
- **Deployment status:** BUILT — NOT DEPLOYED (partial).
- **Recommended next action:** Launch second; it feeds the whole portfolio.

### 3. SalonAI

- **Purpose:** Vertical operating system for salons (booking, reviews, growth).
- **Target customer:** Independent & small-chain salons (pilot: **Canvas Hair Co.**).
- **Foundation completion:** 100% of required modules built (assemblable — Phase IV demo).
- **Product-specific work remaining:** salon domain data, booking/calendar, app UIs, public site config.
- **Edition:** Professional (proposed). **Ownership/Licensing/Pricing: PENDING CEO DECISION.**
- **Subscription model:** subscription (proposed). **Support tiers: PENDING CEO DECISION.**
- **Deployment status:** NEEDS ASSEMBLY.
- **Recommended next action:** First Factory-assembled product; pilot with Canvas Hair Co. (see spec 03).

### 4. Review Management

- **Purpose:** Collect, monitor, and respond to customer reviews.
- **Target customer:** Any local business; natural upsell from a VisibilityAI assessment.
- **Foundation completion:** ~30% (built on `visibility.reviews`).
- **Remaining:** UI + configuration. **Edition:** Standard (proposed). **Terms: PENDING CEO DECISION.**
- **Deployment status:** NEEDS ASSEMBLY. **Next action:** Quick vertical win after SalonAI.

### 5. Reputation Recovery

- **Purpose:** Ethical reputation management and recovery workflows.
- **Target customer:** Businesses with reputation exposure.
- **Foundation completion:** ~25% (built on `visibility.reviews` + comms).
- **Remaining:** UI + workflows. **Edition:** Standard (proposed). **Terms: PENDING CEO DECISION.**
- **Deployment status:** NEEDS ASSEMBLY. **Next action:** Bundle with Review Management.

### 6. ReceptionAI

- **Purpose:** AI receptionist — answer, qualify, route inbound contact.
- **Target customer:** Service businesses that miss calls.
- **Foundation completion:** ~15% (spine + gateway; **no AI receptionist engine yet**).
- **Remaining:** net-new AI receptionist engine + telephony integration. **Terms: PENDING CEO DECISION.**
- **Deployment status:** NOT YET. **Next action:** Build when a named customer justifies the engine.

### 7. TransportationAI

- **Purpose:** Route/logistics assessment and optimization.
- **Target customer:** Transportation & delivery operators.
- **Foundation completion:** ~15% (spine + scoring; **no route-assessment engine yet**).
- **Remaining:** net-new route engine + mapping integration. **Terms: PENDING CEO DECISION.**
- **Deployment status:** NOT YET. **Next action:** On-demand vertical.

### 8. HomeHuddle

- **Purpose:** Home-services community/coordination hub.
- **Target customer:** Home-services businesses & families.
- **Foundation completion:** ~15–20% (spine; live legacy proof in Venuewise).
- **Remaining:** community domain re-implementation; **blocked on Venuewise convergence decision.**
- **Terms: PENDING CEO DECISION. Deployment status:** NOT YET. **Next action:** Resolve Venuewise first.

## Consolidated status table

| Product             | Foundation | Deployment           | Ownership | Licensing | Pricing | Recommended next action |
| ------------------- | ---------: | -------------------- | --------- | --------- | ------- | ----------------------- |
| HL-BTI              |        80% | Built — not deployed | PENDING   | PENDING   | PENDING | Launch 1st              |
| VisibilityAI        |        40% | Built — not deployed | PENDING   | PENDING   | PENDING | Launch 2nd (funnel)     |
| SalonAI             |      100%* | Needs assembly       | PENDING   | PENDING   | PENDING | First Factory pilot     |
| Review Management   |        30% | Needs assembly       | PENDING   | PENDING   | PENDING | Quick win               |
| Reputation Recovery |        25% | Needs assembly       | PENDING   | PENDING   | PENDING | Bundle w/ Reviews       |
| ReceptionAI         |        15% | Not yet              | PENDING   | PENDING   | PENDING | On-demand               |
| TransportationAI    |        15% | Not yet              | PENDING   | PENDING   | PENDING | On-demand               |
| HomeHuddle          |     15–20% | Not yet              | PENDING   | PENDING   | PENDING | After Venuewise         |

*SalonAI: 100% of required _modules_ are built; product-specific composition/UI remains.

## Decision Form (fill this in — no code required)

For each product you want to commercialize, provide:

```
Product: __________________________
  Edition(s) & price:      e.g. "Standard $X/mo, Professional $Y/mo"  → ________
  Subscription model:      subscription | one_time | managed_service  → ________
  Support tier(s):         standard | managed | enterprise            → ________
  Ownership:               internal-only | sellable | white-label     → ________
  Licensing:               per-tenant | per-seat | flat | OEM         → ________
  Commercial availability: not_yet | needs_assembly | ready_to_launch → ________
  Notes:                                                              → ________
```

Once returned, the engineer sets these in `packages/catalog/src/compositions.ts` and (on approval) the database — and the Software Factory console will show real commercial readiness instead of 0%.
