# @hl-bos/bte-pipeline

The Business Transformation Engine (BTE) automated intake pipeline **core** —
deterministic, DB-agnostic, and unit-tested. It turns a normalized Business
Transformation intake into an engagement, collects public website evidence,
analyzes it with `@hl-bos/bti-engine`, generates a versioned **draft** report,
and drives the truthful processing state machine — **without** touching a
database, the network, the clock, or any secret. Every outside effect goes
through an injected adapter (`adapters.ts`).

Full design, reuse matrix, integration plan and the exact merge dependency:
[`docs/products/hld-bte-intake/README.md`](../../docs/products/hld-bte-intake/README.md).
Real generated output: [`internal-preview.md`](../../docs/products/hld-bte-intake/internal-preview.md).

## Modules

| File            | Responsibility                                                                              |
| --------------- | ------------------------------------------------------------------------------------------- |
| `types.ts`      | Domain contract: intake, states, evidence, findings, report, engagement.                    |
| `states.ts`     | The 12-state processing machine + legal transitions + next actions.                         |
| `confidence.ts` | Maps bti-engine fact/inference/opinion → verified/inferred/needs_confirmation/unavailable.  |
| `evidence.ts`   | Turns an injected fetch outcome + intake into truthful `EvidenceRecord`s (blocked ≠ clean). |
| `report.ts`     | Reuses `analyst.analyzeBusiness` to build the 11-section `draft_ai_generated` report.       |
| `versioning.ts` | Version lifecycle; a new draft never overwrites an approved report.                         |
| `adapters.ts`   | Ports (fetch, notify, acknowledge, audit, clock, ids) + in-memory reference impls.          |
| `pipeline.ts`   | The orchestrator; keeps every failure visible and retryable.                                |
| `sample.ts`     | Illustrative fixtures (real bti-engine homepage snapshot).                                  |

## Design guarantees

- The generated report is always `draft_ai_generated` and **never** delivered to
  a client (`EngagementResult.clientReportDelivered` is the literal `false`).
- No failure silently discards the intake.
- A blocked website is recorded as `blocked` with zero observations — never faked.
- A prior `approved` report is never overwritten.

## Commands

```
pnpm --filter @hl-bos/bte-pipeline typecheck
pnpm --filter @hl-bos/bte-pipeline test
```

This package binds to production primitives only through its adapters; on its own
it performs no I/O. See the integration plan for the production bindings.
