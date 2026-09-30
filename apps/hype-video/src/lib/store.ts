import "server-only";

import { config } from "./config.ts";
import { createFileStore, type HypeStore } from "./store-core.ts";

export { extensionFor } from "./store-core.ts";

let instance: HypeStore | undefined;

/** The one store this process uses. See store-core.ts for how it works. */
export function store(): HypeStore {
  instance ??= createFileStore(config().dataDir);
  return instance;
}
