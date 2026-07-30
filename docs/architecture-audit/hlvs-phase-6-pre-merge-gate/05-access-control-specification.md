# Access-Control Specification — Executive Console

## Current state: UNPROTECTED — authentication is a MANDATORY pre-deployment gate

**Confirmed by inspection:** the Control Center (and the catalog/factory routes within it) has **no authentication** — no middleware, no session check, no login. Its only protection is that it runs on `localhost` and its Server Actions are origin-locked to `localhost:4000`. **There is no authorization on any route.**

Therefore: **the executive site must not be deployed until authentication is in place. Do not deploy an unprotected executive system.** This is a hard gate, not a recommendation.

## Authentication flow

1. Unauthenticated request to any route → **redirect to `/login`**.
2. Login via **Supabase Auth** (HL-BOS identity) — email + password (invitation-only; no self-serve signup), MFA recommended.
3. On success, a session JWT is issued; the app reads it server-side on every request.
4. The app resolves the user's **platform role/permissions** from HL-BOS `identity` (`platform_admins` / memberships + `has_platform_permission`).
5. Every data read uses the **publishable key + the user's JWT**; RLS enforces scope in the database.

## HL-BOS identity integration

Reuse the existing platform identity — **do not build a second auth system**:

- Users are `auth.users`; platform authority is `identity.platform_admins` + `identity.has_platform_permission(...)`.
- The executive site is a **platform-internal** tool (like the `hlvs` factory): access is gated on **platform permissions**, not tenant membership.
- A new permission namespace is proposed: `platform.console.read` (view) and `platform.console.admin` (view + see sensitive commercial status). Added via a governed migration (approval-gated), not ad hoc.

## Roles (mapped to platform permissions)

| Role                     | Sees                                                               | Permission                                      |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------- |
| **Platform Owner** (CEO) | Everything, incl. commercial decision status & deployment controls | `platform.*`                                    |
| **Executive**            | Dashboards, catalog, factory, readiness, commercial status (read)  | `platform.console.read` + commercial view       |
| **Administrator**        | Catalog, factory, module registry, deployment status (read)        | `platform.console.admin`                        |
| **Developer**            | Catalog, factory, module registry, relationships (read)            | `platform.console.read`                         |
| **Read-only Auditor**    | Catalog, relationships, platform health, audit trail (read)        | `platform.audit.read` + `platform.console.read` |

All roles are **read-only** in the executive site. No role can trigger a build, deploy, or DB write from this site — those remain in the local Control Center / governed pipelines.

## Tenant isolation

The executive site is platform-internal (cross-tenant by nature for the CEO/executives). It never exposes a specific tenant's customer data — it shows **platform assets and aggregate readiness**, not per-tenant records. Any future per-tenant view must be RLS-scoped by the viewer's membership; the default is platform-aggregate only.

## Session security

- HTTP-only, Secure, SameSite=strict session cookies; short-lived JWT + refresh.
- HTTPS-only (HSTS); no token in URL or `localStorage` for server-validated routes.
- Idle + absolute session timeouts; re-auth for sensitive views (commercial status).
- CSRF protection on any state-changing endpoint (there are none by design — read-only).

## Unauthorized-access behavior

- No session → 302 to `/login`.
- Authenticated but lacking the required permission → **403** with a plain-English message; the attempt is written to `audit.security_events` (denied).
- No information leakage in errors (no stack traces, no asset names in 403 bodies).

## Emergency access & recovery

- **Break-glass:** the Platform Owner can always authenticate (bootstrapped via `platform.bootstrap_first_platform_owner`, already in the schema). Break-glass logins raise a `critical` security event.
- **Account recovery:** Supabase Auth password reset; MFA reset requires platform-owner approval.
- **Lockout:** if identity is unreachable, the site denies access (fail-closed) rather than granting it.

## Audit logging

- Every login, permission denial, and sensitive-view access → `audit.security_events` (append-only, immutable — already enforced in the schema).
- The audit trail itself is viewable only with `platform.audit.read`.

## Summary gate

**Authentication + authorization (this spec) is a mandatory, blocking pre-deployment gate.** The deployment runbook (doc 06) cannot proceed past "validate authentication" until this is implemented and tested. Until then, the executive views remain local-only in the Control Center.
