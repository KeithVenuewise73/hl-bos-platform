# HLD Admin Access & BTIC Role Gating — V1

Two audiences share **one** Supabase authentication system (HL-BOS identity). This
change separates them by role, so the Business Transformation Intelligence Center
(BTIC) is reachable only by internal Herman Legacy Digital team members:

```
Client Login  (/login)        -> client portal only        (/portal)
HLD Team Login (/admin-login)  -> BTIC + internal operations (/intelligence)
```

No second auth platform was created. No service-role key touches the browser. No
migration was applied. BTIC remains the seeded, read-only Venuewise dossier.

## Reuse matrix

| Capability                            | Verdict | Source reused / added                                                          |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Supabase Auth (`signInWithPassword`)  | REUSE   | `lib/browser.ts`, existing `/login` flow                                       |
| Server session (publishable key only) | REUSE   | `lib/session.ts` `createServerClient` + cookies                                |
| Middleware auth gate                  | EXTEND  | `middleware.ts` — split `/portal` vs `/intelligence` audiences                 |
| Dev bypass, impossible in production  | REUSE   | pattern from `lib/access.ts`; new `HLD_DEV_ROLE` mirrors it                    |
| Platform RBAC (source of truth)       | REUSE   | `identity.platform_admins`, `identity.is_platform_admin()`, `role_permissions` |
| Role-from-claims convention           | REUSE   | mirrors `executive-portal`/`venture-studio` (`platform_permissions`)           |
| Role resolution for HLD               | BUILD   | `lib/authz.ts` (pure, unit-tested)                                             |
| Internal viewer                       | EXTEND  | `lib/session.ts` `getInternalViewer()`                                         |
| Admin login page                      | BUILD   | `app/admin-login/page.tsx`                                                     |
| Role resolver for routing             | BUILD   | `app/api/whoami/route.ts` (no secrets, coarse role only)                       |
| BTIC role gate (layout + every page)  | BUILD   | `intelligence/layout.tsx` + all 8 pages + `components/btic-access.tsx`         |
| Internal nav entry                    | BUILD   | role-gated card on `/portal` (never in public nav)                             |

**Why the platform RBAC alone was not enough at runtime, and why NO migration is
included:** the HL-BOS role system is real and is the source of truth, but (a)
PostgREST exposes only the `public` schema, so the app cannot call
`identity.is_platform_admin()` directly, and (b) platform-admin status is not
mirrored into the user's JWT `app_metadata`, which is the claims surface the other
internal apps already read. The gate therefore reads `app_metadata` claims
(`hld_role` / `portal_role` / `platform_permissions`) exactly like
`executive-portal`. Making the existing bootstrap owner recognized as internal in
production is an **auth-configuration** step (mint the claim), not a schema change
— see "Prepared, not applied" below. This is why the PR adds no migration and the
lineage head stays `0031`.

## Role → access matrix

| Role              | BTIC (`/intelligence`) | Portal (`/portal`) | Scope inside BTIC     |
| ----------------- | ---------------------- | ------------------ | --------------------- |
| `platform_owner`  | ✅ full                | ✅                 | full                  |
| `hld_admin`       | ✅ full                | ✅ (internal)      | full                  |
| `hld_team_member` | ✅ limited             | ✅ (internal)      | limited (read-scoped) |
| `client`          | ❌ denied → /portal    | ✅                 | none                  |
| anonymous         | ❌ → /admin-login      | ❌ → /login        | none                  |

`hld_team_member`'s _limited_ scope is defined in code (`bticScope`) but is not yet
data-backed: BTIC V1 is a single static dossier with no per-engagement assignment
model, so a team member currently sees the same read-only dossier as admins once
granted internal access. A finer, assignment-backed scope is future work (it needs
the DB-backed engagement model, not this PR).

## Route behavior

| Route             | Anonymous           | Client (authenticated)  | Internal (authenticated)     |
| ----------------- | ------------------- | ----------------------- | ---------------------------- |
| `/login`          | Client Login form   | → /portal               | → /intelligence              |
| `/admin-login`    | HLD Team Login form | Access-restricted state | → /intelligence              |
| `/intelligence/*` | 307 → /admin-login  | 307 → /portal + denied  | renders BTIC                 |
| `/portal/*`       | 307 → /login        | renders portal          | renders portal (+ BTIC card) |

Defense-in-depth: the edge **middleware**, the **layout** role gate, and **each
page's** own `getInternalViewer()` re-check all enforce the same rule. Access is
never hidden by navigation alone.

## Security properties

- No anonymous BTIC access; no client BTIC access (verified — see below).
- Roles resolved **server-side** from verified `app_metadata`, fail-closed;
  malformed claims never escalate (unit-tested).
- Dev role bypass (`HLD_DEV_ROLE`) is **impossible in production** (`NODE_ENV` /
  `HL_BOS_ENV`), same guarantee as the existing client dev bypass.
- No service-role key in browser code; `/api/whoami` returns only a coarse role +
  a safe destination, no PII beyond that, `no-store`.
- Open-redirect protection on all post-login `next` params; a client `next` that
  points at `/intelligence` is never honored.
- `/intelligence` remains `noindex, nofollow, nocache`.
- The access-denied states never reveal whether an engagement/dossier exists.

## Prepared, not applied — minting the internal claim (auth config, CEO-gated)

To recognize the existing platform owner (already in `identity.platform_admins`)
as internal in production, mirror platform-admin status into the JWT via a Custom
Access Token hook. **This is prepared for reference only — do NOT apply or register
it without CEO approval.** It is intentionally NOT in `supabase/migrations/` (it is
platform-auth configuration, and keeps the migration lineage untouched at `0031`).

```sql
-- PREPARED, NOT APPLIED. Registers as the Supabase "Custom Access Token" hook.
-- Adds platform_permissions to the JWT so claim-reading apps (HLD, exec-portal,
-- venture-studio) can authorize without exposing the identity schema.
create or replace function identity.hld_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  perms  text[];
begin
  select coalesce(array_agg(distinct rp.permission_key::text), '{}')
    into perms
  from identity.platform_admins pa
  join identity.role_permissions rp on rp.role_key = pa.role_key
  where pa.user_id = (event->>'user_id')::uuid;

  claims := jsonb_set(claims, '{app_metadata,platform_permissions}', to_jsonb(perms), true);
  return jsonb_set(event, '{claims}', claims);
end;
$$;
-- Then, in the Supabase dashboard (CEO): Authentication -> Hooks ->
-- Custom Access Token -> select identity.hld_access_token_hook. No app deploy needed.
```

Alternative (equally valid, also CEO-gated): set the owner's
`app_metadata.hld_role = 'platform_owner'` once via an admin action. Either path
makes the gate admit the owner; **neither is a code change and neither is done in
this PR.**

## Local development / screenshots

Set `HLD_DEV_ROLE=platform_owner` (only works when `NODE_ENV`/`HL_BOS_ENV` are not
`production`) to render the real internal views locally without minting claims.
This is how the screenshots below were produced.

## Verification (all local, all green)

- `authz` unit tests: **20 passed** (role resolution, fail-closed, dev-bypass
  impossible in production, open-redirect protection, BTIC gates/scope).
- HLD app unit tests: **70 passed**; repo `lint`, `typecheck`, `format:check`,
  `build` all pass.
- Live gate (dev server, no bypass): `/intelligence` → `307 /admin-login?next=…`,
  `/intelligence/venuewise` → `307 /admin-login?next=…`, `/portal` →
  `307 /login?next=…`, public `/` → `200`, `/admin-login` → `200`.
- Live authorized render (dev role): `/intelligence` and the Venuewise dossier
  (Overview, Timeline, Reports + history, Decisions, Artifacts, Intelligence)
  render under the internal role; mobile layout intact.

## Screenshots

Under `docs/products/hld-btic/screenshots/`:

- `admin-access-01-client-login.png` — Client Login
- `admin-access-02-admin-login.png` — HLD Team Login
- `admin-access-03-executive-home.png` — BTIC Executive Home
- `admin-access-04-venuewise-overview.png` — Venuewise Overview (INTERNAL badge)
- `admin-access-05-reports-history.png` — Reports (current vs. history)
- `admin-access-06-decisions.png` — Decisions
- `admin-access-07-mobile-overview.png` — Venuewise Overview (mobile)
- `admin-access-08-internal-nav.png` — internal BTIC nav entry on /portal (internal-only)
- `admin-access-09-admin-login-mobile.png` — HLD Team Login (mobile)

**Access-denied state:** the client-denied variant (`app_metadata` present but not
internal) is covered by unit tests and rendered by `components/btic-access.tsx` and
the `/admin-login` "Access restricted" screen; a live screenshot of it needs a real
client account, which does not exist yet (only the single bootstrap owner), so it is
not fabricated here.

## Not done (by design)

No migration applied; no `0032`; no BTDI↔BTE↔BTIC wiring; no comms/workers; no
deploy; no DNS; no credential change; no client accounts created.
