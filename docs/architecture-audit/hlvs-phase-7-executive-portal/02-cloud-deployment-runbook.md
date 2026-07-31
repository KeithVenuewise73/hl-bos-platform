# Cloud Deployment Runbook — Executive Portal

Exact sequence to deploy the portal to the Herman Legacy Cloud. **Nothing here runs in this phase.** ⚙️ = Claude can execute · 🔑 = requires CEO action/access.

| #   | Step                                                                                                               | Who                               | Notes                                     |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------- |
| 1   | Merge `feat/herman-legacy-executive-portal` into `main` (after review)                                             | 🔑                                | Standard PR review                        |
| 2   | Confirm `main` CI is green                                                                                         | ⚙️                                | Validate/pgTAP/Deno/Migration/Secret-scan |
| 3   | Create the Coolify **Application** (Dockerfile: `apps/executive-portal/Dockerfile`)                                | 🔑 (create) / ⚙️ (configure)      | Requires Coolify access                   |
| 4   | Connect the repo `KeithVenuewise73/hl-bos-platform`, branch `main`                                                 | 🔑 (authorize)                    | Deploy key / GitHub app                   |
| 5   | Set build args/env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `HL_BOS_ENV=production`    | 🔑 (provide) / ⚙️ (wire)          | Publishable key only                      |
| 6   | **Provision portal roles** for users (`app_metadata.portal_role`), or approve `public.portal_role()` RPC migration | 🔑                                | Until done, users are fail-closed         |
| 7   | Deploy to an **internal staging** address (not the public domain)                                                  | ⚙️                                | First build + boot                        |
| 8   | Validate the health endpoint (`/api/health` → 200)                                                                 | ⚙️                                |                                           |
| 9   | **Validate authentication:** unauthenticated → `/login`; sign in works                                             | ⚙️                                | Blocking gate                             |
| 10  | **Validate authorization:** each role sees only permitted views; sensitive views denied (403, logged)              | ⚙️                                | Blocking gate                             |
| 11  | Validate read-only behavior: no write path, no service-role key present                                            | ⚙️                                |                                           |
| 12  | Validate logs (access/denial lines) reach the platform sink                                                        | ⚙️                                |                                           |
| 13  | Obtain **CEO acceptance** of staging                                                                               | 🔑                                | Sign-off recorded                         |
| 14  | Bind `control.hermanlegacygroup.com` in Coolify + issue TLS                                                        | 🔑 (DNS/domain) / ⚙️ (TLS config) | DNS cutover                               |
| 15  | Promote to production                                                                                              | 🔑 (authorize) / ⚙️ (execute)     | Only after acceptance                     |
| 16  | Verify HTTPS + HSTS + security headers on the live domain                                                          | ⚙️                                |                                           |
| 17  | Document/verify rollback (redeploy previous commit)                                                                | ⚙️                                | Trivial (stateless)                       |

## Approval checkpoints (🔑)

1. Merge this branch (1). 2. Coolify app + repo access (3, 4). 3. Env/keys (5). 4. Provision portal roles / approve the role RPC (6). 5. Staging acceptance (13). 6. DNS + production promotion (14, 15).

## Hard gates (cannot pass without)

1. **Authentication validated** (step 9) — no unprotected access.
2. **Authorization validated** (step 10) — role boundaries enforced.
3. **Read-only confirmed** (step 11) — no write path, no service-role key.
4. **CEO acceptance** (step 13) — before any public promotion.

## What Claude will NOT do without approval

Create the Coolify service, change DNS, deploy to production, store a real secret, provision production roles, or expose the Control Center. All of these are 🔑.
