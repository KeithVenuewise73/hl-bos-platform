import "server-only";

/**
 * TransportationOS's env boundary — the ONE file in this app allowed to read
 * process.env (eslint exemption in eslint.config.mjs).
 *
 * Every value has a safe local default, so the app starts with nothing set.
 * The database must be local: IsolatedDb refuses any other host, and this
 * app is not for production until it is switched to Supabase auth + RPC.
 */
import { randomBytes } from "node:crypto";

const e = process.env;

// ONE random secret per process, not per module copy: Next.js bundles this
// file into several server chunks, and a per-chunk secret meant a cookie
// signed by the sign-in route failed verification on every page. (Found by
// the browser test.)
const SECRET_KEY = Symbol.for("hlbos.tms.sessionSecret");
const g = globalThis as typeof globalThis & { [SECRET_KEY]?: string };
g[SECRET_KEY] ??= randomBytes(32).toString("hex");

export const env = {
  db: {
    host: e["TMS_PGHOST"] ?? "/tmp/tmspg",
    port: Number(e["TMS_PGPORT"] ?? 5434),
    user: e["TMS_PGUSER"] ?? "postgres",
    database: e["TMS_PGDATABASE"] ?? "tms_fleet",
    password: e["TMS_PGPASSWORD"],
  },
  /** Signs session cookies. Random per process if unset: restarting signs everyone out. */
  sessionSecret: e["TMS_SESSION_SECRET"] ?? g[SECRET_KEY],
  /**
   * The webhook secret for the isolated environment. A real Stripe secret is
   * never set here; the dev default only signs events this app generates
   * itself (the "simulate billing event" control).
   */
  stripeWebhookSecret:
    e["TMS_STRIPE_WEBHOOK_SECRET"] ?? "whsec_isolated_environment_only",
  /** The billing / delivery service account seeded into the isolated database. */
  serviceAccountEmail:
    e["TMS_SERVICE_ACCOUNT_EMAIL"] ?? "billing-worker@hlbos.example.test",
  dataDir: e["TMS_DATA_DIR"] ?? ".tms-data",
} as const;
