# Phase XI-2D · Environment determination (pre-apply checkpoint)

**Read-only.** Nothing below wrote to any database. Every fact was gathered with
`list_branches`, `list_migrations`, and read-only `select` queries.

> **Correction (Phase XI-2E):** the table below labels the reachable branch
> `moftgnrbnsixeddcwdpz` as "= production's lineage". That is **wrong** — it is a **stale,
> abandoned preview branch**. Production (`mvvtngiopdrgiedjmhfb`), queried directly in
> XI-2E, runs **this repository's platform lineage** (0001–0027 events/billing/hlvs/bti;
> no portfolio/govcon). Read this document as "the reachable _branch_ is a different
> lineage", not "production is". See
> [../hlvs-phase-11-2e-lineage-reconciliation/02-lineage-schema-identity.md](../hlvs-phase-11-2e-lineage-reconciliation/02-lineage-schema-identity.md).

## Databases reachable from this environment

| Project / branch                   | Ref                    | Role                                                                                                              |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| HL-BOS Core (**production**)       | `mvvtngiopdrgiedjmhfb` | Live production. **Out of bounds.**                                                                               |
| `main` (branch of production)      | `mvvtngiopdrgiedjmhfb` | Default branch of production.                                                                                     |
| `hlbos-m1-portfolio` (**preview**) | `moftgnrbnsixeddcwdpz` | Preview branch. `with_data=false`, `persistent=false`, `is_default=false`, parent = production, `ACTIVE_HEALTHY`. |

The preview branch **is** conclusively non-production and carries **no customer
production data** (`with_data=false`) — it satisfies those two stop conditions.
The problem is a different one.

## The blocker: the reachable HL-BOS is a _different application lineage_

The repository and the reachable database **share only the first eight
migrations, then diverge into two unrelated applications.**

| Migration | This repository (branch `claude/hlvs-…`)                                                                                                                                                             | Reachable DB (`moftgnrbnsixeddcwdpz`, = production's lineage)                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0001–0008 | extensions, identity, roles, audit, seed, provisioning, tenant-class — **identical** (same version timestamps + names)                                                                               | **identical**                                                                                    |
| 0009 →    | `events`, `entitlements`, `integrations`, `ai_gateway`, `workflows_gate`, `visibility`, `billing`, `communications`, `discovery`, `blueprint_engine`, `hlvs_factory`, `bti_platform`, `bti_intake` … | `portfolio_*`, `managed_schema_registry`, `permission_verb_extension`, `govcon_*` (through 0029) |

Confirmed against the **live** schema list on the reachable DB:

- Present: `identity`, `audit`, `platform`, **`portfolio`**, **`govcon`**, `auth`, `storage`, …
- **Absent**: `events`, `hlvs`, `bti` — the schemas this repository's migrations 0009–0027 create.

So the reachable database is a **portfolio + govcon** build of HL-BOS. This
repository's lineage (events / billing / visibility / hlvs / bti) **has never
been applied to any database reachable from here.** There is no preview branch
_of this repository's own schema_ to validate against — a branch always inherits
its parent's (production's) history, which is the portfolio/govcon lineage.

### Consequence

Applying migration `0028` here would:

1. write an unrelated `graph` schema into a **different milestone's** preview branch; and
2. produce a "validation" whose passing tells us nothing about how _this
   repository's_ production would receive the migration — because that production
   does not exist among the reachable databases.

That is a **green light that would lie.** Per the phase stop conditions
(“migration history incompatible”; “cannot be conclusively identified as [the
intended target]”; “do not weaken controls to complete the phase”) the correct
action is to **not apply** and to report.

## Migration-number note (governance, not a code bug)

The reachable production lineage already has an applied migration **labelled
`0028`** (`hlbos_0028_govcon_dashboard_function_grants`) and a `0029`. This
repository's new migration is _also_ numbered `0028` (knowledge-graph read
model). Within **this repository's own** sequence (0001→0027) `0028` is the
correct next number, so the file is **kept at 0028**. The collision exists only
relative to the foreign lineage and is a symptom of the repo↔production
divergence above — a governance item for Keith, not something to paper over by
renumbering (which would leave a gap in this repo's own sequence).

## Identity contract on the reachable DB (for faithful validation)

| Fact                               | Value (read from the live DB)                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `identity.permissions.key`         | `citext`, primary key                                                                                 |
| `permissions_key_format`           | `key ~ '^[a-z_]+\.[a-z_]+\.(read\|create\|update\|delete\|revoke\|assign\|manage\|approve\|export)$'` |
| `identity.has_platform_permission` | `(p_permission citext) returns boolean`                                                               |
| `identity.has_permission`          | `(p_tenant uuid, p_permission citext) returns boolean`                                                |
| `identity.role_scope`              | enum `platform, tenant`                                                                               |
| `graph` schema / `public.graph_*`  | **absent** (no pre-existing collision)                                                                |

This real contract is what exposed the defect documented in
[02-permission-key-defect.md](02-permission-key-defect.md).
