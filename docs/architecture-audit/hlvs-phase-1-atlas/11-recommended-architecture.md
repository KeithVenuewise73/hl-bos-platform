# 11 · Recommended Architecture

Where each capability should live, and the target shape — designed for **maximum reuse and minimal disruption**. The strong recommendation is to **keep the current architecture and extend it.** It is sound, tested, and already organized around the three-role split the CEO defined. There is no compelling reason to redesign anything, and every reason not to.

---

## 1. Guiding principles (unchanged from what's already working)

1. **Preserve the three planes** — catalog definition (HLVS), development execution (Claude, governed), production execution (HL-BOS). The code already honors them; keep it that way.
2. **Assemble, never rebuild.** Every product is composed from HL-BOS shared services through the Factory. The "no second identity/tenancy/billing/event-bus/…" rule stays absolute.
3. **Deterministic authority, advisory AI.** The math decides; AI suggests. Human gates on everything that deploys, charges, publishes, or provisions.
4. **Honesty in the schema.** Null-not-zero, no fabricated data, append-only audit, empty-states-that-explain-themselves — these are competitive assets, not overhead.

## 2. Where each capability belongs

This is the placement map. It mostly ratifies where things already are — which is the point.

### Stays in HLVS (the Product Intelligence Layer)

Everything in `hlvs.*`: capabilities, the engineering module registry, products, editions, industry templates, extraction candidates, duplicate determinations, product technical blueprints, creation orders, prompt packages, development runs, checkpoint/completion reports, conformance results, catalog update proposals, factory build packages, HL-BOS intake, and feedback. **HLVS decides what/why and validates; it never operates production.** This is the layer the mission wants to elevate — so _invest here_ (a console, the extraction workflow, wiring the development agent), but keep its boundaries.

### Stays in HL-BOS (the shared floor)

The entire spine: `platform`, `identity`, `audit`, `events`, `entitlements`, `integrations`, `ai`, `workflows`, `billing`, `storage_meta`, `comms`, plus the shared engines `discovery`, `sales`, `provisioning`. These are correctly placed. **Reuse unchanged; deploy the runtime.**

### Becomes Enterprise Catalog features (surface, don't move)

The catalog _content_ already lives correctly in `hlvs` (engineering) and `discovery` (commercial). The Enterprise Catalog is a **surface over these**, not a new home for them. Specifically:

- The recommend-able catalogs (`discovery.service_catalog`, `discovery.module_catalog`) become the customer-facing shelf.
- The `hlvs` capability/module/product/edition/template registries become the internal governance catalog.
- Keep the 1:1 link between them; do not merge.

### Stays a product (HL-BTI) and the template for future products

`bti.*` and its apps stay as a product on HL-BOS. Its _shape_ — thin RLS-trusting client over permission-checked RPCs, one shared deterministic engine package — is the **reference pattern** every future vertical should copy.

### Legacy — converge later, on a separate approved plan

The legacy `hlvs`/`hscs_glp`/`dpi`/`public` estate stays untouched until a CEO-approved convergence assignment. When it comes, the path is additive and reversible (register → adopt platform plane → re-implement page-by-page → one-time approved data migration → decommission). **No unsafe legacy pattern is ever carried forward.**

## 3. The target shape (a picture of "done" for Phase II)

```
              ┌───────────────────────────────────────────────┐
              │  ENTERPRISE CATALOG CONSOLE  (new UI surface)   │
              │  browse · govern · compose · price · launch     │
              └───────┬───────────────────────────────┬───────┘
                      │ reads/writes via RPC           │
        ┌─────────────▼──────────────┐   ┌─────────────▼─────────────┐
        │ HLVS  (hlvs.*)             │   │ Discovery catalogs        │
        │ engineering registry +     │◄─►│ (service_catalog,         │
        │ governance + factory loop  │1:1│  module_catalog)          │
        └─────────────┬──────────────┘   └───────────────────────────┘
                      │ approved, inert Factory Build Package
        ┌─────────────▼───────────────────────────────────────────┐
        │ HL-BOS shared spine (deployed runtime)                    │
        │ identity·tenancy·audit·events·entitlements·ai·workflows·  │
        │ billing·storage·comms·discovery·sales·provisioning        │
        │            ▲ events-dispatcher + workers (running)         │
        └─────────────┬───────────────────────────────────────────┘
                      │ assembled products
        ┌─────────────▼───────────────────────────────────────────┐
        │ HL-BTI · VisibilityAI · future verticals (assembled)      │
        └───────────────────────────────────────────────────────────┘
```

The only genuinely _new_ boxes are the **Enterprise Catalog Console** and the **deployed runtime**. Everything else already exists; it gets surfaced and switched on.

## 4. Specific recommendations

1. **Do not redesign. Ratify.** Adopt the current architecture as the Phase II foundation. The three-role split, the schema-per-domain layout, the function-as-API pattern, and the anti-fabrication doctrine are all correct.
2. **Elevate HLVS deliberately.** The mission is to turn HLVS into the Product Intelligence Layer — it already is one structurally. Invest in: a console over the factory, activating the capability-extraction workflow, and (a CEO decision) wiring the governed development agent so creation orders can actually be executed.
3. **Switch on the runtime before building more.** Deploy the gateway, dispatcher, and workers; install the scheduler; grant the AI key. Nothing above the database can _demonstrate_ value until this happens.
4. **Build the Enterprise Catalog as a surface, in the next phase.** Reuse the Control Center's UI kit and the HL-BTI RPC-client shape. Do not create new catalog storage.
5. **Keep the guardrails absolute.** The "no second X" rule and the factory's non-waivable duplicate-duplication failure are what keep the estate clean as it scales. Never relax them for expedience.
6. **Make the reserved business decisions explicitly** (ownership, licensing, pricing, production-execution authority). The Factory left these blank on purpose; the architecture can't fill them, and shouldn't.

## 5. What this architecture deliberately avoids

- **A rewrite.** There is no scenario in this assessment where recreating an existing capability is justified.
- **A second platform.** Verticals are modules, not stacks.
- **Premature abstraction.** Reporting, a shared CRM, guardrail-enforcement, and multi-provider AI are deferred until a real requirement (Rule of Three) pulls them in.
- **Touching legacy without a plan.** Convergence is a separate, gated, reversible program — not a Phase II side-effect.

**In one line:** the recommended architecture _is_ the current architecture, deployed, surfaced, and governed — with HLVS elevated to the Product Intelligence Layer it was built to become.
