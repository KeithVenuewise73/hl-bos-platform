# Level B package — HL-BOS Core: NEW-E (`hlvs`), NEW-F (`discovery-run`), `hlvs-probe`, fleet/scorecard RLS

Project: `mvvtngiopdrgiedjmhfb` · Prepared 2026-11-04 · **Status: AWAITING APPROVAL — nothing changed**

## NEW-E — `hlvs` (v6): every request rewrites a Storage object with the service-role key

### Current defect (VERIFIED from deployed source, v6)
- `Deno.serve` calls `publish()` on **every** request, before anything else. `publish()` PUTs the full portal HTML to `storage/v1/object/hlvs-portal/index.html` using `SUPABASE_SERVICE_ROLE_KEY` with `x-upsert: true`. The function is `verify_jwt=false`, so any unauthenticated GET causes a service-role Storage write. The content written is a constant, so this is not content injection; it is unmetered write amplification and a service-role code path reachable by anyone.
- The publishable anon key is embedded as a string literal (`const ANON = "eyJ…"`). It is the public key the browser receives anyway, so not a secret leak — but it is a 208-character literal that must be `Deno.env.get("SUPABASE_ANON_KEY")` (available automatically in Edge Functions).
- `?diag` returns `service_role_key_present` and the Storage response to any caller: harmless disclosure, remove.

### Exact change (proposed v7, to be written after approval of the approach)
1. Remove the publish-on-request path. The portal HTML becomes a static file in the repository (`apps/hlvs-portal/index.html`) deployed to the `hlvs-portal` bucket by the protected `deploy.yml` workflow — or served directly by the function with no Storage write at all (simplest: the function returns `HTML` and never touches Storage).
2. Replace the literal with `Deno.env.get("SUPABASE_ANON_KEY")`.
3. Remove `?diag`.
4. Redeploy with `verify_jwt=false` (the portal must load before sign-in; it contains no data — data comes via RPCs that enforce `identity.has_platform_permission`).

### Affected apps
HLVS portal (`/functions/v1/hlvs`). Behaviour for users: identical page.

### Backup / validation / rollback
Archived v6 under `supabase/recovery/production-2026-11/functions/hlvs/` (anon key literal redacted in the committed copy; original SHA-256 recorded). Validation: GET returns the same HTML; Storage logs show no PUT to `hlvs-portal/index.html` after deploy. Rollback: redeploy v6.

### Risk
Low.

## NEW-F — `discovery-run` (v5): hard-coded run key and tenant id

### Current defect (VERIFIED from deployed source, v5)
- Access control is `url.searchParams.get("key") !== RUN_KEY` where `RUN_KEY` is a **17-character literal in the source** (`"hlvs-restore-2026"`). The literal is in every archived copy and in the platform's function listing; it should be considered public. With it, anyone can start a GitHub discovery run that writes to `dma`/`disco` tables with the service-role key and consumes `GITHUB_TOKEN` rate limit.
- The tenant UUID is a literal (`const TENANT = "…"`).
- Self-continuation (`next` URL) carries the key in the query string → it appears in Edge logs.

### Exact change
1. Move the key to a secret: `const RUN_KEY = Deno.env.get("DISCOVERY_RUN_SECRET")` and check it from a header (`x-run-secret`) with `requireSharedSecret` (fail-closed), not from the query string. Self-continuation passes the header, not the URL.
2. `TENANT` from `Deno.env.get("DISCOVERY_TENANT_ID")` or from the request body.
3. **Rotate**: the old literal is retired by the redeploy itself (no secret store holds it).
4. Keep `verify_jwt=false` (machine caller).

### Affected apps
Whatever triggers discovery runs today — Phase 2 found no cron job and no client for it; the last `dma` rows date from the August restore. Expect no caller to break. If a run is wanted later, it is started from the Control Center with the secret.

### Risk
Low.

## `hlvs-probe`
Returns a static "probe" HTML page. No data, no secrets. **Delete** (Level B "deleting diagnostic functions"). Archived copy retained.

## `site` (BarberOS published pages)
Reviewed: anon RPCs `barberos_published_site` / `barberos_sitemap` only, CSP set, no service-role use. No change proposed.

## fleet / scorecard RLS — finding corrected

Phase 2/3 listed "RLS enabled, not forced" on the 15 `fleet` and 5 `scorecard` tables as a gap. Re-checked live 2026-11-04:

| Schema | Tables | RLS on | RLS forced | Direct `anon` grants | Direct `authenticated` grants | Public RPCs |
| --- | --- | --- | --- | --- | --- | --- |
| fleet | 15 | 15 | 0 | 0 | 0 | `hlg_fleet_rpc`, `hlg_fleet_medical_rpc` — anon **no**, authenticated **yes** |
| scorecard | 5 | 5 | 0 | 0 | 0 | — |

With no table privileges granted to API roles, the only access path is the `SECURITY DEFINER` `fleet.api` through the authenticated-only RPC, which enforces role/workspace scoping itself. **`FORCE ROW LEVEL SECURITY` must not be applied here**: it would subject the owner-run `fleet.api` to the SELECT-only policies and break every write (`save_fleet`, `submit_inspection`, …). The finding is downgraded to *informational*; no change proposed. What remains open is that `fleet.api` (21 KB) has no tests in any repository — covered by the FleetHuddle preservation plan.
