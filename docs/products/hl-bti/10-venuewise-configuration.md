# HL-BTI — Venuewise Configuration (Deliverable 10)

**Customer #2: Venuewise — the first internal transformation assessment, ANALYSIS ONLY.**

## 1. The hard boundary (PCO, verbatim intent)

Venuewise is **NOT** being migrated, **NOT** rebuilt, **NOT** having authentication replaced, **NOT** having payments replaced. HL-BTI performs **analysis only** and generates **recommendations only** for Venuewise. This is consistent with Checkpoint 8B (Venuewise is a live estate; HL-BTI does not touch it).

## 2. Registration

```
bti.register_business(
  tenant   => <tenant>,
  key      => 'venuewise',
  name     => 'Venuewise',
  industry => 'sports',
  pack     => 'sports',
  analysis_only => true)          -- advise-only
```

`analysis_only = true` → every engagement opens in **`analysis_only`** mode.

## 3. How "analysis only" is enforced (in code, not just documented)

The `analysis_only` posture is enforced deterministically at three points:

1. **`bti.advance_stage`** refuses to advance an analysis-only engagement past **`blueprint`** (rank 6). Attempting `proposal` (or beyond) raises `insufficient_privilege`. Test: `t_analysis_cap_blocks_proposal`.
2. **`bti.create_project`** refuses analysis-only engagements — no implementation delivery. Test: `t_analysis_no_delivery`.
3. **`bti.record_roi_metric`** refuses analysis-only engagements — no realized-ROI tracking. Test: `t_analysis_no_roi`.

So Venuewise can be assessed (six domains, seven scores) and receive an Executive Blueprint with recommendations — and **cannot** progress to a proposal, billing, implementation, or ROI engagement. The edge mirror `_shared/bti/lifecycle.ts` reflects the same cap (`nextStage('blueprint','analysis_only') === null`).

## 4. What Venuewise gets

Full executive assessment across all six intelligence domains, the seven executive scores, and an Executive Business Transformation Blueprint whose recommendations each carry priority, estimated ROI, and a recommended Herman Legacy service. **Advice, not intervention.**

## 5. Relationship to the Venuewise platform question

Checkpoint 8B surfaced a converge-vs-coexist decision about Venuewise Core and HL-BOS. HL-BTI does **not** resolve or act on that — it only assesses Venuewise as a business and recommends. Any platform convergence remains a separate, CEO-gated decision untouched by this PCO.
