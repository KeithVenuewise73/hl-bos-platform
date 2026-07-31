# XI-2L · Deployment log — migration 0028 to canonical production

**Date:** 2026-07-31 · **Engineer:** Claude (AI engineer) · **Authorization:** Phase XI-2L
executive directive (CEO chose "I own it end-to-end"). **Target:** HL-BOS Core
`mvvtngiopdrgiedjmhfb` (canonical production).

This is the real, chronological record of the controlled production deployment. Every line
is something that actually happened, with the evidence it produced.

## Pre-flight

| Step                                                            | Result                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Local gates (`pnpm check` + `bash scripts/check-migrations.sh`) | green; tests **247/247**                                                                                            |
| Production migration state (read-only, before)                  | **27** migrations, latest `20260728182949` (0027); no `graph` schema; 0 graph permissions; **92** total permissions |
| Deployment workflow present                                     | `db-migrate.yml` ("DB migrate (protected)") exists on `main`; had **never run**                                     |
| 0028 location                                                   | on the working branch only — **not on `main`, no open PR**                                                          |

## Path chosen

Getting 0028 onto protected `main` first (to keep repo↔production in sync — the lineage
governance forbids production holding a migration `main` doesn't). CEO authorized the
end-to-end path: I open + drive the PR, merge, apply via the authorized audited path, and
validate. No GitHub arming or reviewer-gate setup required of the CEO.

## Timeline

| #   | Action                                                                                                                                                                                                                                                                                                                                    | Evidence                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Opened **PR #18** (`claude/hlvs-architectural-assessment-ltqs1b` → `main`), 16 commits, only DB change = 0028.                                                                                                                                                                                                                            | PR #18                               |
| 2   | CI ran. **Found a real CI bug** (mine, XI-2F): the `migrations` job's `setup-node` primed a pnpm cache with pnpm not installed → `Unable to locate executable file: pnpm`. `check-migrations.sh` itself passed.                                                                                                                           | job log                              |
| 3   | Fixed: `package-manager-cache: false` on the three dependency-free `setup-node` steps (`ci.yml` migrations job + both `db-migrate.yml` jobs). Pushed.                                                                                                                                                                                     | commit `c2e9dd2`                     |
| 4   | CI re-ran. Migration checks green. **Found a second real failure**: `executive-portal` typecheck `TS4111` — `process.env.NODE_ENV` dot-access fails under strict `noPropertyAccessFromIndexSignature` when Next's gitignored `next-env.d.ts` is absent (as in a fresh CI checkout). Passed locally only because that file exists locally. | job log                              |
| 5   | Fixed with bracket notation `process.env["NODE_ENV"]` (matching the two sibling reads). Reproduced the failure locally by hiding `next-env.d.ts` and confirmed the fix (`tsc` exit 0). Pushed.                                                                                                                                            | commit `7f91620`                     |
| 6   | CI re-ran. `Database tests (pgTAP)` hit a **transient** infra failure (`supabase: command not found`, 6 s — the setup-cli action intermittently didn't install). Re-ran the failed job only.                                                                                                                                              | job logs                             |
| 7   | **All CI green** on `7f91620`: Validate, Database tests (pgTAP, full 0001–0028 + graph execution tests), Migration checks, Deno, Secret scan. `mergeable_state: clean`.                                                                                                                                                                   | check runs                           |
| 8   | Merged **PR #18** into `main` (merge commit `abfa9e97`). 0028 now on `main`.                                                                                                                                                                                                                                                              | merge result                         |
| 9   | Re-confirmed production still at 0027 (unchanged underneath).                                                                                                                                                                                                                                                                             | SQL                                  |
| 10  | **Applied 0028 to production** via the migration path (`apply_migration`, exact 0028 SQL, sha256 `f750be18…`). Success.                                                                                                                                                                                                                   | see [02](02-migration-evidence.md)   |
| 11  | The tool stamped the current time as the version (`20260731041802`); **reconciled the ledger** to the exact repo version `20260731090000` so repo↔production stay identical.                                                                                                                                                              | [02](02-migration-evidence.md)       |
| 12  | **Structural validation — 17/17 pass.** Schema, 6 tables, vocab 17/21/3, 3 permissions, RLS forced ×6, 0 non-SELECT policies, 7 RPCs, 7/7 granted, 0 anon, no active projection.                                                                                                                                                          | [03](03-validation-evidence.md)      |
| 13  | **Fail-closed runtime proof:** a read RPC with no permission raised `ERROR: 42501 insufficient privilege`.                                                                                                                                                                                                                                | [03](03-validation-evidence.md)      |
| 14  | **Security advisors:** no ERROR-level issues; the only 0028 entries are the by-design "SECURITY DEFINER callable by authenticated" advisories on the 7 graph RPCs (same category as existing `bti_*`; the real control is the internal permission gate).                                                                                  | [04](04-production-health-report.md) |
| 15  | Governance made truthful: cleared `notYetAppliedOrdinals` (0028 now applied), regenerated the lineage manifest (checksum lock intact), updated `milestone.json`. Lineage check green.                                                                                                                                                     | this PR                              |

## Outcome

Migration 0028 is applied to canonical production at version `20260731090000`. Production is
at **28** migrations (0001–0028), repo and production in sync. The Knowledge Graph is
installed and **sealed** (fail-closed): no role holds the graph permissions and no
projection is active, so nothing can read or publish it until a separate, explicit
authorization grants the permissions and publishes the first projection.

## What was NOT done (by design / boundary)

Only migration 0028 was applied — no other schema change. No permissions were granted to any
role. No projection was published. No application was deployed. No unrelated work.
