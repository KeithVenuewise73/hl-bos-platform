# HL-BTI v2 — The Configurable Scoring Engine

## In plain language

The way a business's score is calculated has not changed in v2. The arithmetic — average the ratings, weight them, scale to 0–100, and honestly return "no score" where nothing was rated — is **reused unchanged** from `@hl-bos/bti-engine`. What v2 adds is a single, well-defined **dial**: the weights that decide how much each of the six domains counts toward the one headline _transformation_ number. Those weights live in configuration as plain data. Turn the dial and the headline number moves; the underlying per-dimension math never changes, and it never lies. There is **no industry hard-coded anywhere** in this engine — a different emphasis is a different config, not different code.

Sources: [`config.ts`](../../../packages/transformation-intelligence/src/config.ts), [`pipeline.ts`](../../../packages/transformation-intelligence/src/pipeline.ts), and the reused [`bti-engine/src/scoring.ts`](../../../packages/bti-engine/src/scoring.ts)

---

## What is reused vs what is new

|                                   |                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reused** (`@hl-bos/bti-engine`) | `computeScorecard` — all scoring arithmetic: weighted mean of 0–5 ratings scaled to 100, per-domain roll-up, the weighted transformation roll-up, and the honesty rule (null when unrated). The canonical dimension weights from `DOMAINS`. |
| **New** (this package)            | `EngineConfig` / `DEFAULT_CONFIG` / `resolveConfig` — the configurable surface. The pipeline's `toDomainWeights` / `toDimensionRatings` adapters that feed config into the reused scorer.                                                   |

---

## The math is reused, and it is honest

The actual scoring lives in `bti-engine`'s `computeScorecard`. v2 does not reimplement it — it calls it. Two properties matter and both come from the reused code, not from v2:

**1. Weighted mean, scaled to 100.** A domain's score is the weight-weighted average of its dimension ratings (each 0–5), divided by 5, times 100, rounded:

```ts
// bti-engine/src/scoring.ts
function domainScore(ratings: DimensionRating[]): number | null {
  if (ratings.length === 0) return null;
  let num = 0,
    den = 0;
  for (const r of ratings) {
    num += r.rating * r.weight;
    den += r.weight;
  }
  if (den === 0) return null;
  return pgRound((num / den / 5) * 100);
}
```

The transformation number is the same shape one level up: a weighted mean of the **domain** scores, using the per-domain transformation weights.

**2. Null when unrated — never a fabricated number.** A domain with no ratings returns `null`, not `0` and not a guess. The header comment of the reused file states the contract outright: _"a domain with NO ratings yields null — never a fabricated number."_ This is Principle 10 enforced in the arithmetic itself, and v2 inherits it for free by reusing the scorer. `ExecutiveScorecard` types every domain field and `transformation` as `number | null` to make the honest absence representable.

Because the same file is the "canonical mirror of the DB authority `bti.compute_scores`," the same inputs yield the same numbers in the database, the edge layer, and this package.

---

## `EngineConfig.scoring` — the configurable surface

Everything the engine could otherwise be tempted to hard-code lives in `EngineConfig` as data. The scoring section:

```ts
export interface ScoringConfig {
  /** Per-domain transformation weights. Overrides the engine's DOMAIN_WEIGHTS. */
  domainWeights: Partial<Record<DomainKey, number>>;
  /** Rating (0-5) at or below which a dimension becomes a finding. */
  findingThreshold: number;
  /** Domain score (0-100) at or above which a domain is a strength. */
  strengthThreshold: number;
  /** Domain score (0-100) below which a domain is a weakness. */
  weaknessThreshold: number;
}
```

| Field               | Meaning                                                                     | Default                                                                               |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `domainWeights`     | How much each of the six domains counts toward the transformation headline. | `business: 9, operations: 8, growth: 8, technology: 7, ai_readiness: 7, financial: 8` |
| `findingThreshold`  | A dimension rated at or below this becomes a finding (4–5 are strengths).   | `3`                                                                                   |
| `strengthThreshold` | Domain score at or above this reads as a strength.                          | `70`                                                                                  |
| `weaknessThreshold` | Domain score below this reads as a weakness.                                | `55`                                                                                  |

The `domainWeights` defaults are **not invented for v2**: they mirror the `transformationWeight` values already declared on each domain in the engine's `DOMAINS` catalog. The `findingThreshold` of `3` matches the engine's existing `FINDING_THRESHOLD`. The defaults are chosen so **v2 does not silently change v1's behaviour** — run with no overrides and you get exactly what the engine produced before.

---

## `DEFAULT_CONFIG` — matches existing engine behaviour

`DEFAULT_CONFIG` (versioned `ENGINE_VERSION = "bti-transformation-0.1.0"`) carries the values above plus the impact, approval and government sections documented elsewhere. The design intent, stated in the file, is explicit: _"The defaults deliberately match the numbers the existing bti-engine already uses … so v2 does not silently change v1's behaviour."_

---

## `resolveConfig` — partial override with nested merge

A caller may override any field and leave the rest to the defaults:

```ts
export interface EngineConfigOverrides {
  version?: string;
  scoring?: Partial<ScoringConfig>;
  impact?: Partial<ImpactConfig>;
  approval?: Partial<ApprovalConfig>;
  government?: Partial<GovernmentConfig>;
}

export function resolveConfig(overrides?: EngineConfigOverrides): EngineConfig;
```

Two semantics matter:

- **Scalar fields** (`findingThreshold`, `strengthThreshold`, …) use `override ?? default`.
- **Nested record/object fields** (`domainWeights`, `revenueUpliftByPriority`, `roiBands`, `winProbabilityBands`) are **spread-merged field-by-field** — `{ ...defaults, ...override }` — so a partial override does **not** erase the defaults it did not mention. Overriding only `growth` leaves the other five domain weights intact.
- `resolveConfig` is **non-mutating**: it always returns a fresh object and never writes back into `DEFAULT_CONFIG`. (The config tests confirm both: overriding `growth` to `12` keeps `business` at `9`, and `DEFAULT_CONFIG.scoring.domainWeights.growth` is still `8` afterward.)

---

## The configurable surface in practice: `toDomainWeights`

The dial the executive can actually turn is the **transformation weighting**, and the pipeline is where config meets the reused scorer. The pipeline builds two inputs and hands them to `computeScorecard`:

```ts
// pipeline.ts
const analysis = computeScorecard(
  toDimensionRatings(input.ratings), // dimension weights: straight from DOMAINS
  toDomainWeights(config.scoring.domainWeights), // domain weights: from CONFIG — the dial
);
```

- `toDimensionRatings` attaches each rating's canonical weight, read directly from the engine catalog (`DIMENSION_WEIGHT`, defaulting to `5` if absent). These are **not** configurable — the per-dimension math stays fixed and honest.
- `toDomainWeights` turns the config's `domainWeights` record into the `DomainWeight[]` the scorer expects. **This is the configurable scoring surface.** Change these numbers and only the transformation roll-up changes; every domain score underneath is untouched.

---

## Proof: reweighting to growth-only makes transformation equal the growth score

This is verified by `pipeline.test.ts`. Reweight so that only `growth` counts:

```ts
const growthOnly = runTransformationIntelligence(SAMPLE, {
  scoring: {
    domainWeights: {
      business: 0,
      operations: 0,
      growth: 1,
      technology: 0,
      ai_readiness: 0,
      financial: 0,
    },
  },
});
expect(growthOnly.analysis.transformation).toBe(result.analysis.growth);
```

With every other domain weighted `0`, the weighted mean of domain scores collapses to the single growth score — so the transformation headline **equals the growth domain score exactly**. The test passes, which demonstrates the dial is real: the weighting genuinely drives the transformation number, and it is driven entirely from config passed at call time, with no code change.

---

## No industry hard-coding

There is **no industry name anywhere in the scoring engine**. A different industry never means a different branch; at most it means a different `domainWeights` override (a new weighting is _config, not code_), and the engine's own comment makes the boundary explicit: industry is _"a row upstream, never a change here."_ Industry emphasis is handled by the data-driven industry templates in `@hl-bos/bti-engine`, not by any conditional in this package.

---

## Reused vs new

- **Reused:** all scoring arithmetic (`computeScorecard`), the null-when-unrated honesty rule, and the canonical dimension weights from `DOMAINS`.
- **New:** the configuration layer (`EngineConfig`, `DEFAULT_CONFIG`, `resolveConfig`) and the pipeline adapters (`toDimensionRatings`, `toDomainWeights`) that feed it in. The only thing v2 makes tunable is the transformation weighting — proven, by test, to move the headline number and nothing else.
