"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client — publishable (anon) key ONLY. Never a service-role
// key. Used solely for interactive client sign-in/out; all data reads happen
// server-side under the viewer's session + RLS.
let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  if (!client) client = createBrowserClient(url, key);
  return client;
}
