# Phase XI-2D · Permission-key defect (found, fixed, re-validated)

## What was wrong

Migration `0028` seeded three permissions:

```sql
('graph.read',              …, 'platform'),   -- ❌ two segments
('graph.opportunity.read',  …, 'platform'),   -- ✅ three segments
('graph.manage',            …, 'platform')    -- ❌ two segments
```

The platform froze a permission-key format in migration `0003` (and the reachable
production lineage kept it, adding only two verbs):

```
key ~ '^[a-z_]+\.[a-z_]+\.(read|create|update|delete|revoke|assign|manage|approve|export)$'
```

Keys **must be three-segment `domain.resource.action`**. `graph.read` and
`graph.manage` have two segments — they **violate the CHECK constraint**. The
very first `insert into identity.permissions` in the migration would raise
`check_violation` on any real HL-BOS identity schema. The migration, as shipped
in XI-2C, **could not have applied to a real database.**

### Why XI-2C's local validation missed it

XI-2C validated on a throwaway Postgres cluster with a **stubbed** `identity`
schema that did **not** carry the `permissions_key_format` constraint. The stub
was more permissive than reality, so the malformed keys inserted cleanly and the
run went green. This is precisely the failure mode Phase XI-2D exists to
catch — “real identity differs materially from local stubs.”

## Proof against the real constraint (read-only, wrote nothing)

Run against the live constraint pattern pulled from `moftgnrbnsixeddcwdpz`:

| Key                       | Passes real constraint |
| ------------------------- | ---------------------- |
| `graph.read`              | **false**              |
| `graph.manage`            | **false**              |
| `graph.opportunity.read`  | true                   |
| `graph.projection.read`   | true                   |
| `graph.projection.manage` | true                   |

## The fix

| Before                   | After                         |
| ------------------------ | ----------------------------- |
| `graph.read`             | `graph.projection.read`       |
| `graph.manage`           | `graph.projection.manage`     |
| `graph.opportunity.read` | _(unchanged — already valid)_ |

Applied everywhere the keys appear: the permission seed, the `projections`
read policy, `graph._can_see` (platform + tenant branches), `graph._require_manage`,
and all seven `public.graph_*` RPC guards. No TypeScript, portal, or pgTAP code
referenced the literal keys, so nothing else changed. Migration number unchanged
(0028).

## Re-validation on a **constraint-faithful** local cluster

A fresh throwaway Postgres 16 cluster, this time with an identity stub that
carries the **real** `citext` key, `role_scope` enum, `has_*` signatures, and the
**real `permissions_key_format` constraint**. The corrected migration applied in
full, then:

| #   | Check                                                              | Result  |
| --- | ------------------------------------------------------------------ | ------- |
| T1  | Seeds exactly the 3 valid three-segment permissions                | ✅ PASS |
| T2  | `publish_projection` denied without `graph.projection.manage`      | ✅ PASS |
| T3  | `integrity_ok=false` refused                                       | ✅ PASS |
| T4  | Publish + activate v1 (2 nodes / 1 edge), status correct           | ✅ PASS |
| T5  | Dangling edge rejected (composite FK)                              | ✅ PASS |
| T6  | Self-edge rejected (CHECK)                                         | ✅ PASS |
| T7  | Activate v2 → exactly one active = v2, v1 superseded               | ✅ PASS |
| T8  | `rollback_projection` → one active = v1                            | ✅ PASS |
| T9  | Read RPC denied without `graph.projection.read`                    | ✅ PASS |
| T10 | `graph_find_capabilities_for_application` returns `[capability:c]` | ✅ PASS |

And the negative control — the same faithful harness **rejects the original
key** and **accepts the corrected key**:

```
insert … values ('graph.read', …)            -> ERROR: violates check constraint "permissions_key_format"
insert … values ('graph.projection.read', …) -> INSERT 0 1
```

The hardened harness would have caught the XI-2C defect. The throwaway cluster
was destroyed after the run.

## Honest limitation of the local run

Running as a superuser **bypasses RLS**, so the row-level policies themselves
(`nodes_select` / `edges_select` via `_can_see`) were _not_ exercised here; only
the function-level permission gates (which are explicit `has_platform_permission`
checks inside the publisher and RPCs) were. True RLS enforcement, real
`has_permission` role wiring, and tenant-isolation behaviour must be verified on
a real Supabase environment of **this repository's own lineage** — which, per
[01-environment-determination.md](01-environment-determination.md), is not
reachable today.
