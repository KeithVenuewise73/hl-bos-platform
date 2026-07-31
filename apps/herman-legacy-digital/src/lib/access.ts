/**
 * Access resolution — PURE helpers (no I/O), unit-tested for the security-
 * critical decision: the local dev bypass is IMPOSSIBLE in production.
 *
 * Herman Legacy Digital reuses HL-BOS identity (Supabase Auth). It introduces no
 * new identity system. The public site needs no auth; only `/portal` is gated.
 */

export interface EnvView {
  nodeEnv: string | undefined;
  hlBosEnv: string | undefined;
  devClient: string | undefined;
}

/**
 * Local-only development bypass for the client portal. Returns true ONLY when NOT
 * in production and an explicit `HLD_DEV_CLIENT` is set. In production (by
 * NODE_ENV or HL_BOS_ENV) it ALWAYS returns false — the bypass cannot exist in
 * production. Lets us render the real portal locally while production stays
 * fully auth-gated.
 */
export function devBypassEnabled(env: EnvView): boolean {
  if (env.nodeEnv === "production" || env.hlBosEnv === "production") return false;
  return Boolean(env.devClient);
}
