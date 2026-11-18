# Recovery module: staff-only data, tightened public intake

**Status: APPLIED TO PRODUCTION on 2026-11-18 with the owner's approval ("yes, go ahead and fix it"): `migration.sql` plus `lockdown.sql`. Verified live; see "Applied to production" below.** Independent of the KPI and dpi fixes (it can be applied before or after either).

Problem (legacy audit findings 3 and 4, 2026-11-18): the six `recovery_*` tables carry client tax ids, decedent details, claims
and outreach, yet one policy let **any signed-in user** read and write them all. Bucket `recovery-documents` let **anyone**
upload any file of any size, and any signed-in user read, replace or delete every document. All tables and the bucket are
empty today (0 rows, 0 objects), so nothing has leaked yet.

## Files
| File | |
| --- | --- |
| `migration.sql` | The fix. Idempotent, one transaction. Header explains every change. |
| `rollback.sql` | Reopens the holes. |
| `replica_recovery.sql`, `helpers_recovery.sql`, `before.sql`, `after.sql` | Local replica (live columns, policies, ACLs, bucket) and assertions. Reuses `../hscs-kpi-rls-fix/` replica and helpers. |
| `run-local-test.sh` | Whole experiment on a throwaway local PostgreSQL 16. Never touches Supabase. |

## What it does
- **Staff only** for all six tables, the compliance view and stored files. "Staff" = an **active** `hscs_glp` member with role
  `owner_ceo`, `contract_admin` or `operations_manager`, through one function `hscs_glp.is_recovery_staff()`.
  **That role list is a placeholder** (it needs your decision): Recovery is a separate business from HSCS logistics, so long
  term it should have its own roles, and ideally its own project and logins.
- **Public intake kept, but narrowed.** Anonymous visitors can still (a) insert a `recovery_clients` row, (b) insert a
  `recovery_documents` row, (c) upload a file under `intake/`. Their rows must have the honeypot empty, status `prospect` (clients)
  or `pending` (documents), no reviewer notes, the right bucket, no claim or match link, and a path under `intake/`. Text lengths
  are capped. They can read nothing back.
- **Bucket limits:** 10 MB per file; PDF, JPEG, PNG, WebP, DOCX only.
- No one but the server role can TRUNCATE. Other buckets' policies are not touched.

## Local result (real output, 2026-11-18)
- Before: anon uploaded anywhere in the bucket and inserted a client already "active" with forged notes; a signed-in stranger read
  clients, saw stored documents and deleted all of them (5 assertions).
- After: **61 assertions pass**: anon reads/updates/deletes/inserts on every table and the view; the allowed intake paths; 15 refused
  intake attempts (honeypot, forged status, forged notes, over-length text, wrong bucket, outside `intake/`, claim link, approved
  status); signed-in strangers, `carrier_user`, an inactive `owner_ceo`, `readonly_exec`, `finance_manager` (all see nothing);
  `owner_ceo` and `operations_manager` (read, write, rename and delete files); `service_role`; the bucket settings; another bucket untouched.
- Re-applying is harmless (61 pass again). Two separate mutations (any-signed-in-user read policy; open bucket upload policy) are
  each caught. `rollback.sql` restores the open state.

## Supabase branch result (2026-11-18)
Branch `recovery-rls-fix-test` (project ref `xxrgkwuizkoxoptdiqti`), created from the legacy project and **deleted afterwards**.
Production was re-checked after the test and is unchanged: the 6 old open table policies and the open upload policy are still
there; no new helper functions, no bucket limits, no new constraints.

- **The branch is incomplete, as before** (it replayed 4 of production's migrations and stopped). This time it did have the
  **real Supabase `storage` schema** (0 buckets, 0 policies), so the storage policies were tested on Supabase's own tables. I
  recreated the Recovery tables, the two buckets, the live before-state policies, a minimal `hscs_glp` and fake users by hand.
  The real `hscs_glp` objects and the two enforcement triggers on matches/outreach were not exercised.
- **Before:** all five holes reproduced on the real stack: anon upload anywhere in the bucket; anon insert of a client already
  "active" with forged notes; a signed-in stranger reading clients, seeing stored documents, and deleting them.
- **Platform guard found:** Supabase blocks direct SQL `DELETE` on `storage.objects` (trigger `protect_delete`, error 42501) unless
  the setting `storage.allow_delete_query` is `true`, which its Storage API sets after the policy checks. To test the delete
  policies I set that setting inside the test function. The first before-run, without it, showed the guard, not the policy.
- **After** (applied with `apply_migration`): **59 of 59 checks hold**, the same scenarios as `after.sql` (anon on every table
  and the view; allowed intake; 13 refused intake attempts; strangers, carrier_user, inactive owner_ceo, readonly_exec,
  finance_manager see nothing; owner_ceo and operations_manager read, write, rename and delete; the other bucket's policy
  untouched; `service_role`).
- **Mutations:** a policy letting any signed-in user read clients, and a policy re-opening anonymous upload, were each caught.
- Bucket `recovery-documents` now has a 10 MB limit and a 5-type allowlist; the other bucket is unchanged; all six tables
  have row security on.

## What this does NOT prove, and side effects
- **I could not find the intake front-end** (no code in any repository I can read uses these tables or the bucket). It may break it:
  an insert that asks for the new row back (`RETURNING`, or `Prefer: return=representation`) is now refused for visitors, because
  they cannot read; the document row can no longer be attached to a claim or match; uploads must go under `intake/`.
  **Test the real intake form before applying.**
- Roles were switched inside a database function, not through the HTTP API. Supabase Storage's HTTP layer, where the size and
  type limits are **enforced**, was **not** exercised: only that the limits were set on the bucket.
- **Not solved: the number of anonymous uploads.** Nothing in SQL can rate-limit it; 10 MB x unlimited uploads is still storage
  abuse. The proper fix is a server-issued signed upload URL behind a captcha when the intake front-end is built.
- A signed-in user is still allowed to upload under `intake/` (same as anonymous).

## Decisions for the owner
1. Who is Recovery staff? (Placeholder above.) Is Recovery meant to share logins with HSCS operations at all?
2. Is the public intake live or planned? If planned and not built, an even safer option is to close anonymous insert entirely until it is.
3. Is public sign-up on Supabase Auth switched off? It decides how serious the original hole was.

## Applied to production (2026-11-18)
- **What ran, in order** on project `bkfsjhhclbqrhaolvhmz`, via migrations `hscs_recovery_rls_fix` then `hscs_recovery_lockdown_intake`:
  `migration.sql` (as it now stands, including the staff-upload policy) and `lockdown.sql`.
- **Pre-flight (before applying):** 0 Recovery rows, 0 stored files, all 12 old policies present, helper function absent, 1 active staff member (role `owner_ceo`).
- **Owner choice that was made on the owner's behalf:** the owner did not say whether the public intake is live, so the default
  stated to them was used: **anonymous intake is closed completely** (`lockdown.sql`). Only Recovery staff can insert rows or upload files.
  To reopen it later, re-run the "public intake" sections of `migration.sql`.
- **Differences from what was branch-tested:** two additions made after the branch test and verified only locally plus the live probes below:
  (1) a staff INSERT policy on stored files (the branch-tested version let staff upload only under `intake/`; found by the lockdown test),
  (2) the lockdown add-on. Local suite: 64 assertions; lockdown suite: 10.
- **Live verification (rolled-back probes, no data written):** anon cannot read any Recovery table or the compliance view, cannot submit an
  intake client or document row, cannot upload anywhere in the bucket; a signed-in stranger sees 0 clients and 0 stored files and cannot insert or
  upload; bucket limit 10 MB with 5 types; row security on for all 6 tables; 0 old open policies left; anon holds 0 privileges on the Recovery
  tables; exactly 1 person passes the staff check; Recovery rows and files unchanged (0 / 0).
- **Rollback:** `rollback.sql` (reopens the holes).
- **Not verified live:** the real Storage upload service, a real signed-in session, and any intake form (none found).
