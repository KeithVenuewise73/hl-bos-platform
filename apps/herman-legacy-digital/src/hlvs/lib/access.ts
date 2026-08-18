/**
 * Access resolution — PURE helpers (no I/O). Unit-tested for the security-
 * critical decisions: the dev bypass is impossible in production, and roles are
 * resolved fail-closed from verified claims.
 */
import { isStudioRole, roleFromPermissions, type StudioRole } from "./authz";
import { isInternalRole, type InternalRole } from "../../lib/authz";

/**
 * The HLD internal role a viewer already holds, expressed as a Studio role.
 *
 * /HLVS is mounted inside Herman Legacy Digital and gated by HLD's middleware
 * on HLD's internal role. If the Studio disagreed about who is allowed in, the
 * viewer would be admitted by the gate and then rejected by the page — which is
 * exactly the sign-in loop this mapping fixes. Every HLD account is provisioned
 * with an `hld_role` and no `vstudio_role`, so without this the Studio was
 * unreachable for everyone.
 *
 * Least privilege, and deliberately narrow: only the CEO maps to
 * `platform_owner`, the one role that can record a decision. A `client` is not
 * an internal role and maps to nothing.
 */
const STUDIO_ROLE_BY_INTERNAL_ROLE: Record<InternalRole, StudioRole> = {
  platform_owner: "platform_owner",
  hld_admin: "platform_admin",
  hld_team_member: "viewer",
};

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

/**
 * Resolve a Studio role from an authenticated user's claims, fail-closed.
 *
 * Sources are tried most-specific first, and a source that yields nothing falls
 * through to the next rather than denying outright:
 *   1. an explicit `vstudio_role`
 *   2. the platform permission vocabulary
 *   3. the HLD internal role that already admitted this viewer to /HLVS
 */
export function roleFromClaims(appMetadata: unknown): StudioRole | null {
  if (typeof appMetadata !== "object" || appMetadata === null) return null;
  const meta = appMetadata as Record<string, unknown>;

  const explicit = meta["vstudio_role"];
  if (isStudioRole(explicit)) return explicit;

  const perms = meta["platform_permissions"];
  if (Array.isArray(perms) && perms.every((p): p is string => typeof p === "string")) {
    const fromPerms = roleFromPermissions(perms);
    if (fromPerms) return fromPerms;
  }

  const internal = meta["hld_role"] ?? meta["portal_role"];
  if (isInternalRole(internal)) return STUDIO_ROLE_BY_INTERNAL_ROLE[internal];

  return null;
}
