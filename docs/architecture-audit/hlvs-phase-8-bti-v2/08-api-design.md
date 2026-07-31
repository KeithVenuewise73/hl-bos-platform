# HL-BTI v2 — API Design

## In plain language

HL-BTI v2 has **one API that exists today** and **one API that is only proposed**.
The one that exists is a plain **TypeScript function call**: the Executive Portal
imports `@hl-bos/transformation-intelligence` and calls
`runTransformationIntelligence(...)` directly, in the browser, over a clearly
labelled **SAMPLE** assessment. No server, no database, no network round-trip.
The one that is proposed is a future **browser-reachable database surface** — a
thin set of `public.bti_*` SECURITY DEFINER RPC wrappers that would persist and
re-read real runs, mirroring the exact pattern already shipped in migration 0027.
**That second layer is NOT built in this phase.** This document describes both so
the boundary is unambiguous.

Sources:
[`packages/transformation-intelligence/src/index.ts`](../../../packages/transformation-intelligence/src/index.ts),
[`apps/hl-bti/src/lib/api.ts`](../../../apps/hl-bti/src/lib/api.ts),
[`apps/hl-bti/src/lib/supabase.ts`](../../../apps/hl-bti/src/lib/supabase.ts)

---

## Layer A — the in-process TypeScript API (exists TODAY)

This is the whole engine. It is pure, synchronous and deterministic. The
Executive Portal consumes it **directly** over a `sample: true` assessment;
nothing is persisted and nothing is sent anywhere.

### Public exports (`index.ts` re-exports every module)

The package's public surface is everything exported from these modules:

| Module            | Key public exports                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline`        | **`runTransformationIntelligence(input, overrides?)`** — the single entry point; `PIPELINE_STAGES`; types `TransformationIntelligenceResult`, `PipelineStage`, `MeasurementMetric`.           |
| `config`          | `DEFAULT_CONFIG`, `ENGINE_VERSION`, `resolveConfig(overrides?)`; types `EngineConfig`, `EngineConfigOverrides`, `ScoringConfig`, `ImpactConfig`, `ApprovalConfig`, `GovernmentConfig`.        |
| `framework`       | `ASSESSMENT_AREAS`, `validateFramework()`, `requiredDimensions()`; types `AssessmentArea`, `DimensionRef`, `FrameworkValidation`.                                                             |
| `impact`          | `automationSavings(...)`, `revenueUplift(...)`, `estimateFindingImpact(...)`, `portfolioImpact(...)`; types `FinancialInput`, `ImpactEstimate`, `RoiBand`, `PortfolioImpact`.                 |
| `factory`         | `factoryReuseForService(...)`, `factoryReuseForProductKey(...)`, `sharedSpineSize()`; types `FactoryReuse`, `BuildEffort`.                                                                    |
| `approval`        | `approvalsForRecommendation(...)`, `spendApproval(...)`, `dedupeApprovals(...)`; types `ApprovalRequirement`, `ApprovalType`.                                                                 |
| `recommendations` | `toRecommendation(...)`, `buildRecommendations(...)`; type `TransformationRecommendation`.                                                                                                    |
| `hlvs`            | `softwareOpportunities(...)`; types `SoftwareOpportunity`, `OpportunityVerdict`.                                                                                                              |
| `government`      | **`assessGovOpportunity(opp, config, capabilities?)`**, `ourCapabilities()`; types `GovOpportunity`, `GovAssessment`, `OurCapability`, `CapabilityGap`, `GovProfit`, `GovVerdict`, `WinBand`. |

### The primary call

```ts
import {
  runTransformationIntelligence,
  type TransformationIntelligenceResult,
  type EngineConfigOverrides,
} from "@hl-bos/transformation-intelligence";
import type { consulting } from "@hl-bos/bti-engine";

// A clearly-labelled SAMPLE — never a fabricated customer.
const sample: consulting.AssessmentInput = {
  businessName: "Sample Business (illustrative)",
  industryPack: "general",
  mode: "full_transformation",
  sample: true,
  ratings: [/* domain/dimension/rating triples */],
  financial: { monthlyRevenue: 50000, laborHoursPerMonth: 200, laborCostPerHour: 30 },
};

const result: TransformationIntelligenceResult = runTransformationIntelligence(
  sample /*, overrides? */,
);
```

### The result shape (`TransformationIntelligenceResult`)

One object answers, for every finding, the five executive questions plus reuse:

| Field                   | Contents                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`                  | `engineVersion`, `configVersion`, `stages`, `businessName`, `industryPack`, `mode`, **`sample`**, `dimensionsRated`, `findings`, `recommendations`. |
| `rawData`               | Stage 1 echo of the inputs, carrying the `sample` flag.                                                                                             |
| `analysis`              | Stage 2 `ExecutiveScorecard` — the configurable transformation score (reused engine math).                                                          |
| `insights`              | Stage 3 reused `consulting.Finding[]` (root causes, evidence, claims).                                                                              |
| `recommendations`       | Stage 4 `TransformationRecommendation[]` — problem / rootCause / solution / revenueImpact / approvals / reusable product.                           |
| `businessImpact`        | Stage 5 evidence-gated `PortfolioImpact` (null totals when inputs missing).                                                                         |
| `approvals`             | Stage 6 deduplicated `ApprovalRequirement[]`.                                                                                                       |
| `softwareOpportunities` | HLVS `SoftwareOpportunity[]` (deduped by product).                                                                                                  |
| `measurementPlan`       | Stage 8 distinct `MeasurementMetric[]` to track post-execution.                                                                                     |

### Configurability

`runTransformationIntelligence` takes an optional `EngineConfigOverrides`. Any
subset merges over `DEFAULT_CONFIG` field-by-field (`resolveConfig`), so changing a
domain weight moves the transformation score while leaving the honest per-dimension
math untouched. There are **no industry names in the code** — industry is a caller
string that only re-orders emphasis via existing data-driven packs.

### What Layer A does NOT do

- It **does not persist** anything — no DB, no file, no network.
- It **approves nothing** — it emits the required human approvals and names the
  gate (`workflows.human_approval_gate`); a human clears the gate.
- It **fabricates nothing** — missing inputs yield `null`, never a guessed number,
  and never a payback period (pricing is a pending CEO decision).

---

## Layer B — the browser-reachable RPC surface (PROPOSED — NOT built this phase)

> ## HARD STOP
>
> The RPCs below are a **design**. They are **not implemented**, **not deployed**,
> and depend on the **PROPOSED, un-applied** tables in `07-database-design.md`.
> **No migration is applied without explicit CEO approval. Do not deploy, do not
> migrate production, do not modify customer apps.**

When (and only when) the CEO approves v2 persistence, the browser would reach it
the same way the existing HL-BTI app reaches migration 0027 — never by touching
tables, only through thin `public.*` SECURITY DEFINER wrappers.

### The pattern we mirror (from `apps/hl-bti`)

The existing client is **RPC-only**. `supabase.ts` creates a single browser client
with **only the publishable (anon) key**; that key is explicitly _not_ a security
boundary — RLS and the permission-checked `public.bti_*` RPCs are. `api.ts` never
selects a table; every call is `getSupabase().rpc("bti_...", { ... })`, and each
RPC re-checks `identity.has_permission(tenant, ...)` internally. The v2 surface
would follow this to the letter.

### Proposed RPCs (illustrative signatures only)

> **PROPOSED — requires CEO approval; not applied; not in `supabase/migrations/`.**

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/

-- Persist a v2 run for a business (the produced result object, tenant-checked).
-- Delegates to a bti.* definer function that re-checks bti.transformation.manage.
create or replace function public.bti_run_transformation(
  p_business uuid,
  p_config   jsonb default '{}'::jsonb,   -- EngineConfigOverrides; server clamps/validates
  p_result   jsonb default '{}'::jsonb)   -- the TransformationIntelligenceResult to store
returns uuid language plpgsql volatile security definer set search_path = '' as $$ /* ... */ $$;

-- Read the latest saved v2 run for a business (null when none). Read-only.
create or replace function public.bti_latest_transformation(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$ /* ... */ $$;

-- Assess a government opportunity and persist the assessment (tenant-checked).
create or replace function public.bti_assess_gov_opportunity(
  p_tenant                uuid,
  p_title                 text,
  p_required_capabilities jsonb default '[]'::jsonb,
  p_contract_value        numeric default null,   -- null => profit withheld
  p_config                jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$ /* ... */ $$;
```

Naming and shape deliberately echo the shipped `public.bti_register_business`,
`public.bti_save_analysis`, `public.bti_latest_analysis`. Notice the naming
convention difference from Layer A: the **engine's** `runTransformationIntelligence`
computes; the **proposed RPC** `bti_run_transformation` would _persist_ an
already-computed result (or compute-then-persist server-side in a later variant).

### Non-negotiable properties of the proposed surface

1. **RPC-only, no direct table access.** The `bti` schema stays off PostgREST; only
   `public.*` wrappers are reachable.
2. **Publishable/anon key only** in the browser; the service-role key is never
   referenced client-side.
3. **Permission re-checked internally** in every function via
   `identity.has_permission(tenant, 'bti.transformation.*' | 'bti.government.*')`,
   **before** any row is read or written; `anon` is `REVOKE`d.
4. **AI approves nothing.** A persisted run records its required approvals; the
   `workflows` human-approval-gate remains the only thing that clears them.
5. **Honesty preserved end-to-end.** The server stores the engine's `null`s as
   `null`; it never back-fills a number, and it flags `sample` truthfully.

### Where the boundary sits

```
TODAY  ── Executive Portal ──(import)──▶ runTransformationIntelligence(SAMPLE)  ── pure, in-memory
PROPOSED ─ Executive Portal ──(rpc)────▶ public.bti_run_transformation(...)     ── needs approved tables
                                          public.bti_latest_transformation(...)
                                          public.bti_assess_gov_opportunity(...)
```

Layer A is live-capable code that runs today over a sample. Layer B is a paper
design that unlocks only after a CEO-approved migration. **Nothing in Layer B is
built, applied, or deployed in this phase.**
</content>
