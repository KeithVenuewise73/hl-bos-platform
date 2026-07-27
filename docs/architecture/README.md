# HL-BOS Architecture Docs — Index

Architecture-level documentation for the Herman Legacy platform. Phase-0 audit and Phase-1 (VisibilityAI) checkpoint docs live under `docs/architecture-audit/` and `docs/visibilityai/phase-1-enablement/` respectively; this folder holds cross-cutting architecture references and the HLVS Software Factory (Checkpoint 8) deliverables.

## Standing references

- [Current-state audit](current-state-audit.md)
- [Target architecture](target-architecture.md)
- [Permission model](permission-model.md)
- [Dependency policy](dependency-policy.md)
- [Decisions (ADRs)](decisions/)

## Checkpoint 8 — HLVS Factory Interface, Software Catalog & Creation Control

| #   | Deliverable                                                                         |
| --- | ----------------------------------------------------------------------------------- |
| 1   | [Reuse Analysis](45-checkpoint8-hlvs-factory-interface-reuse-analysis.md)           |
| 2   | [HLVS ↔ HL-BOS Responsibility Boundary](46-hlvs-hlbos-responsibility-boundary.md)   |
| 3   | [Software Catalog Architecture](47-software-catalog-architecture.md)                |
| 4   | [Capability Extraction Framework](48-capability-extraction-framework.md)            |
| 5   | [Catalog Governance Model](49-catalog-governance-model.md)                          |
| 6   | [Product Technical Blueprint Specification](50-product-technical-blueprint-spec.md) |
| 7   | [Software Creation Order Specification](51-software-creation-order-spec.md)         |
| 8   | [Claude Prompt-Package Specification](52-claude-prompt-package-spec.md)             |
| 9   | [Development-Run Lifecycle](53-development-run-lifecycle.md)                        |
| 10  | [Checkpoint-Report Contract](54-checkpoint-report-contract.md)                      |
| 11  | [Build Completion Report Specification](55-build-completion-report-spec.md)         |
| 12  | [Blueprint-Conformance Model](56-blueprint-conformance-model.md)                    |
| 13  | [Catalog Update Proposal Model](57-catalog-update-proposal-model.md)                |
| 14  | [Factory Build Package Specification](58-factory-build-package-spec.md)             |
| 15  | [HL-BOS Intake Contract](59-hlbos-intake-contract.md)                               |
| 16  | [Factory-Interface Event Catalog](60-factory-interface-event-catalog.md)            |
| 17  | [AI Safety and Authority Matrix](61-ai-safety-and-authority-matrix.md)              |
| 18  | [Readiness and Exception Policy](62-readiness-and-exception-policy.md)              |
| 19  | [Inert Development Adapter Documentation](63-inert-adapter-documentation.md)        |
| 20  | [CEO Decision & Authorization Report](64-checkpoint8-ceo-decision-report.md)        |
| 21  | [Checkpoint 8 Completion Report](65-checkpoint8-completion-report.md)               |

**Migration:** `supabase/migrations/20260727090200_hlbos_0025_hlvs_factory.sql` (`hlvs` schema).
**Tests:** `supabase/tests/27_hlvs_factory.sql` (90 pgTAP), `supabase/functions/tests/hlvs_factory.test.ts` (14 Deno), TS in `supabase/functions/_shared/hlvs/*`. Suite totals: **560 pgTAP + 93 Deno**.
