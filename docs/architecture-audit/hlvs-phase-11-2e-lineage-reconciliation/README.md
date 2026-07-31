# Phase XI-2E · HL-BOS Repository ↔ Production Lineage Reconciliation Assessment

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Read-only assessment.** No migration applied, no project created, no remote schema/data/permission changed, no deploy, no merge. Evidence tags: **[V]** verified · **[SI]** strongly inferred · **[U]** unverified · **[C]** corrects a prior claim.

Annexes: [01-estate-inventory.md](01-estate-inventory.md) · [02-lineage-schema-identity.md](02-lineage-schema-identity.md) · [03-risk-reconciliation-plan.md](03-risk-reconciliation-plan.md)

---

## Executive finding

**HL-BOS has ONE coherent, canonical lineage — not an unmanaged divergence.** The
production database (**HL-BOS Core, `mvvtngiopdrgiedjmhfb`**) runs **this repository's own
lineage**: the same 27 migrations, the same 17 module schemas (events, billing, visibility,
communications, discovery, HLVS Factory, BTI, …), the same identity model. **[V]**

The "divergence" that Phase XI-2D reported was a **false alarm caused by reading the wrong
database.** XI-2D inspected a **stale, abandoned preview branch** (`hlbos-m1-portfolio`,
`moftgnrbnsixeddcwdpz`) that carries a **superseded earlier build** of HL-BOS Core (a
portfolio + govcon prototype from July 19–20) and inferred — without querying production
directly — that production must be that portfolio/govcon build. **Querying production
directly this phase shows the opposite: production is the platform lineage this repo
builds.** **[C]**

So the real picture is:

- **Canonical & healthy:** repo `hl-bos-platform` ↔ production `mvvtngiopdrgiedjmhfb`. Aligned. **[V]**
- **One abandoned leftover:** the `hlbos-m1-portfolio` branch — a superseded milestone, no data (`with_data=false`), safe to delete later. **[V]**
- **One repair needed:** a **version-timestamp drift** on migrations 0023–0027 (repo files vs production's applied records) that must be fixed before the standard apply path can reach migration 0028. **[V]**

This is a **repair-and-tidy** situation, not a **reconcile-two-applications** situation.

> **What this means for XI-2D:** its _decision_ not to apply 0028 to that branch was still
> correct (the branch is a foreign, stale lineage), and its permission-key bug fix was real
> and still valid. Only its _interpretation of what production is_ was wrong — corrected here.

## Repository ownership

| Lineage                              | Repository                                                                              | Branch                         | Database                                           | Confidence                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------- | ------------------------------------------------------ |
| **A — Platform (canonical)**         | `KeithVenuewise73/hl-bos-platform`                                                      | `main` (+ this feature branch) | production `mvvtngiopdrgiedjmhfb`                  | **[V]**                                                |
| **B — Portfolio/GovCon (abandoned)** | likely `KeithVenuewise73/HSCS-GLP` (government logistics) or an early HL-BOS Core build | —                              | stale branch `moftgnrbnsixeddcwdpz` only           | **[SI]** (HSCS-GLP out of GitHub scope; not inspected) |
| Legacy monolith                      | —                                                                                       | —                              | `bkfsjhhclbqrhaolvhmz` (unreachable, out of scope) | **[SI]**                                               |

## Migration divergence

**Shared foundation: 0001–0008 (identical in repo, production, and the stale branch).**
**Divergence point: after 0008.** Lineage A (platform) went to production; Lineage B
(portfolio/govcon) lives only on the abandoned branch. Full map: annex 02 §1.

Within Lineage A, a **tail drift** exists: migrations **0023–0027** have the same names and
order in the repo and production but **different version timestamps** (repo `20260727…`,
production `20260728…`). 0001–0022 match exactly. This blocks a clean `supabase db push`
until repaired. **[V]**

## Schema & data comparison

Production is **schema-live but operationally empty**: 124 module tables across 17 schemas,
but only seeded vocabulary carries rows (`identity.permissions ≈ 52`,
`role_permissions ≈ 280`), **`auth.users = 1`, memberships = 1, platform_admins = 1**, and
**every module table ≈ 0 rows.** So production holds a single bootstrap owner + reference
data and **no customer operational data.** The stale branch has **no data at all**
(`with_data=false`). The only lineage that ever held real business data is the **legacy,
unreachable** `bkfsjhhclbqrhaolvhmz`. **[V]** Full comparison: annex 02 §2.

## Identity comparison

The identity/permission models are **interface-compatible** across lineages: same
`has_platform_permission(citext)` / `has_permission(uuid, citext)` signatures, same
three-segment `domain.resource.action` key rule, same `platform/tenant` scopes. Lineage B
merely added two extra verbs (`approve`, `export`). **One authorization model can serve
everything;** A is authoritative because it is what production runs and what ADR-0001
blesses — not because B is inferior. The graph permissions conform to both. **[V]** Annex 02 §3.

## Risk assessment (ranked)

1. **[High] Tail migration drift (0023–0027)** — blocks the governed apply path; would try to re-apply existing migrations. **Repair before any 0028 apply.**
2. **[Medium] Stale branch mistaken for a faithful preview** — it already caused one wrong conclusion (XI-2D). Label and delete it.
3. **[Medium] Stale root `README.md`** — claims "no schema / not deployed"; contradicts live production. Harmless to fix.
4. **[Low] Production data loss** — negligible; production has no customer data.
5. **[Low, contained] Legacy `bkfsjhhclbqrhaolvhmz`** — unreachable, open security findings; stays out of scope.

## Reconciliation options

| Option                                          | Verdict                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **1 — Single canonical DB**                     | **RECOMMENDED as "confirm & clean"** — already essentially the state; remaining work is repair + forward-apply. |
| 2 — Bounded databases                           | Adopt **only** for a future HSCS-GLP vertical (its own DB, federated via HL-BOS identity).                      |
| 3 — Promote production, absorb repo             | N/A — production already _is_ the repo lineage.                                                                 |
| 4 — Promote repo, migrate production domains in | N/A — the portfolio/govcon domains aren't in production (branch only, no data).                                 |
| 5 — Separate products intentionally             | Adopt for **HSCS-GLP/govcon** — a distinct government-logistics product, not merged into the platform DB.       |

Compared on safety/time/complexity/production-risk/maintainability/alignment in annex 03 §3.

## Recommendation

**Affirm one platform, one canonical database, verticals as separate products.**
Concretely:

1. **Confirm** repo `hl-bos-platform` ↔ production `mvvtngiopdrgiedjmhfb` as the single canonical platform lineage (already ADR-0001; now verified against the live DB).
2. **Repair** the 0023–0027 version drift on the governed path in a dedicated authorized phase — **then** migration 0028 applies cleanly as the correct next forward migration (no renumbering).
3. **Retire** the abandoned `hlbos-m1-portfolio` branch (later, authorized).
4. **Keep** HSCS-GLP as its own product; if it needs a DB, give it a **bounded** one federated through HL-BOS identity — never merged into the platform DB.
5. **Leave** the legacy `bkfsjhhclbqrhaolvhmz` out of scope.

This matches verified reality, changes the least, and never risks the one data-bearing
environment. Why it beats the alternatives: annex 03 §4.

## Immediate containment

- **Keep the remote migration workflow unarmed** (it already is) until the drift is repaired.
- **Add a CI migration-drift check** (repo vs production applied versions) — recommend, build in the next phase.
- **Label the stale branch abandoned**; do not use it as a validation target.
- **Correct the stale root `README.md`** (safe docs-only follow-up).
- **[Done this phase]** Corrected the XI-2D production-lineage inference (banners added; docs-only).

## Knowledge Graph status — what may continue vs must pause

- **May continue:** the corrected migration 0028 stays in the repo at its current number; in-code graph, serializer, tests, portal card — all unchanged and green. It is **safe to sit in a PR**.
- **Must pause:** any **remote apply** of 0028 — until (a) the 0023–0027 drift is repaired and (b) a **faithful preview** exists. Good news: a faithful preview no longer needs a brand-new paid project — after the drift repair, a **fresh preview branch cut from current production** is faithful (the stale one was not). **Do not apply or renumber 0028 now.** (Not done.)

## CEO decisions required (smallest set)

1. **Affirm the canonical lineage** = `hl-bos-platform` ↔ HL-BOS Core (`mvvtngiopdrgiedjmhfb`). _(Expected: yes — matches ADR-0001 and verified reality.)_
2. **Authorize a controlled next phase (XI-2F)** to: repair the 0023–0027 migration-version drift, add a CI drift-check, and delete the abandoned `hlbos-m1-portfolio` branch — preview/read-only until you arm the apply.
3. **Confirm HSCS-GLP / govcon is a separate vertical product** (its own repo, and if needed its own federated database), **not** merged into the HL-BOS platform database.

## Next-phase recommendation (do not begin)

**Phase XI-2F — Controlled migration-history reconciliation & faithful preview
provisioning:** repair the tail drift on the governed path, cut a fresh preview branch from
current production, retire the stale branch, and add the CI drift-check — all preview/read
only until CEO-armed. Then **XI-2G** applies 0028 to that faithful preview and completes the
runtime validation XI-2D could not. Recommended; **not started.**

## Deliverables index (17)

| #   | Deliverable                                   | Location                                            |
| --- | --------------------------------------------- | --------------------------------------------------- |
| 1   | Executive summary                             | this file (top)                                     |
| 2   | Repository estate inventory                   | [01](01-estate-inventory.md) §2                     |
| 3   | Supabase project/branch inventory             | [01](01-estate-inventory.md) §1                     |
| 4   | Deployment ownership map                      | [01](01-estate-inventory.md) §3–4                   |
| 5   | Migration-lineage comparison                  | [02](02-lineage-schema-identity.md) §1              |
| 6   | Schema & capability comparison                | [02](02-lineage-schema-identity.md) §2              |
| 7   | Identity & authorization comparison           | [02](02-lineage-schema-identity.md) §3              |
| 8   | Production-data & operational-risk assessment | [03](03-risk-reconciliation-plan.md) §1             |
| 9   | Repository-to-production gap analysis         | [03](03-risk-reconciliation-plan.md) §2             |
| 10  | Reconciliation strategy options               | [03](03-risk-reconciliation-plan.md) §3             |
| 11  | Recommended canonical architecture            | [03](03-risk-reconciliation-plan.md) §4 · this file |
| 12  | Recommended migration strategy                | [03](03-risk-reconciliation-plan.md) §4             |
| 13  | Recommended repository strategy               | [03](03-risk-reconciliation-plan.md) §4             |
| 14  | Knowledge Graph impact assessment             | [03](03-risk-reconciliation-plan.md) §5 · this file |
| 15  | Immediate containment recommendations         | [03](03-risk-reconciliation-plan.md) §6 · this file |
| 16  | Phased execution plan                         | [03](03-risk-reconciliation-plan.md) §7             |
| 17  | Explicit CEO decisions required               | this file                                           |

## What remains untouched

No migration applied, no project created/deleted, no remote schema/data/permission change,
no deploy, no merge, no migration renamed/renumbered, no Git history rewritten, no DNS,
no secrets. All reads were catalog/stat metadata or repo files; no customer data content
was read (production has none regardless). Quality gates unaffected (assessment is docs-only).
