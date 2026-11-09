import "server-only";

import {
  RevenueCenter,
  supabaseRpc,
  type LineTenants,
} from "@hl-bos/growth-intelligence";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { RevenueSource } from "./revenue";

/**
 * The owner-only pilot: the Revenue Center against HL-BOS Core, signed in as
 * the owner through HL-BOS's own Supabase Auth.
 *
 * Identity is the signed-in session. The console holds only the project URL and
 * the PUBLISHABLE key (both public by design) — never the service-role key — so
 * every read and every decision runs as the owner, and the database's
 * permission checks, row-level security and release settings decide what is
 * allowed. The console cannot widen that.
 *
 * Settings (written to .env.local by the console's Connect page):
 *   HLBOS_PILOT_SUPABASE_URL          https://<ref>.supabase.co
 *   HLBOS_PILOT_PUBLISHABLE_KEY       the project's publishable key
 */
export interface PilotConfig {
  url: string;
  key: string;
}

export function pilotConfig(
  env: Readonly<Record<string, string | undefined>>,
): PilotConfig | undefined {
  const url = env["HLBOS_PILOT_SUPABASE_URL"];
  const key = env["HLBOS_PILOT_PUBLISHABLE_KEY"];
  if (!url || !key) return undefined;
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(url))
    throw new Error("The pilot address must be an HL-BOS Supabase project address.");
  // A service-role key would bypass every check this pilot relies on. Refuse it.
  if (/^sb_secret_/.test(key) || jwtRole(key) === "service_role")
    throw new Error(
      "The pilot was given a server key. It must use the publishable key only.",
    );
  return { url: url.replace(/\/$/, ""), key };
}

/** The `role` claim of a legacy JWT-style key, if it is one. */
export function jwtRole(key: string): string | undefined {
  const part = key.split(".")[1];
  if (!part) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return typeof claims.role === "string" ? claims.role : undefined;
  } catch {
    return undefined;
  }
}

/** A Supabase client bound to this browser's session cookies. */
export async function pilotClient(cfg: PilotConfig, writable: boolean) {
  const jar = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // Server components may not set cookies; actions (sign-in, sign-out, decisions) may.
        if (!writable) return;
        for (const { name, value, options } of list)
          jar.set(name, value, { ...options, httpOnly: true, sameSite: "strict" });
      },
    },
  });
}

/** Tenants by line, as the signed-in owner can see them (revenue.business_lines). */
export function tenantsFrom(
  rows: { tenant_id: string; line: string }[],
): LineTenants | undefined {
  const hld = rows.find((r) => r.line === "hld")?.tenant_id;
  const hscs = rows.find((r) => r.line === "hscs")?.tenant_id;
  return hld && hscs ? { hld, hscs } : undefined;
}

export async function pilotSource(
  cfg: PilotConfig,
  writable = false,
): Promise<RevenueSource> {
  const client = await pilotClient(cfg, writable);
  // getUser() asks the Auth server to verify the token; a forged or expired cookie fails here.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    return { mode: "sign_in_required", reason: "Sign in with your HL-BOS account." };
  const rpc = supabaseRpc(client);
  let lines: { tenant_id: string; line: string }[];
  try {
    lines = await rpc.rows(data.user.id, "revenue.business_lines", {});
  } catch (e) {
    return {
      mode: "not_connected",
      reason: `Signed in, but the Revenue Center is not installed on HL-BOS (${e instanceof Error ? e.message : String(e)}). Installing it is a production change that needs your approval.`,
    };
  }
  const tenants = tenantsFrom(lines);
  if (!tenants)
    return {
      mode: "not_connected",
      reason:
        "Signed in, but this account cannot see both an HLD and an HSCS business line. The tenant set-up (HSCS tenant, business lines, approver) has not been done yet; it needs your approval.",
    };
  return {
    mode: "pilot",
    rc: new RevenueCenter(rpc, tenants),
    rpc,
    actor: data.user.id,
    tenants,
    email: data.user.email ?? null,
  };
}
