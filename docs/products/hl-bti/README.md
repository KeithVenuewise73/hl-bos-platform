# HL-BTI — Business Transformation Intelligence Platform

**Product Creation Order #1** — the first flagship product built by the HL-BOS Software Factory. An AI-powered Business Transformation Operating System delivered as **another reusable platform inside HL-BOS**. Local development only; nothing applied to a live project.

**Code:** `supabase/migrations/20260727090300_hlbos_0026_bti_platform.sql` (`bti` schema) · `supabase/functions/_shared/bti/{scoring,lifecycle,growth,blueprint}.ts` · tests `supabase/tests/28_bti_platform.sql` (47 pgTAP) + `supabase/functions/tests/bti_platform.test.ts` (11 Deno).

## Deliverables

| #   | Deliverable                | Doc                                    |
| --- | -------------------------- | -------------------------------------- |
| 1   | Product Architecture       | [01](01-product-architecture.md)       |
| 2   | Database Schema            | [02](02-database-schema.md)            |
| 3   | Assessment Framework       | [03](03-assessment-framework.md)       |
| 4   | Executive Blueprint Engine | [04](04-executive-blueprint-engine.md) |
| 5   | Growth Intelligence Engine | [05](05-growth-intelligence-engine.md) |
| 6   | Proposal Integration       | [06](06-proposal-integration.md)       |
| 7   | Implementation Module      | [07](07-implementation-module.md)      |
| 8   | CEO Dashboard              | [08](08-ceo-dashboard.md)              |
| 9   | HSCS Configuration         | [09](09-hscs-configuration.md)         |
| 10  | Venuewise Configuration    | [10](10-venuewise-configuration.md)    |
| 11  | Architecture Impact Report | [11](11-architecture-impact-report.md) |
| 12  | Reuse Analysis             | [12](12-reuse-analysis.md)             |
| 13  | Build Completion Report    | [13](13-build-completion-report.md)    |

## Headlines

- **Reuse-first:** zero new platform services; identity, auth, tenancy, permissions, audit, billing, proposals, factory governance and communications are all reused.
- **Deterministic + honest:** 7 executive scores with honest nulls; blueprint sections empty-with-a-reason; dashboard never invents status.
- **Venuewise is analysis-only — in code:** the stage machine and delivery/ROI RPCs refuse to take an analysis-only engagement past a blueprint.
- **All gates green on real runs:** 607 pgTAP + 104 Deno + 45 vitest, prettier/eslint/typecheck/migrations/secrets/ts-pin clean.
