# Recovery module: staff-only data, tightened public intake

**Status: written and tested LOCALLY only. NOT applied to any Supabase project. NOT tested on a Supabase branch.
Needs owner approval.** Independent of the KPI and dpi fixes (it can be applied before or after either).

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

## What this does NOT prove, and side effects
- **I could not find the intake front-end** (no code in any repository I can read uses these tables or the bucket). It may break it:
  an insert that asks for the new row back (`RETURNING`, or `Prefer: return=representation`) is now refused for visitors, because
  they cannot read; the document row can no longer be attached to a claim or match; uploads must go under `intake/`.
  **Test the real intake form before applying.**
- Emulation: superuser session with `SET ROLE`; a minimal emulation of Storage's tables. Supabase Storage's HTTP layer, where the
  size and type limits are enforced, was **not** exercised. The two enforcement triggers on matches and outreach are omitted from the replica.
- **Not solved: the number of anonymous uploads.** Nothing in SQL can rate-limit it; 10 MB x unlimited uploads is still storage
  abuse. The proper fix is a server-issued signed upload URL behind a captcha when the intake front-end is built.
- A signed-in user is still allowed to upload under `intake/` (same as anonymous).

## Decisions for the owner
1. Who is Recovery staff? (Placeholder above.) Is Recovery meant to share logins with HSCS operations at all?
2. Is the public intake live or planned? If planned and not built, an even safer option is to close anonymous insert entirely until it is.
3. Is public sign-up on Supabase Auth switched off? It decides how serious the original hole was.
