# Software Factory Audit · 02 — Product evaluations

**Audit only. No code. Engineering Law #1: ASSEMBLE, DO NOT REBUILD.**

For each product in the executive list: which capabilities already exist, how complete it
really is, what can be reused immediately, what is genuinely missing, and what **must not be
rebuilt**. Percentages are split into **foundation** (shared modules already built) vs
**shippable product** (the customer-facing thing) so a "100% of modules" never masquerades as
"100% of product." Grounded in the registries, compositions, and a live production check.

> **Honesty note up front:** several names in the list have **no HL-BOS product code**. They
> are external marketing sites or name-only stubs. Naming that plainly is the point of a
> reuse audit — you cannot "reuse" a product that was never built.

---

## Products with a real assembly path

### SalonAI — _needs assembly (composition exercise)_

- **Capabilities that exist:** COMMON_SPINE (9), `discovery_engine`, `visibility_assessments`, `bti_platform`, `scoring_engine` — all built.
- **% complete:** Foundation **~100% (modules built)** · Shippable product **~15–25%** (no salon app, no booking).
- **Reuse immediately:** identity/tenancy/billing/entitlements/events/workflows/storage/comms + discovery + reviews + scoring — the whole backend.
- **Actually missing (net-new):** salon **domain** (services/staff/clients), **booking/calendar**, customer/admin/staff **app surfaces**, public **site**. (AI receptionist deferred for the pilot.)
- **MUST NOT rebuild:** identity, tenancy, billing, entitlements, events, workflows, storage, comms, discovery, reviews, scoring — the SalonAI **Gap Register** exists precisely to stop this. "SalonAI is a composition exercise, not a platform build."

### TransportationAI — _not yet (needs one net-new engine)_

- **Capabilities that exist:** COMMON_SPINE, `discovery_engine`, `scoring_engine`.
- **% complete:** Foundation **~100%** · Shippable **~15%**.
- **Reuse immediately:** spine + discovery + scoring.
- **Actually missing:** a **route-assessment engine** (`route_assessment` capability is `planned` — no module), plus app surfaces.
- **MUST NOT rebuild:** the spine, discovery, scoring. Build only the route engine.

### HomeHuddle — _not yet (blocked on a business decision)_

- **What exists in code:** a `home_huddle` **composition** (spine + discovery + scoring, `not_yet`) and an **external marketing site** ("HomeHuddle — powered by Venuewise", `venuewise.net`, GitHub Pages). **No HL-BOS product app.**
- **% complete:** Foundation **~100%** · Shippable **~15–20%**.
- **Reuse immediately:** spine + discovery + scoring.
- **Actually missing:** a community/coordination domain + app; and a **"Venuewise convergence decision"** (business, not engineering) that blocks the composition.
- **MUST NOT rebuild:** the spine, discovery, scoring. Resolve Venuewise first.

---

## Adjacent commercial opportunities (thin wraps on built capabilities)

### Review Management / Reputation Recovery — _needs assembly (Standard edition)_

- **Capabilities that exist:** COMMON_SPINE, `discovery_engine`, `visibility_assessments` (`visibility.reviews` on prod), comms.
- **% complete:** Foundation **~100%** · Shippable **~25–30%**.
- **Reuse immediately:** reviews + comms + identity + billing.
- **Actually missing:** UI + configuration; natural **upsell from a live VisibilityAI assessment**.
- **MUST NOT rebuild:** reviews, comms, identity, billing.

---

## Products that are NOT HL-BOS products (no code — do not imply otherwise)

### HSCS Consulting — _a services business, not a software product_

- **Reality:** HSCS Consulting is the **consulting practice**; its _software tool_ is **HL-BTI** (already built, backend live on prod). Separately, `HSCS-GLP` is a private prototype repo and `HSCS Government Logistics` is a **legacy, unreachable** product.
- **Assembly path:** none needed as a "product" — HL-BTI **is** its software. Reuse HL-BTI; do not build a new consulting app.

### CoachAI — _name-only stub_

- **Reality:** `not-started`, no composition, no modules. An **external** "CoachesHuddle — Chris Mazzu" Vercel app exists ("powered by Venuewise", `reusableModules: []`) but is **not** CoachAI and shares no HL-BOS code.
- **% complete:** **0%** (no code). **Reuse:** would start from the spine like any vertical. **Missing:** everything. **Must not rebuild:** n/a — nothing exists yet.

### 5-Star Sports Media — _external marketing sites only_

- **Reality:** exists as **external hosted sites** (`5starsportsmedia.com`, `5starcommunityevents.com`, `5stargrowthsolutions` GitHub Pages), `developmentStatus: external`, `reusableModules: []`. **No HL-BOS product code.**
- **Assembly path:** none today; would be a future vertical assembled from the spine + events/registration capabilities if pursued.

### AthleteHuddle — _not found_

- **Reality:** **does not appear anywhere** in the codebase (not in the portfolio registry, catalog, compositions, or app-registry). It is a **name only**. **0% — no code, no composition.**

### FleetHuddle — _name-only stub_

- **Reality:** `not-started`; "one integration point exists in the legacy project," no HL-BOS code, no composition. **0%.**

### Venuewise — _external brand / unresolved convergence, not a product_

- **Reality:** appears only as **external branding** on live sites (`venuewise.net`, the coaches-huddle Vercel app) and as an unresolved **"Venuewise convergence decision"** inside the `home_huddle` composition. **No HL-BOS product code.** Treat as a **business decision** (what to do with the Venuewise properties), not an engineering build.

### Future verticals — _the Factory's job_

- Any new vertical starts at **~100% foundation** (9-module spine + discovery + scoring + reviews + billing already built) and needs only its **domain + app surfaces** (± one net-new engine). The **Factory duplicate-risk check** and **Gap Register** are the guardrails that keep every future vertical an _assembly_, not a rebuild.

---

## What this evaluation establishes

1. **Exactly one product is ready to launch on built code: HL-BTI** (backend live on prod; deploy + terms remain). Full treatment in [`../first-commercial-launch/`](../first-commercial-launch/README.md).
2. **VisibilityAI** is a real prototype (backend on prod) but mock-only and behind a security gate — the funnel, launch #2.
3. **SalonAI / Review Management / Reputation Recovery / TransportationAI / HomeHuddle** are genuine assembly candidates: **~100% foundation, product surface missing**.
4. **AthleteHuddle, 5-Star Sports Media, FleetHuddle, CoachAI, Venuewise** are **not products yet** — external sites, name-only stubs, or brand/business decisions. They cannot be "reused" because they were never built here.
