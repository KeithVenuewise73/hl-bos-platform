# @hl-bos/hld-transformation-pipeline

The Herman Legacy Digital **Business Transformation Pipeline** — the workflow
that surrounds BTI and turns analysis into a client transformation. It is an
**assembly** on the merged BTI components, not a new engine.

## The eleven stages

```
1 Business Discovery      ┐
2 Evidence Collection     ├─ reused verbatim from @hl-bos/bti-venuewise
3 BTI Analysis            │   (which reuses @hl-bos/bti-cycle)
4 Executive Report        ┘
5 Executive Review        — the CEO decision gate (approve / evidence / defer / decline)
6 Transformation Plan     — the recommendation becomes EXECUTABLE tasks
7 Capability Mapping      — each task ↦ the HLD capability that executes it
8 Implementation Roadmap  — phased; the full roadmap is GATED until BTI reruns firm
9 Progress Tracking       — deterministic status rollup
10 Success Measurement    — the BTI Measurement Contract, honest nulls
11 Continuous Transformation — fold new evidence back in; rerun; unlock the next phase
```

`runPipeline(engagement, decision?)` walks all eleven stages and returns a typed
`PipelineState`. It **plans; it does not execute** — no task is run, nothing is
deployed, no database is touched.

## The core idea

> The transformation, not the report, is the product.

So **every recommendation becomes an executable implementation task** with
acceptance criteria, dependencies, and the HLD capability that would execute it.
When BTI's output is `COLLECT_MORE_EVIDENCE` (as it is for Venuewise), the
pipeline is honest: it turns the **provisional lead + evidence appetite** into
Phase-0/1 tasks and **gates the full commercialization roadmap** until BTI
reruns to a firm recommendation. `reanalyze()` folds newly-collected evidence
back in and reruns — closing the loop.

## Client #1 — Venuewise

`runPipeline(VENUEWISE_CLIENT)` produces (deterministically): output
`COLLECT_MORE_EVIDENCE`; an executive decision to approve evidence collection;
**9 executable tasks** (package one offer → price it → put it in front of real
prospects; collect the load-bearing CEO facts; capture the baseline); a
capability map; a roadmap with the full commercialization phase **gated**;
0 %-complete progress; a measurement contract with the honest `subscriptions = 1`
baseline; and the rerun trigger. The loop test proves that once the CEO confirms
the goal and the evidence lands, BTI reaches `RECOMMEND_TRANSFORMATION` and the
gated phase unlocks.

## Run it

```
pnpm --filter @hl-bos/hld-transformation-pipeline test       # 14 tests
pnpm --filter @hl-bos/hld-transformation-pipeline pipeline   # prints the plan for Client #1
```
