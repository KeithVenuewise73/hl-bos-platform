/**
 * Access resolution — PURE helpers (no I/O). Unit-tested for the security-
 * critical decisions: the dev bypass is impossible in production, and roles are
 * resolved fail-closed from verified claims.
 */
import { isStudioRole, roleFromPermissions, type StudioRole } from "./authz";

export interface EnvView {
  nodeEnv: string | undefined;
  hlBosEnv: string | undefined;
  devRole: string | undefined;
}

/**
 * Local-only development role. Returns a role ONLY when NOT in production and an
 * explicit `VSTUDIO_DEV_ROLE` is set. In production (by NODE_ENV or HL_BOS_ENV)
 * it ALWAYS returns null — the bypass cannot exist in production.
 */
export function devRoleFromEnv(env: EnvView): StudioRole | null {
  if (env.nodeEnv === "production" || env.hlBosEnv === "production") return null;
  if (!env.devRole) return null;
  return isStudioRole(env.devRole) ? env.devRole : null;
}

/** Resolve a Studio role from an authenticated user's claims, fail-closed. */
export function roleFromClaims(appMetadata: unknown): StudioRole | null {
  if (typeof appMetadata !== "object" || appMetadata === null) return null;
  const meta = appMetadata as Record<string, unknown>;

  const explicit = meta["vstudio_role"];
  if (isStudioRole(explicit)) return explicit;

  const perms = meta["platform_permissions"];
  if (Array.isArray(perms) && perms.every((p): p is string => typeof p === "string")) {
    return roleFromPermissions(perms);
  }
  return null;
}
