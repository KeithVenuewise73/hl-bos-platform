# HL-BTI — CEO Dashboard (Deliverable 8)

`bti.ceo_dashboard()` — a deterministic, platform-permission-gated read model showing transformation status across **every** Herman Legacy business, configurable for future businesses.

## 1. What it returns (per business)

| Column                                      | Meaning                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `business_key`, `business_name`, `industry` | portfolio identity                                               |
| `analysis_only`                             | true for advise-only businesses (e.g. Venuewise)                 |
| `latest_stage`, `engagement_mode`           | current lifecycle stage + mode of the most recent engagement     |
| `transformation_score`                      | the latest completed assessment's Transformation Score (or null) |
| `active_projects`                           | count of active delivery projects                                |
| `realized_roi`                              | sum of realized ROI metrics                                      |
| `open_engagements`                          | engagements not `declined`                                       |

Businesses are included when `dashboard_visible` is true; ordered by name.

## 2. Honesty (platform principle 10, "the dashboard is not exempt")

The dashboard reports **only real rows**. A business with no engagement shows null stage/score; no engagement, no fabricated status. `transformation_score` is null until an assessment is actually completed. It never renders a health bar for state that does not exist.

## 3. Access control

`bti.ceo_dashboard()` is `SECURITY DEFINER` + `STABLE` and requires the **platform** permission `bti.dashboard.read` (held by `platform_owner`/`platform_admin`). A tenant user without it is refused (`t_dashboard_requires_platform`); a platform admin gets rows (`t_dashboard_returns_businesses`). This is a cross-business view, so it is deliberately a platform capability, not a tenant one.

## 4. Configurable portfolio (PCO)

The PCO requires HSCS, Venuewise, HomeHuddle and 5-Star initially, with future businesses configurable. Businesses are **rows** (`bti.register_business`), each tagged with industry, industry pack, and the `analysis_only` posture. Adding a business to the dashboard is a governed RPC call, not a code change — so the portfolio grows without a migration. No business rows are seeded as fake data; each is created for a real engagement.

## 5. Reuse

The dashboard aggregates existing `bti` tables only; it introduces no reporting warehouse, no second metrics store, and reads through the same permission model as everything else.
