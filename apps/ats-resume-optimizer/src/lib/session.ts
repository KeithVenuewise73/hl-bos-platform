import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "./config.ts";
import { deploymentMode, describeMode, type DeploymentMode } from "./deployment.ts";

/**
 * Who is asking.
 *
 * Fail-closed throughout: an error talking to the identity provider produces
 * an unauthenticated viewer, never an authenticated one. The publishable key
 * is the only credential used here — never a service-role key, which would
 * bypass the row-level security that makes one user's career database
 * invisible to another.
 */

export interface Viewer {
  readonly authenticated: boolean;
  readonly userId: string | null;
  readonly email: string | null;
  readonly mode: DeploymentMode;
}

export function currentMode(): DeploymentMode {
  const c = config();
  return deploymentMode({
    hlBosEnv: c.hlBosEnv,
    nodeEnv: c.nodeEnv,
    supabaseUrl: c.supabaseUrl,
    supabaseKey: c.supabasePublishableKey,
  });
}

export function modeDescription(): string {
  return describeMode(currentMode());
}

/**
 * The local operator.
 *
 * In local mode there is no identity provider and no sign-in, so the single
 * person at the keyboard is the owner of everything. The id is fixed rather
 * than random so the local store keeps working across restarts.
 */
const LOCAL_OPERATOR: Viewer = {
  authenticated: true,
  userId: "00000000-0000-4000-8000-000000000001",
  email: null,
  mode: "local",
};

const UNAUTHENTICATED: Viewer = {
  authenticated: false,
  userId: null,
  email: null,
  mode: "authenticated",
};

export async function getViewer(): Promise<Viewer> {
  const mode = currentMode();
  if (mode === "local") return LOCAL_OPERATOR;
  if (mode === "refuse") {
    return { authenticated: false, userId: null, email: null, mode: "refuse" };
  }

  const client = await serverSupabase();
  if (client === null) return UNAUTHENTICATED;
  try {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user === null) return UNAUTHENTICATED;
    return {
      authenticated: true,
      userId: user.id,
      email: user.email ?? null,
      mode: "authenticated",
    };
  } catch {
    // Provider unreachable or a malformed cookie: treat as signed out. The
    // alternative — assuming the last known identity — is how one person ends
    // up looking at another person's resume.
    return UNAUTHENTICATED;
  }
}

/** A Supabase client bound to the viewer's cookies, so RLS applies to it. */
export async function serverSupabase(): Promise<SupabaseClient | null> {
  const c = config();
  if (c.supabaseUrl === undefined || c.supabasePublishableKey === undefined)
    return null;
  const cookieStore = await cookies();
  return createServerClient(c.supabaseUrl, c.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        // Server components cannot set cookies; middleware refreshes the
        // session instead. Swallowing here is the documented Supabase pattern.
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context */
        }
      },
    },
  });
}
