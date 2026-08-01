# HLVS V2 · V2-1 — Security Report

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **Branch:** `claude/hlvs-v2-foundation`

## Posture summary

Venture Studio adds **no new trust boundary**. It reuses HL-BOS identity, permissions, and RLS; every net-new object is gated; the CEO decision is the tightest gate in the app.

| Control                         | Implementation                                                                                                | Verified by                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Authentication                  | HL-BOS Supabase Auth (publishable key only) via SSR                                                           | `session.ts`, `middleware.ts`                             |
| No independent auth             | reuses `identity.*`; no user store, no new roles                                                              | reuse matrix; migration                                   |
| Tenant context                  | `platform.tenants` FK; `VSTUDIO_TENANT_ID` at deploy                                                          | `writes.ts`                                               |
| RLS on all net-new tables       | `enable` + **`force` row level security** on all 6 tables; SELECT gated on `vstudio.opportunity.read`         | migration RLS loop; pgTAP                                 |
| No anonymous access             | `revoke all … from anon` on schema + tables; RPCs `revoke … from anon`                                        | migration                                                 |
| No anonymous mutation           | middleware redirects unauth requests (307); RPCs require permission                                           | runtime check (307); pgTAP                                |
| No client service-role key      | browser client uses publishable key only; server client uses the viewer's cookies                             | `browser.ts`, `session.ts`; secret-scan gate              |
| Server-side authz for decisions | `vstudio.decision.record` granted to **platform_owner only**; app `canDecide` mirrors it                      | pgTAP `t_non_ceo_cannot_record_decision`; `authz.test.ts` |
| Writes via governed RPCs        | all writes are `SECURITY DEFINER` functions with `perform vstudio._require(perm)` and `auth.uid()` provenance | migration                                                 |
| Advisory ≠ authoritative        | `recommendations.authoritative` is a **generated column fixed FALSE** — cannot be stored true                 | pgTAP `t_recommendation_never_authoritative`              |
| Decision immutability           | `vstudio.decisions` insert-only (no update/delete RPC); event-sourced via `events.emit`                       | migration                                                 |
| Input validation                | URLs validated (`^https?://`), enums gated, lengths bounded (DB checks + `validate.ts`)                       | `validate.test.ts`; DB `check` constraints                |
| Dev bypass impossible in prod   | `devRoleFromEnv` returns null when `NODE_ENV`/`HL_BOS_ENV` = production                                       | `access.test.ts`; runtime `/`→307                         |
| Security headers                | CSP, HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff                                         | `next.config.ts`                                          |
| Audit trail                     | decisions + meaningful mutations emit to the append-only `events.outbox`                                      | migration RPCs                                            |

## Permission model (least-privilege)

| Permission                        | platform_owner (CEO) | platform_admin |
| --------------------------------- | -------------------- | -------------- |
| `vstudio.opportunity.read`        | ✅                   | ✅             |
| `vstudio.opportunity.manage`      | ✅                   | ✅             |
| `vstudio.evaluation.manage`       | ✅                   | ✅             |
| `vstudio.recommendation.generate` | ✅                   | ✅             |
| **`vstudio.decision.record`**     | ✅                   | ❌ (CEO-only)  |

## Defense in depth

Three independent layers block an unauthorized decision: (1) middleware auth gate, (2) app `canDecide` (server component, platform_owner only), (3) the database `vstudio._require('vstudio.decision.record')` inside the definer RPC. The database is authoritative; the app layers fail closed.

## Residual risk

- **Schema exposure**: live reads/writes require `vstudio` to be exposed to PostgREST at deploy — a config step, not a code risk; until then the app is read-only-with-honest-empty-states.
- **pgTAP is CI-verified, not locally run** (no Supabase CLI here) — the DB guarantees above are asserted by `22_venture_studio.sql` in CI's ephemeral database.
- No secrets are committed; the secret-scan gate passes.
