"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser Supabase client — the app's ONE client-side env boundary.
 *
 * Publishable key only, never the service-role key. It is used for exactly two
 * things: interactive sign-in, and streaming an upload's bytes to Storage. Every
 * data read is server-side under the viewer's session and RLS.
 *
 * Consolidated here rather than read in each component so the eslint env-access
 * exemption covers one file instead of several — the same pattern as
 * apps/executive-portal/src/lib/browser.ts.
 *
 * Bracket access is deliberate: `noPropertyAccessFromIndexSignature` in the
 * shared tsconfig rejects `process.env.FOO`. Verified by build probe that Next
 * 16 still inlines the bracket form into the client bundle, so the values are
 * present in the browser.
 */
let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  if (client === null) client = createBrowserClient(url, key);
  return client;
}

/** Whether the browser has what it needs to talk to a project at all. */
export function browserConfigured(): boolean {
  return browserSupabase() !== null;
}
