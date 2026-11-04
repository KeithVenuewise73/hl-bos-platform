/**
 * IsolatedDb — run HL-BOS SQL exactly as PostgREST does for a signed-in user.
 *
 * Every call is one transaction:
 *   SET LOCAL ROLE authenticated;
 *   set_config('request.jwt.claims', {"sub": <user>, "role": "authenticated"});
 *   <the RPC>
 * so row-level security, SECURITY DEFINER checks, identity.has_permission and
 * the module gate behave as they would behind the Supabase API. Nothing runs
 * with superuser rights except explicit seeding (`superuser`), which stands in
 * for provisioning and is refused unless the target is local.
 *
 * Scope: ISOLATED environments only. It refuses any host that is not a local
 * socket or localhost. Production uses supabase-js with the user's real JWT
 * against the same SQL.
 */

import pg from "pg";

export interface DbTarget {
  host: string;
  port: number;
  user: string;
  database: string;
  password?: string | undefined;
}

export class DbError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
  }
}

/** Structural check: survives a bundler loading this module twice. */
export function isDbError(e: unknown): e is DbError {
  return e instanceof Error && e.name === "DbError";
}

export function assertLocalTarget(t: DbTarget): DbTarget {
  if (!(t.host.startsWith("/") || t.host === "localhost" || t.host === "127.0.0.1")) {
    throw new Error(`IsolatedDb refuses non-local host ${t.host}`);
  }
  return t;
}

type Client = pg.PoolClient;

export class IsolatedDb {
  private readonly pool: pg.Pool;

  constructor(target: DbTarget) {
    assertLocalTarget(target);
    this.pool = new pg.Pool({
      host: target.host,
      port: target.port,
      user: target.user,
      database: target.database,
      password: target.password,
      max: 8,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async tx<T>(
    fn: (c: Client) => Promise<T>,
    setup?: (c: Client) => Promise<void>,
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      if (setup) await setup(c);
      const out = await fn(c);
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback").catch(() => undefined);
      const err = e as { message?: string; code?: string };
      throw new DbError(err.message ?? String(e), err.code);
    } finally {
      c.release();
    }
  }

  /** As a signed-in user: the same role switch and claims PostgREST applies. */
  asUser<T>(userId: string, fn: (c: Client) => Promise<T>): Promise<T> {
    return this.tx(fn, async (c) => {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    });
  }

  /** Seeding and provisioning only. Never used to serve a request. */
  superuser<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    return this.tx(fn);
  }

  /** Call one function as a user and return its single scalar result. */
  async rpc<T = unknown>(
    userId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T> {
    return this.asUser(userId, async (c) => {
      const r = await c.query(sql, params);
      const row = r.rows[0] as Record<string, unknown> | undefined;
      return (row ? Object.values(row)[0] : null) as T;
    });
  }

  /** Call a set-returning query as a user. */
  async rows<T = Record<string, unknown>>(
    userId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.asUser(userId, async (c) => (await c.query(sql, params)).rows as T[]);
  }
}
