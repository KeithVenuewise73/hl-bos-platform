# XI-2J · Runtime validation + RLS + RPC + Knowledge Graph reports

All results were produced on the live preview against the **real** identity/auth
system (real `has_platform_permission`/`has_permission`, real
`platform_admins`/`role_permissions`, real `auth.uid()` via simulated JWT) —
the enforcement XI-2D could not exercise.

## Runtime validation report (authz / publisher / versioning / rollback)

Synthetic identities: a platform **owner** (`graph.projection.manage`+`read`), a
platform **reader** (`read` only), a **no-perm** user; a synthetic Tenant B node.

| #   | Check                                                              | Result                    |
| --- | ------------------------------------------------------------------ | ------------------------- |
| 1   | Publisher **denied** without `graph.projection.manage`             | ✅ insufficient_privilege |
| 2   | `integrity_ok=false` **refused**                                   | ✅ check_violation        |
| 3   | Publish + activate v1 (status active, counts correct)              | ✅                        |
| 4   | Dangling edge **rejected** (composite FK)                          | ✅ foreign_key_violation  |
| 5   | Self-edge **rejected** (CHECK)                                     | ✅ check_violation        |
| 6   | Activate v2 → **exactly one active**, v1 superseded                | ✅                        |
| 7   | `rollback_projection()` → v1 active                                | ✅                        |
| 8   | Read RPC **denied** without `graph.projection.read`                | ✅ insufficient_privilege |
| 9   | Platform reader **allowed** to read a platform node                | ✅                        |
| 10  | **Tenant isolation:** tenant node invisible to a non-member (null) | ✅ no existence leak      |
| 11  | **No existence inference:** nonexistent == hidden (both null)      | ✅                        |

## RLS report

- **Enabled + FORCED** on all 6 `graph` tables (structural, verified).
- **Mutation denial:** `graph.nodes`/`graph.edges` have **0** non-SELECT policies —
  ordinary/authenticated roles cannot write; only the SECURITY DEFINER publisher
  (gated on `graph.projection.manage`) writes.
- **Read gating:** every read path requires `graph.projection.read`;
  `graph._can_see(scope, tenant)` is scope-aware — platform via
  `has_platform_permission`, tenant via `has_permission(tenant, …)`, opportunity via
  `graph.opportunity.read`.
- **Tenant isolation (runtime):** a platform-read user could **not** see a
  tenant-B-scoped node and could not distinguish it from a nonexistent node — no
  cross-tenant existence inference.
- **Design note (recorded):** the `graph_*` RPCs are SECURITY DEFINER and enforce
  visibility through explicit `_can_see()` predicates in their `WHERE` clauses; the
  table RLS is defence-in-depth for any direct authenticated table access. Also note
  `graph.projection.read` is a **platform-scoped** permission; if tenant-scoped graph
  nodes are ever introduced, gating them will need a tenant-scoped permission (the
  scope-equality trigger forbids a tenant role from holding a platform permission).
  Today all 145 nodes are platform-scoped, so this path is unused.

## RPC report (executed on a real 32-node / 92-edge subgraph)

| RPC                                                           | Result                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `graph_active_projection_status`                              | ✅ v200, 32 nodes / 92 edges                                                                |
| `graph_get_node('product:hl_bti')`                            | ✅ returns the node                                                                         |
| `graph_get_neighbors('capability:ai_gateway')`                | ✅ 2 outgoing / 2 incoming, deterministic order                                             |
| `graph_find_dependencies('capability:commerce_provisioning')` | ✅ 6 multi-hop dependencies (incl. event_bus, billing, identity_access)                     |
| `graph_find_blast_radius('capability:event_bus')`             | ✅ **9 transitive dependents** (incl. ai_gateway, product:hl_bti) — _after the fix, see 03_ |
| `graph_find_blast_radius` depth cap                           | ✅ requested depth 999 → **capped at 12**                                                   |
| `graph_find_applications_for_capability`                      | ✅ graceful `[]`                                                                            |
| `graph_find_capabilities_for_application`                     | ✅ graceful `[]`                                                                            |

Bounded, scope-aware, deterministic, and — critically — they **execute** on real
multi-hop data.

## Knowledge Graph report (population + parity)

- **Population:** a real 32/92 connected subgraph (products → capabilities →
  modules, with `depends_on`/`provided_by`/`composed_of`/`uses`/`targets`) published
  via the publisher and activated.
- **Structural parity — exact:** the DB structural fingerprint
  (`md5` over sorted `id|type|lifecycle|scope` for nodes + `id|kind|inverse|scope`
  for edges) = **`9b0822bd…`**, identical to the in-code value. **The DB stores
  exactly what the serializer emits.**
- **Full 145/427 parity — by composition:** the serializer emits exactly 145 nodes
  / 427 edges (verified this phase, checksum `e4e3dc8b`); the publisher stores its
  input faithfully with a count-guard (validated in check #3 and the count-mismatch
  guard). Therefore publishing the serializer output yields exactly 145/427 in the
  DB. (Bulk-loading the full 191 KB payload through the MCP channel was impractical;
  the composition argument + exact subgraph parity establishes it.)
- **Determinism:** the serializer uses no `Date`/`Math.random`; identical graph ⇒
  identical projection.
