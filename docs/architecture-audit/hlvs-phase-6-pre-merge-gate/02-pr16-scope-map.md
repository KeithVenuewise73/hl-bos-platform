# PR #16 Scope Map

**Verified against the real `main` (`3fad20e`, Merge PR #15).**

## The headline correction

An earlier note (based on a stale local `main` ref pointing at PR #6) said PR #16 carries the whole platform since PR #6. **That was wrong.** The real `main` already contains PR #14 and PR #15, i.e. **migrations 0009–0027, HL-BTI, and the HLVS factory are already merged.**

**PR #16 contains ONLY the 5 Atlas commits — 67 files, +6785 / −0 (purely additive). It touches no migrations and no edge functions.**

## Categorized scope

Categories **A–D are already on `main`** (merged via PRs #13–#15) and are **NOT part of PR #16**. Categories **E–I are PR #16**.

| Cat                        | What                                             | In PR #16?       | Commit range | Files                          | DB impact                           | Runtime impact             | Security impact               | Deploy impact        | Risk         | Rollback                            |
| -------------------------- | ------------------------------------------------ | ---------------- | ------------ | ------------------------------ | ----------------------------------- | -------------------------- | ----------------------------- | -------------------- | ------------ | ----------------------------------- |
| **A** Pre-Atlas platform   | Spine 0001–0008, config, CI, control-center base | **No — on main** | ≤ PR #6/#13  | —                              | already applied                     | none                       | none                          | none                 | n/a (merged) | revert prior PRs                    |
| **B** HL-BTI               | `bti` schema, apps, engine                       | **No — on main** | PR #15       | —                              | already applied                     | none                       | none                          | none                 | n/a          | revert PR #15                       |
| **C** HLVS Factory         | `hlvs` schema, factory worker                    | **No — on main** | PR #15/CP8   | —                              | already applied                     | none                       | none                          | none                 | n/a          | revert                              |
| **D** Migrations 0009–0027 | events…bti                                       | **No — on main** | PRs #13–#15  | —                              | **already applied to canonical DB** | none                       | none                          | none                 | n/a          | per-migration rollback blocks exist |
| **E** Atlas Phase I        | Architectural assessment (12 reports)            | **Yes**          | `282633e`    | docs only                      | none                                | none                       | none                          | none                 | **None**     | `git revert`                        |
| **F** Atlas Phase II       | `@hl-bos/catalog` + catalog console              | **Yes**          | `d2e894a`    | pkg + app + docs               | none                                | new local read-only routes | read-only; localhost-only app | none (local console) | **Low**      | `git revert`                        |
| **G** Atlas Phase III      | Reconciliation (8 reports)                       | **Yes**          | `dd1fe47`    | docs only                      | none                                | none                       | none                          | none                 | **None**     | `git revert`                        |
| **H** Atlas Phase IV       | Factory engine + `/catalog/factory`              | **Yes**          | `42f66fc`    | pkg + app + docs               | none                                | new local read-only route  | read-only; localhost-only     | none                 | **Low**      | `git revert`                        |
| **I** Atlas Phase V        | Closeout docs + proposed migration `0029`        | **Yes**          | `eaa26dc`    | docs only (0029 under `docs/`) | none (proposed, not applied)        | none                       | none                          | none                 | **None**     | `git revert`                        |

## What PR #16 actually changes (67 files)

| Area                                      | Files | Nature                                                                                    |
| ----------------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `docs/architecture-audit/`                | 40    | Documentation (reports, screenshots, proposed migrations under `proposed/`)               |
| `packages/catalog/`                       | 17    | New pure package (`@hl-bos/catalog`) + tests — read-only logic, no I/O beyond a repo scan |
| `apps/control-center/`                    | 8     | New read-only catalog/factory routes + lib + UI; one nav link edit                        |
| `pnpm-lock.yaml`, `.hlbos/milestone.json` | 2     | Dependency lock + milestone state                                                         |

- **Database impact:** none. No migration or function changed; `supabase/migrations` stays at 27.
- **Runtime impact:** new **read-only** routes in the localhost-only console. Nothing deployed.
- **Security impact:** the catalog/factory routes are read-only; they inherit the console's existing localhost-only posture (see the access-control spec for the deployment implication).
- **Deploy impact:** none by merging. Deployment is a separate, gated activity.

## Is PR #16 safe to merge as one PR, or should it be divided?

**Safe to merge as a single integration PR.** It is 5 cohesive, additive commits (67 files, 0 deletions), all Atlas, CI-green, touching no migrations, functions, or production infrastructure. There is no correctness or security reason to split it, and splitting would fragment the program's narrative. **Do not split or rewrite history** (and per the mission, not without explicit approval).

## Rollback

Because the PR is purely additive and touches no schema or runtime, rollback is a clean `git revert` of the merge commit — no data migration, no downtime, no infrastructure change.
