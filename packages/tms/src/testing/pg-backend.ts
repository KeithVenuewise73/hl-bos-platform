/**
 * PgFleetBackend — TEST ONLY. Calls the real, recovered production fleet.api
 * in an isolated local PostgreSQL built by scripts/local-test/tms-fleet-db.sh.
 *
 * Each call is one transaction that does what PostgREST does for a signed-in
 * user: SET LOCAL ROLE authenticated, set request.jwt.claims, then
 * select public.hlg_fleet_rpc(op, args). Seeding runs as the superuser, the way
 * HL-BOS provisioning would.
 *
 * Uses the psql binary rather than a driver so the repo gains no dependency.
 * Never point this at a Supabase project: it refuses any host but a local
 * socket or localhost.
 */

import { execFileSync } from "node:child_process";
import { FleetError, type FleetBackend } from "../backend.ts";
import type { Operation, Role } from "../entitlements.ts";

export interface PgTarget {
  host: string;
  port: string;
  user: string;
  database: string;
}

/** Refuses anything but a local socket or localhost. */
export function assertLocal(t: PgTarget): PgTarget {
  if (!(t.host.startsWith("/") || t.host === "localhost" || t.host === "127.0.0.1")) {
    throw new Error(`PgFleetBackend refuses non-local host ${t.host}`);
  }
  return t;
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export class PgFleetBackend implements FleetBackend {
  constructor(private readonly t: PgTarget) {
    assertLocal(t);
  }

  private psql(sql: string): string {
    try {
      return execFileSync(
        "psql",
        [
          "-h",
          this.t.host,
          "-p",
          this.t.port,
          "-U",
          this.t.user,
          "-d",
          this.t.database,
          "-X",
          "-q",
          "-t",
          "-A",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    } catch (e) {
      const stderr = String((e as { stderr?: string }).stderr ?? e);
      const m = /ERROR:\s+(.*)/.exec(stderr);
      throw new FleetError(m ? m[1]!.trim() : stderr.trim());
    }
  }

  sql(sql: string): string {
    return this.psql(sql);
  }

  /** One transaction as a signed-in user, the way PostgREST runs a request. */
  private asUser<T>(actor: string, expr: string): T {
    const claims = JSON.stringify({ sub: actor, role: "authenticated" });
    const out = this.psql(
      [
        "begin;",
        "set local role authenticated;",
        `select set_config('request.jwt.claims', ${lit(claims)}, true) \\g /dev/null`,
        `select ${expr};`,
        "commit;",
      ].join("\n"),
    );
    return JSON.parse(out) as T;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- psql is synchronous; interface is async
  async call<T = unknown>(
    actor: string,
    op: Operation,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    return this.asUser<T>(
      actor,
      `public.hlg_fleet_rpc(${lit(op)}, ${lit(JSON.stringify(args))}::jsonb)`,
    );
  }

  /** Call one of the public fleet RPC wrappers by name. */
  // eslint-disable-next-line @typescript-eslint/require-await -- psql is synchronous
  async callRpc<T = unknown>(
    actor: string,
    fn: "hlg_fleet_rpc" | "hlg_fleet_medical_rpc",
    op: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    return this.asUser<T>(
      actor,
      `public.${fn}(${lit(op)}, ${lit(JSON.stringify(args))}::jsonb)`,
    );
  }

  /** Call an internal function directly, as a signed-in user would try to. */
  // eslint-disable-next-line @typescript-eslint/require-await -- psql is synchronous
  async callFunction<T = unknown>(
    actor: string,
    qualified: "fleet.api" | "fleet.medical_api",
    op: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    return this.asUser<T>(
      actor,
      `${qualified}(${lit(op)}, ${lit(JSON.stringify(args))}::jsonb)`,
    );
  }

  addUser(id: string, email: string, confirmed = true): void {
    this.psql(
      `insert into auth.users(id,email,email_confirmed_at) values (${lit(id)},${lit(email)},${confirmed ? "now()" : "null"});`,
    );
  }

  /**
   * A company with the four built TransportationOS modules licensed unless
   * `modules` says otherwise. Licences are real HL-BOS entitlement rows, so
   * every call goes through the P002 gate exactly as it would in production.
   */
  addWorkspace(
    id: string,
    name: string,
    opts: { operable?: boolean; modules?: readonly string[] } = {},
  ): void {
    const slug = `t-${id.slice(0, 8)}`;
    const status = opts.operable === false ? "suspended" : "active";
    const features = (
      opts.modules ?? ["tms_fleet", "tms_drivers", "tms_dvir", "tms_maintenance"]
    )
      .map(
        (m) =>
          `(${lit(id)}, (select feature_key from entitlements.modules where key = ${lit(m)}), 'grant')`,
      )
      .join(",");
    this.psql(
      `insert into platform.tenants(id,slug,name,status) values (${lit(id)},${lit(slug)},${lit(name)},${lit(status)});
       insert into fleet.workspaces(id,name,bootstrap_owner_email) values (${lit(id)},${lit(name)},'owner@example.test');
       ${features ? `insert into entitlements.tenant_entitlements (tenant_id, feature_key, source) values ${features};` : ""}`,
    );
  }

  /** Replace a company's licences (to test what happens when one is removed). */
  setModules(id: string, modules: readonly string[]): void {
    const rows = modules
      .map(
        (m) =>
          `(${lit(id)}, (select feature_key from entitlements.modules where key = ${lit(m)}), 'grant')`,
      )
      .join(",");
    this.psql(
      `delete from entitlements.tenant_entitlements where tenant_id = ${lit(id)};
       ${rows ? `insert into entitlements.tenant_entitlements (tenant_id, feature_key, source) values ${rows};` : ""}`,
    );
  }

  addMember(workspace: string, user: string, role: Role, active = true): void {
    this.psql(
      `insert into fleet.members(workspace_id,user_id,role,active) values (${lit(workspace)},${lit(user)},${lit(role)},${active});`,
    );
  }

  putObject(workspace: string, path: string, owner: string): void {
    this.psql(
      `insert into storage.objects(bucket_id,name,owner_id) values ('hlg-fleet-documents',${lit(`${workspace}/${path}`)},${lit(owner)});`,
    );
  }
}
