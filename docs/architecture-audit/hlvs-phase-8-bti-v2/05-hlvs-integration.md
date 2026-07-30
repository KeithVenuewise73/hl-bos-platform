# 05 — HLVS Integration (`hlvs.ts`)

## Plain summary

A transformation assessment produces a list of recommendations, and several of
them often point at the _same_ piece of software — e.g. three different findings
that all really need VisibilityAI. This file rolls those recommendations up into
one clean list of **software opportunities**: one row per product the customer
needs, each carrying the Factory's reuse picture and a plain verdict —
_assemble it now, assemble it with a few gaps, reuse the shared spine, or build
greenfield._ It is the bridge from "this customer needs X" to "the Software
Factory can assemble or build X, reusing N% of what we already own," and it is
what connects HL-BTI to the HLVS Software Factory.

This module sits on top of `factory.ts` (see doc 04): it reads the
`FactoryReuse` already attached to each recommendation and never re-runs the
assembler itself.

---

## `OpportunityVerdict`

```ts
export type OpportunityVerdict =
  "assemble_now" | "assemble_with_gaps" | "greenfield_build" | "reuse_spine";
```

## `SoftwareOpportunity`

```ts
export interface SoftwareOpportunity {
  key: string;
  service: string;
  matchedProductKey: string | null;
  matchedProductName: string | null;
  reusePct: number | null;
  missingModules: string[];
  buildEffort: BuildEffort;
  commercialAvailability:
    ProductComposition["commercial"]["commercialAvailability"] | null;
  /** Recommendation ids that surfaced this opportunity. */
  fromRecommendations: string[];
  verdict: OpportunityVerdict;
  note: string;
}
```

Every field except `key`, `service`, `fromRecommendations` and `verdict` is
copied straight from the recommendation's `reusableProduct.factory`
(`FactoryReuse`). So `reusePct` remains the assembler's counted
`foundationReadinessPct` (or `null`), and `commercialAvailability` remains the
composition's honest value (or `null`) — this layer asserts neither.

---

## `softwareOpportunities(recs)` — roll-up and dedup

```ts
export function softwareOpportunities(
  recs: TransformationRecommendation[],
): SoftwareOpportunity[] {
  const byKey = new Map<string, SoftwareOpportunity>();

  for (const rec of recs) {
    const f = rec.reusableProduct.factory;
    const service = rec.reusableProduct.services[0] ?? "Business Transformation Services";
    const key = f.matchedProductKey ?? `service:${service.toLowerCase()}`;

    const existing = byKey.get(key);
    if (existing) {
      existing.fromRecommendations.push(rec.id);
      continue;
    }

    byKey.set(key, { key, service, matchedProductKey: f.matchedProductKey, ... });
  }
  ...
}
```

Dedup key logic:

- If the recommendation matched a product, the key is that
  **`matchedProductKey`** — so every finding that needs the same product
  collapses into one opportunity.
- If it matched nothing, the key is a synthetic **`service:{service}`** (lowercased),
  keeping unmatched net-new needs distinct by service name.

When a later recommendation resolves to a key already seen, it does **not**
create a new row — it only appends its `rec.id` to `fromRecommendations`,
preserving full provenance (which findings drove this opportunity) while keeping
one row per product.

Each recommendation id is `${finding.domain}.${finding.dimension}`
(from `recommendations.ts`), so `fromRecommendations` traces the opportunity
back to specific assessment findings.

---

## The verdict rule

```ts
function verdictFor(
  matched: boolean,
  assemblable: boolean,
  effort: BuildEffort,
): OpportunityVerdict {
  if (!matched) return effort === "new_build" ? "greenfield_build" : "reuse_spine";
  return assemblable ? "assemble_now" : "assemble_with_gaps";
}
```

Called as `verdictFor(f.matchedProductKey !== null, f.assemblable, f.buildEffort)`:

| Matched a product? | Assemblable? | `buildEffort`   | Verdict              |
| ------------------ | ------------ | --------------- | -------------------- |
| yes                | yes          | (`low`)         | `assemble_now`       |
| yes                | no           | `medium`/`high` | `assemble_with_gaps` |
| no                 | —            | `new_build`     | `greenfield_build`   |
| no                 | —            | not `new_build` | `reuse_spine`        |

The verdict is a pure re-expression of the Factory's already-counted facts
(`matchedProductKey`, `assemblable`, `buildEffort` from `assembleProduct`). It
adds no new judgement about readiness — it just labels it.

---

## Deterministic sort

```ts
const rank: Record<OpportunityVerdict, number> = {
  assemble_now: 0,
  assemble_with_gaps: 1,
  reuse_spine: 2,
  greenfield_build: 3,
};
return [...byKey.values()].sort((a, b) => {
  const r = rank[a.verdict] - rank[b.verdict];
  if (r !== 0) return r;
  const ra = a.reusePct ?? -1;
  const rb = b.reusePct ?? -1;
  if (rb !== ra) return rb - ra;
  return a.key.localeCompare(b.key);
});
```

Ordering, in priority:

1. **By verdict rank** — `assemble_now` first, then `assemble_with_gaps`, then
   `reuse_spine`, then `greenfield_build`. The cheapest-to-deliver opportunities
   surface at the top.
2. **By `reusePct` descending** — within a verdict, more already-built comes
   first. A `null` reusePct sorts as `-1` (last).
3. **By `key` ascending** (`localeCompare`) — a stable, total tiebreak.

Because every tie is resolved, the same set of recommendations always yields the
same ordered list — deterministic, reproducible output.

---

## Where this sits in the flow

```
consulting finding
   → toRecommendation()            (attaches reusableProduct.factory via factoryReuseForService)
      → softwareOpportunities()    (this file: roll up + dedup by product, verdict, sort)
         → HLVS Software Factory   (assemble_now / assemble_with_gaps → assembleProduct blueprint)
```

The recommendation layer answers "what does this customer need and why"; this
module answers "as software, what are we actually being asked to ship, and how
much of it do we already own" — the hand-off point into the Factory.

---

## Reused vs new

| Reused (not rebuilt)                                                                                                                           | New in this file                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `FactoryReuse` (incl. counted `reusePct`, `assemblable`, `buildEffort`, honest `commercialAvailability`) from `factory.ts` / `@hl-bos/catalog` | `SoftwareOpportunity` roll-up shape                                   |
| `TransformationRecommendation` from `recommendations.ts`                                                                                       | Dedup-by-matched-product logic + provenance via `fromRecommendations` |
| `ProductComposition` commercial typing from `@hl-bos/catalog`                                                                                  | `OpportunityVerdict` labelling + the deterministic sort               |

This module re-runs nothing and asserts nothing. It reshapes counts the Factory
already produced into a decision-ready, deduplicated, deterministically-ordered
opportunity list — the connective tissue between HL-BTI's recommendations and
the HLVS Software Factory's assembler.
