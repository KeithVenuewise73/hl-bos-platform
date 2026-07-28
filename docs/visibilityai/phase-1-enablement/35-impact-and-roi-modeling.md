# Phase 1 · Deliverable 6 (CP6) — Impact and ROI Modeling Specification

**Date:** 2026-07-27 · **Checkpoint:** 6 · Assumption-based, honest, never guaranteed.

`_shared/blueprint/impact.ts` (`impact-0.1.0`) and `discovery.impact_estimates` produce impact estimates that are transparent about their assumptions and never fabricate customer revenue.

## 1. Every estimate carries

- **Assumption** — the premise in plain language.
- **Input source** — `evidence`, `profile`, or `illustrative`.
- **Calculation method** — how the numbers (if any) were derived.
- **Low / Expected / High scenarios** — a range, never a single false-precise figure.
- **Confidence** — 0–1.
- **Illustrative flag** — `true` when there is no customer financial input.
- **Caveats** — the honesty disclaimer.

## 2. Two honest modes

**With customer financial input** (`financialInputs` + a `compute` function): the model computes low/expected/high from the customer's own numbers and labels `input_source = profile`, `illustrative = false`. The calculation method names exactly which inputs were used.

**Without financial input** (the default): the estimate is **qualitative and explicitly illustrative** — scenarios read "Modest / Meaningful / Substantial improvement", `illustrative = true`, and the caveat states plainly that no customer financial data was provided and outcomes are not guaranteed. This is the anti-fabrication rule in force: an honest "we can't quantify this yet" beats an invented ROI.

## 3. No guaranteed outcomes — enforced

`claimsGuarantee()` detects guarantee language. Caveats that contain it are neutralised (`sanitizeCaveats`). Critically, the assembler **rejects any AI executive summary that claims a guaranteed outcome** and marks the blueprint partial rather than publish it (proven by `blueprint_engine.test.ts :: assemble: AI guaranteed-outcome language is rejected`). Impact categories supported: lead-generation, conversion, time-savings, administrative-reduction, missed-opportunity-recovery, customer-retention, review-volume, response-time, scheduling-efficiency, revenue-readiness, risk-reduction.

## 4. Impact assumptions are a CEO decision

The default assumptions and confidence levels are provisional. The set of impact assumptions Herman Legacy stands behind is a **CEO decision** ([CEO Decision Report](42-checkpoint6-ceo-decision-report.md)); until then, estimates without customer inputs remain clearly illustrative.
