/**
 * Authorization resolution — PURE helpers (no I/O), unit-tested for the
 * security-critical decisions. Herman Legacy Digital reuses HL-BOS identity
 * (Supabase Auth) and the platform permission vocabulary; it introduces NO new
 * identity system and NO service-role key.
 *
 * Two audiences share one Supabase auth:
 *   - clients          -> the client portal only (/portal)
 *   - internal HLD team -> the Business Transformation Intelligence Center (/intelligence)
 *
 * Roles are resolved fail-closed from VERIFIED claims on the authenticated
 * user's `app_metadata` (set by the platform, not user-editable). An
 * authenticated user with no internal signal is a `client`. Anyone unrecognized
 * gets no access.
 */

export type InternalRole = "platform_owner" | "hld_admin" | "hld_team_member";
export type Role = InternalRole | "client";

export const INTERNAL_ROLES: readonly InternalRole[] = [
  "platform_owner",
  "hld_admin",
  "hld_team_member",
];

export function isInternalRole(v: unknown): v is InternalRole {
  return typeof v === "string" && (INTERNAL_ROLES as readonly string[]).includes(v);
}

/**
 * Map platform permission claims to an internal HLD role, least-privilege.
 * Reuses the HL-BOS permission keys (identity.permissions) rather than inventing
 * a parallel vocabulary. Returns null when no internal permission is present.
 */
export function internalRoleFromPermissions(
  perms: readonly string[],
): InternalRole | null {
  const has = (p: string) => perms.includes(p);
  if (has("platform.owner") || has("platform.*")) return "platform_owner";
  if (has("platform.console.admin") || has("platform.tenant.manage"))
    return "hld_admin";
  // Team members are granted read-scoped internal access explicitly.
  if (
    has("hld.btic.read") ||
    has("platform.console.read") ||
    has("platform.audit.read")
  )
    return "hld_team_member";
  return null;
}

/**
 * Resolve the caller's role from Supabase `app_metadata`, fail-closed.
 * - not authenticated                         -> null   (anonymous)
 * - explicit `hld_role`/`portal_role` claim    -> that internal role (validated)
 * - `platform_permissions` array               -> mapped internal role
 * - authenticated, no internal signal          -> "client"
 */
export function roleFromClaims(
  appMetadata: unknown,
  opts: { authenticated: boolean },
): Role | null {
  if (!opts.authenticated) return null;

  if (typeof appMetadata === "object" && appMetadata !== null) {
    const meta = appMetadata as Record<string, unknown>;

    const explicit = meta["hld_role"] ?? meta["portal_role"];
    if (isInternalRole(explicit)) return explicit;

    const perms = meta["platform_permissions"];
    if (
      Array.isArray(perms) &&
      perms.every((p): p is string => typeof p === "string")
    ) {
      const r = internalRoleFromPermissions(perms);
      if (r) return r;
    }
  }
  // Authenticated but nothing marks them internal: a client.
  return "client";
}

export function isInternal(role: Role | null): boolean {
  return role !== null && role !== "client";
}

export function canAccessBTIC(role: Role | null): boolean {
  return isInternal(role);
}

export type BticScope = "full" | "limited" | "none";

/**
 * BTIC data scope by role. platform_owner/hld_admin see everything; a
 * hld_team_member sees the limited, read-scoped view (assigned engagements,
 * reports, tasks — NOT the full internal decision/evidence surface). Clients
 * and anonymous visitors see nothing.
 */
export function bticScope(role: Role | null): BticScope {
  if (role === "platform_owner" || role === "hld_admin") return "full";
  if (role === "hld_team_member") return "limited";
  return "none";
}

/**
 * Local-only development role. Returns an internal role ONLY when NOT in
 * production and an explicit `HLD_DEV_ROLE` is set to a valid internal role. In
 * production (by NODE_ENV or HL_BOS_ENV) it ALWAYS returns null — the bypass
 * cannot exist in production. Lets us render/screenshot the real internal views
 * locally while production stays fully claim-gated.
 */
export function devInternalRoleFromEnv(env: {
  nodeEnv: string | undefined;
  hlBosEnv: string | undefined;
  devRole: string | undefined;
}): InternalRole | null {
  if (env.nodeEnv === "production" || env.hlBosEnv === "production") return null;
  if (!env.devRole) return null;
  return isInternalRole(env.devRole) ? env.devRole : null;
}

/** A safe same-origin return path: must start with a single "/", never "//". */
function safeNext(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

/**
 * Post-sign-in destination by role, with open-redirect protection and no
 * cross-audience leakage: a client is never routed into /intelligence, an
 * internal user is never trapped in the client portal by a stale `next`.
 */
export function destinationFor(
  role: Role | null,
  opts?: { next?: string | null },
): string {
  const next = safeNext(opts?.next);
  if (isInternal(role)) {
    return next ?? "/intelligence";
  }
  if (role === "client") {
    // Never honor a `next` that points at an internal area for a client.
    if (next && !next.startsWith("/intelligence")) return next;
    return "/portal";
  }
  return "/login";
}
