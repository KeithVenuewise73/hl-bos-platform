# VisibilityAI Phase 1 — Platform Enablement

Turning the built HL-BOS foundation + VisibilityAI assessment engine into a working, controlled customer-acquisition platform. Executed in 5 checkpoints; each ends in a working, tested capability or a governance artifact for CEO review.

**Canonical project:** `HL-BOS Core` / `mvvtngiopdrgiedjmhfb` — see [ADR-0001](../../architecture/decisions/0001-canonical-hl-bos-supabase-project.md).

## Deliverable status

| #   | Deliverable                                                                                        | Checkpoint | Status                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| 1   | Canonical Project ADR                                                                              | 1          | ✅ [ADR-0001](../../architecture/decisions/0001-canonical-hl-bos-supabase-project.md) |
| 2   | [Environment Reconciliation Report](02-environment-reconciliation-report.md)                       | 1          | ✅ Done                                                                               |
| 3   | [Deployment & Migration Plan](03-deployment-and-migration-plan.md)                                 | 1          | ✅ Done (workflows authored, inert)                                                   |
| —   | [Retirement-Readiness — empty project](04-retirement-readiness-empty-project.md)                   | 1          | ✅ Done (park, do not retire)                                                         |
| 4   | [Shared AI Enablement Report](05-shared-ai-enablement-report.md)                                   | 2          | ✅ Done (local; mock provider)                                                        |
| 5   | [Communications Architecture](08-communications-architecture-report.md)                            | 3          | ✅ Done (local; mock provider)                                                        |
| 6   | [Storage Architecture](07-storage-architecture-report.md)                                          | 3          | ✅ Done (local)                                                                       |
| —   | [CP3 Reuse Analysis](06-checkpoint3-reuse-analysis.md)                                             | 3          | ✅ Done                                                                               |
| —   | [Provider & Secret Configuration Guide](09-provider-and-secret-configuration-guide.md)             | 3          | ✅ Done                                                                               |
| —   | [CP3 Runbook & Test Coverage](10-checkpoint3-runbook-and-test-coverage.md)                         | 3          | ✅ Done (241 pgTAP + 14 Deno)                                                         |
| —   | [CP3 Completion Summary + CEO List](11-checkpoint3-completion-summary.md)                          | 3          | ✅ Done                                                                               |
| —   | [CP4 Reuse Analysis](12-checkpoint4-reuse-analysis.md)                                             | 4          | ✅ Done                                                                               |
| —   | [CP4 Discovery Architecture (profile/evidence/workflow)](13-checkpoint4-discovery-architecture.md) | 4          | ✅ Done                                                                               |
| —   | [Digital Maturity Framework](14-digital-maturity-framework.md)                                     | 4          | ✅ Done                                                                               |
| —   | [Business Health Framework](15-business-health-framework.md)                                       | 4          | ✅ Done                                                                               |
| —   | [CP4 Test Coverage](16-checkpoint4-test-coverage.md)                                               | 4          | ✅ Done (275 pgTAP + 14 Deno)                                                         |
| —   | [CP4 CEO Decision Report](17-checkpoint4-ceo-decision-report.md)                                   | 4          | ✅ Done                                                                               |
| —   | [CP4 Completion Summary](18-checkpoint4-completion-summary.md)                                     | 4          | ✅ Done                                                                               |
| —   | [CP5 Reuse Analysis](19-checkpoint5-reuse-analysis.md)                                             | 5          | ✅ Done                                                                               |
| 7   | [Website Assessment Architecture (Discovery Module 1)](20-website-assessment-architecture.md)      | 5          | ✅ Done (local; core tested)                                                          |
| —   | [SSRF & Crawl Security Report](21-ssrf-and-crawl-security.md)                                      | 5          | ✅ Done                                                                               |
| —   | [Website Evidence & Scoring Spec](22-website-evidence-and-scoring.md)                              | 5          | ✅ Done                                                                               |
| —   | [Shared Dispatcher Handler-Invocation](23-shared-dispatcher-handler-invocation.md)                 | 5          | ✅ Done (migration 0021)                                                              |
| —   | [Website Scanner Operations Runbook](24-website-scanner-operations-runbook.md)                     | 5          | ✅ Done                                                                               |
| —   | [Website Provider & Secret Configuration](25-website-provider-and-secret-configuration.md)         | 5          | ✅ Done (names only; no secret created)                                               |
| —   | [CP5 Test Coverage](26-website-test-coverage.md)                                                   | 5          | ✅ Done (315 pgTAP + 44 Deno)                                                         |
| —   | [CP5 Known Limitations](27-known-limitations.md)                                                   | 5          | ✅ Done                                                                               |
| —   | [CP5 CEO Decision & Authorization](28-checkpoint5-ceo-decision-report.md)                          | 5          | ✅ Done                                                                               |
| —   | [CP5 Completion Summary](29-checkpoint5-completion-summary.md)                                     | 5          | ✅ Done                                                                               |
| —   | [CP6 Reuse Analysis](30-checkpoint6-reuse-analysis.md)                                             | 6          | ✅ Done                                                                               |
| —   | [Blueprint Architecture](31-blueprint-architecture.md)                                             | 6          | ✅ Done (local; engine tested)                                                        |
| —   | [Service Catalog Spec](32-service-catalog-spec.md)                                                 | 6          | ✅ Done (provisional; no prices)                                                      |
| —   | [Module Catalog Spec](33-module-catalog-spec.md)                                                   | 6          | ✅ Done (no provisioning)                                                             |
| —   | [Recommendation Rules & Priority Model](34-recommendation-rules-and-priority.md)                   | 6          | ✅ Done (data-driven, versioned)                                                      |
| —   | [Impact & ROI Modeling Spec](35-impact-and-roi-modeling.md)                                        | 6          | ✅ Done (assumption-based, no guarantees)                                             |
| —   | [Blueprint Lifecycle & Workflow](36-blueprint-lifecycle-and-workflow.md)                           | 6          | ✅ Done (AI cannot self-approve)                                                      |
| —   | [Evidence Traceability](37-evidence-traceability.md)                                               | 6          | ✅ Done                                                                               |
| —   | [Proposal & Provisioning Interface](38-proposal-and-provisioning-interface.md)                     | 6          | ✅ Done (interfaces only)                                                             |
| —   | [Blueprint Operations Runbook](39-blueprint-operations-runbook.md)                                 | 6          | ✅ Done                                                                               |
| —   | [CP6 Test Coverage](40-blueprint-test-coverage.md)                                                 | 6          | ✅ Done (380 pgTAP + 65 Deno)                                                         |
| —   | [CP6 Known Limitations](41-blueprint-known-limitations.md)                                         | 6          | ✅ Done                                                                               |
| —   | [CP6 CEO Decision & Authorization](42-checkpoint6-ceo-decision-report.md)                          | 6          | ✅ Done                                                                               |
| —   | [CP6 Completion Summary](43-checkpoint6-completion-summary.md)                                     | 6          | ✅ Done                                                                               |
| —   | [CP7 Reuse Analysis](44-checkpoint7-reuse-analysis.md)                                             | 7          | ✅ Done                                                                               |
| —   | [Proposal Architecture](45-proposal-architecture.md)                                               | 7          | ✅ Done (local; engine tested)                                                        |
| —   | [Pricing & Commercial Terms](46-pricing-and-commercial-terms.md)                                   | 7          | ✅ Done (versioned; no prices)                                                        |
| —   | [Customer Selection](47-customer-selection.md)                                                     | 7          | ✅ Done                                                                               |
| —   | [Agreement & Acceptance](48-agreement-and-acceptance.md)                                           | 7          | ✅ Done (placeholders; attorney review)                                               |
| —   | [Billing Setup Integration](49-billing-setup-integration.md)                                       | 7          | ✅ Done (mock; not activated)                                                         |
| —   | [Provisioning Request Architecture](50-provisioning-request-architecture.md)                       | 7          | ✅ Done (stops at ready)                                                              |
| —   | [Entitlement Plan Spec](51-entitlement-plan-spec.md)                                               | 7          | ✅ Done (not activated)                                                               |
| —   | [Implementation Work Order Spec](52-work-order-spec.md)                                            | 7          | ✅ Done                                                                               |
| —   | [Software Factory Authorization Package](53-software-factory-authorization.md)                     | 7          | ✅ Done                                                                               |
| —   | [Readiness & Blocking Rules](54-readiness-and-blocking-rules.md)                                   | 7          | ✅ Done (deterministic)                                                               |
| —   | [Tenant Provisioning Adapter](55-tenant-provisioning-adapter.md)                                   | 7          | ✅ Done (inert mock executor)                                                         |
| —   | [Events, Workflows & Approval](56-events-workflows-approval.md)                                    | 7          | ✅ Done                                                                               |
| —   | [CP7 Operations Runbook](57-checkpoint7-operations-runbook.md)                                     | 7          | ✅ Done                                                                               |
| —   | [CP7 Test Coverage](58-checkpoint7-test-coverage.md)                                               | 7          | ✅ Done (470 pgTAP + 79 Deno)                                                         |
| —   | [CP7 Known Limitations](59-checkpoint7-known-limitations.md)                                       | 7          | ✅ Done                                                                               |
| —   | [CP7 CEO Decision & Authorization](60-checkpoint7-ceo-decision-report.md)                          | 7          | ✅ Done                                                                               |
| —   | [CP7 Completion Summary](61-checkpoint7-completion-summary.md)                                     | 7          | ✅ Done                                                                               |

## Checkpoints

1. **Canonical project & deployment controls** — ADR, stale-ref corrections, protected `db-migrate.yml` + `deploy.yml` (inert), env reconciliation, retirement-readiness. **← current; report then stop before production deployment.**
2. AI & background runtime — activate AI gateway, event dispatcher, smoke tests, cost tracking. **← done locally (mock provider); 24 pgTAP + 8 Deno assertions passing.**
3. Shared storage & communications — schemas, provider interfaces, RLS, consent, tests. **← done locally; migrations 0018/0019; 51 new pgTAP + 6 Deno assertions passing.**
4. **Business Discovery Engine foundation** — reusable `discovery` schema (migration 0020): collector registry, unified Business Profile + evidence, Digital Maturity + Business Health frameworks, assessment lifecycle via workflows. **← done locally; 34 new pgTAP assertions. The Website Scanner is now Discovery Module 1 (an evidence collector).**
5. **Website Assessment collector (Discovery Module 1)** — SSRF-safe deterministic evidence collection into the Discovery Engine; shared event handler-invocation (migration 0021); scan lifecycle + collector activation (migration 0022); data-driven rubric scoring; prompt-injection fencing; mock AI/PageSpeed. **← done locally; migrations 0021/0022; +40 pgTAP + 30 Deno assertions (315 pgTAP + 44 Deno total). Live crawl/AI/PageSpeed/scheduler remain CEO-gated.**
6. **Business Transformation Blueprint Engine** — converts a completed assessment into a structured, versioned, evidence-traceable transformation plan (migration 0023): extended blueprints/recommendations, data-driven service + module + phase catalogs, versioned recommendation rules, transparent priority model, honest assumption-based impact estimates, controlled lifecycle with human approval (AI can never self-approve). Reuses the discovery/workflow/events/AI/storage/comms/billing spine; inert worker on the CP5 dispatcher. **← done locally; migration 0023; +65 pgTAP + 21 Deno assertions (380 pgTAP + 65 Deno total). Live AI/scheduler/proposal/provisioning/prices remain CEO-gated.**
7. **Proposal, Customer Selection & Provisioning Request** — commercial + operational handoff from an approved blueprint (migration 0024, new `sales` + `provisioning` schemas): versioned proposals + structured priced line items, a versioned price model with an approval gate, customer-selection snapshots, agreement acceptance (attorney-review-flagged placeholders), a billing-setup request (reuses `billing.*`, never activates), a provisioning request + entitlement plan + implementation work order, and a Software Factory authorization package with a deterministic readiness engine + audited bounded exceptions. Human approval throughout (AI can never price/approve/accept/pass readiness); the provisioning lifecycle stops at `ready` with an inert mock executor. **← done locally; migration 0024; +90 pgTAP + 14 Deno assertions (470 pgTAP + 79 Deno total). Live billing/payments/provisioning/comms/prices/legal remain CEO-gated.**

## Governance

No migration is applied and no service is deployed without the §10 review and the CEO-armed `production` environment gate. Nothing in Checkpoint 1 changed production: no migration applied, no function deployed, no secret created, no environment armed.
