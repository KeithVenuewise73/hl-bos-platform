import "server-only";
import { IsolatedDb } from "@hl-bos/commercial";
import { env } from "./env.ts";

const KEY = Symbol.for("hlbos.tms.db");
type G = typeof globalThis & { [KEY]?: IsolatedDb };

/** One pool per server process (survives dev hot reload). */
export function db(): IsolatedDb {
  const g = globalThis as G;
  g[KEY] ??= new IsolatedDb(env.db);
  return g[KEY];
}
