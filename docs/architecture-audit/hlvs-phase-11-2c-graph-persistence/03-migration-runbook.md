# Migration & Deployment Runbook — Knowledge Graph read model (0028)

**Nothing in this runbook has been executed against any remote/production project.** The migration was created and validated on a throwaway LOCAL Postgres cluster only. ⚙️ = Claude can execute after approval · 🔑 = requires CEO authorization.

> **Corrected by Phase XI-2D.** Permission keys were `graph.read` / `graph.manage` (invalid — two-segment) and are now `graph.projection.read` / `graph.projection.manage`. Also: the reachable HL-BOS production is a **different application lineage** (portfolio/govcon) than this repository, so there is no in-lineage preview to apply against yet. See [../hlvs-phase-11-2d-preview-validation/README.md](../hlvs-phase-11-2d-preview-validation/README.md).

## What the migration does

`supabase/migrations/…_0028_knowledge_graph_read_model.sql` creates the internal `graph` schema: vocabulary tables, `projections`/`nodes`/`edges`, RLS (enable+force, read-only for authenticated), three `graph.*` permissions, the SECURITY DEFINER publisher (`publish_projection`, `activate_projection`, `rollback_projection`, `record_failed_projection`, `cleanup_superseded`), and read-only `public.graph_*` RPCs.

## Pre-apply checks (all green locally)

| Check                                  | Result                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| Applies on Postgres 16                 | ✅ (local throwaway cluster)                                    |
| Publisher inserts + count verification | ✅ v1 published (2 nodes / 1 edge), activated                   |
| Dangling edge rejected (FK)            | ✅                                                              |
| Self-edge rejected (CHECK)             | ✅                                                              |
| Integrity-false refused (guard)        | ✅                                                              |
| Atomic activation (one active)         | ✅ v2 activated, v1 superseded                                  |
| Rollback                               | ✅ rolled back to v1                                            |
| pgTAP structural suite                 | authored (`supabase/tests/28_knowledge_graph.sql`) — runs in CI |

## Apply sequence (when authorized — NOT done here)

| #   | Step                                                                                                                                                                                                                           | Who                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 1   | Review migration `0028` + pgTAP in the PR                                                                                                                                                                                      | 🔑                        |
| 2   | CI applies `0028` to a **preview/branch** DB and runs pgTAP                                                                                                                                                                    | ⚙️ (CI)                   |
| 3   | Grant `graph.projection.read` / `graph.projection.manage` to the intended platform roles                                                                                                                                       | 🔑                        |
| 4   | Publish the first projection: call `graph.publish_projection(1, 'kg-0.1.0', <commit>, <checksum>, true, <nodes>, <edges>)` from a controlled admin path (payload from `serializeGraph()`), then `graph.activate_projection(1)` | 🔑 authorize / ⚙️ execute |
| 5   | Verify `public.graph_active_projection_status()` returns node/edge counts matching the in-code graph (parity)                                                                                                                  | ⚙️                        |
| 6   | (Production) apply `0028` to HL-BOS Core **only after** preview acceptance                                                                                                                                                     | 🔑                        |

## Rollback

- **Schema:** `0028` is additive (new schema + functions); rollback = drop the `graph` schema + the three permissions + the `public.graph_*` functions (a `down` migration can be authored on request). No existing object is altered.
- **Projection:** `select graph.rollback_projection();` reactivates the previous successful projection atomically. `graph.cleanup_superseded(keep)` prunes old versions safely.

## Hard gates (cannot pass without)

1. **CEO approval to apply** (steps 1, 6) — no remote apply without it.
2. **Role provisioning** (step 3) — until `graph.projection.read` is granted, RPCs deny (fail-closed).
3. **Parity confirmation** (step 5) — the persisted graph must match the in-code graph.

## What Claude will NOT do without approval

Apply the migration to any remote/preview/production project, publish a projection to a remote DB, grant permissions in production, schedule an automatic refresh, or expose any graph write path to consumers.
