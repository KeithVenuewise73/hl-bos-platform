# Revenue Center — Phase 8: pilot preparation, reconciliation and approvals

2026-11-05. Labels: **VERIFIED** (run or read by me, output seen), **DOCUMENTED** (Supabase
docs, not tested), **NOT VERIFIED**, **ESTIMATE**.

**Not release-ready.** Every database result here is from PostgreSQL 16 stand-ins and
read-only production reads. Nothing ran on real PostgreSQL 17 with Supabase Auth, PostgREST
and real pgTAP, because creating an environment for that costs money and has not been approved.

## Completed in this phase

| Done                                                                                                                                | Proof                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Exact cost and clean-up for a temporary Supabase branch, read from the org and the docs; nothing created                            | §1                                                                          |
| All 20 replay hazards **measured**: each one replayed on the production-equivalent copy, plus a simulated `db push`                 | `scripts/local-test/replay-hazard-matrix.sh`; §3                            |
| Production state of every object the hazards touch compared by hash against production (read-only)                                  | 11/11 identical; §3                                                         |
| Security packages tested role by role, with rollbacks                                                                               | `security-packages.db.test.ts` 6/6; §4                                      |
| **New finding:** the public (anon) key can read the JobScout shortlist today                                                        | catalog privileges, VERIFIED; §4                                            |
| #114 mock-delivery guard implemented in a coordinated draft PR, **#116** → `feat/salonos-v1`                                        | the old function fails 3 of the new checks; full suite 844 → 848, 0 failing |
| Owner pilot in the console: HL-BOS sign-in, pilot-safety panel, error log                                                           | 17 unit tests; page run against the development database; screenshots below |
| Corrected my own earlier error: the legacy SEC-1 project is `bkfsjhhclbqrhaolvhmz` (Herman Legacy Business Platform), not Venuewise | README + security README fixed                                              |

## 1. Temporary Supabase branch — exact cost and approval (VERIFIED/DOCUMENTED)

| Item                          | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization                  | Herman Legacy Software Ventures (`ihtsbcxtvkbfkkpmforp`), **Pro plan** (VERIFIED)                                                                                                                                                                                                                                                                                                                                                                                           |
| Price                         | No fixed fee. Micro compute **$0.01344 per hour**, every started hour billed in full. Disk inside the plan's included 8 GB: $0. Egress: usage-based, negligible for tests (DOCUMENTED)                                                                                                                                                                                                                                                                                      |
| Not covered by                | The **spend cap** and the monthly **compute credits**. It is always an extra charge (DOCUMENTED)                                                                                                                                                                                                                                                                                                                                                                            |
| Validation window             | 24 h ≈ **$0.32** · 48 h ≈ **$0.65** · 7 days ≈ **$2.26** · if forgotten, ≈ $9.81/month (ESTIMATE from the hourly price)                                                                                                                                                                                                                                                                                                                                                     |
| What you get                  | A separate PG17 database with real Auth, PostgREST, Storage and edge runtime. Production **data is not copied** (DOCUMENTED, `with_data: false`)                                                                                                                                                                                                                                                                                                                            |
| Clean-up                      | Delete the branch when validation ends; billing stops at deletion (DOCUMENTED). Nothing to remove in production                                                                                                                                                                                                                                                                                                                                                             |
| **Catch I found**             | A new branch replays **production's migration history**. Nine of production's 111 history rows are comment-only stamps (0009–0017), so a fresh branch would be **missing those schemas** and would not be production-equivalent (VERIFIED for the stamps; the branch behaviour is DOCUMENTED, not tested). The approved scope must include rebuilding it the way the local copy is built (stamps replaced by their source), then comparing it to the production fingerprint |
| Existing `hlbos-m1-portfolio` | Kept, not touched. PG 17.6; 8 users, all `@test.local`, none ever signed in; 16 MB; its own 29-row history (last 2026-07-20), unrelated to production's (VERIFIED). **Running since 2026-07-19 ≈ 2,611 hours ≈ $35 so far** at Micro (ESTIMATE; compute size not read). Not usable at no extra cost: validation would mean applying migrations to it (needs approval) and resetting its divergent history (destroys its contents)                                           |

**Approval needed:** "Create a temporary branch of HL-BOS Core for up to N days (≈ $0.32/day),
build the production-equivalent schema on it, run the validation, then delete it." Optionally,
reuse `hlbos-m1-portfolio` instead (no new cost, but its test contents would be erased).

## 2. Real PostgreSQL 17 validation — NOT RUN

No approved environment exists. The only PG17 facts are read-only production reads (VERIFIED):
server 17.6; `E'\v'` is a vertical tab (ASCII 11, unlike PG16); citext 1.6 compares
case-insensitively on the default path; pgtap 1.3.3, pg_net 0.20.3, pg_cron 1.6.4 and
supabase_vault 0.3.1 are installed. These do **not** validate the Revenue Center. Still open:
Auth, PostgREST, real pgTAP, the migration, owner sign-in, HLD/HSCS isolation, approval
controls, API grants, rollback.

## 3. Ledger reconciliation matrix (20 hazards)

**How it was measured:** `scripts/local-test/replay-hazard-matrix.sh`. It replays main's file
alone, in one transaction, on the production-equivalent copy, then simulates a whole push.
Function logic is compared with comments and whitespace ignored.

**Production state:** the 11 functions these files touch were hashed read-only in production.
All 11 are **identical** to the production-equivalent copy. Main's end state has the **same
logic** as production for all 11; only comments differ (VERIFIED).

**What a plain `supabase db push` would do today (VERIFIED on the copy):**

1. Replay 0029–0039 under main's version numbers. 0034–0038 briefly revert Venture Studio
   scoring to older logic, and 0039 restores it.
2. **Stop at 0040** ("constraint already exists"), so the 6 genuinely new migrations never run.
3. Leave production's history holding duplicate entries under two numbers.

Effects on production **data** during the replay are NOT VERIFIED, because the copy has no data.
Rows that would be written do have `on conflict` guards (0029, 0033) or are idempotent updates (0036).

### The 6 hazards whose SQL differs

| #    | Production version (file)                                           | Main file                   | Difference (VERIFIED)                                                                         | Replay alone                                  | Proposed ledger action                                  |
| ---- | ------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| 0032 | `20260818203419` (recovered `…0032_vstudio_discovery_metadata.sql`) | `20260818210000`            | main adds `create extension if not exists pg_trgm`; production already has pg_trgm 1.6        | succeeds, changes nothing                     | mark `20260818210000` applied                           |
| 0034 | `20260820012431` + `0034r01` `…013335` + `0034r02` `…013903`        | `20260820140000`            | main folds the two production refinements (core terms, two-term rule) into one file           | succeeds; **reverts `score_level1` logic**    | mark applied (production already has the final logic)   |
| 0035 | `20260820012941`                                                    | `20260820160000`            | main's portfolio scoring uses the refined core/supporting terms                               | succeeds; **reverts `build_portfolio` logic** | mark applied                                            |
| 0039 | `20260820152634`                                                    | `20260820240000`            | main (519 lines) re-creates 7 scoring functions in final form; production's 0039 was 52 lines | succeeds; logic equal to production           | mark applied                                            |
| 0044 | `20260820171812` (0044a) + `20260820171902` (0044b)                 | `20260820340000` (one file) | production split it into vocabulary + function                                                | succeeds; logic equal to production           | mark applied; the RENAMED map already prevents a re-run |
| 0046 | `20260826160814`                                                    | `20260826120000`            | one function comment's wording ("Marks the post publishing.", absent in production)           | **fails** (trigger exists)                    | mark applied                                            |

### The 14 hazards with identical SQL

| #    | Production version | Main version   | Replay alone                                                                                                                                                   |
| ---- | ------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0029 | 20260801233354     | 20260801120000 | succeeds, no change                                                                                                                                            |
| 0031 | 20261007005544     | 20260804120000 | succeeds, no change                                                                                                                                            |
| 0033 | 20260820011152     | 20260820120000 | succeeds, no change                                                                                                                                            |
| 0036 | 20260820014408     | 20260820180000 | **reverts 3 functions** (rising scoring), later replaced in production by 0039                                                                                 |
| 0037 | 20260820015400     | 20260820200000 | **reverts 3 functions** (pain clusters)                                                                                                                        |
| 0038 | 20260820022340     | 20260820220000 | **reverts `set_analysis_levels`**                                                                                                                              |
| 0040 | 20260820152914     | 20260820260000 | **fails** (constraint exists) — where a push stops                                                                                                             |
| 0041 | 20260820171407     | 20260820280000 | succeeds, no change                                                                                                                                            |
| 0042 | 20260820171438     | 20260820300000 | succeeds on the empty copy; **it is a data backfill** — on production it would add a second discovery run and re-attribute pain signals (NOT VERIFIED on data) |
| 0043 | 20260820171552     | 20260820320000 | succeeds, no change                                                                                                                                            |
| 0045 | 20260820172440     | 20260820360000 | succeeds; overwrites a portfolio label                                                                                                                         |
| 0047 | 20260826161134     | 20260826170000 | succeeds, no change                                                                                                                                            |
| 0048 | 20260916190643     | 20260916120000 | **fails** (constraint exists)                                                                                                                                  |
| 0051 | 20260930183702     | 20260930120000 | **fails** (policy exists)                                                                                                                                      |

"Same SQL" does **not** mean harmless. A replay re-runs old definitions on top of later changes.

**For all 20:**

| What            | How                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proposed action | **History-only repair.** `supabase migration repair --status applied <main version>` inserts one history row and runs no SQL. The list is printed by `node scripts/check-replay-safety.mjs --repair`. Not done: repairing production history is excluded from this assignment |
| Validation test | **Before:** the matrix script shows the result above. **After the repair:** `supabase db push --dry-run` must list exactly the 6 genuinely new migrations (0030, 0049, 0050, 0052, 0053, 0054) and nothing else, and `check-replay-safety` must report 0 hazards              |
| Rollback        | `supabase migration repair --status reverted <main version>` removes the inserted row. The schema is untouched either way                                                                                                                                                     |

## 4. Security packages — impact analysis

| Package                  | What it changes                                                                                       | Who depends on it (VERIFIED)                                                                                                                               | Demonstrated impact (copy)                                                                                                                                                                                                                                                               | Rollback                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **S-B2** (kept separate) | JobScout views `v_shortlist`, `v_last_runs` → security invoker; revoke SELECT from anon/authenticated | Only `jobscout-dashboard`, which reads both through the **service role** (deployed source read). `apps/viewer` holds no key. No repository code reads them | **Exposure today:** the API serves `jobscout`, anon has schema access and SELECT on both owner-rights views, so the public key can read the 74-row shortlist (fit, reasoning, résumé angle, application status) and run reports. After: dashboard reads both, anon/authenticated refused | in the file header; proven to restore privileges exactly |
| S-A                      | Remove PUBLIC/anon EXECUTE from 35 definer functions                                                  | anon has no access to those schemas in production (VERIFIED), so nothing reachable today changes; no app calls them as anon                                | anon 35 → 0; authenticated/service_role privileges unchanged; trigger functions still fire for a writer without EXECUTE (new-user trigger proven)                                                                                                                                        | `grant execute … to public`                              |
| S-B1                     | `disco.v_opportunity_board` → security invoker                                                        | **Nobody but its owner can read it** (not anon, authenticated or service_role). This corrects the earlier note "read by service-role code"                 | owner sees the same rows; no role's access changes                                                                                                                                                                                                                                       | `reset (security_invoker)`                               |
| S-C                      | Pin search_path on 6 functions                                                                        | disco/hlvs/vstudio internals                                                                                                                               | same results before and after                                                                                                                                                                                                                                                            | `reset search_path`                                      |
| S-D                      | Leaked-password protection (dashboard setting)                                                        | Supabase Auth sign-ups and password changes                                                                                                                | not testable locally; rejects known-breached passwords (DOCUMENTED)                                                                                                                                                                                                                      | toggle off                                               |
| Legacy SEC-1             | —                                                                                                     | Legacy project `bkfsjhhclbqrhaolvhmz`                                                                                                                      | untouched. Stays on its existing remediation track (`docs/architecture/target-architecture.md` R01, Decision 2), which is blocked on an approved plan per the operating contract                                                                                                         | —                                                        |

**Recommended order:** S-B2 first, because it is the only live exposure. Then S-A, S-B1, S-C in
one change. S-D is a dashboard toggle.

## 5. #114 fix status

**Draft PR #116** (`claude/pr114-mock-delivery-guard` → `feat/salonos-v1`). #114 itself is unchanged.

**What the mock sender now does:**

- It completes only queued messages addressed to a mock provider, or to none (those get the
  channel's mock provider).
- It never touches real-provider, pending or suppressed messages, even when Twilio is switched on.
- It never overwrites the provider. It emits `communication.sent`.
- When the Revenue Center is installed, it obeys the release settings.

**Proof (VERIFIED, local PG16 stand-in):**

- The old function fails 3 of the 4 new checks.
- The new function passes 37/37 in `60_commercial_modules`, and `62_salon` passes 67/67.
- Full suite, same harness, #114 vs #114+fix: **844 → 848 passing, 0 failing**, and no other file changed.
- Lineage, migration checks, secret scan and formatting are clean.

**Other delivery paths (VERIFIED by search and reading):**

- #115's development path, `revenue.mock_deliver`, already refuses any provider whose kind is not `mock`.
- The trusted worker path, `comms.record_delivery`, is guarded in #115: no delivery without approval,
  and no real-provider Revenue Center delivery unless the settings allow it.
- No other function in `supabase/migrations`, `supabase/proposed` or #114's branch sets a message to `sent`.

## 6. Owner-only pilot — what is built

| Requirement                                      | State                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticate through HL-BOS                      | **Built.** The console signs in with HL-BOS's Supabase Auth using the publishable key only. It refuses a service-role or secret key. Every call runs as the signed-in owner (`apps/control-center/src/lib/revenue-pilot.ts`). Unit-tested. **NOT VERIFIED against a real Auth server** (no approved environment) |
| The 8 industries                                 | yes — seeded by the migration, shown on the page                                                                                                                                                                                                                                                                 |
| HLD prospects only after approved adoption       | production has no Revenue Center records; the adoption package (dry run first, reversible) is the only way the 50 HLD barbershops enter                                                                                                                                                                          |
| Separate HSCS tenant                             | package `provision_hscs_commercial.md`; tested                                                                                                                                                                                                                                                                   |
| Review, evidence-backed recommendations, history | yes; `revenue.prospect_history` keeps the Transformation Audit history beside the Revenue Center's                                                                                                                                                                                                               |
| Communications and paid discovery off            | enforced by the database (`release_settings` defaults to pilot). The console's **Pilot safety** panel re-reads it on every page load and puts up a stop banner if anything is on                                                                                                                                 |
| Synthetic data excluded from live metrics        | the database refuses synthetic records in pilot; the dashboard counts them only in development; the panel checks both                                                                                                                                                                                            |
| Unknown financial metrics                        | shown as not connected / no data; the panel fails if any money figure appears without a connected source                                                                                                                                                                                                         |
| Error reporting                                  | every failed or refused action is logged on this computer (`.data/revenue/errors.jsonl`, no form contents) and listed under **Recent problems**                                                                                                                                                                  |
| Monitoring                                       | the safety checks run on every page load. **There is no alerting or background monitor**; it checks when the page is opened                                                                                                                                                                                      |
| Recovery                                         | §7                                                                                                                                                                                                                                                                                                               |

The console needs one more production setting before the pilot can sign in:
PostgREST must serve the `revenue` and `visibility` schemas. Production serves `public,
graphql_public, dma, vstudio, jobscout, playtime` (VERIFIED). That is item 4 in §8.

Screenshots (development database, showing the leftover test settings that the panel flags):
`phase8-pilot-safety.png`, `phase8-recent-problems.png`, `phase8-phone.png` (no sideways
scroll at 390 px).

## 7. Backup and rollback requirements

**Before any production change:**

- Record the latest daily backup time. Pro includes daily backups (DOCUMENTED); point-in-time
  recovery is an add-on and is NOT VERIFIED as enabled.
- Save the schema fingerprint (`schema-fingerprint.sql`) and the privilege snapshot (the PRIVS
  query in `security-packages.db.test.ts`).

| Change                    | Rollback                                                                                   | Proven                                        |
| ------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Revenue Center migration  | `revenue_center_rollback.sql` (restores the 4 replaced functions exactly, drops `revenue`) | locally: 4,294 → 4,294 objects, 0 differences |
| Expose schemas to the API | restore the previous `pgrst.db_schemas` value                                              | n/a                                           |
| HSCS tenant               | delete its business-line row, then the tenant                                              | locally                                       |
| HLD adoption              | `revenue.unadopt_transform_audit`; original records untouched                              | locally, 50 → 0 → 50                          |
| History repair            | `migration repair --status reverted`                                                       | not run                                       |
| S-B2 / S-A / S-B1 / S-C   | statements in each file's header                                                           | locally, privileges restored exactly (S-B2)   |
| Temporary branch          | delete it                                                                                  | n/a                                           |

## 8. Exact production changes that need your authorization

| #   | Change                                                                   | Cost / risk                                                        |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | Temporary validation branch (or reuse `hlbos-m1-portfolio`)              | ≈ $0.32/day; deleted afterwards                                    |
| 2   | **S-B2** — close the JobScout shortlist exposure                         | dashboard unaffected (demonstrated)                                |
| 3   | History-only repair of 20 rows                                           | no SQL runs; reversible                                            |
| 4   | Revenue Center migration + serve `revenue`, `visibility` through the API | rollback proven locally; must pass real-PG17 validation (#1) first |
| 5   | HSCS commercial tenant + business lines + approver + campaigns           | new, empty tenant                                                  |
| 6   | Adopt the 50 HLD barbershops (dry run first)                             | reversible                                                         |
| 7   | S-A, S-B1, S-C; S-D toggle                                               | low                                                                |
| 8   | Keep or delete `hlbos-m1-portfolio`                                      | ≈ $9.80/month while kept                                           |
| 9   | Merges: #113 → #114 (+#116) → #115                                       | your decision each                                                 |

## 9. Deployment checklist (in order; none started)

1. Approve the branch (#1). Build the production-equivalent schema on it, compare its
   fingerprint to production, apply the Revenue Center migration, run real pgTAP and the 44+24
   database tests, sign in as a test owner through real Auth/PostgREST, then roll back and
   compare again. **Only this step can make a release claim.**
2. Close S-B2 (#2), independently of everything else.
3. Merge #113 (recovered history). Repair history (#3). Confirm the dry-run push lists only the 6 new migrations.
4. Merge #116 into #114, then #114, then #115.
5. Apply the migration and serve the schemas (#4). Confirm the release settings read `pilot` with everything off.
6. Provision tenants (#5). Adopt, dry run first (#6).
7. The owner signs in through the console. The **Pilot safety** panel must be all OK.
8. Delete the branch.

## 10. Owner decision matrix

| Decision                                           | Recommendation                      | Why                                                            |
| -------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Close the JobScout shortlist exposure (S-B2)?      | **Yes, now**                        | live; the dashboard keeps working (demonstrated)               |
| Approve a temporary branch, ≈ $0.32/day, ≤ 7 days? | **Yes**                             | the only route to a real PG17 + Auth validation; ≤ $2.26       |
| Reuse `hlbos-m1-portfolio` instead?                | No — keep it separate, or delete it | divergent; reuse erases its contents; costs ≈ $9.80/month idle |
| Merge #116 into #114?                              | Yes, after your review              | proven fix, no other test changes                              |
| History repair (20 rows)?                          | Yes, after #113 merges              | otherwise any push stops half-way at 0040                      |
| S-A/S-B1/S-C/S-D?                                  | Yes, one change                     | no reachable access changes                                    |
| Pilot go-live?                                     | **Not yet**                         | needs step 1 of §9 first                                       |
