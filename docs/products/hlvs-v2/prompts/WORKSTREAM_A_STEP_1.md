# Workstream A · Step 1 — Expose `vstudio` & Deploy Venture Studio (internal)

**Copy-paste this prompt to start Workstream A. It is the first, CEO-gated deployment step. Read-only until the two explicit approvals below are given.**

---

## MISSION

Bring Venture Studio online for internal Herman Legacy use: expose the `vstudio` schema to the Data API and deploy `apps/venture-studio` on Coolify at an internal domain, using the values already verified in `V2_1_COOLIFY_DEPLOYMENT_PACKAGE.md` and `V2_1_POSTGREST_EXPOSURE_PLAN.md`. **Assemble, do not rebuild** — reuse the proven Executive-Portal / Herman-Legacy-Digital Coolify pattern.

## AUTHORIZATION REQUIRED (two explicit gates)

1. **Expose `vstudio` to PostgREST** (additive; changes no privileges, no RLS).
2. **Deploy the container + assign the internal domain.**

Do nothing irreversible before the matching approval.

## PRECONDITIONS TO VERIFY FIRST (read-only)

- `main` CI is green; migration 0029 is applied (`V2_1_PRODUCTION_STATE.md`).
- Internal tenant exists: **Herman Legacy Group Internal** (`herman-legacy-internal`); `VSTUDIO_TENANT_ID` is the value in `V2_1_DEPLOYMENT_READINESS.md` (private).
- Confirm the current Exposed-schemas list in the Supabase dashboard (baseline before change).

If any precondition fails: **STOP** and report.

## STEP 1 — Expose `vstudio` (after approval 1)

- Add **only** `vstudio` to Project Settings → API → Exposed schemas (do not remove/reorder existing entries).
- Run the **6-point verification** from `V2_1_POSTGREST_EXPOSURE_PLAN.md`:
  1. authenticated `GET` with `Accept-Profile: vstudio` → 200 (empty ok);
  2. anon → 401/denied;
  3. a user without `vstudio.opportunity.read` sees 0 rows; owner sees rows;
  4. RPCs restricted as designed (`create_opportunity` needs `opportunity.manage`; `record_decision` `platform_owner` only; anon rejected);
  5. exposed list = previous list **+ `vstudio`** only;
  6. app `/` (authorized) loads live (empty) data, not the "not provisioned" banner.

## STEP 2 — Deploy on Coolify (after approval 2)

Use `V2_1_COOLIFY_DEPLOYMENT_PACKAGE.md` verbatim: Dockerfile `apps/venture-studio/Dockerfile`, build context = repo root, internal port **4500**, health `/api/health`. Env: the two `NEXT_PUBLIC_SUPABASE_*` (Core; publishable key only) as **build args + runtime**, and `VSTUDIO_TENANT_ID` (runtime) = the internal-tenant UUID. **Never** set `VSTUDIO_DEV_ROLE`, `SUPABASE_SERVICE_ROLE_KEY`, or any secret behind `NEXT_PUBLIC_*`. `NODE_ENV`/`HL_BOS_ENV=production` are baked.

## STEP 3 — Domain, auth, smoke, performance

- Assign **`venturestudio.hermanlegacygroup.com`** (auth-gated; network-restricted if possible); valid TLS.
- Verify auth: sign in as `platform_owner`; anon `/` → 307 `/login`; dev bypass impossible.
- Run the **16-step smoke test** (`V2_1_PRODUCTION_SMOKE_TEST.md`), using a **DEMONSTRATION / NOT LIVE** opportunity for the write steps. Confirm **no** Factory order row is created.
- Check Supabase advisors + logs; record cold-start and page timings; fix blocking issues.

## GUARDRAILS

- Canonical Core `mvvtngiopdrgiedjmhfb` only.
- No fabricated data; honest empty states everywhere.
- If a smoke step fails: follow the rollback table (safest partial rollback = remove `vstudio` from exposed schemas).

## DELIVERABLE (CEO report)

Exposure result (6-point) · deploy result (health/auth) · domain + TLS · smoke-test result (16 steps, real output) · performance snapshot · advisors status · any bug fixed · production-impact statement · **next single approval**.

## STOP CONDITION

Stop after exposure, deploy, domain, auth verification, smoke test, and the report. Do **not** add external connectors or begin any Workstream-B capability in this step.
