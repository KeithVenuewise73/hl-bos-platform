# VisibilityAI Phase 1 — Platform Enablement

Turning the built HL-BOS foundation + VisibilityAI assessment engine into a working, controlled customer-acquisition platform. Executed in 5 checkpoints; each ends in a working, tested capability or a governance artifact for CEO review.

**Canonical project:** `HL-BOS Core` / `mvvtngiopdrgiedjmhfb` — see [ADR-0001](../../architecture/decisions/0001-canonical-hl-bos-supabase-project.md).

## Deliverable status

| #   | Deliverable                                                                      | Checkpoint | Status                                                                                |
| --- | -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| 1   | Canonical Project ADR                                                            | 1          | ✅ [ADR-0001](../../architecture/decisions/0001-canonical-hl-bos-supabase-project.md) |
| 2   | [Environment Reconciliation Report](02-environment-reconciliation-report.md)     | 1          | ✅ Done                                                                               |
| 3   | [Deployment & Migration Plan](03-deployment-and-migration-plan.md)               | 1          | ✅ Done (workflows authored, inert)                                                   |
| —   | [Retirement-Readiness — empty project](04-retirement-readiness-empty-project.md) | 1          | ✅ Done (park, do not retire)                                                         |
| 4   | Shared AI Enablement Report                                                      | 2          | ⏳ Pending                                                                            |
| 5   | Communications Architecture                                                      | 3          | ⏳ Pending                                                                            |
| 6   | Storage Architecture                                                             | 3          | ⏳ Pending                                                                            |
| 7   | Website Scanner Architecture                                                     | 4          | ⏳ Pending                                                                            |
| 8   | Database Reuse Matrix                                                            | 2–4        | ⏳ Pending (per new object)                                                           |
| 9   | Security Threat Model                                                            | 2–4        | ⏳ Pending                                                                            |
| 10  | Test Plan & Results                                                              | all        | ⏳ Pending                                                                            |
| 11  | Operational Runbook                                                              | 2–4        | ⏳ Pending                                                                            |
| 12  | Phase 1 Readiness Report                                                         | 5          | ⏳ Pending                                                                            |

## Checkpoints

1. **Canonical project & deployment controls** — ADR, stale-ref corrections, protected `db-migrate.yml` + `deploy.yml` (inert), env reconciliation, retirement-readiness. **← current; report then stop before production deployment.**
2. AI & background runtime — activate AI gateway, event dispatcher, smoke tests, cost tracking.
3. Shared storage & communications — schemas, provider interfaces, RLS, consent, tests.
4. Website scanner — SSRF-safe worker, evidence collection, assessment integration, human-review handoff.
5. Internal end-to-end test — an authorized Herman Legacy-controlled public site.

## Governance

No migration is applied and no service is deployed without the §10 review and the CEO-armed `production` environment gate. Nothing in Checkpoint 1 changed production: no migration applied, no function deployed, no secret created, no environment armed.
