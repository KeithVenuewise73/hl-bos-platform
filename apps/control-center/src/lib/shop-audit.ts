import "server-only";
import { readEnvFile } from "./secrets";
import {
  CAMPAIGN_SQL,
  text,
  HLD_TENANT_SLUG,
  REPORT_SQL,
  SHOPS_SQL,
  summarise,
  toShopRow,
  type CampaignSummary,
  type ShopRow,
  type SqlRunner,
} from "./shop-audit-sql";

export * from "./shop-audit-sql";

/**
 * Reads the Shop Transformation Analysis Tool's data out of HL-BOS Core.
 *
 * TRANSPORT. The console already holds a Supabase access token (the CEO pastes
 * it once on /connect) and this uses the same Management API the rest of
 * lib/supabase.ts uses, via its SQL endpoint. No second credential, no
 * database password, nothing new for anyone to manage.
 *
 * WHY NOT PostgREST: `transform_audit` and `barberos` are deliberately absent
 * from the API allow-list in supabase/config.toml, so they are unreachable over
 * /rest/v1. Exposing them would mean adding public wrapper RPCs and a new
 * externally-callable surface, which is a bigger decision than a read-only
 * console page justifies.
 *
 * PRIVILEGE. The SQL endpoint runs as `postgres`, which bypasses RLS. That is
 * not an escalation -- the same token can already do anything to the project --
 * but it does mean these reads see rows regardless of policy, so every query
 * below filters by tenant explicitly rather than relying on RLS to do it.
 * WRITES do not take this shortcut: they impersonate the tenant owner and go
 * through the permission-checked SECURITY DEFINER functions, exactly as the
 * app would. See scripts/audit-shops.mts.
 *
 * NOT VERIFIED AGAINST A LIVE PROJECT from the build environment: it has no
 * Supabase token and its network policy blocks the API. The SQL below is
 * verified against a local PostgreSQL carrying the same migrations; the HTTP
 * call is not. Said plainly rather than implied.
 */

/**
 * The Management API base.
 *
 * Overridable via the console's own .env.local -- the same file the token comes
 * from, read through secrets.ts, never from a request -- because the
 * alternative is a page nobody can check. Pointed at a local stand-in backed by
 * a PostgreSQL carrying the same migrations, this whole page renders against
 * real shop data before it ever sees production. It also covers a self-hosted
 * Supabase. See scripts/local-test/README.md.
 */
const DEFAULT_API = "https://api.supabase.com/v1";

export interface Connection {
  run: SqlRunner;
  ref: string;
}

export type ConnectionState =
  { connected: false; reason: string } | { connected: true; conn: Connection };

export async function connect(): Promise<ConnectionState> {
  const env = await readEnvFile();
  const tk = env["SUPABASE_ACCESS_TOKEN"];
  const ref = env["HLBOS_SUPABASE_PROJECT_REF"];
  const api = env["HLBOS_SUPABASE_API_URL"] ?? DEFAULT_API;
  if (!tk) {
    return {
      connected: false,
      reason: "Supabase is not connected yet. Add an access token on Connect accounts.",
    };
  }
  if (!ref) {
    return { connected: false, reason: "No Supabase project has been chosen yet." };
  }
  return {
    connected: true,
    conn: {
      ref,
      run: async (sql: string) => {
        const res = await fetch(`${api}/projects/${ref}/database/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tk}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(
            `Supabase ${res.status}: ${(await res.text()).slice(0, 400)}`,
          );
        }
        const body: unknown = await res.json();
        // Unverified against a live project from the build environment (it has
        // no Supabase token), so accept both shapes this endpoint is documented
        // to return -- a bare array, or one wrapped in `data` -- and treat
        // anything else as a failure rather than as "no shops".
        if (Array.isArray(body)) return body as Record<string, unknown>[];
        const wrapped = (body as { data?: unknown }).data;
        if (Array.isArray(wrapped)) return wrapped as Record<string, unknown>[];
        throw new Error(
          `Supabase returned something that is not a row set: ${JSON.stringify(body).slice(0, 200)}`,
        );
      },
    },
  };
}

export async function listShops(
  conn: Connection,
  campaignKey: string,
): Promise<{ campaign: CampaignSummary | null; shops: ShopRow[] }> {
  const campaignRows = await conn.run(CAMPAIGN_SQL(HLD_TENANT_SLUG, campaignKey));
  const campaign = campaignRows[0];
  // No campaign is a real state -- nothing has been imported yet -- not an
  // error and not an empty list of shops that happen to exist.
  if (campaign === undefined) return { campaign: null, shops: [] };
  const rows = (await conn.run(SHOPS_SQL(HLD_TENANT_SLUG, campaignKey))).map(toShopRow);
  return {
    campaign: summarise(
      text(campaign["key"]) ?? campaignKey,
      text(campaign["name"]) ?? campaignKey,
      rows,
    ),
    shops: rows,
  };
}

export interface ShopReport {
  name: string;
  locality: string | null;
  address: string | null;
  postalCode: string | null;
  phone: string | null;
  websiteUrl: string | null;
  sourceFile: string | null;
  sourceRow: number | null;
  /** null when the shop has never been analysed. Not an error — a state. */
  runId: string | null;
  status: string | null;
  score: number | null;
  hook: string | null;
  scored: number | null;
  possible: number | null;
  scorecard: {
    dimension: string;
    score: number | null;
    confidence: string;
    note: string;
    rubric: string;
  }[];
  findings: {
    code: string;
    statement: string;
    severity: string;
    confidence: string;
    evidence_url: string | null;
  }[];
  recommendations: {
    priority: string;
    title: string;
    detail: string;
    capability_key: string | null;
    rank: number;
  }[];
  bundle: { key: string; name: string; status: string; shipped: boolean }[];
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export async function shopReport(
  conn: Connection,
  prospectId: string,
): Promise<ShopReport | null> {
  const rows = await conn.run(REPORT_SQL(HLD_TENANT_SLUG, prospectId));
  const r = rows[0];
  if (r === undefined) return null;
  const s = (k: string): string | null => text(r[k]);
  const n = (k: string): number | null =>
    r[k] === null || r[k] === undefined ? null : Number(r[k]);
  return {
    name: text(r["business_name"]) ?? "",
    locality: s("locality"),
    address: s("address_line1"),
    postalCode: s("postal_code"),
    phone: s("phone"),
    websiteUrl: s("website_url"),
    sourceFile: s("source_file"),
    sourceRow: n("source_row"),
    runId: s("run_id"),
    status: s("status"),
    score: n("score"),
    hook: s("hook"),
    scored: n("dimensions_scored"),
    possible: n("dimensions_possible"),
    scorecard: arr(r["scorecard"]),
    findings: arr(r["findings"]),
    recommendations: arr(r["recommendations"]),
    bundle: arr(r["bundle"]),
  };
}
