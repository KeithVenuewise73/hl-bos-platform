"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser-side Supabase client, used only by the sign-in form.
 *
 * `NEXT_PUBLIC_*` must be read as literal dot-access for Next to inline it into
 * the client bundle, which is why this file carries the ESLint exemption. Both
 * values are browser-safe by the platform's own ENV_SPEC: the publishable key
 * is public by design and row-level security, not secrecy, is the boundary.
 */
export function browserSupabase() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (url === undefined || key === undefined) return null;
  return createBrowserClient(url, key);
}
