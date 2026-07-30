/**
 * Access resolution — PURE helpers (no I/O). Unit-tested for the security-
 * critical decisions: the dev bypass is impossible in production, and roles are
 * resolved fail-closed from verified claims.
 */

import { isPortalRole, roleFromPermissions, type PortalRole } from "./authz";

export interface EnvView {
  nodeEnv: string | undefined;
  hlBosEnv: string | undefined;
  devRole: string | undefined;
}

/**
 * Local-only development role. Returns a role ONLY when NOT in production and an
 * explicit `PORTAL_DEV_ROLE` is set. In production (by NODE_ENV or HL_BOS_ENV)
 * it ALWAYS returns null — the bypass cannot exist in production. This lets us
 * screenshot the real views locally while production stays fully auth-gated.
 */
export function devRoleFromEnv(env: EnvView): PortalRole | null {
  if (env.nodeEnv === "production" || env.hlBosEnv === "production") return null;
  if (!env.devRole) return null;
  return isPortalRole(env.devRole) ? env.devRole : null;
}

/**
 * Resolve a portal role from an authenticated user's claims, fail-closed.
 * Accepts either an explicit validated `portal_role` claim, or a
 * `platform_permissions` array mapped via the least-privilege matrix.
 * Anything unrecognized → null (no access).
 */
export function roleFromClaims(appMetadata: unknown): PortalRole | null {
  if (typeof appMetadata !== "object" || appMetadata === null) return null;
  const meta = appMetadata as Record<string, unknown>;

  const explicit = meta["portal_role"];
  if (isPortalRole(explicit)) return explicit;

  const perms = meta["platform_permissions"];
  if (Array.isArray(perms) && perms.every((p): p is string => typeof p === "string")) {
    return roleFromPermissions(perms);
  }
  return null;
}
