import "server-only";

import { config } from "./config.ts";
import { db } from "./db.ts";
import {
  importFolder,
  newProgress,
  type FolderContents,
  type ImportProgress,
} from "./folder-import.ts";
import { kickQueue } from "./queue.ts";

/**
 * Folder imports running in this server, by event. Kept in memory: a restart
 * stops an import part-way, and starting it again from DateSort finishes it
 * (photos already in are recognised by their bytes and skipped).
 *
 * On globalThis, not in a module variable: Next.js bundles the server action
 * (which starts an import) and the pages and API routes (which show it)
 * separately, each with its own copy of this module. A plain Map here was
 * invisible to the event page, so the import ran but never showed.
 */
const shared = globalThis as { __jerseysortImports?: Map<string, ImportProgress> };
const running = (shared.__jerseysortImports ??= new Map<string, ImportProgress>());

export function startImport(input: {
  readonly org: string;
  readonly userId: string;
  readonly eventId: string;
  readonly contents: FolderContents;
}): void {
  const progress = newProgress(input.contents);
  running.set(input.eventId, progress);
  void importFolder(db(), config().dataDir, {
    ...input,
    progress,
    onPhoto: (p) => {
      // Analysis starts while photos are still arriving.
      if (p.added > 0 && (p.done % 5 === 0 || p.done === p.total)) kickQueue();
    },
  }).catch((e: unknown) => {
    console.error("[jerseysort] folder import stopped:", e);
    progress.finished = true;
  });
}

export function importStatus(eventId: string | null): ImportProgress | null {
  return eventId === null ? null : (running.get(eventId) ?? null);
}
