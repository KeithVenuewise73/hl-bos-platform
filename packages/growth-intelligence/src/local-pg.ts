// LOCAL DEVELOPMENT AND TESTS ONLY. An HlbosRpc that runs the real HL-BOS database functions
// on a throwaway local PostgreSQL through `psql`, impersonating a user exactly
// as PostgREST does (request.jwt.claims + role authenticated), so row-level
// security and every permission check apply. Never pointed at a hosted project:
// it refuses any host other than a local socket or localhost.

import { execFileSync } from "node:child_process";

import type { HlbosRpc } from "./revenue-center.ts";

const IDENT = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const COL = /^[a-z_][a-z0-9_]*$/;

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  // A list of strings is a PostgreSQL array literal ('{"a","b"}'), as PostgREST
  // converts a JSON array for a text[] parameter.
  if (Array.isArray(v) && v.every((x) => typeof x === "string"))
    return lit(
      `{${v.map((x) => `"${x.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`,
    );
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `'${s.replace(/'/g, "''")}'`;
}

export interface LocalPg {
  host: string;
  port: string;
  user: string;
  database: string;
}

export function assertLocal(pg: LocalPg): void {
  if (!(pg.host.startsWith("/") || pg.host === "localhost" || pg.host === "127.0.0.1"))
    throw new Error(`Refusing to run tests against non-local host ${pg.host}.`);
}

export function psql(pg: LocalPg, sql: string, database = pg.database): string {
  assertLocal(pg);
  try {
    return execFileSync(
      "psql",
      [
        "-h",
        pg.host,
        "-p",
        pg.port,
        "-U",
        pg.user,
        "-d",
        database,
        "-X",
        "-q",
        "-tA",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string };
    const msg =
      (err.stderr ?? String(e)).split("\n").find((l) => l.includes("ERROR")) ??
      String(e);
    throw new Error(msg.replace(/^.*ERROR:\s*/, "").trim(), { cause: e });
  }
}

function asUser(actor: string, body: string): string {
  const claims = JSON.stringify({ sub: actor, role: "authenticated" });
  return `begin;
\\o /dev/null
select set_config('request.jwt.claims', ${lit(claims)}, true);
set local role authenticated;
\\o
${body}
commit;
`;
}

function result(out: string): unknown {
  const line = out.split("\n").find((l) => l.startsWith("RESULT:"));
  if (line === undefined) throw new Error(`No result in: ${out}`);
  return JSON.parse(line.slice("RESULT:".length));
}

export function psqlRpc(pg: LocalPg): HlbosRpc {
  return {
    call<T>(actor: string, fn: string, args: Record<string, unknown>): Promise<T> {
      if (!IDENT.test(fn)) return Promise.reject(new Error(`Bad function name ${fn}`));
      const named = Object.entries(args)
        .map(([k, v]) => {
          if (!COL.test(k)) throw new Error(`Bad argument name ${k}`);
          return `${k} => ${lit(v)}`;
        })
        .join(", ");
      try {
        const out = psql(
          pg,
          asUser(
            actor,
            `select 'RESULT:' || coalesce(to_jsonb(${fn}(${named}))::text, 'null');`,
          ),
        );
        return Promise.resolve(result(out) as T);
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    },
    rows<T>(actor: string, table: string, match: Record<string, string>): Promise<T[]> {
      if (!IDENT.test(table))
        return Promise.reject(new Error(`Bad table name ${table}`));
      const where = Object.entries(match)
        .map(([k, v]) => {
          if (!COL.test(k)) throw new Error(`Bad column ${k}`);
          return `t.${k}::text = ${lit(v)}`;
        })
        .join(" and ");
      try {
        const out = psql(
          pg,
          asUser(
            actor,
            `select 'RESULT:' || coalesce(jsonb_agg(to_jsonb(t))::text, '[]') from ${table} t${where ? ` where ${where}` : ""};`,
          ),
        );
        return Promise.resolve(result(out) as T[]);
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    },
  };
}
