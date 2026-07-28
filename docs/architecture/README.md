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

## Checkpoint 8B — Venuewise, Huddle, HighlightAI & BroadcastAI Legacy Asset Discovery

Evidence discovery, classification & migration planning only — **no migration, no production code, no legacy asset altered.** These docs correct any assumption that CP8's "greenfield" applied beyond the `hl-bos-platform` repo/DB.

| #      | Deliverable(s)                                                                       | Doc                                                                                                      |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1–3,19 | Access report · Repo/branch inventory · Pages inventory · Manual-access requirements | [67 · Reuse & Evidence Analysis](67-checkpoint8b-legacy-asset-discovery-reuse-analysis.md)               |
| 4–7    | Venuewise evidence · Huddle evidence · Capability matrix · Migration-candidate map   | [68 · Venuewise & Huddle Evidence](68-venuewise-huddle-evidence.md)                                      |
| 8–9    | Duplicate-implementation register · Unsafe-implementation register                   | [69 · Duplicate & Unsafe Report](69-duplicate-and-unsafe-legacy-report.md)                               |
| 10–14  | HighlightAI + BroadcastAI evidence audits · determinations · video-AI gap statement  | [70 · Video-AI Evidence Audit](70-highlightai-broadcastai-evidence-audit.md)                             |
| 15–16  | Shared media-platform capability map · Venuewise product boundary                    | [71 · Media Platform Capability Map](71-media-platform-capability-map.md)                                |
| 17–18  | HLVS catalog registration proposals · Exact migration sequence                       | [72 · Catalog Registration & Migration Sequence](72-hlvs-catalog-registration-and-migration-sequence.md) |
| 20     | CEO decision & authorization report                                                  | [73 · CEO Decision Report](73-checkpoint8b-ceo-decision-report.md)                                       |
| 21     | Completion report — answers the 10 questions                                         | [74 · Completion Report](74-checkpoint8b-completion-report.md)                                           |

**Headline findings:** the legacy estate is **live, not greenfield** (Venuewise Core → `venuewise.net`, 5 Star Sports Media → `5starsportsmedia.com`, one shared Supabase project); **HighlightAI and BroadcastAI were not found** as working software (only a YouTube-embed gallery), so they are genuinely greenfield; legacy security patterns (no FORCE RLS, anon INSERT, admin-by-JWT-claim, single shared project) **must never be migrated**; and Venuewise Core overlaps HL-BOS's own multi-tenant purpose — a **converge-vs-coexist decision for the CEO.**
