import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { devBypassEnabled } from "./access";

export interface ClientViewer {
  authenticated: boolean;
  email: string | null;
  /** True when access came from the local dev bypass (never in production). */
  dev: boolean;
}

const ANON: ClientViewer = { authenticated: false, email: null, dev: false };

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
