# 06 — Government Contracts Intelligence (`government.ts`)

## Plain summary

Government solicitations list capabilities a bidder must have. This file takes
one opportunity, checks the required capabilities against **the capabilities
Herman Legacy actually has registered** (pulled live from the Enterprise
Catalog — not a hand-typed list), and works through a chain: how well we match →
what's missing → a rough profit figure _only if a contract value was supplied_ →
what to do next → a bid/no-bid recommendation. Every step is honest: if the
solicitation lists no capabilities, win probability is `null`, not a made-up
percentage; if no contract value is given, profit is `null`; and the final
pursue/decline call is only a _recommendation_ — it always attaches the CEO
spend approval, because deciding to bid is the CEO's call, not the engine's.

Like the rest of HL-BTI v2, this reuses `@hl-bos/catalog` rather than inventing
its own notion of what the company can do.

---

## Our real capabilities — `ourCapabilities()`

Capability fit is judged against the catalog, not against assertion:

```ts
import { buildCatalog, assetsByKind } from "@hl-bos/catalog";

export function ourCapabilities(): OurCapability[] {
  const catalog = buildCatalog();
  return assetsByKind(catalog, "business_capability").map((a) => ({
    key: a.id.replace(/^cap\./, ""),
    name: a.name,
  }));
}
```

`OurCapability` is `{ key: string; name: string }`. The list is whatever
`business_capability` assets are registered in the Enterprise Catalog — so gaps
are computed against reality and shrink automatically as real capabilities are
added upstream.

---

## `GovOpportunity`

```ts
export interface GovOpportunity {
  id: string;
  title: string;
  agency?: string;
  naics?: string;
  /** Contract value if known; null/undefined => profit cannot be estimated. */
  value?: number | null;
  /** Optional per-opportunity margin override (fraction). */
  marginFraction?: number;
  dueInDays?: number;
  /** Capabilities the solicitation requires (keys or human names). */
  requiredCapabilities: string[];
}
```

`value` and `marginFraction` are the two evidence hooks; `requiredCapabilities`
is what drives the whole match.

---

## `assessGovOpportunity(opp, config, capabilities = ourCapabilities())`

Pure and deterministic. It returns a `GovAssessment`:

```ts
export interface GovAssessment {
  opportunity: GovOpportunity;
  winProbability: { band: WinBand | null; score: number | null; basis: string };
  capabilityGaps: CapabilityGap[];
  haveCount: number;
  gapCount: number;
  estimatedProfit: GovProfit;
  recommendedActions: string[];
  ceoRecommendation: {
    verdict: GovVerdict;
    reason: string;
    approval: ApprovalRequirement;
  };
}
```

### Step 1 — capability gaps (against real capabilities)

```ts
const gaps: CapabilityGap[] = opp.requiredCapabilities.map((req) => {
  const matchedTo = matchCapability(req, capabilities);
  return { capability: req, have: matchedTo !== null, matchedTo };
});
const haveCount = gaps.filter((g) => g.have).length;
const gapCount = gaps.length - haveCount;
```

`CapabilityGap` is `{ capability: string; have: boolean; matchedTo: string | null }`.
`matchCapability` matches a required string against our registered capabilities
in two passes — first an exact key/name match, then a substring match in either
direction — returning the matched capability _name_ or `null`.

### Step 2 — win probability (a match ratio, never fabricated)

```ts
const ratio = gaps.length === 0 ? null : haveCount / gaps.length;
const bands = config.government.winProbabilityBands;
const band: WinBand | null =
  ratio === null
    ? null
    : ratio >= bands.high
      ? "high"
      : ratio >= bands.medium
        ? "medium"
        : "low";
const winProbability = {
  band,
  score: ratio === null ? null : Math.round(ratio * 100),
  basis:
    ratio === null
      ? "No required capabilities supplied — win probability cannot be estimated."
      : `${haveCount}/${gaps.length} required capabilities already registered.`,
};
```

Win probability is the **capability-match ratio** `have / required`, expressed as
`score` (0–100) and a `band`. If the solicitation supplied **no** required
capabilities, there is nothing to match: `ratio`, `band` and `score` are all
`null` and the basis says so. No percentage is invented.

Configurable bands (`config.government.winProbabilityBands`, defaults):

| Band     | Ratio threshold |
| -------- | --------------- |
| `high`   | `≥ 0.75`        |
| `medium` | `≥ 0.50`        |
| `low`    | below `0.50`    |

### Step 3 — estimated profit (evidence-gated, illustrative)

```ts
const margin = opp.marginFraction ?? config.government.assumedMarginFraction;
const value = opp.value ?? null;
const estimatedProfit: GovProfit =
  value === null
    ? {
        contractValue: null,
        marginFraction: margin,
        estimatedProfit: null,
        illustrative: false,
        basis: "Requires a supplied contract value.",
        note: "Additional financial information required — profit withheld.",
      }
    : {
        contractValue: value,
        marginFraction: margin,
        estimatedProfit: Math.round(value * margin),
        illustrative: true,
        basis: `${Math.round(margin * 100)}% assumed gross margin on ${value} contract value.`,
        note: "Illustrative; actual margin depends on the priced bid.",
      };
```

`GovProfit` fields: `contractValue`, `marginFraction`, `estimatedProfit`,
`illustrative`, `basis`, `note`. If no `value` is supplied, profit is **`null`**
and flagged withheld — a contract value is never invented. When supplied, profit
is `value × margin` (rounded), always flagged `illustrative: true`. The margin is
`config.government.assumedMarginFraction` (default **`0.15`**, i.e. 15%), overridable
per-opportunity via `opp.marginFraction`.

### Step 4 — recommended actions (`buildActions`)

Deterministic, built from the gaps and the deadline:

- If there are required capabilities and **none** are missing:
  `"All required capabilities are registered — prepare the capability statement and bid."`
- For each missing capability:
  `Close the "{cap}" gap: build via the Software Factory, or partner/subcontract for it.`
  — note this points the gap straight back at the HLVS Software Factory as one
  way to close it.
- If `dueInDays !== undefined && dueInDays <= 14`:
  `Deadline in {n} days — decide bid/no-bid immediately.`
- Always:
  `"Confirm past-performance and compliance (registrations, certifications) before committing."`

### Step 5 — CEO recommendation (recommends; never decides)

```ts
export type GovVerdict =
  "pursue" | "pursue_with_partner" | "decline" | "insufficient_data";
```

`decide(band, ratio, gapCount, value)` first constructs the required approval —
**attached to every verdict**:

```ts
const approval: ApprovalRequirement = {
  required: true,
  type: "ceo_spend",
  reason:
    "Pursuing a bid commits proposal resources and, if won, delivery spend — a CEO bid/no-bid decision.",
  gate: "workflows.human_approval_gate",
};
```

Verdict logic:

| Condition                                   | Verdict               |
| ------------------------------------------- | --------------------- |
| `band === null \|\| ratio === null`         | `insufficient_data`   |
| `band === "high"` and `gapCount === 0`      | `pursue`              |
| `band === "high"` or `"medium"` (with gaps) | `pursue_with_partner` |
| otherwise (low fit)                         | `decline`             |

The `reason` strings quote the real match percentage (`Math.round(ratio * 100)`);
the `pursue` reason appends `"; profit estimate available"` only when a value was
supplied. Whatever the verdict, `ceoRecommendation.approval` carries the
`ceo_spend` requirement enforced by `workflows.human_approval_gate` — the engine
advises, the CEO holds the bid/no-bid gate.

---

## Configurable bands recap

```ts
government: {
  winProbabilityBands: { high: 0.75, medium: 0.5 },
  assumedMarginFraction: 0.15,
}
```

Both are data in `DEFAULT_CONFIG` and overridable via `EngineConfigOverrides` —
no threshold or economic assumption is hard-coded into the logic.

---

## Reused vs new

| Reused (not rebuilt)                                                                                     | New in this file                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `buildCatalog`, `assetsByKind` from `@hl-bos/catalog` — the real registered `business_capability` assets | `GovOpportunity` / `GovAssessment` / `GovProfit` / `CapabilityGap` shapes |
| `ApprovalRequirement` type from `approval.ts` (the shared `ceo_spend` gate)                              | Capability-match win probability + two-pass `matchCapability`             |
| `EngineConfig` bands + margin (shared config contract)                                                   | Evidence-gated profit, action builder, and the CEO-verdict decision       |

The company's capabilities and the approval gate are reused wholesale; this file
adds only the government-specific assessment chain — and it keeps every honesty
rule: `null` where evidence is missing, illustrative flags on every derived
figure, no invented contract value, and a CEO approval attached to every
bid recommendation.
