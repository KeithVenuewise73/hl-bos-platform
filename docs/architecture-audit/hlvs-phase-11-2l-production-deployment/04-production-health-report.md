# XI-2L · Production health report — post-deployment

Health assessment of canonical production (`mvvtngiopdrgiedjmhfb`) after applying migration
0028, from the Supabase **security advisors** plus the structural/runtime checks in
[03-validation-evidence.md](03-validation-evidence.md).

## Headline

**Healthy. Migration 0028 introduced no ERROR-level issues and no new class of finding.**
The only advisories attributable to 0028 are seven instances of a single **by-design**
pattern already present on the platform.

## Security advisors — 0028 attribution

| Advisory                                                                                | Level | From 0028? | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticated_security_definer_function_executable` on the **7 `public.graph_*` RPCs** | WARN  | **Yes**    | **By design.** The RPCs are `SECURITY DEFINER` and enforce authorization _inside_ the function (`identity.has_platform_permission('graph.projection.read')`), proven fail-closed in [03](03-validation-evidence.md). This is the same intentional pattern as the pre-existing `bti_*` RPCs. The generic linter flags every SECURITY DEFINER function callable by `authenticated`; the actual control is the internal gate. **No action** — revoking EXECUTE would break legitimate authorized reads. |
| `rls_enabled_no_policy` on `ai.guardrails`, `integrations.webhook_events`               | INFO  | No         | Pre-existing tables from earlier migrations. Not touched by 0028.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `function_search_path_mutable` on `hlvs.non_exceptionable_rules`                        | WARN  | No         | Pre-existing. **Note:** all 0028 graph functions correctly pin `search_path = ''`, so none appear here.                                                                                                                                                                                                                                                                                                                                                                                              |
| `extension_in_public` (`pgtap`)                                                         | WARN  | No         | Pre-existing test extension.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `authenticated_security_definer_function_executable` on `bti_*` (5 functions)           | WARN  | No         | Pre-existing (Phase VIII); same intentional pattern as the graph RPCs.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `auth_leaked_password_protection` disabled                                              | WARN  | No         | Pre-existing Auth configuration choice.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**No `rls_enabled_no_policy` for any `graph` table** (all six carry the intended SELECT
policies). **No `function_search_path_mutable` for any `graph` function** (all pinned).
**No `security_definer_view`, no ERROR-level findings.**

## Structural / integrity health

- Foundation `0001–0027` **intact** — 0028 is additive to an isolated `graph` schema and
  altered nothing pre-existing (total non-graph permissions unchanged; migration set
  contiguous).
- RLS **enabled and forced** on all six graph tables; only SELECT policies exist; the sole
  write path is the `graph.projection.manage`-gated SECURITY DEFINER publisher.
- The feature is **sealed**: 0 role grants, 0 projections, no active projection. Attack
  surface today is effectively nil — the RPCs deny everyone until permissions are granted.

## Lineage / governance health

- Repo ↔ production agree on `0001–0028` at identical versions (no drift).
- `pnpm lineage` green; checksum lock intact (`f750be18…`).

## Recommendation (informational — not part of this phase)

The seven graph-RPC advisories are expected and safe to accept as-is (documented design). If
the platform later wants to silence this specific linter across the board, the option is to
move the `graph_*`/`bti_*` RPCs behind a dedicated RPC schema or add explicit acceptance
annotations — a cosmetic, platform-wide decision, **not** a fix and **not** a blocker.

**Production health: verified good. No remediation required for this deployment.**
