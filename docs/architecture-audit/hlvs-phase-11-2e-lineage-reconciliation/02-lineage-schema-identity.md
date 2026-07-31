# XI-2E · Migration-lineage map, schema comparison, identity comparison

All comparisons treat migration **identity** (version timestamp) — not just the number —
as significant, per the phase brief. **[V]/[SI]/[U]/[C]** as in doc 01.

## 1. The definitive migration-lineage map

Three lineages share the **same foundation (0001–0008, dated 2026-07-18)** and then split.

| Segment     | **Lineage A — Platform** (repo `main` **and** production `mvvtngiopdrgiedjmhfb`)                                                                                                                                                                                                                                                                                    | **Lineage B — Portfolio/GovCon** (stale branch `moftgnrbnsixeddcwdpz` only)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001–0008   | extensions, identity, roles, audit, seed, provisioning, tenant-class — **identical version timestamps** in repo, production, and branch                                                                                                                                                                                                                             | **identical** (shared ancestor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0009 →      | `events, entitlements, integrations, ai_gateway, workflows_gate, visibility_core, billing_core/subscriptions, visibility_assessments, storage_meta, communications, discovery, events_handlers, website_assessment, blueprint_engine, commerce_provisioning, hlvs_factory, bti_platform, bti_intake` (0009–0027), **+ repo-only `0028 knowledge_graph_read_model`** | `portfolio_schema_and_types, portfolio_permissions_and_role, portfolio_read_model_tables, portfolio_population_functions, portfolio_refresh_orchestration/actor_fix, managed_schema_registry, profile_creation_trigger, permission_verb_extension, govcon_schema_and_reference, …company_profile, …discovery, …evaluation, …workflow, permission_constraint_correction, govcon_permissions, …scoring_engine, …dashboard, …helper_function_grants, …dashboard_function_grants, …dashboard_security_invoker` (0009–0029) |
| Dates 0009+ | 2026-07-25 → 07-28                                                                                                                                                                                                                                                                                                                                                  | 2026-07-19 → 07-20 (**earlier**)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Deployed to | **production** (schema-live, ~no data)                                                                                                                                                                                                                                                                                                                              | **nowhere live** (branch, `with_data=false`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Divergence point: after 0008.** **[V]**

### 1a. Number collisions across lineages (same number ≠ same migration)

| #         | Lineage A (repo/prod)                    | Lineage B (stale branch)                               | Collision type                       |
| --------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| 0009–0027 | platform modules                         | portfolio/govcon modules                               | **Same numbers, unrelated meaning**  |
| **0028**  | `knowledge_graph_read_model` (repo only) | `govcon_dashboard_function_grants` (applied on branch) | **Same number, different migration** |
| 0029      | _(none)_                                 | `govcon_dashboard_security_invoker`                    | branch-only                          |

Because Lineage B lives **only** on an abandoned branch that is not part of production,
these collisions are **inert** — they matter only if someone tried to combine the branch
into the platform (which no one should). **[V]**

### 1b. Tail migration-identity **drift within Lineage A** (repo vs production)

Names and order match, but the **version timestamps differ for 0023–0027**:

| # / name                       | Repo file version (`main` & working branch) | Production applied version | Match? |
| ------------------------------ | ------------------------------------------- | -------------------------- | ------ |
| 0001–0022                      | 20260718… / 20260725… / 20260726…           | identical                  | ✅     |
| 0023 blueprint_engine          | `20260727090000`                            | `20260728181327`           | ❌     |
| 0024 commerce_provisioning     | `20260727090100`                            | `20260728182035`           | ❌     |
| 0025 hlvs_factory              | `20260727090200`                            | `20260728182459`           | ❌     |
| 0026 bti_platform              | `20260727090300`                            | `20260728182832`           | ❌     |
| 0027 bti_intake_and_public_api | `20260728090000`                            | `20260728182949`           | ❌     |
| 0028 knowledge_graph           | `20260731090000` (repo only)                | _(not applied)_            | n/a    |

**Consequence [V/SI]:** a governed `supabase db push` from the repo keys on the version
prefix. Because the repo's `0023–0027` versions are **not** in production's
`schema_migrations`, the CLI would treat them as _pending_ and try to **re-apply** them
(objects already exist → failure/drift), and it would not cleanly reach `0028`. **This
drift must be repaired before migration 0028 can be applied through the standard path.**
Mechanism of how it arose is **[U]** (repo files appear to have been re-timestamped, or
production was applied from a differently-timestamped copy; I cannot see production's
pre-current history).

## 2. Schema & capability comparison

Deployed status is for **production `mvvtngiopdrgiedjmhfb`** (queried live). Data-bearing =
seed/reference rows present at migration time; **operational** customer data ≈ none anywhere.

| Schema / subsystem                  | Lineage A repo |     Prod deployed     |        Lineage B branch         |     Data-bearing (seed)     | Source-of-truth       | Collision risk A↔B                      | Disposition                        |
| ----------------------------------- | :------------: | :-------------------: | :-----------------------------: | :-------------------------: | --------------------- | --------------------------------------- | ---------------------------------- |
| identity                            |       ✅       |      ✅ (8 tbl)       |               ✅                | vocab (52 perms/280 grants) | **shared foundation** | low (shared 0001–0008; B extends verbs) | Canonical (A)                      |
| audit                               |       ✅       |        ✅ (2)         |               ✅                |              —              | shared                | low                                     | Canonical (A)                      |
| platform (tenants)                  |       ✅       |        ✅ (1)         |               ✅                |              —              | shared                | low                                     | Canonical (A)                      |
| catalog (in-code `@hl-bos/catalog`) |    ✅ code     | n/a (not a DB schema) |                —                |              —              | repo registries       | none                                    | Canonical (A)                      |
| events                              |       ✅       |        ✅ (4)         |               ❌                |              —              | A                     | n/a                                     | Canonical (A)                      |
| entitlements                        |       ✅       |        ✅ (4)         |               ❌                |         ✅ features         | A                     | n/a                                     | Canonical (A)                      |
| ai (gateway)                        |       ✅       |        ✅ (7)         |               ❌                |     ✅ providers/models     | A                     | n/a                                     | Canonical (A)                      |
| workflows                           |       ✅       |        ✅ (3)         |               ❌                |              —              | A                     | n/a                                     | Canonical (A)                      |
| billing                             |       ✅       |        ✅ (8)         |               ❌                |         ✅ catalog          | A                     | n/a                                     | Canonical (A)                      |
| visibility                          |       ✅       |        ✅ (8)         |               ❌                |        ✅ categories        | A                     | n/a                                     | Canonical (A)                      |
| storage_meta                        |       ✅       |        ✅ (1)         |               ❌                |              —              | A                     | n/a                                     | Canonical (A)                      |
| comms                               |       ✅       |        ✅ (7)         |               ❌                |        ✅ templates         | A                     | n/a                                     | Canonical (A)                      |
| discovery                           |       ✅       |        ✅ (19)        |               ❌                |   ✅ collectors/blueprint   | A                     | n/a                                     | Canonical (A)                      |
| sales + provisioning                |       ✅       |       ✅ (7+7)        |               ❌                |         ✅ catalog          | A                     | n/a                                     | Canonical (A)                      |
| hlvs (Factory)                      |       ✅       |        ✅ (19)        | partial (legacy hlvs elsewhere) |       ✅ capabilities       | A                     | n/a                                     | Canonical (A)                      |
| bti                                 |       ✅       |        ✅ (14)        |               ❌                |         ✅ domains          | A                     | n/a                                     | Canonical (A)                      |
| **graph** (Knowledge Graph)         | ✅ repo (0028) |    ❌ not applied     |               ❌                |         vocab only          | A (read model)        | none                                    | **Apply after tail-drift repair**  |
| **portfolio**                       |       ❌       |          ❌           |               ✅                |              ?              | B                     | —                                       | Abandoned-branch only; not adopted |
| **govcon**                          |       ❌       |          ❌           |               ✅                |              ?              | B (likely HSCS-GLP)   | —                                       | Separate product (see doc 03)      |
| managed_schema_registry             |       ❌       |          ❌           |               ✅                |              ?              | B                     | —                                       | Abandoned-branch only              |

Production live schema list (queried): `ai, audit, billing, bti, comms, discovery,
entitlements, events, hlvs, identity, integrations, platform, provisioning, sales,
storage_meta, visibility, workflows` (+ system schemas). **No `portfolio`, `govcon`, or
`graph`.** **[V]** The word "portfolio" in the repo is an **unrelated** product-catalog UI
concept, not a DB schema. **[V]**

## 3. Identity & authorization comparison

| Aspect                    | Lineage A (repo + production)                                                | Lineage B (stale branch)                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `permissions.key` type    | `citext` PK                                                                  | `citext` PK                                                                              |
| `permissions_key_format`  | `^[a-z_]+\.[a-z_]+\.(read\|create\|update\|delete\|revoke\|assign\|manage)$` | **verb-extended**: same + `\|approve\|export` (via B's `permission_verb_extension` 0017) |
| `role_scope`              | `platform, tenant`                                                           | `platform, tenant` (+ possible extensions)                                               |
| `has_platform_permission` | `(citext) → bool`                                                            | `(citext) → bool`                                                                        |
| `has_permission`          | `(uuid, citext) → bool`                                                      | `(uuid, citext) → bool`                                                                  |
| Maturity                  | The canonical model; 52 perms seeded                                         | A **superset of verbs**, but on an abandoned lineage                                     |

**Finding:** the two identity models are **compatible at the interface** (same helper
signatures, same three-segment key rule, same scopes). B's only material difference is two
extra action verbs (`approve`, `export`). **Neither is "more authoritative" by merit** —
A is authoritative **because it is what production runs and what ADR-0001 blesses**, not
because B is inferior. The graph permissions (`graph.projection.read/manage`,
`graph.opportunity.read`) conform to **both** constraints. **[V]** If `approve`/`export`
verbs are ever wanted in A, they are a trivial forward-only additive migration — no
convergence blocker. **[V]**
