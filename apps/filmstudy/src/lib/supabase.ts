import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The app's only route to the database.
 *
 * It uses the PUBLISHABLE key and the signed-in user's own cookies — never a
 * service-role key. That is not a convenience: every read in this app is
 * filtered by the RLS policies in migration 0048, and a service-role client
 * would bypass all of them. There is deliberately no helper here that could
 * be reached for in a hurry.
 *
 * The `filmstudy` schema is not `public`, so the client is pinned to it. That
 * requires the schema to be listed in the project's PostgREST `db.schemas` at
 * deploy time; `supabaseConfigured()` cannot detect that, so a misconfigured
 * project surfaces as a query error, which the UI reports rather than hides.
 */

export const FILMSTUDY_SCHEMA = "filmstudy";

function env() {
  return {
    url: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    key: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  };
}

export function supabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.url && e.key);
}

/** Render-context client: reads cookies, never writes them. */
export async function readClient(): Promise<SupabaseClient | null> {
  const e = env();
  if (!e.url || !e.key) return null;
  const store = await cookies();
  return createServerClient(e.url, e.key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      // Token refresh happens in middleware. A Server Component cannot set
      // cookies, and swallowing the attempt here is what keeps that true.
      setAll() {},
    },
  });
}

/** Action-context client: may rotate the session cookie. */
export async function writeClient(): Promise<SupabaseClient | null> {
  const e = env();
  if (!e.url || !e.key) return null;
  const store = await cookies();
  return createServerClient(e.url, e.key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          store.set(name, value, options);
        }
      },
    },
  });
}
