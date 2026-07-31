# Phase XI-2J · Knowledge Graph Preview Validation — Final report

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Migration 0028 was validated on a disposable preview cut from production. Production was NOT modified. No merge, no production deploy. The preview branch was deleted afterward.**

Annexes: [01-migration-and-provisioning.md](01-migration-and-provisioning.md) · [02-runtime-security-rpc.md](02-runtime-security-rpc.md) · [03-rollback-portal-and-bug.md](03-rollback-portal-and-bug.md)

---

## In plain language

I created a **throwaway copy** of the real production database, applied the Knowledge
Graph change (0028) to it only, and tested it under real conditions — the security
checks, the graph queries, publishing, and rollback. **It works** — and the testing did
its job: it **caught a real bug** in one of the graph queries that every earlier check
had missed, because no earlier test actually _ran_ the queries. I fixed the bug, proved
the fix on the copy and independently on a local database, and added a test so it can't
come back. Then I deleted the copy so it stops costing anything. Production was never
touched.

## What was validated (all against the REAL identity/security system)

| Area                                       | Result                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Migration apply**                        | ✅ 0028 applies; 11/11 structural checks pass (schema, tables, vocab, permissions, RLS forced, mutation denial, RPC grants) |
| **Runtime authorization**                  | ✅ 11/11 — publisher gated on real `graph.projection.manage`; reads gated on real `graph.projection.read`; anon denied      |
| **Tenant isolation**                       | ✅ a non-member cannot see (or infer the existence of) a tenant-scoped node                                                 |
| **Publisher / versioning**                 | ✅ publish → activate → exactly one active → rollback; integrity-false, dangling-edge, self-edge all rejected               |
| **RPCs (executed on real 32/92 subgraph)** | ✅ all 7 execute; multi-hop dependencies & blast-radius correct; depth capped at 12                                         |
| **Graph parity**                           | ✅ DB structural fingerprint = in-code exactly; full 145/427 established by composition                                     |
| **Rollback**                               | ✅ projection rollback + the migration `-- rollback:` block (schema fully removed, foundation intact)                       |
| **Executive Portal surface**               | ✅ the capability-graph & dependency-graph RPCs the portal uses are functional & gated (portal itself undeployed)           |

## The bug — found, fixed, guarded (disclosed)

`graph_find_blast_radius` shipped with an **ambiguous-column error** (`column "n" is
ambiguous`) that made it fail for any node with dependents. **No prior test ever executed
the RPCs** — they were checked for existence/grants but never called. I fixed the query,
verified it on the preview and on a local Postgres cluster, and added a pgTAP test that
**executes** all five read RPCs so this can't recur. Detail: [03](03-rollback-portal-and-bug.md).

## Production-readiness assessment

**Migration 0028 is READY FOR PRODUCTION MIGRATION — pending executive approval to apply.**

- The graph **operates correctly** under real runtime conditions (authz, RLS, RPCs,
  versioning, rollback) — validated on a faithful copy of production.
- The one **bug** found is **fixed** and now covered by a regression test.
- The lineage is **already reconciled** (XI-2I): production is at `0027`, repo and
  production identities match, and `0028` is the correct next migration.
- **Two honest caveats** (neither blocks the apply):
  1. Supabase's **branch provisioner** mis-orders our migrations when building a full
     clone from scratch (it failed at 0019→0013). This affects _creating preview
     branches_, **not** the production apply — `supabase db push` applies the single
     pending `0028` in order onto the existing `0001–0027`. Noted for future previews.
  2. The blast-radius fix **changes 0028's content** (its checksum); the lineage
     manifest reflects it. 0028 is now the runtime-validated version.

**Gates:** `pnpm format:check` / `lint` / `typecheck` / `check-migrations` / `lineage`
clean; **tests 247/247**; pgTAP regression test added (CI-run). 0028 remains
`notYetApplied` in the registry until the approved production apply.

## Outputs (against the phase brief)

| #   | Output                          | Location                               |
| --- | ------------------------------- | -------------------------------------- |
| 1   | Migration report                | [01](01-migration-and-provisioning.md) |
| 2   | Runtime validation report       | [02](02-runtime-security-rpc.md)       |
| 3   | RLS report                      | [02](02-runtime-security-rpc.md)       |
| 4   | RPC report                      | [02](02-runtime-security-rpc.md)       |
| 5   | Knowledge Graph report          | [02](02-runtime-security-rpc.md)       |
| 6   | Executive Portal validation     | [03](03-rollback-portal-and-bug.md)    |
| 7   | Rollback validation             | [03](03-rollback-portal-and-bug.md)    |
| 8   | Production readiness assessment | this file                              |
| 9   | Final Phase XI-2J report        | this file                              |

## CEO decisions required

1. **Arm the gated migration workflow** (`SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`
   - a `production` GitHub Environment with required reviewers) — the trust decision that
     unlocks the apply path.
2. **Approve applying migration 0028 to production** via the reviewer-gated `db-migrate`
   workflow (forward-only; only `0028` pending).
3. Later/optional: publish the first production projection and wire the (to-be-deployed)
   Executive Portal `/graph` view to the live RPCs.

## Next-phase recommendation (do not begin)

**Phase XI-2K — Gated production apply of 0028** (after arming), then publish + activate
the first production projection and confirm `graph_active_projection_status()` parity.
Executive Portal live wiring follows portal deployment.

## What remains untouched

Production was **not** modified (0028 applied only to the deleted preview branch). No
merge, no production deploy, no DNS, no secrets. The stale `hlbos-m1-portfolio` branch
remains (archived; deletion still pending your approval). Production is exactly as found
(27 migrations, single bootstrap owner, no customer data).
