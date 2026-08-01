# HLVS V2 · V2-1 — PostgREST (Data API) Exposure Plan

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **Analysis + proposed change; NOT applied.**

## Why exposure is required

`apps/venture-studio` reads and writes `vstudio` through the Supabase **Data API (PostgREST)** under the viewer's session:

- Reads: `supabase.schema("vstudio").from("opportunities"|"evidence").select(...)` (`src/lib/data.ts`).
- Writes: `supabase.schema("vstudio").rpc("create_opportunity"|"add_evidence"|"record_decision", …)` (`src/lib/writes.ts`).

PostgREST only serves schemas on its **exposed-schemas** list. Until `vstudio` is exposed, every call errors and the app shows its honest **"schema not yet provisioned"** state — no data is fabricated. There is **no server-only alternative** wired in V2-1 (the app deliberately reuses the publishable-key + RLS Data API path; it uses no service-role key).

## Current state (verified)

- The exposed-schemas setting is **not readable via SQL** (`current_setting('pgrst.db_schemas', true)` → null; no role-level `pgrst.db_schemas`). It is a **project API setting**, so it must be read/changed in the **Supabase Dashboard → Project Settings → API → "Exposed schemas"** (or via the management API), not via a migration.
- Therefore: **`vstudio` is presumed NOT currently exposed** (it was just created; default exposed schemas are `public`, `graphql_public`). Confirm in the dashboard before deploy.

## Proposed change (do not apply yet)

**Add `vstudio` to the project's Exposed schemas**, alongside the existing entries — do **not** remove or reorder any existing schema.

- Dashboard: Project Settings → API → **Exposed schemas** → add `vstudio` → Save.
- (Equivalent management-API/config: append `vstudio` to the PostgREST `db-schemas` list.)

This is an **additive** config change. It changes **no** table privileges and **no** RLS.

## Why this stays safe

- **RLS remains enforced.** Exposure only lets PostgREST _route_ to the schema; row access is still governed by the forced RLS policies (`_select` gated on `vstudio.opportunity.read`).
- **Anon stays denied.** `anon` has **zero** privileges on `vstudio` tables (`revoke all … from anon`), so an exposed schema still returns permission-denied to anonymous callers.
- **Authenticated reads are RLS-controlled.** `authenticated` has SELECT only; rows are filtered by the platform-permission policy.
- **Writes stay RPC-gated.** `authenticated` has **no** direct INSERT/UPDATE/DELETE; writes go only through the `SECURITY DEFINER` RPCs, each `perform vstudio._require(<perm>)`.
- **No unrelated exposure.** Only `vstudio` is added; existing exposed schemas are unchanged.

## Post-change verification checklist (run after exposure, before/with deploy)

1. **Schema visible to PostgREST:** an authenticated `GET /rest/v1/opportunities?select=id` (with `Accept-Profile: vstudio`) returns 200 (empty array is fine) rather than a "schema not exposed" error.
2. **Anon denied:** the same call with only the anon key returns **401/permission denied** (no rows, no leak).
3. **Authenticated reads RLS-controlled:** a user **without** `vstudio.opportunity.read` sees **0 rows**; a `platform_owner`/`platform_admin` sees rows.
4. **RPC execution restricted as designed:** `POST /rest/v1/rpc/create_opportunity` succeeds only for a user holding `vstudio.opportunity.manage`; `record_decision` succeeds only for `platform_owner`; anon is rejected.
5. **No unrelated schema exposure changed:** the exposed-schemas list equals the previous list **plus** `vstudio` only.
6. **App-level:** `apps/venture-studio` `/` (authorized) loads the Executive Overview with live (empty) data instead of the "not provisioned" banner.

**Nothing in this plan was executed.** Exposure is a CEO-approved deploy-phase action.
