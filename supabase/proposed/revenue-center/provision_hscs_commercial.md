# Package: provision the HSCS commercial tenant (NOT executed)

**Why a new tenant, not `hscs-government`.** Read-only assessment of production,
2026-11-05 (VERIFIED). Tenant `hscs-government` (`0fa1e91a-…`, first_party, trial) holds:

- 2 `bti.businesses` records (government contracting)
- 2 `events.outbox` rows and 8 `audit.events` rows
- 1 membership (tenant_owner, the same person as the HLD owner)
- no modules and no entitlements

Reusing it would put commercial transportation prospects in the same tenant as
government-contracting records. Every member of either side would then see both, because
tenant RLS has no finer boundary. **Recommendation: a separate tenant;
`hscs-government` stays as it is.**

## Sequence (platform owner's signed-in session, in this order)

| #   | Call                                                                                                                                                | Effect                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | `platform.provision_tenant('herman-supply-chain-solutions', 'Herman Supply Chain Solutions', <owner user id>, 'first_party')`                       | new tenant, owner membership (existing platform function)        |
| 2   | `revenue.set_business_line(<new id>, 'hscs', <notification address or null>)`                                                                       | marks it as the HSCS line (unique: no second HSCS tenant)        |
| 3   | `revenue.designate_approver(<new id>, <owner user id>)`                                                                                             | the owner approves HSCS proposals and outreach                   |
| 4   | `revenue.enable_first_party_tenant(<new id>)`                                                                                                       | activates `visibility` + `visibility.content` (first-party only) |
| 5   | `revenue.upsert_campaign(...)` ×3 (moving, transportation, third_party_logistics), then `revenue.set_campaign_status(..., 'approved')` by the owner | campaigns; discovery still off (pilot settings)                  |

Same steps for HLD on the **existing** tenant `herman-legacy-digital` (`8a669381-…`): steps 2–5,
then the adoption package (`adopt_hld_barbershops.sql`, dry run first).

**Rollback:** `revenue.set_business_line` cannot unassign a line, so roll back by
deleting the `revenue.business_lines` row (platform owner, SQL) and then deleting the tenant
(cascade). The tenant is new and empty, so nothing else is affected.

Tested on an isolated database: `packages/growth-intelligence/src/tenants.db.test.ts`.
