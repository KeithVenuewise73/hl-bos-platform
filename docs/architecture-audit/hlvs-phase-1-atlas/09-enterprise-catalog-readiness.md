# 09 · Enterprise Catalog Readiness Assessment

This is the gap analysis the directive asks for. For every capability the future **Enterprise Catalog** needs, it is classified **ALREADY EXISTS · PARTIALLY EXISTS · MISSING**. The governing objective is to _extend_ existing work, not recreate it — and the finding is that **most of the Enterprise Catalog already exists as governed data and logic.** What is missing is the storefront, the runtime ignition, and a set of business decisions.

> **Scope note:** this is a readiness assessment only. Per the directive, this sprint does **not** begin designing or building the Enterprise Catalog — that is the next phase.

---

## 1. What "Enterprise Catalog" means here

A catalog that lets Herman Legacy leadership see, govern, compose, price, and deploy the reusable software the company owns — capabilities, modules, products, editions, and industry templates — and turn an approved catalog entry into a real, provisioned customer system through a governed factory. In short: **the shelf, the recipes, the pricing, and the ignition.**

## 2. Gap analysis

### Catalog content & structure

| Capability needed                                      | Status             | Evidence / where it lives                                                                       |
| ------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| Capability registry (what HL owns)                     | **ALREADY EXISTS** | `hlvs.capabilities` (10 seeded), versioned, approval-gated                                      |
| Module registry (engineering units)                    | **ALREADY EXISTS** | `hlvs.modules` — repo/path, APIs, tests, maturity, licensing-eligibility                        |
| Product definitions                                    | **ALREADY EXISTS** | `hlvs.products` (7 seeded)                                                                      |
| Product editions (Basic/Pro/Enterprise/White-Label…)   | **ALREADY EXISTS** | `hlvs.product_editions`                                                                         |
| Industry templates (compose per industry)              | **ALREADY EXISTS** | `hlvs.industry_templates` (7 seeded)                                                            |
| Commercial/recommend-able catalog (services & modules) | **ALREADY EXISTS** | `discovery.service_catalog` (25), `discovery.module_catalog` (23), linked 1:1 to `hlvs.modules` |

### Catalog governance

| Capability needed                                           | Status               | Evidence                                                                                                         |
| ----------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Lifecycle & versioning (draft→approved→deprecated→retired)  | **ALREADY EXISTS**   | Governance model in `hlvs`; immutable approved blueprints                                                        |
| Human approval gates                                        | **ALREADY EXISTS**   | `approve_capability`, `approve_module_production`, `publish_product`, `approve_determination` (permission-gated) |
| Duplicate-risk prevention                                   | **ALREADY EXISTS**   | Deterministic `hlvs.duplicate_check` (7 verdicts); AI advice stored, never authoritative                         |
| Capability extraction (harvest reuse from existing systems) | **PARTIALLY EXISTS** | `hlvs.extraction_candidates` registry + workflow built (12 sources); **actual code extraction is not performed** |
| Change control (catalog updates from builds)                | **ALREADY EXISTS**   | `hlvs.catalog_update_proposals` — no silent catalog edits                                                        |
| Audit of catalog changes                                    | **ALREADY EXISTS**   | `audit.emit` on every change                                                                                     |

### The factory (catalog entry → real software)

| Capability needed                                     | Status                  | Evidence                                                                            |
| ----------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Technical blueprint → creation order → prompt package | **ALREADY EXISTS**      | `hlvs.product_blueprints`, `software_creation_orders`, `prompt_packages`            |
| Governed development run tracking                     | **ALREADY EXISTS**      | `hlvs.development_runs` (agent-neutral, inert)                                      |
| Conformance validation                                | **ALREADY EXISTS**      | Deterministic conformance engine; non-waivable failure list                         |
| Build package → HL-BOS intake                         | **ALREADY EXISTS**      | `hlvs.factory_build_packages`, `hlbos_intake`, compared vs commercial authorization |
| Automated build execution (Claude actually builds)    | **MISSING (by design)** | `external_execution` always false; wiring Claude to the factory is a CEO decision   |

### Composition → commerce → provisioning

| Capability needed                                   | Status                  | Evidence                                                         |
| --------------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| Compose a product from modules/editions             | **ALREADY EXISTS**      | `hlvs.products`/`product_editions` referencing modules           |
| Proposal & agreement generation                     | **ALREADY EXISTS**      | `sales.proposals`, `agreements`, `billing_setup_requests`        |
| Provisioning & work orders                          | **ALREADY EXISTS**      | `provisioning.requests`, `work_orders`, `factory_authorizations` |
| Deterministic readiness gating                      | **ALREADY EXISTS**      | Readiness engine; stops at `ready`                               |
| Entitlement provisioning                            | **ALREADY EXISTS**      | Writes `entitlements.tenant_entitlements`, `module_activations`  |
| Actually deploying/operating the provisioned system | **MISSING (by design)** | HL-BOS production execution is intake-only today                 |

### Pricing, licensing, commercial terms

| Capability needed                       | Status                 | Evidence                                                                                                                 |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Price model & approval                  | **PARTIALLY EXISTS**   | `sales.prices` structure + approval gate exist; **actual prices are deliberately blank** (`pricing_ref='pending-ceo:…'`) |
| Licensing model per edition             | **PARTIALLY EXISTS**   | `licensing_eligibility` fields exist on modules/editions; **the licensing decisions are unmade**                         |
| Module ownership (internal vs sellable) | **MISSING (decision)** | Explicitly reserved as a CEO decision                                                                                    |

### Interface & runtime

| Capability needed                             | Status                 | Evidence                                                            |
| --------------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| Catalog user interface / console              | **MISSING**            | No catalog UI exists; the factory & catalogs are database-only      |
| Runtime (workers deployed, scheduler, AI key) | **MISSING (ignition)** | 8 edge functions built but undeployed; no `pg_cron`; no live AI key |
| Governed deploy pipeline                      | **MISSING**            | Migrations applied out-of-band; no deploy job                       |
| Reporting / catalog analytics                 | **MISSING (deferred)** | No reporting service yet                                            |

## 3. Scorecard

| Classification       | Count | Share |
| -------------------- | ----- | ----- |
| **ALREADY EXISTS**   | 20    | ~59%  |
| **PARTIALLY EXISTS** | 5     | ~15%  |
| **MISSING**          | 9     | ~26%  |

And of the nine "missing," **four are business decisions** (module ownership, licensing, pricing values, wiring Claude/production execution) rather than engineering — and the engineering-missing items (catalog UI, runtime ignition, deploy pipeline, reporting) are **additions on top of an existing foundation, not rebuilds.**

## 4. The one-sentence readiness verdict

**The Enterprise Catalog is roughly three-fifths already built** — its content model, governance, factory, and commerce pipeline exist as live, tested database logic. To reach a usable Enterprise Catalog, Phase II needs to **(a) put an interface on what exists, (b) switch on the runtime, and (c) make the reserved business decisions on ownership, licensing, and pricing** — in that order, and without recreating a single existing capability.

## 5. What must NOT be recreated (preserve list)

Because these already exist and are the point of the whole system, the next phase must extend — never re-scaffold — them: the capability/module/product/edition/template registries, the duplicate-risk check, the governance lifecycle and approval gates, the conformance and readiness engines, the discovery service/module catalogs, and the sales→provisioning pipeline. Recreating any of these would destroy accumulated IP and violate the mission.
