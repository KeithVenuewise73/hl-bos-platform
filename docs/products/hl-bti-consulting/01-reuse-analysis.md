# HL-BTI Consulting Intelligence Framework — Reuse Analysis

**Product:** the Herman Legacy Business Transformation Methodology (the "consulting brain") · **PCO:** #3 · **Scope:** a deterministic consulting engine + case studies + reports. Local development.

> The PCO: _"Reuse every existing engine. Favor deterministic consulting over generative speculation."_ This framework **extends** the canonical engine; it introduces no platform service and duplicates no scoring, lifecycle, or catalog.

## 1. Where it lives (reuse-correct)

The framework is a new module inside the **existing canonical engine** `@hl-bos/bti-engine` (`packages/bti-engine/src/consulting/`). That package is already the one algorithm shared by the DB authority (`bti.*`), the edge layer (`_shared/bti`), and the Alpha UI. Putting the consulting brain there is what lets it "power every future Herman Legacy product" (VisibilityAI, TransportationAI, SalonAI, FleetHuddle, …) without a second engine.

## 2. What it reuses (no duplication)

| Reused                                                       | From                                                      | How                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Assessment / executive scoring                               | `@hl-bos/bti-engine` `computeScorecard`                   | findings are keyed to the same domains/dimensions and consume the scorecard                                |
| Domain + dimension catalog                                   | `@hl-bos/bti-engine` `DOMAINS` (43 dimensions, 6 domains) | the consulting knowledge base is keyed to these exact dimensions, so every finding traces to a real rating |
| Growth intelligence                                          | `@hl-bos/bti-engine` `analyzeGrowth`                      | the growth section reuses its priority/ROI/service mapping                                                 |
| Lifecycle + analysis-only cap                                | `@hl-bos/bti-engine` `lifecycle`                          | Venuewise case study stays analysis-only                                                                   |
| Identity / tenancy / audit / workflows / billing / proposals | HL-BOS backend                                            | untouched; the framework is pure logic that runs over an assessment's data                                 |

## 3. What is genuinely new (and only this)

A deterministic consulting layer that turns a scored assessment into structured consulting output:

- **Finding workflow** — the 12-part structure per finding, each traceable to evidence.
- **FACT / INFERENCE / OPINION** classification on every claim.
- **Root-cause, priority, difficulty, timeline** — deterministic.
- **Transformation roadmap** — Immediate / Short / Medium / Long buckets with justifications.
- **Herman Legacy solution mapping** — services recommended only when a finding supports them.
- **Financial framework** — computes values only where evidence supports; otherwise says "Additional financial information required."
- **Executive narrative** — deterministic, evidence-based section generation (AI would only polish the prose; the facts are deterministic).
- **CEO review package** — confidence, evidence used, missing information, next questions.
- **Industry consulting templates** — reusable configuration (rows), not hardcoded logic.

## 4. Determinism & honesty (the core mandate)

- **Deterministic:** scoring, prioritization, roadmap placement, recommendation structure, root-cause selection, confidence — all pure functions with tests. Same input → same output.
- **AI:** reserved for natural-language polish only; the framework ships a deterministic narrative that never depends on a model to state a fact.
- **Never fabricated:** scores, ROI, savings, revenue, benchmarks, competitor data, financial projections. Missing evidence is reported as a gap with the exact next question to ask — never filled with a guess.
- **Traceability:** every recommendation carries the dimension + rating + evidence that justify it. Inferences and opinions are labelled as such and never presented as fact.
