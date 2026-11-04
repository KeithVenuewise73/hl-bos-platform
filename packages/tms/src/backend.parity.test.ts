/**
 * Runs the shared scenarios against both backends.
 *
 *   pnpm --filter @hl-bos/tms test                       # memory backend only
 *   bash scripts/local-test/tms-fleet-db.sh \
 *     && TMS_PG_DB=tms_fleet pnpm --filter @hl-bos/tms test   # + recovered production SQL
 *
 * The PostgreSQL half is skipped (and says so) when TMS_PG_DB is not set, so
 * CI without a database stays green without pretending the parity ran.
 */
import { describe, it } from "vitest";
import { MemoryFleetBackend } from "./memory-backend.ts";
import { PgFleetBackend, type PgTarget } from "./testing/pg-backend.ts";
import { fleetScenarios } from "./testing/scenarios.ts";

fleetScenarios("in-memory port", () => new MemoryFleetBackend());

const env = process.env;
const target: PgTarget | null = env["TMS_PG_DB"]
  ? {
      host: env["PGHOST"] ?? "/tmp/tmspg",
      port: env["PGPORT"] ?? "5434",
      user: env["PGUSER"] ?? "postgres",
      database: env["TMS_PG_DB"],
    }
  : null;
if (target) {
  fleetScenarios(
    `recovered production fleet.api on local PostgreSQL (${target.database})`,
    () => new PgFleetBackend(target),
  );
} else {
  describe("recovered production fleet.api on local PostgreSQL", () => {
    it.skip("SKIPPED: set TMS_PG_DB after running scripts/local-test/tms-fleet-db.sh", () => {});
  });
}
