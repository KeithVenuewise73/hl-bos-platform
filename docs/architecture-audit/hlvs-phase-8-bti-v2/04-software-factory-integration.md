# 04 — Software Factory Integration (`factory.ts` + `impact.ts` + `approval.ts`)

## Plain summary

When the transformation engine recommends that a customer needs a piece of
software, someone has to answer four questions honestly: _how much of it do we
already own, what's missing, how hard is the rest, and can we actually sell it
today?_ This layer answers those questions without guessing. It does not have
its own opinion about what is built — it asks the **real Software Factory**
(the `@hl-bos/catalog` package) to assemble the product from the modules that
are actually registered, and it reports back what the Factory **counted**. Two
companion modules do the same thing for money (`impact.ts`) and for authority
(`approval.ts`): every number is derived from a figure the caller supplied, and
every action carries the human approval that must sign it off. Nothing is
invented, and the AI approves nothing.

`@hl-bos/transformation-intelligence` is **HL-BTI v2**, a composition layer. It
reuses `@hl-bos/catalog` (the Software Factory / assembler) and
`@hl-bos/bti-engine`. This document covers the three files that turn a
recommendation into a Factory reuse picture, a business-impact estimate, and a
set of required approvals.

---

## Part A — `factory.ts`: the reuse picture

### What it drives, and what it refuses to compute

The file header states the contract directly:

> It computes nothing itself — it drives `assembleProduct` over the registered
> module registry and reports what is counted, never asserted.

It imports the real assembler and composition helpers from the catalog package:

```ts
import {
  compositionByKey,
  assembleProduct,
  sharedSpineOf,
  PRODUCT_COMPOSITIONS,
  type ProductComposition,
} from "@hl-bos/catalog";
```

`assembleProduct(c: ProductComposition): AssemblyResult` (in
`packages/catalog/src/factory.ts`) is the authority. It resolves a product's
`requiredModules` against `MODULE_REGISTRY`, and returns `requiredCount`,
`builtCount`, `sharedSpineCount`, `missingModules`, `assemblable`, and
`foundationReadinessPct`. Crucially, in the assembler:

```ts
foundationReadinessPct:
  c.requiredModules.length === 0
    ? 0
    : Math.round((builtCount / c.requiredModules.length) * 100),
```

and `assemblable = missingModules.length === 0 && unregisteredModules.length === 0`.
Both are **counted** from the registry — built modules over required modules —
never a hand-typed readiness figure.

### `FactoryReuse`

The shape this module returns:

```ts
export interface FactoryReuse {
  matchedProductKey: string | null;
  matchedProductName: string | null;
  /** Foundation readiness % from the assembler (share of required modules built). */
  reusePct: number | null;
  requiredCount: number | null;
  builtCount: number | null;
  sharedSpineCount: number | null;
  missingModules: string[];
  assemblable: boolean;
  buildEffort: BuildEffort;
  /** Honest commercial availability from the composition (pricing stays pending-CEO). */
  commercialAvailability:
    ProductComposition["commercial"]["commercialAvailability"] | null;
  note: string;
}
```

The load-bearing point: **`reusePct` is `foundationReadinessPct` passed straight
through from `assembleProduct`.** It is `builtCount / requiredCount` rounded to a
percent — a count, not a claim. When there is no matched product, `reusePct` is
`null` (see "unmatched" below); it is never back-filled with a plausible number.

`commercialAvailability` is likewise copied from the composition
(`comp.commercial.commercialAvailability`), which the catalog computes from real
readiness — one of `"not_yet" | "needs_assembly" | "ready_to_launch" |
"available"`. It is honest by construction and is **never asserted here**.
Pricing, licensing and ownership do not appear in `FactoryReuse` at all: in the
catalog every composition carries them as `{ status: "pending-ceo" }`, so they
remain a pending CEO decision and are out of this layer's reach.

### `SERVICE_TO_PRODUCT` — the data map

A recommendation names a Herman Legacy service in prose. To reach a Factory
composition, that name is matched case-insensitively against a substring table —
data, not branching, so "a new mapping is a row":

```ts
const SERVICE_TO_PRODUCT: Array<{ match: string; product: string }> = [
  { match: "reputation", product: "reputation_recovery" },
  { match: "review", product: "review_management" },
  { match: "visibility", product: "visibility_ai" },
  { match: "transformation", product: "hl_bti" },
  { match: "business transformation", product: "hl_bti" },
  { match: "bti", product: "hl_bti" },
  { match: "salon", product: "salon_ai" },
  { match: "reception", product: "reception_ai" },
  { match: "transportation", product: "transportation_ai" },
  { match: "homehuddle", product: "home_huddle" },
];
```

### `sharedSpineSize()`

The shared spine is the reuse dividend every vertical inherits. It is measured,
not declared — read from an actual composition via the catalog's `sharedSpineOf`:

```ts
export function sharedSpineSize(): number {
  const anchor = PRODUCT_COMPOSITIONS[0];
  return anchor ? sharedSpineOf(anchor).length : 0;
}
```

(The `COMMON_SPINE` in the catalog has 9 modules: `identity_core`, `tenancy`,
`audit`, `events_bus`, `entitlements`, `workflows`, `billing_core`, `storage`,
`communications`.)

### `factoryReuseForProductKey` and `BuildEffort` derivation

```ts
export type BuildEffort = "low" | "medium" | "high" | "new_build";
```

```ts
export function factoryReuseForProductKey(productKey: string): FactoryReuse {
  const comp = compositionByKey(productKey);
  if (!comp) return unmatchedReuse(`No registered composition for "${productKey}".`);
  const asm = assembleProduct(comp);
  const missing = asm.missingModules.length;
  const effort: BuildEffort = asm.assemblable ? "low" : missing <= 2 ? "medium" : "high";
  ...
}
```

Effort is a direct function of the assembler's own output:

| Condition (from `assembleProduct`)    | `buildEffort` |
| ------------------------------------- | ------------- |
| `assemblable === true`                | `low`         |
| not assemblable, `missingModules ≤ 2` | `medium`      |
| not assemblable, `missingModules > 2` | `high`        |
| no matched composition at all         | `new_build`   |

The `note` is generated from real counts — either
`"Assemblable now: {builtCount}/{requiredCount} modules built ({sharedSpineCount} from the shared spine)."`
or `"{missing} module(s) missing: {missingModules.join(", ")}."`.

### `factoryReuseForService` — the entry point recommendations use

```ts
export function factoryReuseForService(service: string): FactoryReuse {
  const hay = service.toLowerCase();
  const hit = SERVICE_TO_PRODUCT.find((r) => hay.includes(r.match));
  if (!hit) {
    return unmatchedReuse(
      `"${service}" maps to no single product; ${sharedSpineSize()} shared-spine modules remain reusable for a net-new build.`,
    );
  }
  return factoryReuseForProductKey(hit.product);
}
```

`recommendations.ts` calls exactly this (`factoryReuseForService(primaryService)`)
and stores the result on `reusableProduct.factory`.

### The honest "no match" branch

```ts
function unmatchedReuse(note: string): FactoryReuse {
  return {
    matchedProductKey: null,
    matchedProductName: null,
    reusePct: null, // never invented
    requiredCount: null,
    builtCount: null,
    sharedSpineCount: sharedSpineSize(),
    missingModules: [],
    assemblable: false,
    buildEffort: "new_build",
    commercialAvailability: null,
    note,
  };
}
```

When a service maps to no product, everything the Factory can't count is `null`,
`buildEffort` is `new_build`, and `commercialAvailability` is `null` — but the
shared-spine count is still reported, because that reuse is real for a net-new
build.

---

## Part B — `impact.ts`: evidence-gated business impact

### The honesty rule, stated in the file

The header binds this module to Principle 10: if the caller did not supply the
required financial figure, the value is `null` and the note says what is
missing; any value it _does_ compute is a supplied figure times a transparent
assumption, flagged `illustrative: true`; and **payback is always `null`
because Herman Legacy pricing is a pending CEO decision.**

### `FinancialInput` and `ImpactEstimate`

```ts
export interface FinancialInput {
  monthlyRevenue?: number;
  monthlyOperatingCost?: number;
  laborHoursPerMonth?: number;
  laborCostPerHour?: number;
}

export interface ImpactEstimate {
  label: string;
  monthlyValue: number | null; // null => insufficient input
  annualValue: number | null;
  roiBand: RoiBand | null; // "high" | "medium" | "low" | null
  paybackMonths: number | null; // ALWAYS null — pricing pending
  illustrative: boolean;
  basis: string; // exactly how it was derived, or why it is null
  note: string;
}
```

### `automationSavings` — needs measured labour

Requires **both** `laborHoursPerMonth` and `laborCostPerHour`. Missing either →
a fully gated estimate (`monthlyValue: null`, `illustrative: false`, note
`"Additional financial information required — value withheld."`). Otherwise:

```ts
const monthly = round(hours * config.impact.automatableHoursFraction * rate);
```

`automatableHoursFraction` defaults to `0.2` (20%) and is configurable. Worked
example from the brief: **200 hours × 0.20 × $30/hr = $1,200/month**
(`annualValue` = `monthly * 12`). `basis` restates the arithmetic
(`"20% of 200 measured labour hours/month × 30 per hour."`) and `paybackMonths`
stays `null` with note `"Payback withheld: Herman Legacy pricing is a pending
CEO decision."`.

### `revenueUplift` — needs supplied revenue

Requires a supplied `monthlyRevenue`; absent it, the estimate is gated (`null`,
"we do not invent revenue"). Otherwise `monthly = round(revenue * fraction)`,
where `fraction = config.impact.revenueUpliftByPriority[priority]`
(defaults: `critical 0.06`, `high 0.04`, `medium 0.02`, `low 0.01`). Again
`illustrative: true`, `paybackMonths: null`.

`roiBand` (both functions) comes from `roiBandFor`, which returns `null` unless
a positive `monthlyRevenue` is present, then bands `monthlyValue / monthlyRevenue`
against `config.impact.roiBands` (defaults `high 0.03`, `medium 0.01`).

### `estimateFindingImpact` — the per-finding router

```ts
const EFFICIENCY_DOMAINS = new Set<DomainKey>([
  "operations",
  "technology",
  "ai_readiness",
]);

export function estimateFindingImpact(domain, priority, fin, config): ImpactEstimate {
  return EFFICIENCY_DOMAINS.has(domain)
    ? automationSavings(fin, config)
    : revenueUplift(priority, fin, config);
}
```

Efficiency-domain findings are scored as automation savings; every other domain
as revenue uplift. Either way the value is `null` unless its required figure was
supplied.

### `portfolioImpact` — gated items are counted, not guessed

```ts
export function portfolioImpact(estimates: ImpactEstimate[]): PortfolioImpact {
  const withValue = estimates.filter((e) => e.monthlyValue !== null);
  const gated = estimates.length - withValue.length;
  const totalMonthly = withValue.length
    ? withValue.reduce((s, e) => s + (e.monthlyValue ?? 0), 0)
    : null;
  ...
}
```

`PortfolioImpact` reports `totalMonthlyValue` / `totalAnnualValue` (both `null`
if nothing had a value), `estimatesWithValue`, `estimatesGated`, and
`incomplete: gated > 0`. Gated estimates are **excluded** from the totals and
**counted** in `estimatesGated`, and the note says so:
`"{gated} estimate(s) withheld for missing financial inputs; totals reflect only
the {withValue.length} with supplied figures."`. An honest partial total, never
a flattering full one.

---

## Part C — `approval.ts`: "AI approves nothing"

The engine is advisory. For every actionable recommendation it emits the human
approval(s) required to act — deterministically, each naming the gate that
enforces it (`workflows.human_approval_gate`), never the AI.

### `ApprovalType`

```ts
export type ApprovalType =
  | "none"
  | "ceo_commercial_terms"
  | "ceo_deploy"
  | "ceo_migration"
  | "ceo_spend"
  | "ceo_data_access";
```

### `approvalsForRecommendation(reuse: FactoryReuse)`

Always emits two, and conditionally a third:

| Approval               | When                                      | Reason (abridged)                                                                   |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `ceo_commercial_terms` | always                                    | Pricing/licensing/ownership are pending CEO decisions                               |
| `ceo_deploy`           | always                                    | Delivery requires switching on / deploying runtime (CEO/ops)                        |
| `ceo_migration`        | `buildEffort === "high" \|\| "new_build"` | Heavy/net-new build likely introduces new schema; no migration without CEO approval |

The migration gate keys directly off the `buildEffort` computed in `factory.ts`,
so the heaviest builds automatically pull in the migration-approval requirement.

### `spendApproval(monthlyValue, config)`

Returns a single `ApprovalRequirement`. If `monthlyValue === null`, spend is
still `required: true` but flagged unquantified (financial inputs missing).
Otherwise it is required only when `monthlyValue >= config.approval.ceoSpendThreshold`
(default `1`); below that, `type: "none"`, `required: false`.

### `dedupeApprovals(items)`

De-duplicates by `ApprovalType`, keeping the first occurrence, and drops any
entry that is not required or is `type: "none"`:

```ts
for (const a of items) {
  if (!a.required || a.type === "none") continue;
  if (seen.has(a.type)) continue;
  seen.add(a.type);
  out.push(a);
}
```

`recommendations.ts` uses exactly `dedupeApprovals(approvalsForRecommendation(factory))`.

---

## Reused vs new

| Reused (not rebuilt)                                                                                                           | New in this file set                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `assembleProduct`, `compositionByKey`, `sharedSpineOf`, `PRODUCT_COMPOSITIONS`, `MODULE_REGISTRY` — all from `@hl-bos/catalog` | `FactoryReuse` shape + `BuildEffort` derivation adapting the assembler's counts      |
| `foundationReadinessPct`, `assemblable`, `commercialAvailability` — computed upstream in the catalog                           | `SERVICE_TO_PRODUCT` data map from HL service name → composition key                 |
| `DomainKey`, `Priority` from `@hl-bos/bti-engine`; `EngineConfig` defaults matching v1                                         | Evidence-gated `ImpactEstimate` + `portfolioImpact`; deterministic approval emission |

Nothing here re-implements the Factory. `factory.ts` _drives_ it and reshapes
its counts; `impact.ts` and `approval.ts` add the money and authority layers the
consulting engine did not have — under a strict rule that missing inputs stay
`null`, prices stay pending-CEO, and no control asserts an authority it does not
hold.
