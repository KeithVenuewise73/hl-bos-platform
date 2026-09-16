"use client";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

/**
 * The Supabase client.
 *
 * Publishable (anon) key ONLY. This app is statically exported and runs
 * entirely on the device, so there is no server here that could hold a secret
 * and none is given one. Row Level Security -- enabled AND forced on every
 * table in migration 0049 -- is the boundary, exactly as it would be for a
 * native app.
 *
 * Returns null rather than throwing when the build has no Supabase
 * configuration. Callers must handle that, because "no account service" is a
 * supported mode of this product and not an error state.
 */
function build(url: string, key: string) {
  return createClient(url, key, {
    // Everything this app stores lives in the `playtime` schema, which must be
    // added to the project's exposed schemas for PostgREST to serve it. Until
    // migration 0049 is applied and that setting is made, every call fails
    // cleanly and the app stays on the device.
    db: { schema: "playtime" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The app is a static export opened at a file:// origin inside the
      // native shell, where there is no URL to read a session back from.
      detectSessionInUrl:
        typeof window !== "undefined" && window.location.protocol.startsWith("http"),
    },
  });
}

export type PlaytimeClient = ReturnType<typeof build>;

let client: PlaytimeClient | null = null;

export function supabase(): PlaytimeClient | null {
  if (SUPABASE_URL === null || SUPABASE_KEY === null) return null;
  if (client === null) client = build(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

/**
 * Turn a Supabase error into something a coach standing on a sideline can act
 * on. Anything unrecognised is passed through rather than replaced with a
 * friendly lie -- an error we have not seen before is exactly the one worth
 * reading verbatim.
 */
export function readableError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password do not match an account.";
  if (m.includes("email not confirmed")) return "Check your email and confirm your address before signing in.";
  if (m.includes("user already registered")) return "An account already exists for that email. Try signing in.";
  if (m.includes("password should be at least")) return "Choose a password of at least 6 characters.";
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "No connection. Your data is safe on this device and will sync when you are back online.";
  }
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  return message;
}
