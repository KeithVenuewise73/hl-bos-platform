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
| 7   | Website Scanner Architecture (now Discovery Module 1)                                              | 5          | ⏳ Pending (CP5)                                                                      |
| 8   | Database Reuse Matrix                                                                              | 2–4        | ⏳ Pending (per new object)                                                           |
| 9   | Security Threat Model                                                                              | 2–4        | ⏳ Pending                                                                            |
| 10  | Test Plan & Results                                                                                | all        | ⏳ Pending                                                                            |
| 11  | Operational Runbook                                                                                | 2–4        | ⏳ Pending                                                                            |
| 12  | Phase 1 Readiness Report                                                                           | 5          | ⏳ Pending                                                                            |

## Checkpoints

1. **Canonical project & deployment controls** — ADR, stale-ref corrections, protected `db-migrate.yml` + `deploy.yml` (inert), env reconciliation, retirement-readiness. **← current; report then stop before production deployment.**
2. AI & background runtime — activate AI gateway, event dispatcher, smoke tests, cost tracking. **← done locally (mock provider); 24 pgTAP + 8 Deno assertions passing.**
3. Shared storage & communications — schemas, provider interfaces, RLS, consent, tests. **← done locally; migrations 0018/0019; 51 new pgTAP + 6 Deno assertions passing.**
4. **Business Discovery Engine foundation** — reusable `discovery` schema (migration 0020): collector registry, unified Business Profile + evidence, Digital Maturity + Business Health frameworks, assessment lifecycle via workflows. **← done locally; 34 new pgTAP assertions. The Website Scanner is now Discovery Module 1 (an evidence collector).**
5. Website Assessment collector (Discovery Module 1) — SSRF-safe evidence collection into the Discovery Engine; then internal end-to-end test on an authorized Herman Legacy-controlled public site.

## Governance

No migration is applied and no service is deployed without the §10 review and the CEO-armed `production` environment gate. Nothing in Checkpoint 1 changed production: no migration applied, no function deployed, no secret created, no environment armed.
