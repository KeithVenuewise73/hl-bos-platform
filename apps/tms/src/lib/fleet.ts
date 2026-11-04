import "server-only";

/**
 * The fleet backend for this app: production's fleet API (recovered) behind
 * the proposed licence gate, in the isolated database, called AS the
 * signed-in user through public.hlg_fleet_rpc — the same door Supabase
 * clients use. Role checks, licence checks and company isolation all happen
 * in the database.
 */
import { isDbError } from "@hl-bos/commercial";
import { FleetError, type FleetBackend, type Operation } from "@hl-bos/tms";
import { db } from "./db.ts";

export const fleetBackend: FleetBackend = {
  async call<T = unknown>(
    actor: string,
    op: Operation,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    try {
      return await db().rpc<T>(actor, "select public.hlg_fleet_rpc($1, $2::jsonb)", [
        op,
        JSON.stringify(args),
      ]);
    } catch (e) {
      if (isDbError(e)) throw new FleetError(e.message, e.code);
      throw e;
    }
  },
};
