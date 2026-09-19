import "server-only";

import type { ModeState } from "./mode";
import { resolveMode } from "./mode";

/**
 * The app's ONLY reader of `process.env`.
 *
 * HL-BOS blocks direct `process.env` access everywhere (`no-restricted-properties`)
 * so that configuration goes through `@hl-bos/config`, which validates and
 * classifies every variable. This file is the single scoped exception, matching
 * the pattern the Executive Portal and Venture Studio already use.
 *
 * The exception is narrow and the values are narrow with it: the Supabase URL
 * and publishable key, both browser-safe by the platform's own ENV_SPEC (the
 * publishable key is gated by RLS, not by secrecy), plus a demo-mode switch.
 * No service-role key is read here or anywhere in this app.
 *
 * `server-only` makes it a build error to pull this into a client bundle.
 */
export function currentMode(): ModeState {
  // Static literal keys, bracketed to satisfy `noPropertyAccessFromIndexSignature`.
  // Next inlines NEXT_PUBLIC_* at build time from a literal key either way; what
  // it cannot inline is a computed one, so these must never become variables.
  return resolveMode({
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    HIGHLIGHTAI_MODE: process.env["HIGHLIGHTAI_MODE"],
  });
}
