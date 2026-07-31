import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { devRoleFromEnv, roleFromClaims } from "./access";
import type { PortalRole } from "./authz";

export interface Viewer {
  authenticated: boolean;
  role: PortalRole | null;
  email: string | null;
  /** True when access came from the local dev bypass (never in production). */
  dev: boolean;
}

const UNAUTHENTICATED: Viewer = {
  authenticated: false,
  role: null,
  email: null,
  dev: false,
};

function env() {
  return {
    url: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    key: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    nodeEnv: process.env["NODE_ENV"],
    hlBosEnv: process.env["HL_BOS_ENV"],
    devRole: process.env["PORTAL_DEV_ROLE"],
  };
}

export function supabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.url && e.key);
}

/**
 * Resolve the current viewer, server-side, fail-closed.
 * 1. Local dev bypass (impossible in production — see access.ts).
 * 2. Authenticated Supabase user → role from verified claims.
 * 3. Otherwise unauthenticated (no access).
 * NEVER uses a service-role key; only the publishable key + the user's cookies.
 */
export async function getViewer(): Promise<Viewer> {
  const e = env();

  const dev = devRoleFromEnv({
    nodeEnv: e.nodeEnv,
    hlBosEnv: e.hlBosEnv,
    devRole: e.devRole,
  });
  if (dev) {
    return { authenticated: true, role: dev, email: "dev@localhost", dev: true };
  }

  if (!e.url || !e.key) return UNAUTHENTICATED;

  const cookieStore = await cookies();
  const supabase = createServerClient(e.url, e.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // Read-only render context: token refresh happens in middleware, not here.
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHENTICATED;

  const role = roleFromClaims(user.app_metadata);
  return { authenticated: true, role, email: user.email ?? null, dev: false };
}
