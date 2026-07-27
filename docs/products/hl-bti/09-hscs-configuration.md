# HL-BTI — HSCS Configuration (Deliverable 9)

**Customer #1: Herman Supply Chain Solutions (HSCS) Consulting.** HSCS is the first user of HL-BTI and runs **full-transformation** engagements.

## 1. Registration

```
bti.register_business(
  tenant   => <HSCS tenant>,
  key      => 'hscs',
  name     => 'Herman Supply Chain Solutions',
  industry => 'logistics',
  pack     => 'transportation',
  analysis_only => false)         -- full transformation lifecycle
```

`analysis_only = false` → engagements open in `full_transformation` mode and may traverse the entire 13-stage lifecycle through `monthly_partnership`, including proposal, implementation delivery, and ROI tracking.

## 2. Industry pack

HSCS uses the **`transportation`** pack (`applicable_domains`: operations, business, financial, technology, growth, ai_readiness — operations-first). This supports assessing the PCO's target business types — warehouses, transportation companies, distribution centers, manufacturers, logistics providers, fleet operations, and small businesses — via the Operations Intelligence dimensions (operations, supply_chain, scheduling, reporting, automation, fleet, resource_utilization, warehouse_operations, transportation) plus the five cross-cutting domains.

## 3. What HSCS can do (the success-criteria path)

1. Register a prospect business → `open_engagement` (full).
2. Run discovery (reused `discovery` engine) and link the profile → `link_profile`.
3. Advance through the lifecycle one governed step at a time.
4. Score the six domains → `rate_dimension` → `compute_scores` → the 7 executive scores.
5. Submit for human review → approve → `complete_assessment`.
6. Assemble the Executive Business Transformation Blueprint (deterministic + AI narrative).
7. Generate a proposal via the reused `sales` flow.
8. On acceptance, manage implementation (`projects`/`milestones`/`tasks`) and track ROI (`roi_metrics`).
9. See status on the CEO dashboard.

Every step above is exercised by `supabase/tests/28_bti_platform.sql` against the HSCS business fixture.

## 4. Recommendations carry service + ROI

HSCS recommendations use the reused `discovery.recommendations` shape (recommended Herman Legacy service, estimated impact, priority) and, for the growth domain, the Growth Intelligence engine's service/ROI mapping — so each recommendation is actionable and revenue-linked.

## 5. Boundary

This document configures HSCS **in HL-BTI**; it does not touch the separate legacy HSCS Government Logistics system (out of scope, per the operating contract). No live tenant is created here — configuration is applied per real engagement, on approval.
