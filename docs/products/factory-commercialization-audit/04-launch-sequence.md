# Software Factory Audit · 04 — Recommended commercial launch sequence

**Audit only. No code. Optimize for: minimum new engineering × maximum recurring revenue.**

The sequence front-loads products that need **zero net-new engines**, uses the first
product's cash to fund the next, and turns on the **recurring** flywheel as early as the
engineering allows.

## The sequence

| #      | Product                                              | New engineering required                                                | Revenue type                                             | Why here                                                                                                                             |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **1**  | **HL-BTI** (consultant-operated)                     | **None** — deploy + 3 evidence bridges (reuse-first)                    | Engagement fees now → managed-service subscription later | Only `ready_to_launch` product; backend live on prod; warm HSCS pipeline. Fastest cash, funds the rest.                              |
| **2**  | **VisibilityAI**                                     | Security hardening (SSRF/live-egress) + customer UI — **no new engine** | **Subscription** (the recurring engine)                  | It is the **funnel** that feeds every other product; turning it on starts recurring revenue and creates the upsell pipeline.         |
| **3**  | **Review Management** + **Reputation Recovery**      | **Thinnest wraps** — UI + config only                                   | **Subscription** (Standard)                              | Lowest engineering in the whole portfolio; natural **upsell from a VisibilityAI assessment**. Recurring revenue for almost no build. |
| **4**  | **SalonAI** (pilot: Canvas Hair Co.)                 | Salon domain + booking + app surfaces + site — **no new engine**        | **Subscription** (vertical SaaS)                         | First full **Factory** vertical; strong recurring; proves the assembly model end-to-end with a named pilot.                          |
| **5+** | **TransportationAI**, **ReceptionAI**, new verticals | **One net-new engine each** (route / receptionist)                      | Subscription                                             | Deferred until a **named customer** justifies the engine — the only items needing real new engineering.                              |

_Excluded from the near-term sequence (no code to launch):_ AthleteHuddle, 5-Star Sports
Media, FleetHuddle, CoachAI, HomeHuddle (Venuewise decision first), Venuewise. These are
future greenfield or business decisions, not reuse plays.

## Why this order maximizes recurring revenue while minimizing engineering

- **Engineering rises left-to-right.** #1 is deploy-only; #2 adds security + UI; #3 is a thin
  wrap; #4 is a vertical app; #5+ each need a new engine. You spend the _least_ new
  engineering earliest, for the _fastest_ revenue.
- **Recurring compounds.** HL-BTI seeds cash (engagement fees). VisibilityAI turns on the
  **subscription funnel**. Review Management / Reputation Recovery / SalonAI are all
  **subscription** products fed by that funnel — so recurring revenue accelerates without new
  platform work.
- **Each step de-risks the next.** VisibilityAI's live-egress security work (step 2) is reused
  by every product that scans a real site. SalonAI (step 4) proves the full Factory assembly
  the later verticals will follow.

## The gating decisions (yours — the only thing between "built" and "earning")

Across the whole sequence, the blockers are **ignition + terms**, not construction:

1. 🔑 Grant the **Anthropic key** (unlocks AI across HL-BTI, VisibilityAI, ReceptionAI).
2. 🔑 Authorize **deploying** the edge runtime + the first app(s).
3. 🔑 Set **commercial terms** per product (every price is `pending-ceo` — yours to set).
4. 🔑 **Billing:** out-of-band first (recommended), or finish the Stripe adapter (the one
   shared-service stub) before self-serve subscriptions.
5. 🔑 Approve the **VisibilityAI security hardening** as the prerequisite to any real-site scan.

## Guardrails that keep this a reuse program (Engineering Law #1)

- The **SalonAI Gap Register** and the **Factory duplicate-risk check** are non-waivable: no
  product may rebuild identity, tenancy, billing, entitlements, events, workflows, storage,
  comms, discovery, reviews, or scoring.
- **No shared-UI extraction** until ≥2 apps ship (avoid speculative abstraction).
- **No new schema** for a product that an existing schema already covers (CRM = discovery +
  identity, not a new service).
- Every step is **deploy + assemble**, and each net-new engine (steps 5+) requires a **named
  customer** first.

## Relationship to the first-commercial-launch package

This sequence **refines** [`../first-commercial-launch/`](../first-commercial-launch/README.md)
(HL-BTI → VisibilityAI → SalonAI) by inserting **Review Management / Reputation Recovery** at
step 3 — because they are the single lowest-engineering way to add recurring revenue once the
VisibilityAI funnel is live. The HL-BTI 90-day roadmap in that package remains the concrete
plan for step 1.
