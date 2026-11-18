# Legacy project security audit ("Herman Legacy Business Platform", `bkfsjhhclbqrhaolvhmz`)

Date: 2026-11-18. **Read-only. Metadata, policy text and function source only: no row values were read and nothing was
changed.** Branches created for the two fix tests were deleted; production was re-checked afterwards.

## Scope and method
- Every table, view and materialised view in `public`, `dpi`, `hlvs`, `hscs_glp` that `anon` or `authenticated` can touch
  (171 relations): row security, policies, grants, schema usage, view options.
- Every function callable by those roles that is SECURITY DEFINER or callable by `anon`.
- Storage buckets and policies, the cron job, vault, auth user counts, extensions, realtime publication.
- All 11 Edge Functions: `verify_jwt` flag, and for 10 of 11 the source of the auth path (see "Not checked").
- Supabase's own security advisor.

## Headline
The core platform schema `hscs_glp` (85 tables: bids, contracts, carriers, pricing, invoices) is **well protected**: every table
is gated by role checks (`is_internal`, `has_role`, `can_write`), `anon` has no access to the schema at all, and the storage
bucket `glp-documents` is private and scoped to the user's organisation. The weak spots are the three tables the dashboards
use, the four `dpi` tables, and the Recovery module's intake. Edge Functions check the caller properly.

## Findings
| # | Severity | What | Status |
| --- | --- | --- | --- |
| 1 | **High** | `public.ltr_data`, `kpi_sp_weekly`, `kpi_spe_weekly`: "Allow all" policy; anon can read, change, delete. | Fix written and tested: `../hscs-kpi-rls-fix/`. **Not applied.** |
| 2 | **High** | `dpi.deliveries`, `surveys`, `drivers`, `dsp_companies`: public read and public insert (includes DSP contact names and emails). | Fix written and tested: `../hscs-dpi-rls-fix/`. **Not applied.** |
| 3 | **Medium** | Storage bucket `recovery-documents` (private, 0 objects): policy "recovery docs public upload" lets **anyone with the public key upload** (no size limit, any file type). Policies "staff read / update / delete" are only `authenticated` + bucket name, with no role check: **any signed-in user** can read, replace or delete every recovery document. | Open. Not written. |
| 4 | **Medium** | `public.recovery_assets`, `recovery_claims`, `recovery_matches`, `recovery_outreach` (all empty): one policy `ALL ... TO authenticated USING true`. Any signed-in user can read and write them. `recovery_clients` and `recovery_documents` take anonymous inserts with `WITH CHECK true` and no spam guard (the other public intake tables have a honeypot check). | Open. Not written. |
| 5 | Low (latent) | `hlvs.profiles`: policy `profiles_update_self` lets a user update their own row. A trigger blocks changing `role`, but **nothing blocks changing `org_id`**. A signed-in user who knows another organisation's id could move themselves into it and read its `hlvs` data (read-only, because the default role is `viewer`). Today there is one `hlvs` organisation and no self-insert policy, so no practical exposure. | Open. Not written. |
| 6 | Low | Edge Function `sam-probe` authorises by decoding the JWT payload and trusting `role == service_role` without checking the signature. The platform's own `verify_jwt` check should reject a forged token first, so this looks sound in practice, but I did not test it. Its own header says it is temporary. | Recommend deleting it. |
| 7 | Low | Edge Function `discover-sync` fetches URLs stored in `source_connectors.config` with no host allowlist. Only a signed-in staff user with a role who can first write that config could abuse it. | Recommend an HTTPS-only, public-host allowlist. |
| 8 | Low | `generate-alerts` allows any active org member of any role (empty role list). It only writes notifications. | Note. |
| 9 | Low | Four `hlvs` helper functions (`can_write`, `current_org_id`, `current_user_role`, `is_admin`) are SECURITY DEFINER and callable by `anon`; they return null/false without a login. `hscs_glp.claim_org` is callable by any signed-in user: it only lets someone join an organisation that has **no owner yet**, and the one organisation has one. If that owner row were ever removed, any signed-in user could become owner. | Tidy: revoke from `anon` / `PUBLIC`. |
| 10 | Low | `anon` still holds UPDATE/DELETE/TRUNCATE on 19 `public` tables. Row security blocks it for all but #1; TRUNCATE ignores row security but the Supabase web API has no TRUNCATE endpoint, so it is not reachable that way. | Tidy: revoke. |
| 11 | Low | Advisor: leaked-password protection off; `pg_trgm` installed in `public`; `hlvs.brand_compute_overall_score` has no fixed search path; extension `http` is installed. | Note. |

## Corrections to earlier statements (mine)
- I said the view `public.recovery_compliance_exceptions` might bypass the protection on the tables beneath it. **That was
  wrong.** It is declared `security_invoker=on`, so the caller's own row security applies.
- I described the KPI/dpi findings with "anon can truncate". The privilege exists, but the web API cannot issue TRUNCATE.
  Reading, changing, deleting and (for dpi) inserting rows were the real exposures.

## Checked and fine
- No relation reachable by `anon` or `authenticated` lacks row security. All views are `security_invoker`.
- Policies on `hlvs` are scoped to the user's organisation; `anon` has no table privileges there.
- Only one cron job; its command contains no key or bearer token. Vault holds 0 secrets. No realtime publication.
- Auth users: 2, none anonymous, none unconfirmed.
- `glp-documents`: private, 50 MB limit, MIME allowlist, policies scoped to the user's organisation folders.
- Edge Functions `fleethuddle-handoff`, `acquire-documents`, `analyze-opportunity`, `daily-brief`, `sam-sync`, `brand-scan`:
  source read. They validate the caller (user token, active membership, role), or in `sam-sync` accept the service role.
  `brand-scan` relies on row security and fails before any outbound call when called without a user. `generate-alerts`,
  `extract-document`, `score-opportunity` and `discover-sync` were reviewed by a delegated read-only review that reported
  the same pattern; I did not re-read those four myself.

## Not checked
- **Auth settings** (is public sign-up open? email confirmation? MFA? token lifetime). These tools cannot read them, and
  findings 3, 4 and 5 are only as serious as "any signed-in user" is easy to become. **Please check in the dashboard whether
  sign-ups are disabled.**
- Which schemas the Supabase web API exposes. `hscs_glp` is unreachable by `anon` regardless.
- No call was made through the web API; everything is from database metadata and source.
- Edge Function environment variables and secrets; the full adapter code under `discover-sync`.
- HL-BOS Core and the Venuewise project (HL-BOS Core's advisor findings are recorded in the main audit document).

## Cross-product coupling worth noting
`hscs_glp.execution_handoffs` and the `fleethuddle-handoff` function send HSCS contract and carrier data to a FleetHuddle
endpoint (mock unless `FLEETHUDDLE_WEBHOOK_URL` is set). Under the new independence rules that handoff must never carry
recruiting data, and Driver Recruitment must not call it.

## Proposed next fixes (none written yet)
A. Recovery module: decide whether it is live (0 rows, 0 objects). If yes: role-gate the staff policies, cap upload size and
   type, add the honeypot to intake, restrict anonymous upload to a signed path. If no: lock it to staff only.
B. `hlvs.profiles`: forbid changing `org_id` (extend the existing guard trigger) and add a test.
C. Tidy migration: revoke `anon` execute on the `hlvs` helpers and on `claim_org`; revoke excess table grants.
D. Delete `sam-probe`; add a URL allowlist to `discover-sync`.
