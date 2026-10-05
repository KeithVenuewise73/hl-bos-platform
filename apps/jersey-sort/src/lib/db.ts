import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import { config } from "./config.ts";
import { openDb, type Db } from "./db-core.ts";

export { newId, nowIso, type Db } from "./db-core.ts";

const g = globalThis as unknown as { __jerseysortDb?: Db };

/** The one database handle this process uses (survives dev hot reloads). */
export function db(): Db {
  if (g.__jerseysortDb !== undefined) return g.__jerseysortDb;
  mkdirSync(config().dataDir, { recursive: true });
  g.__jerseysortDb = openDb(path.join(config().dataDir, "jerseysort.db"));
  return g.__jerseysortDb;
}
