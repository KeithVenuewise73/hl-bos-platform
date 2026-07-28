# Phase 1 · Deliverable 5 (CP6) — Recommendation Rules and Priority Model

**Date:** 2026-07-27 · **Checkpoint:** 6 · Versioned, data-driven, traceable. No opaque AI list.

## 1. Recommendation rules (`discovery.recommendation_rules`, `rules-0.1.0`)

Rules are **data**, evaluated by the pure engine `_shared/blueprint/rules.ts`. A rule declares:

- `conditions` — evidence keys/values and/or a dimension threshold, e.g.
  `{"evidence":{"https":{"present":false}}}` or `{"dimension":{"framework":"maturity","key":"security","lte":2}}`.
- `output` — what to produce: `service_key`/`module_key`, `title`, `severity`, `priority_band`, `effort_band`, `cost_band`, `affected_dimensions`, `dedupe_group`.
- `confidence`, `kind`, `is_active`.

The engine matches conditions against the profile's evidence and dimension scores and emits a recommendation carrying the **`rule_key` + `rule_version` + the evidence ids it matched**. There is no free-form AI recommendation list — AI only adds narrative on top of these traceable facts.

### Seeded rules

`rule_no_https` (critical), `rule_no_website`, `rule_weak_seo`, `rule_no_contact`, `rule_no_analytics`, `rule_low_security_dim`, `rule_low_comms_dim`. Each maps to a service or module in the catalogs.

### Origins preserved

Every recommendation records its `origin`: `deterministic` (rule-produced), `ai_assisted` (AI-suggested — must cite evidence), or `human` (hand-authored). A human can `override` a recommendation (recording who + why); `state` tracks `proposed` → `accepted`/`rejected`/`deferred`/`overridden` and the proposal flags. Duplicates in the same `dedupe_group` are consolidated (highest confidence kept, the rest deferred — traceable, never deleted).

### Inactive catalog entries excluded

A rule may reference a service/module that is currently `unavailable`; `discovery.recommend` rejects it, and the TS engine marks it `excluded` rather than emitting it. Availability is honoured at both layers.

## 2. Priority model (`_shared/blueprint/priority.ts`, `priority-0.1.0`)

Transparent and **categorical** — it never presents false mathematical precision. Severity sets a base band; urgency and a high revenue/risk signal can raise it; very low confidence lowers it. Factors considered: severity, urgency, confidence, effort, dependency order, revenue opportunity, customer-experience impact, operational-efficiency impact, risk reduction, growth enablement.

The result is one of five clear bands — **Critical, High, Medium, Low, Future** — plus the exact `factors`, `modelVersion`, and a human-readable `rationale` retained for traceability. Dependency order sorts earlier items first so the roadmap sequences prerequisites ahead of dependents.

## 3. Traceability guarantee

Given any recommendation you can answer: which rule produced it (`rule_key`/`rule_version`), which evidence justified it (`evidence_refs`), which dimensions it affects (`affected_dimensions`), what priority and why (`priority_band` + `priority_factors`), and its origin and current state. Proven by `25_blueprint_engine.sql` (`t_rec_traceable_to_rule`, `t_rec_evidence_refs`, `t_rec_priority_band`) and the rule-engine Deno tests.
