import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { devRoleFromEnv, roleFromClaims } from "./access";
import type { StudioRole } from "./authz";

export interface Viewer {
  authenticated: boolean;
  role: StudioRole | null;
  email: string | null;
  dev: boolean;
}

const UNAUTH: Viewer = { authenticated: false, role: null, email: null, dev: false };

function env() {
  return {
    url: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    key: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    nodeEnv: process.env["NODE_ENV"],
    hlBosEnv: process.env["HL_BOS_ENV"],
    devRole: process.env["VSTUDIO_DEV_ROLE"],
  };
}

export function supabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.url && e.key);
}

/**
 * The Herman Legacy first-party tenant id that owns Venture Studio records.
 * Set at deploy time (`VSTUDIO_TENANT_ID`). Never fabricated — writes report an
 * honest "tenant not configured" state when it is unset.
 */
export function firstPartyTenant(): string | null {
  return process.env["VSTUDIO_TENANT_ID"] ?? null;
}

/** Resolve the current viewer, server-side, fail-closed. Publishable key only. */
export async function getViewer(): Promise<Viewer> {
  const e = env();
  const dev = devRoleFromEnv({
    nodeEnv: e.nodeEnv,
    hlBosEnv: e.hlBosEnv,
    devRole: e.devRole,
  });
  if (dev) return { authenticated: true, role: dev, email: "dev@localhost", dev: true };

  if (!e.url || !e.key) return UNAUTH;

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
  if (!user) return UNAUTH;
  return {
    authenticated: true,
    role: roleFromClaims(user.app_metadata),
    email: user.email ?? null,
    dev: false,
  };
}

/** A server Supabase client bound to the viewer's cookies (RLS-enforced). */
export async function serverSupabase(): Promise<SupabaseClient | null> {
  const e = env();
  if (!e.url || !e.key) return null;
  const cookieStore = await cookies();
  return createServerClient(e.url, e.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });
}
