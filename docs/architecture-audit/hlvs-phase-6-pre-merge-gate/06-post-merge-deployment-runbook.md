# Post-Merge Deployment Runbook — Herman Legacy Cloud Executive Site

Exact sequence to deploy `control.hermanlegacygroup.com` **after** Atlas is merged. **Nothing here is executed in this phase.** ⚙️ = Claude can execute · 🔑 = requires CEO action/approval/access.

## Prerequisite gate (before any deploy) — build the safe app

The current Control Center is **not deployable** (RCE risk, no auth). Before step 3, a read-only executive app must exist:

| #   | Step                                                                                                                              | Who                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| P1  | Build `apps/executive-console` — read-only views over `@hl-bos/catalog`; **no** `child_process`/Server Actions; add `/api/health` | ⚙️                           |
| P2  | Implement authentication + roles (access-control spec 05); governed migration for `platform.console.*` permissions                | ⚙️ (migration → 🔑 to apply) |
| P3  | Verify locally: unauthenticated → login; RBAC enforced; no service-role key; all 10 views render                                  | ⚙️                           |

## Deployment runbook

| #   | Step                                                                                                         | Who                           | Notes                                                     |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------- |
| 1   | **Merge PR #16** after CEO approval                                                                          | 🔑                            | Branch → protected `main`                                 |
| 2   | **Confirm `main` is green**                                                                                  | ⚙️                            | Re-check CI on `main` post-merge                          |
| 3   | **Create/update the Coolify application** for the executive console                                          | 🔑 (create) / ⚙️ (configure)  | Requires Coolify access                                   |
| 4   | **Connect the canonical GitHub repository** (`KeithVenuewise73/hl-bos-platform`)                             | 🔑 (authorize)                | Deploy key / GitHub app grant                             |
| 5   | **Configure the production branch** = `main`                                                                 | ⚙️                            |                                                           |
| 6   | **Configure build & start commands** (spec 04)                                                               | ⚙️                            | `pnpm --filter @hl-bos/executive-console build` / `start` |
| 7   | **Configure secrets** (publishable key only; **no** service-role key)                                        | 🔑 (provide) / ⚙️ (wire)      | Supabase publishable key, allowed roles                   |
| 8   | **Configure Supabase access** (HL-BOS Core, RLS-scoped, publishable key)                                     | ⚙️                            | Read-only; JWT-scoped                                     |
| 9   | **Configure `control.hermanlegacygroup.com`** in Coolify                                                     | 🔑                            | Domain binding                                            |
| 10  | **Enable TLS** (Let's Encrypt via Coolify)                                                                   | ⚙️                            | HTTPS-only + HSTS                                         |
| 11  | **Deploy to an internal staging address**                                                                    | ⚙️                            | Not the public domain yet                                 |
| 12  | **Validate authentication** (unauth → login; RBAC; break-glass; denials audited)                             | ⚙️                            | **Blocking gate**                                         |
| 13  | **Validate every Control Center route** (all 10 views render, read-only)                                     | ⚙️                            |                                                           |
| 14  | **Validate database read-only behavior** (no writes possible; RLS scopes reads; no service-role key present) | ⚙️                            |                                                           |
| 15  | **Validate logs & health checks** (`/api/health` 200; structured logs; no secrets logged)                    | ⚙️                            |                                                           |
| 16  | **Obtain CEO acceptance** (staging demo against acceptance criteria)                                         | 🔑                            | Sign-off recorded                                         |
| 17  | **Promote to the permanent domain** (`control.hermanlegacygroup.com`)                                        | 🔑 (authorize) / ⚙️ (execute) | DNS cutover + TLS live                                    |
| 18  | **Document rollback** (redeploy previous commit/image; one click; no data impact)                            | ⚙️                            | Read-only app = trivial rollback                          |

## Who does what (summary)

- **🔑 CEO:** approve the merge (1); authorize Coolify/GitHub/domain/secrets access (3, 4, 7, 9); apply the permissions migration (P2); accept staging (16); authorize production promotion (17).
- **⚙️ Claude:** build the read-only app + auth (P1–P3); configure build/start/branch/TLS (5, 6, 8, 10); deploy to staging (11); run all validations (12–15); prepare rollback docs (18).

## Hard gates (deployment cannot pass these)

1. **Auth in place & validated** (step 12) — no unprotected executive system.
2. **Read-only confirmed** (step 14) — no write path, no service-role key.
3. **CEO acceptance** (step 16) — before any public promotion.

## Acceptance criteria (staging)

- Unauthenticated access is impossible; each role sees only its permitted views.
- All 10 executive views render with real data or honest empties.
- No database write is possible from the site; no service-role key is present.
- `/api/health` returns 200 with the build SHA; logs contain no secrets.
- Rollback to the prior deployment verified.
