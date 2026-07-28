# HL-BTI Consulting Intelligence Framework — Specification (Deliverables 1–7, 10)

The Herman Legacy Business Transformation Methodology, as deterministic software. It lives in `@hl-bos/bti-engine/src/consulting/` and turns a scored assessment into structured consulting output. Deterministic end to end; AI is reserved for prose polish and may never change or invent a fact.

`generateConsultingReport(assessment)` returns the whole package: findings, roadmap, solutions, financial, narrative, review, meta.

## Deliverable 1 — Consulting Intelligence Framework (the finding workflow)

For every rated dimension at or below the finding threshold (rating ≤ 3), the framework emits a **12-part finding** (`findings.ts`): Finding · Supporting Evidence · Business Impact · Root Cause · Business Risk · Opportunity · Priority · Recommended Action · Implementation Difficulty · Expected Timeline · Success Metrics · Recommended Herman Legacy Services. Ratings of 4–5 are strengths, not findings.

**FACT / INFERENCE / OPINION.** Every finding also carries classified `claims`: the rating and attached evidence are **FACT**; the root cause and business impact are **INFERENCE**; the recommended action is **OPINION**. Inference and opinion are never presented as fact, and each claim lists the evidence it rests on. The report `meta` counts all three.

## Deliverable 2 — Root Cause Analysis Framework

Every recommendation explains **why**. The knowledge base (`knowledge.ts`) supplies a root-cause hypothesis per dimension (explicitly an inference), and the finding pairs it with a business impact and a measurable expected outcome (success metrics). The framework never simply reports a score — it states the cause, the impact, the action, the priority, and the expected improvement.

## Deliverable 3 — Recommendation Engine

`findings.ts` + `priority.ts`. Priority is deterministic and categorical: severity = 5 − rating drives the band (critical/high/medium), the domain's transformation weight only breaks ties for ordering. Difficulty, timeline, success metrics and services come from the per-dimension knowledge base. Same input → same recommendations, every time.

## Deliverable 4 — Transformation Roadmap Engine

`roadmap.ts` places every finding into exactly one bucket — **Immediate (0–30d) · Short-Term (30–90d) · Medium-Term (3–6mo) · Long-Term (6–12mo)** — from its timeline (critical findings are pulled to Immediate), and every placement carries a written justification. No item is placed without a reason.

## Deliverable 5 — Executive Narrative Engine

`narrative.ts` generates the board-ready sections deterministically: Executive Summary, Current State, Business Strengths, Business Weaknesses, Strategic Risks, Growth / Technology / AI / Operational / Financial Opportunities, Transformation Priorities, Executive Recommendations, and a Board-Level Summary. A section with no supporting data is emitted marked "not available" with the reason — never a fabricated paragraph. AI may restyle this prose; it may not add a fact.

## Deliverable 6 — Herman Legacy Solution Mapping Framework

`solutions.ts` recommends a Herman Legacy service **only when a finding supports it**, and ranks services by how many findings (weighted by priority) call for them. The service vocabulary (`knowledge.ts` `HL_SERVICES`) is the PCO list: Business Transformation, Operational Consulting, Website Development, VisibilityAI, SEO, Digital Marketing, AI Automation, Operating Systems, Custom Software, Managed Services, Hosting, Training. No service is ever recommended speculatively.

## Deliverable 7 — Industry Consulting Templates

`industry.ts` — reusable **configuration**, not hardcoded logic. Each template names the domains an industry should emphasize (in order) and a consulting lens. Twelve are shipped: Transportation, Sports, Salons, Barbershops, Landscaping, Mechanics, Collision Repair, Restaurants, Professional Services, Manufacturing, Healthcare, and a General fallback. Adding an industry is a row; the same deterministic engine runs for all of them.

## Deliverable 10 — CEO Review Framework

`review.ts` — for every finding, the CEO gets: **Confidence Level** (high when corroborating evidence is attached; moderate on a rating alone; low for an uncorroborated extreme), **Evidence Used**, **Missing Information** (e.g. "no financial figures supplied"), and **Recommended Next Questions**. This lets Keith validate findings before presenting them to a customer — the honesty mechanism that surfaces thin evidence instead of hiding it.

## The financial framework (honesty-gated)

`financial.ts` computes a value **only** where the assessment supplied the evidence (e.g. automation savings need labor hours and cost/hour). Every other line returns `null` with the exact note **"Additional financial information required."** plus what to provide. It never fabricates ROI, savings, revenue, or benchmarks.

## Proven

13 unit tests in `packages/bti-engine/src/consulting/consulting.test.ts` assert determinism, the 12-part structure, evidence tracing, FACT/INFERENCE/OPINION classification, priority + roadmap placement, solution mapping (and none without findings), financial gating, CEO-review flags, honest narrative empties, and the Markdown renderer. See the [Build Completion Report](12-build-completion-report.md).
