# @hl-bos/bti-cycle — BTI V1, one transformation cycle

This package is the first implementation of the approved **BTI constitution**
(Methodology + Reasoning Framework + Learning Loop). It builds exactly **one
vertical slice**:

```
Customer Goal → Business Discovery → Evidence → Analysis → Constraint
→ Opportunity → Transformation Design → Measurement Contract
```

It is the **reasoning spine** and nothing more. There is no persistence, no
execution, and no UI here — those are later, separately-approved slices. Every
type and function maps to a step of the methodology or a field of the Reasoning
Ledger; there is no generic framework.

## What it does

`runCycle(engagement)` takes a `CustomerGoal` and a set of `EvidenceItem`s and
returns a **Reasoning Ledger** — the mandatory, complete explanation of a BTI
recommendation. The engine is **deterministic**: the same engagement always
produces the same ledger. Judgement lives only at the edges (the evidence and
its confidence tiers).

The engine emits exactly one of the **four permitted outputs** and will never
manufacture a recommendation to avoid the honest ones:

- `recommendation` — a confirmed binding constraint, a sized option above the
  decision bar, with a measurement contract.
- `revise_goal` — the goal exceeds a verified capacity ceiling.
- `collect_more_evidence` — the binding constraint cannot be confirmed; a
  provisional lead (a verified-precondition option) is attached, with the exact
  facts needed to go further.
- `no_transformation` — nothing clears the bar.

## The parts

| Module          | Constitution concept                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`      | The domain model — goal, evidence, value chain, ledger, measurement contract                                                                 |
| `confidence.ts` | The **Confidence State Machine** — quality axis + health flags, capped by the weakest load-bearing input                                     |
| `valuechain.ts` | The value chain and its analysis; the outcome library (never products)                                                                       |
| `reasoning.ts`  | Constraint identification, option scoring (the value function), the four outputs, stability, the evidence appetite, the measurement contract |
| `render.ts`     | A plain-language Executive Review artifact — a faithful projection of the ledger, nothing more                                               |
| `saffer.ts`     | The **real** Saffer engagement seed (public facts at true tiers, internal facts Unknown)                                                     |

## Truth Mode

The engine caps its own confidence, refuses to score what it cannot size,
prioritises the evidence most likely to prove it **wrong**, and — on the real
Saffer seed — reaches the same honest "collect more evidence" conclusion a human
consultant did. `src/saffer.test.ts` is that proof.

## Run it

```
pnpm --filter @hl-bos/bti-cycle test        # 23 tests, incl. the Saffer proof
pnpm --filter @hl-bos/bti-cycle typecheck
```
