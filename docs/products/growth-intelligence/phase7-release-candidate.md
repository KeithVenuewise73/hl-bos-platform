# Revenue Center — internal pilot release candidate (Phase 7)

**Date:** 2026-11-05 · **Branch:** `claude/hlg-growth-intelligence-phase5` · **PR:** #115
**Status:** release candidate for an **owner-only internal pilot**. Nothing has been applied,
merged, provisioned, connected or sent.

Labels: **VERIFIED** (run/read by me today) · **DOCUMENTED** · **NOT VERIFIED** · **ASSUMPTION**.

## 1. Blocker: real PostgreSQL 17 + Supabase (items 1 and 5)

**NOT VERIFIED**, and not substituted with a PostgreSQL 16 run called complete. The three
possible environments, each checked:

| Route                                                         | Finding (VERIFIED)                                                                                                                                                                                                                                                        | To unblock                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Local Supabase stack (Docker)                                 | Docker CLI present but no daemon running, no Supabase CLI, 0 images; downloading images is refused by this session's policy                                                                                                                                               | Owner allows image downloads in a session with Docker, or runs it on his machine |
| New Supabase branch of HL-BOS Core                            | Branches **bill hourly**; creating one is spending, not authorised. Also: a branch replays the production migration ledger, and 9 ledger rows hold only a comment, so a branch built from it would lack the 0009–0017 schemas (ASSUMPTION; to be confirmed on the branch) | Owner approves **Package P1** below                                              |
| Existing branch `hlbos-m1-portfolio` (`moftgnrbnsixeddcwdpz`) | PostgreSQL 17.6, real extensions, **ACTIVE since 2026-07-19 (billing)**. Different migration lineage (0009–0029 are portfolio and government-contracting work), 8 auth users. Not production-equivalent, and not mine to overwrite                                        | Owner decides: keep it, or delete it (**Package P0**)                            |

What is verified instead, and labelled as such:

- **PostgreSQL 16, production-equivalent:** 111/111 production migrations replayed; 99.49% of
  objects identical to production.
- **31/31** Revenue Center database tests on each base; 744/744 existing tests pass with and without the migration.
- Real pgTAP, real Supabase Auth and PostgREST, and PostgreSQL 17 are the open items.

## 2. Security impact (generated from the database, not hand-listed)

The migration adds **283 objects** on the production-equivalent copy: 16 tables, 3 views, 3 types,
34 functions, 101 constraints, 23 indexes, 16 policies, 17 triggers, and related grants. It
changes **4** existing functions and removes **0**.

| Property (all 34 `revenue` functions)                                              | Result                                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executable by `anon`                                                               | **0** (test-enforced)                                                                                                                              |
| SECURITY DEFINER without a pinned `search_path`                                    | **0** (test-enforced)                                                                                                                              |
| Callable by signed-in users without a caller check of their own                    | 5, all safe: two pure hash functions; `draft_proposal`, `release_outreach` and `mock_deliver` delegate to platform functions that check the caller |
| Internal helpers (`setting`, `assert_*`, `is_commercial`, `tenant_line`, triggers) | not executable by `authenticated`                                                                                                                  |
| Tables writable directly by `authenticated`                                        | **0**; writes only through the functions                                                                                                           |
| Views                                                                              | 5, all `security_invoker` (RLS applies)                                                                                                            |

The 4 modified platform functions:

- `workflows.decide`: **narrowed**; refuses commercial items. The existing workflow tests (7) still pass.
- `comms.record_delivery`: **narrowed**; no delivery without approval, and no real Revenue Center
  delivery unless release settings allow it.
- `comms.has_consent`, `comms.request_message`: comparisons made case-insensitive (fixes an
  opt-out bypass). The existing communications tests (31) still pass.

## 3. Application dependency analysis

- **Called by the app:** 30 `revenue` functions and views, through `RevenueCenter` / `submitInquiry`
  / `backfillCampaign`. All are on the `supabaseRpc` allow-list.
- **Not called by the app:** 14 platform-owner operations and internal helpers, absent from the allow-list.
- **Platform objects depended on:**
  - `identity`: has_permission, is_member, is_platform_admin, platform_admins, role_permissions
  - `visibility`: prospects, assessments, recommendations, content_assets and their functions
  - `workflows`: instances, tasks, approvals, request_approval, is_approved
  - `comms`: messages, consent, suppression, providers, templates, request_message, approve_message
  - `entitlements`: module_activations, tenant_entitlements
  - `audit` and `events`
  - `platform.tenants`
- A change to any of these needs this suite re-run.

## 4. Rollback (VERIFIED)

`supabase/proposed/revenue-center/revenue_center_rollback.sql` restores the four platform
functions exactly as production stores them, and removes the triggers, template, permissions and the
`revenue` schema. Proven on the production-equivalent copy with the controls and the adoption package
applied: **4,294 objects → 4,294, 0 differences**. It deletes Revenue Center data, so export
`revenue.*` first (release step R2).

## 5. Adoption of the 50 HLD barbershops (prepared, not run)

- `adopt_hld_barbershops.sql`: designated owner only, dry run first, safe to repeat, reversible.
- It adds one profile and identity keys per prospect, and records the source file and row,
  campaign, and Transformation Audit run ids.
- **Changes no existing row.** The fingerprint of every original prospect, shop profile, run,
  finding and recommendation is identical before, after dry run, after adoption and after reversal.
- Adds `revenue.prospect_history` showing the old Transformation Audit runs and new reviews side by side.
- Tested on the production-equivalent schema (7/7). Production's shape, read-only:
  - 50 prospects, all at stage `prospect`
  - 50 distinct keys, 10 websites, 0 Google place ids
  - 40 runs, 45 findings, 40 recommendations
- Adopted records have **no website scan**, so Send to Review refuses them until they are scanned.

## 6. HSCS commercial tenant (prepared, not created)

The `hscs-government` tenant holds 2 BTI government records, 2 outbox rows, 8 audit events and one
owner, so **it is not reused**. `provision_hscs_commercial.md` uses `platform.provision_tenant`, then
`set_business_line`, `designate_approver`, `enable_first_party_tenant` and campaigns. Tested (4/4):

- only the platform owner provisions
- only one HSCS line can exist
- customer tenants cannot be enabled
- HSCS campaigns accept only HSCS industries
- government records stay invisible to HSCS staff and untouched

## 7. PR reconciliation (VERIFIED)

- **Replay guard:** `scripts/check-replay-safety.mjs` reads `.hlbos/production-ledger.json`
  (111 rows, verified against production) and runs in CI (test `replay-safety.test.ts`).
  - Classification of main's files: **28 applied, 20 replay hazards** (14 same SQL, 6 different SQL,
    including renamed 0044 and 0045), **6 genuinely new**.
  - Fails on a NEW hazard, or on archived SQL under `supabase/migrations`.
  - `--repair` prints the ledger-only commands (Package P3).
- **Recovered history** (#113 `supabase/recovery`, #112 `supabase/recovered`) stays outside
  `supabase/migrations`. The Supabase CLI never reads it.
- **#114 mock-delivery bypass:** demonstrated. `comms.dev_dispatch_mock` marked a message for the REAL
  email provider "sent" and rewrote its provider to `mock`. Fix: `supabase/proposed/pr114-fixes/dev_dispatch_mock_guard.sql`
  (mock providers only, provider kept, queued/approved only, refused unless release settings allow).
  Tested 3/3. It belongs in #114, not in #115.
- **Test merges:** #115 merges cleanly with #113, #114 and #103. It conflicts with #112 only in
  `.hlbos/milestone.json` and `eslint.config.mjs`.
- **Order:** #113 → ledger repair (P3) → #114 (with the fix, numbered) → #115 (ordinal assigned then).

## 8. Internal-pilot configuration (enforced in the database)

`revenue.release_settings` has one row and defaults to the pilot posture. Only the platform owner
can change it, and a constraint makes mock delivery and synthetic data impossible outside
`development`. In pilot, all of the following are refused (tested):

- synthetic or mock records (discovery, inquiries, adoption, referrals)
- mock delivery
- paid discovery, even with an allowance set
- automatic notifications
- recording a Revenue Center message as sent by a real provider

Live dashboard figures exclude synthetic records. The console shows the posture and hides the
synthetic-backfill control outside development.

## 9. Release sequence — owner-only internal pilot

| Step | Action                                                                             | Verify                                                                                                                                                                    | Rollback                             |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| R0   | P1: isolated branch; run §1's open checks there (PG17, real pgTAP, Auth/PostgREST) | all green                                                                                                                                                                 | delete branch                        |
| R1   | Merge #113                                                                         | CI green                                                                                                                                                                  | revert merge                         |
| R2   | Production backup (Supabase PITR/backup) + export `revenue` (empty)                | backup id recorded                                                                                                                                                        | —                                    |
| R3   | P3 ledger repair (20 rows)                                                         | `check-replay-safety` against the live ledger shows 0 hazards                                                                                                             | `migration repair --status reverted` |
| R4   | P2: apply Revenue Center controls (with ordinal)                                   | fingerprint: +283 / 4 changed / 0 removed; anon has 0 grants; settings = pilot                                                                                            | rollback SQL or restore R2           |
| R5   | Assign HLD line to `herman-legacy-digital`; designate owner; enable                | `revenue.business_lines` has 1 row                                                                                                                                        | delete row                           |
| R6   | P4: HSCS tenant                                                                    | 4 calls succeed; isolation query                                                                                                                                          | delete tenant                        |
| R7   | P5: adoption, dry run → real                                                       | 50 adopted, 0 conflicts, original-row fingerprint unchanged                                                                                                               | `unadopt_transform_audit`            |
| R8   | Expose `revenue` schema in the API; console on the owner's session                 | grant-posture check on live; owner sees data; a second account sees none                                                                                                  | remove from exposed schemas          |
| R9   | Monitoring (first 2 weeks)                                                         | daily: `audit.security_events` for revenue.*, `revenue.release_settings` unchanged, `comms.messages` with status sent/delivered for revenue_center = 0, Supabase advisors | —                                    |

## 10. Individually approvable production change packages

| Id   | Package                                                                   | Files                                                           | Risk                                                  |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| P0   | Delete or keep the stale branch `hlbos-m1-portfolio` (billing since July) | —                                                               | owner decision                                        |
| P1   | Create an isolated Supabase branch for release verification (hourly cost) | §1                                                              | cost only                                             |
| P2   | Revenue Center controls migration                                         | `revenue_center_controls.sql` (+ `revenue_center_rollback.sql`) | medium; rollback proven                               |
| P3   | Ledger repair for 20 replay hazards (ledger rows only, no SQL)            | `node scripts/check-replay-safety.mjs --repair`                 | low; 6 rows need review first (different SQL)         |
| P4   | HSCS commercial tenant                                                    | `provision_hscs_commercial.md`                                  | low                                                   |
| P5   | Adopt 50 HLD barbershops                                                  | `adopt_hld_barbershops.sql`                                     | low; reversible                                       |
| P6   | #114 mock-dispatch fix (in #114)                                          | `pr114-fixes/dev_dispatch_mock_guard.sql`                       | low                                                   |
| S-A  | Revoke latent anon EXECUTE on 35 definer functions                        | `security/sec_a_anon_definer_functions.sql`                     | low; tested                                           |
| S-B1 | `disco.v_opportunity_board` → security invoker                            | `security/sec_b_definer_views.sql`                              | low                                                   |
| S-B2 | JobScout views → security invoker                                         | same file, commented out                                        | **may break the JobScout dashboard**; needs its owner |
| S-C  | Pin search_path on 6 functions                                            | `security/sec_c_search_path.sql`                                | low                                                   |
| S-D  | Enable leaked-password protection                                         | Supabase dashboard                                              | none                                                  |
