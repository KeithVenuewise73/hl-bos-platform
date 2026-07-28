"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The browser talks to the HL-BOS Supabase Pro project with ONLY the publishable
// (anon) key. That key is not a security boundary — Row Level Security and the
// permission-checked public.bti_* RPCs are. The signed-in user's JWT rides on
// every request, so identity.has_permission(tenant, …) governs everything.
//
// These two values are NEXT_PUBLIC_ and inlined at build time; they are public
// by design (the URL is in every request; the anon key is documented as safe to
// expose). The service-role key is NEVER referenced here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True only when both build-time Supabase values are present. */
export const supabaseConfigured: boolean = Boolean(url && key);

let client: SupabaseClient | null = null;

/** Lazily create the single browser client. Throws a clear error if unconfigured. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set at build time.",
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
