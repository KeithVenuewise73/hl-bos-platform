# HLVS V2 · Sprint Alpha — Workstream A (Deployment & Stabilization) Status

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Honest status — what is ready, and the exact access boundary.**

## The honest headline

Venture Studio is **deploy-ready and verified as far as this environment allows** — but three Workstream-A steps require infrastructure I have **no tool or credential to reach from here**, so I did **not** fake them. They need one small action from you (or an ops grant), and then I can finish A.

## What I verified (real, in this environment)

| Check                        | Result                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` + this branch build   | **`pnpm build` green** — all 7 apps compile, incl. `apps/venture-studio` standalone (the exact build Coolify runs)                                                                       |
| Full quality gate            | **`pnpm check` green** — format, lint, typecheck (11 projects), lineage (30 migrations), **397 unit tests**                                                                              |
| Migration governance         | `check-migrations` + `check-lineage` green; migration 0030 conforms                                                                                                                      |
| Migration 0029 in production | applied + verified (`V2_1_PRODUCTION_STATE.md`)                                                                                                                                          |
| Internal tenant              | provisioned + verified (`V2_1_INTERNAL_TENANT_PROVISIONING.md`); `VSTUDIO_TENANT_ID` resolved                                                                                            |
| Deployment package           | every value verified from source (`V2_1_COOLIFY_DEPLOYMENT_PACKAGE.md`)                                                                                                                  |
| Exposure mechanism           | investigated: the `authenticator` role has **no** `pgrst.db_schemas` setting — exposed-schemas is a **Supabase platform/project setting**, not reachable via SQL or the MCP tools I have |

## The access boundary (why A is not "done")

These three steps are the "grant access he controls" exception in the operating contract — infrastructure toggles, not engineering chores I can automate away without a credential:

| Step                                               | Needs                                                                                     | Why I can't do it here                                                                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1 Expose `vstudio`**                            | Supabase **Dashboard → Project Settings → API → Exposed schemas** (or the management API) | No MCP/SQL path exists; confirmed it isn't a role setting I could `ALTER`. Doing an unsupported `ALTER ROLE authenticator` workaround would contradict your "supported configuration" instruction and has a wider blast radius — I won't. |
| **A2 Coolify deploy**                              | Coolify access (or its API token)                                                         | No Coolify tool/credential in this environment                                                                                                                                                                                            |
| **A3 DNS** (`venturestudio.hermanlegacygroup.com`) | DNS registrar access                                                                      | No DNS tool/credential in this environment                                                                                                                                                                                                |

## How to unblock A (smallest path)

**Either** you do the one-time toggles (I'll supply the exact values), **or** you grant me the credentials to automate them going forward:

1. **Expose `vstudio`** — Supabase Dashboard → Settings → API → Exposed schemas → add `vstudio` → Save. (Additive; RLS + anon-denial preserved — see `V2_1_POSTGREST_EXPOSURE_PLAN.md`.) _Or_ grant a Supabase **management-API token** and I'll do it and all future ones.
2. **Deploy on Coolify** — new app from `apps/venture-studio/Dockerfile`, build context = repo root, port **4500**, env per `V2_1_COOLIFY_DEPLOYMENT_PACKAGE.md` (incl. `VSTUDIO_TENANT_ID`). _Or_ grant Coolify API access and I'll configure it.
3. **Domain + TLS** — point `venturestudio.hermanlegacygroup.com` at the Coolify app.

The moment any of these is granted, I run the rest of A myself: the **6-point exposure check**, first-boot checks, the **16-step smoke test** (`V2_1_PRODUCTION_SMOKE_TEST.md`), performance validation, and stabilization — and report real output.

## What is NOT blocked

Workstream **B1 (CEO Notebook)** is complete on its branch with a PR, because it is code — fully within my control. It merges independently of A; A just redeploys to surface it. See `B1_CEO_NOTEBOOK_IMPLEMENTATION_REPORT.md`.
