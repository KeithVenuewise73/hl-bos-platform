import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The only connection this app has to HL-BOS Core.
 *
 * THE PUBLISHABLE KEY AND THE USER'S COOKIES, NOTHING ELSE. There is no
 * service-role key anywhere in this app and there must never be one: every
 * request is made AS THE SIGNED-IN BARBER, so the RLS policies and the
 * `identity.has_permission()` checks inside the database decide what happens.
 * A service-role key would bypass all of it and turn this app into the thing
 * standing between a shop and its own data.
 *
 * That is also why this app needs no authorization logic of its own. It asks
 * `barberos_my_shops()` what the person may do and draws its buttons from the
 * answer; the database enforces it either way.
 */

export interface Config {
  url: string;
  key: string;
}

export function config(): Config | null {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  return url && key ? { url, key } : null;
}

export type Connection =
  | { connected: false; reason: string }
  | { connected: true; client: SupabaseClient; email: string | null };

/**
 * Resolve the signed-in barber, fail-closed.
 *
 * Never assumes a session. An unconfigured environment and an expired session
 * are different answers and the screens say which.
 */
export async function connect(): Promise<Connection> {
  const c = config();
  if (c === null) {
    return {
      connected: false,
      reason:
        "This installation is not pointed at a BarberOS database yet, so there is nothing to sign in to.",
    };
  }

  const store = await cookies();
  const client = createServerClient(c.url, c.key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      // Render contexts cannot set cookies; the token refresh happens in
      // middleware, which is the one place allowed to write them back.
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return { connected: false, reason: "You are not signed in." };
  }
  return { connected: true, client, email: user.email ?? null };
}
