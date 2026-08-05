import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { devBypassEnabled } from "./access";
import {
  roleFromClaims,
  devInternalRoleFromEnv,
  canAccessBTIC,
  bticScope,
  isInternal,
  type Role,
  type BticScope,
} from "./authz";

export interface ClientViewer {
  authenticated: boolean;
  email: string | null;
  /** True when access came from the local dev bypass (never in production). */
  dev: boolean;
}

const ANON: ClientViewer = { authenticated: false, email: null, dev: false };

/** The internal (HLD team) viewer used to authorize the BTIC workspace. */
export interface InternalViewer {
  authenticated: boolean;
  email: string | null;
  role: Role | null;
  /** True for platform_owner / hld_admin / hld_team_member (never a client). */
  internal: boolean;
  /** True when this viewer may enter /intelligence at all. */
  canBTIC: boolean;
  /** Data breadth once inside: full (owner/admin), limited (team), or none. */
  scope: BticScope;
  dev: boolean;
}

const ANON_INTERNAL: InternalViewer = {
  authenticated: false,
  email: null,
  role: null,
  internal: false,
  canBTIC: false,
  scope: "none",
  dev: false,
};

function env() {
  return {
    url: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    key: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    nodeEnv: process.env["NODE_ENV"],
    hlBosEnv: process.env["HL_BOS_ENV"],
    devClient: process.env["HLD_DEV_CLIENT"],
  };
}

export function supabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.url && e.key);
}

/**
 * Resolve the current client viewer, server-side, fail-closed. Reuses HL-BOS
 * identity (Supabase Auth); NEVER a service-role key — only the publishable key
 * + the user's cookies. There is NO new identity system here.
 */
export async function getClientViewer(): Promise<ClientViewer> {
  const e = env();

  if (
    devBypassEnabled({
      nodeEnv: e.nodeEnv,
      hlBosEnv: e.hlBosEnv,
      devClient: e.devClient,
    })
  ) {
    return { authenticated: true, email: "dev-client@localhost", dev: true };
  }

  if (!e.url || !e.key) return ANON;

  const cookieStore = await cookies();
  const supabase = createServerClient(e.url, e.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ANON;
  return { authenticated: true, email: user.email ?? null, dev: false };
}

/**
 * Resolve the current INTERNAL viewer for BTIC authorization, server-side,
 * fail-closed. Reuses HL-BOS identity + the platform permission claims on the
 * user's `app_metadata`; NEVER a service-role key. There is no new identity
 * system — only a role read on top of the same Supabase session.
 */
export async function getInternalViewer(): Promise<InternalViewer> {
  const e = env();

  // Local-only dev role bypass — impossible in production (see authz.ts).
  const devRole = devInternalRoleFromEnv({
    nodeEnv: e.nodeEnv,
    hlBosEnv: e.hlBosEnv,
    devRole: process.env["HLD_DEV_ROLE"],
  });
  if (devRole) {
    return {
      authenticated: true,
      email: `dev-${devRole}@localhost`,
      role: devRole,
      internal: true,
      canBTIC: canAccessBTIC(devRole),
      scope: bticScope(devRole),
      dev: true,
    };
  }

  if (!e.url || !e.key) return ANON_INTERNAL;

  const cookieStore = await cookies();
  const supabase = createServerClient(e.url, e.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ANON_INTERNAL;

  const role = roleFromClaims(user.app_metadata, { authenticated: true });
  return {
    authenticated: true,
    email: user.email ?? null,
    role,
    internal: isInternal(role),
    canBTIC: canAccessBTIC(role),
    scope: bticScope(role),
    dev: false,
  };
}
