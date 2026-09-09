/**
 * Talking to HL-BOS Core from a script.
 *
 * Two things every script that writes to the platform needs, and neither of
 * which should be written twice:
 *
 *   1. A transport. The Supabase Management API's SQL endpoint, using the
 *      access token the Control Center already holds. No database password, no
 *      second credential.
 *
 *   2. Impersonation. That endpoint connects as `postgres`, which bypasses
 *      every permission check in the schema. `asOwner()` puts them back: it
 *      sets the JWT claims and assumes `authenticated`, so a row written by a
 *      script is subject to exactly the rules a row written by the app is.
 *
 * The transport is an interface, not a hard dependency, so the same scripts run
 * against a local PostgreSQL in tests.
 */

export type SqlRunner = (sql: string) => Promise<Record<string, unknown>[]>;

/**
 * A database value as text, or null.
 *
 * Never `String(v)` on an unknown: a jsonb column that came back as an object
 * would become "[object Object]" and be written back as if it were a value.
 */
export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/**
 * Single-quote a value for inlining into a statement.
 *
 * The Management API takes a statement, not parameters, so values are inlined.
 * Doubling the quote is the whole escape: PostgreSQL has no backslash escape in
 * a standard-conforming string, so there is nothing else to neutralise.
 */
export function lit(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/** Wrap a plpgsql body so it executes as the given user, not as `postgres`. */
export function asOwner(userId: string, body: string): string {
  return `do $hl$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', ${lit(userId)}, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ${body}
  reset role;
end $hl$;`;
}

export function managementApiRunner(ref: string, token: string): SqlRunner {
  return async (sql: string) => {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (!res.ok) {
      throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const body: unknown = await res.json();
    // Both documented shapes. An unexpected shape is an error, never an empty
    // result: "no rows" and "we could not read the answer" are different, and
    // a script that confuses them would silently do nothing and report success.
    if (Array.isArray(body)) return body as Record<string, unknown>[];
    const wrapped = (body as { data?: unknown }).data;
    if (Array.isArray(wrapped)) return wrapped as Record<string, unknown>[];
    throw new Error(
      `Supabase returned something that is not a row set: ${JSON.stringify(body).slice(0, 200)}`,
    );
  };
}

/** The token and project ref a script needs, or a clear reason why not. */
export function runnerFromEnv():
  { ok: true; run: SqlRunner; ref: string } | { ok: false; reason: string } {
  const token = process.env["SUPABASE_ACCESS_TOKEN"];
  const ref = process.env["HLBOS_SUPABASE_PROJECT_REF"];
  if (!token || !ref) {
    return {
      ok: false,
      reason:
        "SUPABASE_ACCESS_TOKEN and HLBOS_SUPABASE_PROJECT_REF must be set. " +
        "The Control Center passes them from its Connect page.",
    };
  }
  return { ok: true, run: managementApiRunner(ref, token), ref };
}

/**
 * The tenant owner to act as, and the campaign to write into.
 *
 * Returns no owner rather than falling back to `postgres`: a script that
 * cannot find someone to act as must stop, not quietly write with more
 * authority than anyone actually has.
 */
export const CONTEXT_SQL = (tenantSlug: string, campaignKey: string) => `
select t.id::text as tenant_id,
       c.id::text as campaign_id,
       (select m.user_id::text from identity.memberships m
         join identity.membership_roles mr on mr.membership_id = m.id
        where m.tenant_id = t.id and m.status = 'active'
          and mr.role_key = 'tenant_owner' limit 1) as owner_id
  from platform.tenants t
  left join transform_audit.campaigns c
         on c.tenant_id = t.id and c.key = ${lit(campaignKey)}
 where t.slug = ${lit(tenantSlug)}`;

export interface HlbosContext {
  tenantId: string;
  campaignId: string | null;
  ownerId: string;
}

export async function loadContext(
  run: SqlRunner,
  tenantSlug: string,
  campaignKey: string,
): Promise<HlbosContext> {
  const rows = await run(CONTEXT_SQL(tenantSlug, campaignKey));
  const r = rows[0];
  if (r === undefined) throw new Error(`tenant ${tenantSlug} not found`);
  const ownerId = r["owner_id"];
  if (typeof ownerId !== "string" || ownerId === "") {
    throw new Error(
      `tenant ${tenantSlug} has no active owner to act as; refusing to write as a superuser`,
    );
  }
  return {
    tenantId: text(r["tenant_id"]) ?? "",
    campaignId: text(r["campaign_id"]),
    ownerId,
  };
}
