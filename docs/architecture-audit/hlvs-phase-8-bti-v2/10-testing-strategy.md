# HL-BTI v2 — Testing Strategy

## In plain language

The v2 engine ships with **41 automated tests across 6 files**, and they all
pass. The tests do more than check arithmetic: they enforce the platform's honesty
rules as executable guarantees — that the same input always produces the same
output (determinism), that a missing input yields `null` rather than an invented
number, that no payback period is ever asserted, and that the engine approves
nothing. This document records exactly what exists today, then describes the wider
strategy the engine is designed for.

### Proof it passes (run on 2026-07-30)

```
 Test Files  6 passed (6)
      Tests  41 passed (41)
```

Run from `packages/transformation-intelligence` with vitest v4.1.10. These are the
real tests in the repository, counted and executed — not aspirational.

---

## The tests that exist today

| File                 |  Tests | What it asserts                                                                   |
| -------------------- | -----: | --------------------------------------------------------------------------------- |
| `config.test.ts`     |      5 | Configuration merge & immutability.                                               |
| `framework.test.ts`  |      4 | The 15-area framework validates against the engine (no drift).                    |
| `impact.test.ts`     |      8 | Evidence-gated impact; determinism; no fabricated payback.                        |
| `factory.test.ts`    |      5 | Software Factory reuse is counted from the real assembler, never asserted.        |
| `government.test.ts` |      7 | Government-contracts intelligence, evidence-gated, CEO-gated.                     |
| `pipeline.test.ts`   |     12 | The full pipeline answers the 5 questions, is deterministic, and is configurable. |
| **Total**            | **41** |                                                                                   |

### `config.test.ts` — configuration merge (5)

- Returns `DEFAULT_CONFIG` verbatim when no overrides are given; the default's
  `version` equals `ENGINE_VERSION`.
- The defaults match the existing bti-engine behaviour (finding threshold `3`,
  strength threshold `70`, automatable-hours fraction `0.2`) — v2 does not silently
  change v1's numbers.
- A partial `scoring` override sets the one field and **leaves the others intact**.
- Nested `domainWeights` merge **field-by-field** (override `growth`, keep
  `business`).
- Resolving with an override **does not mutate** `DEFAULT_CONFIG`.

### `framework.test.ts` — framework validation / no-drift (4)

- There are **exactly 15** assessment areas.
- `validateFramework()` proves **every** area reference resolves to a canonical
  engine dimension (`ok: true`, `unresolved: []`, `areaCount: 15`). This is the
  anti-drift guarantee: the framework cannot point at a dimension the engine does
  not define.
- `requiredDimensions()` is **de-duplicated** and every entry resolvable.
- Area keys are **stable and unique**.

### `impact.test.ts` — evidence gating, determinism, no payback (8)

- **Withholds** automation savings when labour inputs are missing (`monthlyValue`
  is `null`, note says what is required).
- Computes automation savings **deterministically** from supplied labour
  (`200 × 0.20 × 30 = 1200`).
- **Withholds** revenue uplift when monthly revenue is missing.
- Computes revenue uplift from supplied revenue and priority
  (`50000 × 0.06 = 3000`).
- **Never asserts a payback period** — `paybackMonths` is `null` for both savings
  and uplift, because Herman Legacy pricing is a pending CEO decision.
- Routes efficiency domains (operations/technology/ai_readiness) to savings and
  growth domains to revenue uplift.
- Aggregates a portfolio **honestly**: gated (null) estimates are counted and
  excluded from the total, not guessed; `incomplete` flips true.
- Reports **null totals** when nothing has a value.

### `factory.test.ts` — factory reuse, counted not asserted (5)

- Exposes a **non-zero shared spine** (the platform reuse dividend).
- Maps a "Reputation Management" service to the `reputation_recovery` composition.
- Drives the **real assembler** for a known product (`salon_ai` → `SalonAI`) and
  reports counts; build effort is derived from the missing-module count, one of
  `low`/`medium`/`high`.
- Reports a **net-new build** when no product matches, and even then inherits the
  shared spine.
- Carries **honest commercial availability, never a price**.

### `government.test.ts` — government intelligence (7)

- Reads our **real registered capabilities** from the catalog.
- Computes **win probability as a capability-match ratio** (full match ⇒ score
  `100`, band `high`, `pursue`).
- **Flags capability gaps** and recommends partnering when some are missing.
- **Withholds profit** until a contract value is supplied (`estimatedProfit` null,
  note says required).
- Estimates profit from a supplied value × margin, **flagged illustrative**
  (`1,000,000 × 0.15 = 150,000`).
- Returns `insufficient_data` when no required capabilities are supplied (win band
  `null`).
- **Always attaches a required CEO approval** (`ceo_spend`) to the bid decision —
  the engine recommends; the CEO decides.

### `pipeline.test.ts` — the whole pipeline (12)

- Runs all **eight** pipeline stages; `result.meta.stages` equals
  `PIPELINE_STAGES`.
- Stage 1 raw-data carries the **`sample: true`** flag — no fabricated customer.
- Stage 2 analysis produces a numeric transformation score.
- Stage 3 insights reuse the consulting findings.
- Stage 4: **every recommendation answers all five executive questions** —
  `problem` (what), `rootCause` (why), `solution` (what to do), `revenueImpact`
  (estimate), `approvals` (what approval) — plus a reusable HL product.
- Stage 4 **never asserts a payback period** on any recommendation.
- Stage 5 business impact totals **only** the supplied-figure estimates.
- Stage 6 CEO approval **always** includes `ceo_commercial_terms` and `ceo_deploy`.
- HLVS surfaces **deduplicated** software opportunities.
- Stage 8 measurement plan lists metrics to track.
- **Is fully deterministic** — a second run is `JSON.stringify`-identical to the
  first.
- **Scoring is configurable** — reweighting to growth-only makes the transformation
  score equal the growth score, proving the weights are live data, not hardcode.

---

## The broader strategy

### 1. Determinism as a first-class property

Determinism is not a nice-to-have; it is asserted directly. The pipeline test
deep-equals two independent runs of the same input. The engine has no clock, no
randomness, no I/O, so identical inputs must yield identical outputs. This is what
lets the Executive Portal, and any future persisted run, be trusted to reproduce
exactly. Every stable ordering in the engine (e.g. the HLVS opportunity sort by
verdict → reuse → key) exists to keep output byte-stable.

### 2. Honesty assertions (Principle 10)

The tests treat honesty as a testable contract:

- **Null when inputs are missing** — savings, revenue uplift, profit and win
  probability each return `null` (with an explanatory note) rather than a number
  when the figure they depend on was not supplied.
- **No fabricated payback** — `paybackMonths` is asserted `null` in both the impact
  and pipeline tests, because pricing is a pending CEO decision.
- **No invented price** — factory reuse carries honest commercial availability, and
  the tests assert it is never a price.
- **Sample is labelled** — the pipeline test asserts the `sample` flag propagates,
  so a demonstration can never masquerade as a real result.

### 3. Boundary / authorization tests live in the portal

The engine itself has no auth surface — it is a pure function. Authorization and
boundary tests (who may run it, over which tenant, with which permission) belong to
the **Executive Portal** and, if the proposed persistence is ever approved, to the
`public.bti_*` RPC layer, where `identity.has_permission(...)` is enforced exactly
as in migrations 0026/0027. Those SECURITY DEFINER functions are the correct place
for "denied without permission" tests; the engine's own suite deliberately does not
duplicate them. Until persistence exists, there is no authorization code in this
package to test.

### 4. The three-way parity invariant (and why v2 is exempt)

The HL-BTI platform holds a parity invariant for its **core scoring**: the same
deterministic result must come from the TypeScript engine, the edge `_shared/bti`
mirror, and the SQL `bti.*` functions (e.g. `bti.compute_scores`). That invariant
protects the numbers that already have a database authority.

**HL-BTI v2 does not alter the core scoring.** It is a _composition layer_: it calls
the existing engine's `computeScorecard` (with configurable weights that are
themselves data), reuses the existing consulting findings wholesale, and adds
enrichment (impact, reuse, approvals, opportunities, measurement) on top. It
introduces **no new scoring math that a database or edge function would need to
mirror**. Therefore v2 does **not** require SQL/edge mirroring, and the parity
invariant is neither weakened nor extended by it. If, in future, any v2 output is
persisted (see `07-database-design.md`), the store would hold the engine's produced
values verbatim — it would record, not recompute — so parity would remain a
property of the unchanged core, not of v2.

---

## What is deliberately not claimed

- No performance/load claims — the engine is synchronous and in-memory; there is
  nothing to load-test yet.
- No end-to-end deployment tests — **nothing in this phase is deployed**, so there
  is no live surface to test end-to-end.
- No database tests — the proposed persistence is **un-applied**; there are no
tables to test against, and none will be created without explicit CEO approval.
</content>
