# CP8 · Deliverable 3 — Software Catalog Architecture

**Date:** 2026-07-27 · **Checkpoint:** 8

The authoritative HLVS catalog distinguishes five object types, each in the `hlvs` schema.

## Objects

| Object                | Table                     | What it is                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Capability**        | `hlvs.capabilities`       | A business/technical ability HL owns (AI receptionist, reputation recovery, scheduling, event management, registration, route assessment, KPI scoring, communications, tenant identity, document extraction).                                                                                                                                                      |
| **Module**            | `hlvs.modules`            | An implementation unit delivering one or more capabilities. Records identifier, name, description, category, owning system, source repo/path, schema ownership, APIs, RPCs, UI components, worker functions, dependencies, test suites, documentation, security requirements, maturity, current version, lifecycle, production-eligibility, licensing-eligibility. |
| **Product**           | `hlvs.products`           | A deployable software product assembled from modules (ReceptionAI, SalonAI, TransportationAI, HomeHuddle, AthleteHuddle, Reputation Recovery, Review Management).                                                                                                                                                                                                  |
| **Industry Template** | `hlvs.industry_templates` | A reusable composition for an industry (salon, barbershop, transportation, sports organization, home services, consulting, school district).                                                                                                                                                                                                                       |
| **Product Edition**   | `hlvs.product_editions`   | A priced/licenseable configuration (Basic, Professional, Enterprise, Managed, White Label, Internal).                                                                                                                                                                                                                                                              |

## Relationship to the CP6 catalogs (no duplication)

`discovery.module_catalog` (CP6) remains the **commercial / recommend-able** catalog consumed by the customer blueprint engine (availability, entitlement_key, effort). `hlvs.modules` is the **engineering registry** — the factory's authoritative record (repo/schema/APIs/lifecycle/production-eligibility/licensing/maturity). They link 1:1 by `hlvs.modules.discovery_module_key`. This separation of concerns is documented as necessary in the [Reuse Analysis](45-checkpoint8-hlvs-factory-interface-reuse-analysis.md) §5. `discovery.service_catalog` is referenced by product/edition compositions; HLVS adds no competing service catalog.

## Rich list fields

Because a module/product carries many list-valued attributes (APIs, RPCs, UI, workers, deps, tests, docs, security, manifests), those are stored as `jsonb` arrays. Scalar governance fields (lifecycle, version, production-eligibility, maturity) are typed columns so they can be constrained and queried.

## Seeds

Ten capabilities, seven products, seven industry templates, and twelve extraction candidates are seeded so the catalog is navigable immediately; all catalog changes thereafter go through the governance model ([Deliverable 5](49-catalog-governance-model.md)).
