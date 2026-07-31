# HL-BTI v2 — Business Transformation Intelligence Engine — Architecture

**Phase VIII · Branch `claude/hlvs-architectural-assessment-ltqs1b` · Built, tested, un-deployed.**

## In one paragraph

HL-BTI v2 is a **reusable intelligence engine** that turns a scored business assessment into executive recommendations, answering five questions for every finding: _what happened, why, what should we do, what is the estimated business impact,_ and _what approval is required_. It is delivered as one new package, `@hl-bos/transformation-intelligence`, that is a **composition layer** — it reuses the platform's existing scoring and consulting engine (`@hl-bos/bti-engine`) and the Software Factory (`@hl-bos/catalog`) rather than rebuilding any of it. It adds only what did not exist: configurable scoring weights, quantified evidence-gated impact/ROI, Software-Factory reuse intelligence, deterministic CEO-approval gating, and government-contract opportunity intelligence. Nothing is fabricated, nothing is deployed, and no database was migrated.

## The pipeline

```
Raw Data ─▶ Analysis ─▶ Insights ─▶ Recommendations ─▶ Business Impact
         ─▶ CEO Approval ─▶ Execution ─▶ Measurement
```

| Stage           | What it produces                                            | Where it comes from                                                    |
| --------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Raw Data        | The scored assessment (labelled `sample` when illustrative) | Caller input                                                           |
| Analysis        | Executive scorecard (7 scores + transformation)             | **Reused** `bti-engine.computeScorecard`, fed **configurable** weights |
| Insights        | Findings with root cause + evidence + claims                | **Reused** `bti-engine.consulting.generateConsultingReport`            |
| Recommendations | Per-finding executive recommendation (the 5 answers)        | **New** `recommendations.ts` (enriches findings)                       |
| Business Impact | Evidence-gated monetary estimate + portfolio total          | **New** `impact.ts`                                                    |
| CEO Approval    | Deterministic required approvals                            | **New** `approval.ts`                                                  |
| Execution       | _Not performed_ — the approval-gated action set             | Deterministic authority; humans act                                    |
| Measurement     | Success metrics to track afterward                          | From the reused findings                                               |

Entry point: `runTransformationIntelligence(assessment, configOverrides?)` in `pipeline.ts`.

## Module map

| File                 | Responsibility                                                          | Reuses                           |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `config.ts`          | Configurable weights/thresholds/assumptions; `resolveConfig`            | —                                |
| `framework.ts`       | The 15 assessment areas as a data-driven view over canonical dimensions | `bti-engine.DOMAINS`             |
| `impact.ts`          | Quantified, evidence-gated impact & ROI                                 | —                                |
| `factory.ts`         | Software-Factory reuse (%, missing modules, effort, availability)       | `catalog.assembleProduct`        |
| `approval.ts`        | Deterministic CEO-approval requirements                                 | —                                |
| `recommendations.ts` | Enriches consulting findings into v2 recommendations                    | `bti-engine.consulting`          |
| `hlvs.ts`            | Software-opportunity intelligence over recommendations                  | `catalog` compositions           |
| `government.ts`      | Government-contract opportunity intelligence                            | `catalog` capabilities           |
| `pipeline.ts`        | The 8-stage orchestrator                                                | `computeScorecard`, `consulting` |

## Architecture decisions (ADRs)

### ADR-1 — A new composition package, not an extension of `bti-engine`

`@hl-bos/bti-engine` is a **canonical mirror** kept in three-way parity with the DB authority (`bti.*`) and the edge layer (`_shared/bti`), tagged with `BTI_*_VERSION`. Extending its core would force parallel SQL + edge changes and a migration. v2 is therefore a **separate package that composes** the engine. Consequence: the core scoring stays untouched and un-mirrored work is avoided; v2 can evolve without a migration.

### ADR-2 — Reuse the consulting engine's pipeline wholesale

The existing `consulting.*` namespace already implements Problem → Root Cause → Priority → Solution → HL-service with FACT/INFERENCE/OPINION claim classification. v2 **enriches** each `Finding` rather than re-deriving it. Consequence: no duplicated finding logic; the same numbers everywhere.

### ADR-3 — Configurable scoring, zero hardcoded industries

All weights, thresholds and economic assumptions live in `EngineConfig` as data. Industry is a caller-supplied `industryPack` string that only re-orders emphasis through the existing data-driven industry templates. Consequence: a new industry or weighting is a row/override, never a code branch. Proven by test: reweighting to growth-only makes the transformation score equal the growth domain score.

### ADR-4 — Honesty is enforced in types, not just docs (Principle 10)

Every monetary field is `number | null`. Missing inputs yield `null` with a stated reason; computed values are flagged `illustrative` with their basis; `paybackMonths` is **always** `null` because Herman Legacy pricing is a pending CEO decision. Consequence: the engine cannot fabricate a business result.

### ADR-5 — The engine advises; humans approve

`approval.ts` attaches deterministic approval requirements to every actionable recommendation; the government module attaches a required `ceo_spend` approval to every bid decision. The engine authorises nothing. Consequence: "AI approves nothing" is structural.

### ADR-6 — Demonstrated on a labelled sample, never a fabricated customer

The Executive Portal section runs the real engine over an input explicitly marked `sample: true` ("Sample Business (illustrative)"), and sample government opportunities marked illustrative. Consequence: the demonstration is honest — a real engine on labelled sample input, not an invented customer interaction.

### ADR-7 — Purity: no I/O, no writes, safe to deploy read-only

The package is pure functions over in-memory data (`buildCatalog` is in-memory, not a filesystem scan). No shell, git, filesystem mutation, or database writes. Consequence: it is safe inside the read-only Executive Portal and requires no runtime to function.

## What this phase did NOT do (stop conditions honoured)

- **No deployment.** The package and portal section are built and tested; nothing was deployed.
- **No production migration.** The optional persistence design (`07-database-design.md`) is a **proposal under `docs/`**, not applied, not in `supabase/migrations/`.
- **No customer application modified.** `apps/control-center` (localhost-only) and the existing `apps/hl-bti*` are untouched. The only app change is additive views in the Phase VII Executive Portal.
