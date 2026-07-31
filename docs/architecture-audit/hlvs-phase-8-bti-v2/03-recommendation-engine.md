# HL-BTI v2 — The Recommendation Engine

## In plain language

The hard part of consulting — spotting the problem, naming the likely cause, ranking it by urgency, and prescribing the fix — is already done by the reused consulting engine in `@hl-bos/bti-engine`. The Recommendation Engine does **not** redo any of that. It takes each finding the consulting engine already produced and **enriches** it into an executive recommendation that answers the five questions a CEO actually asks: _what happened, why, what do we do, what is it worth, and what do you need me to approve._ It adds the money view (honestly — a blank where a real number is missing), the "how much of this can we reuse from what we've already built" view, and the exact human approvals required to act. It decides nothing on its own and it invents no numbers.

Sources: [`recommendations.ts`](../../../packages/transformation-intelligence/src/recommendations.ts), reusing [`bti-engine/src/consulting/types.ts`](../../../packages/bti-engine/src/consulting/types.ts) and [`findings.ts`](../../../packages/bti-engine/src/consulting/findings.ts)

---

## What is reused vs what is new

|                                              |                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reused** (`@hl-bos/bti-engine` consulting) | The entire `Finding` — the 12-part Problem → Supporting Evidence → Business Impact → **Root Cause** → Risk → Opportunity → **Priority** → **Recommended Action** → Difficulty → Timeline → Success Metrics → **HL Services**, plus the FACT / INFERENCE / OPINION `Claim` breakdown. All findings, and their deterministic priority ordering. |
| **New** (this package)                       | `TransformationRecommendation`, `toRecommendation`, `buildRecommendations`. The evidence-gated money estimate, the Software Factory reuse picture, the deterministic approval set, and the mapping back to one of the 15 assessment areas.                                                                                                    |

The engine **does not re-derive findings.** It is an enrichment pass over findings that already exist.

---

## The reused Finding already carries the consulting chain

The consulting engine's `Finding` (from `consulting/types.ts`) is explicitly the "12-part consulting workflow the PCO mandates for every finding," and it is generated deterministically in `findings.ts` — every finding traces to a verified 0–5 rating, with root cause and business impact tagged **INFERENCE**, the recommended action tagged **OPINION**, and the rating/evidence tagged **FACT**. The recommendation engine consumes these fields directly:

| Reused `Finding` field                     | Meaning                                                 | Claim class              |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------ |
| `finding`                                  | What happened (the problem statement)                   | derived from FACT rating |
| `rootCause`                                | The likely why                                          | **INFERENCE**            |
| `priority`                                 | critical / high / medium / low                          | derived                  |
| `recommendedAction`                        | What to do                                              | **OPINION**              |
| `supportingEvidence`, `claims`             | The evidence trail and FACT/INFERENCE/OPINION breakdown | —                        |
| `services`                                 | Recommended Herman Legacy services                      | —                        |
| `difficulty`, `timeline`, `successMetrics` | Effort, horizon, what to measure                        | —                        |

Nothing above is recomputed by v2. It is passed through, re-labelled for an executive, and augmented.

---

## The five executive questions

`toRecommendation` maps a reused finding onto the five questions the brief mandates:

| #   | Executive question         | Recommendation field | Source                                          |
| --- | -------------------------- | -------------------- | ----------------------------------------------- |
| 1   | What happened?             | `problem`            | `finding.finding` (reused)                      |
| 2   | Why?                       | `rootCause`          | `finding.rootCause` (reused) — an **INFERENCE** |
| 3   | What should we do?         | `solution`           | `finding.recommendedAction` (reused)            |
| 4   | Estimated business impact  | `revenueImpact`      | **new**, evidence-gated                         |
| 5   | What approval is required? | `approvals`          | **new**, deterministic                          |

Questions 1–3 are answered by reused consulting output. Questions 4–5 are the new value this package adds — and both are built to be honest.

---

## The `TransformationRecommendation` shape

```ts
export interface TransformationRecommendation {
  id: string;
  /** The assessment area (of the 15) this maps to, if any. */
  area: string | null;
  domain: DomainKey;
  dimension: string;
  label: string;
  // --- the five executive questions ---
  problem: string;
  rootCause: string;
  priority: Priority;
  solution: string;
  revenueImpact: ImpactEstimate;
  approvals: ApprovalRequirement[];
  // --- reuse + provenance ---
  reusableProduct: { services: string[]; factory: FactoryReuse };
  roiBand: RoiBand | null;
  difficulty: string;
  timeline: string;
  successMetrics: string[];
  evidence: string[];
  claims: consulting.Claim[];
}
```

Every field is either a reused finding value or a new, honesty-constrained enrichment. Note `claims` and `evidence` are carried through verbatim, so a recommendation never loses the FACT/INFERENCE/OPINION provenance of the finding it came from.

---

## `toRecommendation` — the enrichment, step by step

```ts
export function toRecommendation(
  finding: consulting.Finding,
  financial: FinancialInput | undefined,
  config: EngineConfig,
): TransformationRecommendation;
```

1. **Pick the HL product/service.** The finding's first recommended service (`finding.services[0]`), falling back to `"Business Transformation Services"`.
2. **Resolve the Software Factory reuse picture.** `factoryReuseForService(primaryService)` drives the _real_ `@hl-bos/catalog` assembler to report how much of the product is already built (reuse %), which modules are missing, the build effort, and honest commercial availability. It counts; it does not assert.
3. **Estimate business impact — evidence-gated.** `estimateFindingImpact(finding.domain, finding.priority, financial, config)` returns an `ImpactEstimate` whose `monthlyValue` is `null` whenever the caller did not supply the figure it depends on. `paybackMonths` is **always `null`** because Herman Legacy pricing is a pending CEO decision — payback is never asserted against a price that does not exist.
4. **Compute required approvals — deterministic.** `dedupeApprovals(approvalsForRecommendation(factory))` yields the exact human approvals needed to act (commercial terms, deploy, and — for a heavy/new build — migration). The engine authorises nothing; it names the gates.
5. **Map back to an assessment area.** `areaFor(domain, dimension)` finds the first of the 15 `ASSESSMENT_AREAS` whose refs include this `(domain, dimension)`, or `null` if none. This ties every recommendation back to the executive view in doc 01.

The recommendation `id` is `${finding.domain}.${finding.dimension}` — stable and canonical.

---

## `buildRecommendations` — all findings, order preserved

```ts
export function buildRecommendations(
  findings: consulting.Finding[],
  financial: FinancialInput | undefined,
  config: EngineConfig,
): TransformationRecommendation[];
```

A straight `findings.map(...)` over `toRecommendation`. Because it does not sort, it **preserves the consulting engine's deterministic priority ordering** (worst priority first, then domain weight, then label) exactly as `findings.ts` produced it. Enrichment never reshuffles the consultant's ranking.

---

## Every recommendation carries the reuse picture

`reusableProduct` bundles the finding's HL `services` with a `FactoryReuse` object from the real Software Factory assembler. That object answers "how much of this already exists?" — `reusePct`, `builtCount`/`requiredCount`, `sharedSpineCount`, `missingModules`, `buildEffort`, and honest `commercialAvailability`. This is the reuse-before-rebuild principle made visible per recommendation: the CEO sees not just "we should do X" but "X is 80% already built from modules we own, here is the 2 that are missing." When a service maps to no single product, the reuse picture honestly reports the shared-spine modules still reusable for a net-new build rather than pretending a match.

---

## Honesty guarantees (Principle 10)

- **No invented money.** `revenueImpact.monthlyValue` / `annualValue` / `roiBand` are `null` when the required financial input was not supplied; the estimate states in `basis`/`note` exactly what is missing.
- **No asserted payback.** `paybackMonths` is `null` by construction — pricing is a pending CEO decision.
- **No self-authorisation.** `approvals` are advisory requirements naming the human gate (`workflows.human_approval_gate`); the engine advises, humans act.
- **Provenance preserved.** `claims` and `evidence` from the reused finding travel with the recommendation, so its FACT/INFERENCE/OPINION basis is auditable.

---

## Reused vs new

- **Reused:** the full `consulting.Finding` (problem, root-cause inference, priority, recommended action, evidence, claims, services) and the consulting engine's deterministic ordering — all of the analytical judgement.
- **New:** the `TransformationRecommendation` enrichment — evidence-gated money (`revenueImpact`, `roiBand`), the Software Factory reuse picture (`reusableProduct`), the deterministic approval set (`approvals`), and the tie-back to one of the 15 assessment areas (`area`). The engine composes and enriches; it does not re-derive, and it invents nothing.
