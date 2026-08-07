# @hl-bos/bti-venuewise — Venuewise through the BTI pipeline

Runs **Venuewise** through the BTI reasoning contract, adapted to a **startup**.
It is an assembly on top of `@hl-bos/bti-cycle`, not a new engine: the
**confidence state machine**, the quality tiers, the health flags, the
evidence-effect classes and the **four permitted outputs** are reused directly.
What changes is the value chain.

## The startup value chain

```
Problem → Customer → Solution → Product → Activation → Value Delivery →
Retention → Revenue → Acquisition → Sales → Fulfillment → Scale → Margin
```

`runStartupCycle(engagement)` classifies each link (strength / gap / unknown)
from source-labeled evidence, finds the binding constraint (or refuses to), and
emits exactly one of:

- `RECOMMEND_TRANSFORMATION`
- `REVISE_GOAL`
- `COLLECT_MORE_EVIDENCE`
- `NO_TRANSFORMATION_NOW`

…never manufacturing a recommendation, and never confusing a **functioning
product** with a **functioning business**.

## The Venuewise result (deterministic, from the real harvest)

On the real Venuewise evidence (`src/venuewise.ts`, sourced from the read-only
`docs/products/venuewise-*harvest`), the pipeline returns **COLLECT_MORE_EVIDENCE**:

- **Product / Solution / Problem are strengths** — a technically mature, live
  product exists. Building more product is **explicitly rejected** (the startup
  analog of refusing SEO to a business that is already visible).
- **The commercial chain is unproven** — `subscriptions = 1`, `leads = 0`,
  forms `0`; the binding commercial link cannot be confirmed from row counts.
- **Provisional lead:** _Package Venuewise into one focused commercial offer_ —
  its precondition (a working product exists to sell) is verified; the specific
  binding link depends on answers only the CEO holds.
- **Evidence appetite** = the load-bearing CEO questions (first offer, first
  paying customer, price accepted/rejected, deployability without engineering).
- **Measurement contract** with an honest baseline (`subscriptions = 1`).

## Truth Mode

Near-zero commercial numbers are recorded as real data but left **untagged** —
absence of revenue is a _symptom_ of the goal gap, not proof of _which_
constraint binds. Tagging them a gap would let the engine "recommend" a revenue
fix without investigating go-to-market — exactly what this analysis refuses.

## Run it

```
pnpm --filter @hl-bos/bti-venuewise test      # 15 tests (the 16 requirements)
pnpm --filter @hl-bos/bti-venuewise report    # prints the Business Transformation Report
```
