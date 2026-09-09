# ADR-0003 · ServiceOS: one prospect store, one tenant model, one website scanner

**Status:** Accepted · **Date:** 2026-09-09
**Applies to:** migrations 0048 (`barberos`) and 0049 (`transform_audit`)
**Builds on:** [ADR-0001](0001-canonical-hl-bos-supabase-project.md), [ADR-0002](0002-migration-lineage-governance.md)

## Context

The Shop Transformation Analysis Tool + BarberOS specification proposed three new
stores: `audit_shops` (shop identity for the audit tool), `barberos_tenants`
("one row per shop"), and a fresh set of website checks for the audit's website
dimension.

All three already exist in this platform under different names.

| Spec proposal      | What already exists                                                                                                                                                                     | Migration   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `audit_shops`      | `visibility.prospects` — "a business the agency tenant is selling to", with `business_name`, `phone`, `city`, `website_url`, `industry`, a `stage` lifecycle, and `converted_tenant_id` | 0017        |
| `barberos_tenants` | `platform.tenants`                                                                                                                                                                      | 0002        |
| Website checks     | `_shared/discovery` — SSRF-validated fetch, per-redirect-hop validation, deterministic HTML extraction, rubric scoring                                                                  | 0020 / 0022 |

The spec also described the audit data as "tenant-agnostic".

## Decision

**1. The audited shop is a `visibility.prospects` row.** `transform_audit.shop_profiles`
is a satellite keyed by `prospect_id`, carrying only the local-business facts
prospects lacks: street address, postal code, Google place id, social URLs, the
hosting platform, and the source file and row it was imported from.

`converted_tenant_id` on `visibility.prospects` is already the Tool → BarberOS
handoff the spec describes as Phase 5. A second prospect table would have meant
a second lifecycle to keep in step with it.

**2. A shop is a `platform.tenants` row.** `barberos.shops` is a satellite, with
`origin_prospect_id` pointing back at the audit that won the account. The
current-state audit records what this platform's existing _two_ incompatible
tenancy models cost; a third is not available.

**3. The audit data is scoped to the agency tenant, not tenant-agnostic.**
Non-negotiable #1 requires every tenant-owned record to carry an enforceable
`tenant_id`. The spec's instinct was right — this data is not the _shop's_ — but
the conclusion was wrong: it is Herman Legacy Digital's own sales data, so it
belongs to the HLD tenant exactly as `visibility.prospects` already does. This
also means VisibilityAI can run audits for a second agency later without a
rewrite.

**4. The website dimension reuses `_shared/discovery` unchanged.**
`_shared/transform_audit/barber_web.ts` adds only the barber-specific _reading_
of the same extracted facts. The generic rubric scores digital maturity; a shop
owner does not have a digital-maturity problem, they have a "nobody can book me
at 9pm" problem. That translation is the new part. Fetching, SSRF validation and
extraction are not rebuilt.

**5. 0048 (`barberos`) is ordered before 0049 (`transform_audit`)**, inverting the
spec's phase numbers. `transform_audit.recommendations.capability_key` is a
foreign key into `barberos.capabilities`, so the catalog must exist before the
thing that points at it. Without the key, a report could recommend a module
nobody ever built.

## The honesty rules, as constraints rather than prose

The spec states that every claim must trace to something actually fetched. A
document cannot enforce that. These do:

| Rule                                                                          | Mechanism                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No dimension reaches `verified` confidence without a directly verified source | Trigger on `dimension_scores`: requires a finding on that run/dimension with a non-null `evidence_url`                                                            |
| An unreachable dimension is a gap, never a guess                              | `CHECK ((confidence = 'unknown') = (score is null))`                                                                                                              |
| The composite is computed, never asserted                                     | Trigger rejects any write to `composite_score` / `dimensions_scored` outside `recompute_composite()`                                                              |
| A report states its own coverage                                              | `dimensions_scored` / `dimensions_possible` on the run; `report()` also names the unscored dimensions                                                             |
| Findings cannot be rewritten after a report is sent                           | `findings` is append-only (trigger denies UPDATE/DELETE)                                                                                                          |
| Evidence and judgment stay separate                                           | `findings` and `recommendations` are different tables                                                                                                             |
| The outreach hook cites a real observation                                    | FK to `findings` + a trigger requiring it belong to _this_ run                                                                                                    |
| A report cannot recommend a module that does not exist                        | FK to `barberos.capabilities`                                                                                                                                     |
| Payments stays out of v1                                                      | Seeded `status = 'deferred'`; `enable_capability` refuses anything not `available`                                                                                |
| The review engine cannot be gated by predicted sentiment                      | `locked_config_keys` on the capability; trigger refuses `min_rating`, `gate_by_sentiment`, `suppress_below`, `ask_only_if_happy`, `predicted_sentiment_threshold` |

The same discipline runs one level down in the rubric: a check with nothing to
judge is dropped from the denominator rather than scored zero, so a shop is
never marked down for something we failed to look at.

## The spec's open questions

Four of the five are answered by building both options rather than by choosing
for the CEO:

1. **GBP depth.** The `google_business` dimension is modelled and weightable but
   has no collector. A campaign that weights it today closes
   `partially_completed` and the report names it as unscored. Nothing pretends
   otherwise.
2. **Audit cadence.** Re-auditing creates a new run; `runs` keeps history and
   snapshots its weights, so improvement over time is measurable whenever the
   CEO wants it. One-time and recurring both work.
3. **Report format.** `transform_audit.report(run_id)` returns the report as
   structured JSON. A PDF or one-pager is a renderer over that, not a schema
   change.
4. **Pricing / tiering.** `barberos.bundles` is a named capability set carrying
   **no price**, and `tenant_capabilities.enabled_via` records which route a
   tenant took. Tiers and à-la-carte both work; the commercial decision stays a
   commercial decision.
5. **Payments out of v1.** Confirmed, and enforced (above).

## Consequences

- The Enterprise Catalog now discovers both schemas, registered `built_undeployed`
  rather than `live`, because neither has been applied anywhere.
- `db()` in `packages/catalog/src/registry.ts` gained optional `maturity` and
  `evidence` arguments. It previously hardcoded `live` and a 2026-07-29 census as
  evidence for every schema, which is how the `intake` schema (migration 0031,
  never applied) came to be listed as live. Corrected in the same commit.
- `.hlbos/canonical.json` `notYetAppliedOrdinals` was `[]`. Checked against the
  canonical project's own applied-migration list — which runs `hlbos_0001`–`0029`
  and `hlbos_0032`–`0047` — it is now `[30, 31, 48, 49]`.
- SalonOS reuses `barberos.capabilities` with a different default-on bundle
  rather than forking the vertical.

## Status of the work itself

Both migrations are **written and tested and applied nowhere** — not to
production, not to a branch. `transform_audit` holds **zero shops**: the WNY
50-shop prospect list is not in this repository, `import_shop` is the only way
data enters, and nothing about those shops has been invented. No BarberOS
capability module exists; all nine are catalogued `planned` or `deferred` and the
toggle refuses to enable any of them.
