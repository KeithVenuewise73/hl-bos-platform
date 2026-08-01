# HLVS V2 · V2-1 — Production Smoke-Test & Rollback Plan

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **To run after a CEO-approved deploy — not executed here.**

Prerequisites: migration 0029 applied (done) · `vstudio` exposed to PostgREST · `VSTUDIO_TENANT_ID` set to the approved tenant · container deployed on Coolify.

## Validation sequence (stop and roll back on any ❌)

| #   | Check                             | Pass criterion                                                                                                       |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Container health                  | Coolify reports the container healthy                                                                                |
| 2   | Health route                      | `GET /api/health` → **200** `{"status":"ok","app":"venture-studio"}`                                                 |
| 3   | Anonymous root                    | `GET /` (no session) → **307 → /login**                                                                              |
| 4   | Login                             | An authorized `platform_owner` (`keith@venuewise.net`) signs in successfully                                         |
| 5   | Executive Overview                | `/` loads with live (empty) pipeline, no "not provisioned" banner                                                    |
| 6   | Opportunity Catalog               | `/opportunities` loads (empty list, no error)                                                                        |
| 7   | Manual opportunity create         | `New Opportunity` → submit → persists (`persisted`, real id); appears in the catalog                                 |
| 8   | Evidence create                   | attach evidence on the opportunity → persists                                                                        |
| 9   | Evaluation create                 | record an evaluation → persists; composite excludes unknown dimensions                                               |
| 10  | Reuse analysis                    | detail page shows a **measured** reuse score computed from the real `@hl-bos/catalog` (deterministic; formula shown) |
| 11  | Advisory recommendation           | recommendation renders **non-authoritative** (advisory label; `authoritative=false`)                                 |
| 12  | CEO decision gate                 | `Record decision` succeeds as `platform_owner`; a non-owner (or `platform_admin`) is refused (DB `42501`)            |
| 13  | Factory readiness                 | preview only — shows blockers/readiness; **no** "execute/build" action                                               |
| 14  | No Factory order                  | confirm **no** `hlvs.software_creation_orders` / `hlvs.extraction_candidates` row was created by Venture Studio      |
| 15  | Unauthorized / anonymous mutation | anon `POST /api/opportunities` → redirected/denied (no row); authenticated-but-unauthorized → 403/denied             |
| 16  | Existing apps healthy             | executive-portal / hl-bti unaffected; Core health green; no error-level advisors introduced                          |

Use a **DEMONSTRATION / NOT LIVE** opportunity for steps 7–13 (the app labels it), so no fabricated external intelligence enters the record.

## Rollback criteria & actions

| Failure                                | Trigger                                                                     | Rollback action                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Application deploy failure**         | container won't build/start; health ❌ (steps 1–2)                          | Stop/remove the Coolify app. **No DB change needed** — the schema is inert without a client. Diagnose build args / logs; redeploy.                                                                                                                                                                                              |
| **API schema-exposure error**          | reads/writes fail; app shows "not provisioned" after exposure (steps 5–9)   | Re-verify the Exposed-schemas list includes `vstudio`; if misconfigured, correct it. If exposure caused any unexpected access, **remove `vstudio` from exposed schemas** (reverts to inert).                                                                                                                                    |
| **Authentication failure**             | login ❌ or wrong redirect (steps 3–4)                                      | Verify `NEXT_PUBLIC_*` build args match Core; confirm the user is `platform_owner`. Roll back the app; RLS already prevents data exposure.                                                                                                                                                                                      |
| **RLS failure**                        | any anon/unauthorized read returns rows (steps 3, 15)                       | **Immediately remove `vstudio` from exposed schemas** (cuts Data-API access) and open an incident. RLS is forced in the DB, so this should be impossible; treat any occurrence as sev-1.                                                                                                                                        |
| **Unexpected permission behavior**     | non-owner records a decision, or a write bypasses a permission (step 12/15) | Remove exposure; revoke the affected role grant; investigate. DB gate (`_require`) is authoritative and independently blocks this.                                                                                                                                                                                              |
| **Full schema rollback (last resort)** | a genuine defect in the schema requires removal                             | Apply the documented rollback (CEO-approved, off-peak): `DROP SCHEMA IF EXISTS vstudio CASCADE; DELETE FROM identity.role_permissions WHERE permission_key LIKE 'vstudio.%'; DELETE FROM identity.permissions WHERE key LIKE 'vstudio.%';` — additive-only migration, so this fully reverts with no impact on existing schemas. |

**The safest partial rollback is removing `vstudio` from the exposed-schemas list** — it instantly cuts all Data-API access to the schema while leaving the (correct, RLS-protected) objects in place.
