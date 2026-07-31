# ADR-XI-1 · The Canonical Capability Library

**Status:** Accepted (implemented on `claude/hlvs-architectural-assessment-ltqs1b`, not merged).
**Date:** 2026-07-30 · **Context:** Phase XI-1, authorized under the Phase X blueprint.

## Context

Six capability-like registries exist (see the reconnaissance report). "Reuse before rebuild" was a documentation guideline with no enforcement point. Downstream systems (HLVS Intelligence, HL-BTI, Software Factory, future Build Queue) had no single deterministic answer to "does this already exist?".

## Decision

Introduce **one canonical Capability Library** in `@hl-bos/catalog` (`capabilities.ts` + `capability-reuse.ts`) that:

1. Defines a canonical `Capability` (identity + technical + business + relationships + governance).
2. Maps every legacy registry row in via `aliases` / `duplicatesConsolidated` — **linking, never collapsing**.
3. Computes application/product relationships from the live registries (so links can't drift).
4. Provides a **deterministic** `duplicateCheck` → `{REUSE_EXISTING, EXTEND_EXISTING, CONSOLIDATE_DUPLICATES, POSSIBLE_OVERLAP, BUILD_NEW, MANUAL_REVIEW_REQUIRED}` and an `evaluateReuse` decision contract.
5. Guards against new parallel registries (`reconcileCapabilities` + `KNOWN_CAPABILITY_SOURCES`).

## Decisions of record (and their rationale)

| Decision                                             | Rationale                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In-code, not a DB migration**                      | The library must be reviewable/diffable and CI-verified; XI-1 is explicitly no-migration. DB persistence is deferred to XI-2 (approval-gated).                                         |
| **Deterministic first; AI never the authority**      | Tests need no AI; verdicts are explainable (reason codes). AI semantic advice is a future, advisory-only addition through the gateway.                                                 |
| **Link the three systems, don't merge them**         | Enterprise Catalog = what we own; Application Registry = what's deployed; Capability Library = reusable functionality. Collapsing them recreates the ambiguity XI-1 removes.           |
| **`discovery.*_catalog` stays the commercial layer** | Sellable services ≠ reusable engineering capabilities; forcing 48 commercial rows into the capability model would conflate two concepts. They are linked as the commercial projection. |
| **Planned ≠ reusable**                               | Capabilities with no built module (e.g. `scheduling`, `ai_receptionist`) are `planned`; `isReusableNow` returns false for them. No plan is counted as operational reuse.               |
| **Reuse/Extend do not enter the Build Queue**        | `mayEnterBuildQueue` is true only for `BUILD_NEW`; exact duplicates are refused registration (`canRegister`). This is the anti-duplication gate made concrete.                         |
| **Preserve all consumers**                           | `MODULE_REGISTRY` et al. are untouched; the library imports them. Zero breaking changes.                                                                                               |

## Duplicate-gate scoring (deterministic)

Score (0–100) per existing capability = exact alias/name match (+60) + functional-purpose token overlap (Jaccard × 45, prefix-normalized) + domain (+10) + type (+5) + technical schema/package (+10) + industry (+5). Verdict bands: ≥2 exact → CONSOLIDATE; 1 exact → REUSE; ≥55 → EXTEND; ≥35 → POSSIBLE_OVERLAP; ≥20 → MANUAL_REVIEW; <20 → BUILD_NEW.

## Consequences

- **Positive:** one authoritative reuse record; enforceable anti-duplication gate; a stable contract for HLVS/HL-BTI/Factory/Build-Queue; honest implemented-vs-planned signal; no production risk.
- **Negative / accepted:** the canonical inventory is curated (27 capabilities) and must be maintained as modules land — the reconciliation test enforces this. The scoring thresholds are heuristics tuned on real data; they are configurable data, not hidden logic, and can be refined.

## Alternatives rejected

- **Merge everything into one registry** — rejected: destroys the catalog/registry/library distinction the architecture requires.
- **DB-first (new schema now)** — rejected: violates the no-migration boundary and reduces reviewability. Deferred to XI-2.
- **AI-generated inventory** — rejected by directive and by Principle 10; would fabricate unevidenced capabilities.
