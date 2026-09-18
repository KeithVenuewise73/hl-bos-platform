import "server-only";

/**
 * Storage.
 *
 * One JSON document per account, written atomically. The PostgreSQL schema
 * this maps onto is written, tested and committed (migration 0049) but has NOT
 * been applied to any project, so the Supabase-backed store is not the default
 * — and Settings says which of the two is actually in use rather than implying
 * a database that is not there.
 *
 * The important property for this product is durability across page loads:
 * "users must be able to leave the page and return without losing job state"
 * is a requirement about where progress lives, and it lives here.
 */

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { emptyWorkspace, type Workspace } from "./workspace.ts";
import { config } from "./config.ts";
import { getViewer } from "./session.ts";

export type { Workspace } from "./workspace.ts";

/**
 * One file per owner.
 *
 * The id comes from the identity provider and is used as a path segment, so it
 * is validated rather than trusted: anything that is not a plain UUID is
 * refused instead of being written somewhere unexpected.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dataRoot(): string {
  const dir = config().dataDir;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

export function storePathFor(ownerId: string): string {
  if (!UUID_RE.test(ownerId)) {
    throw new Error("Refusing to open a store for a malformed owner id.");
  }
  return join(dataRoot(), `workspace-${ownerId.toLowerCase()}.json`);
}

/**
 * Cache keyed on the file's modification time, not a plain in-memory copy.
 *
 * Route handlers and server actions do not reliably share module state: each
 * bundle can carry its own copy of this module and its own cache. For a job
 * whose status is polled from one place and advanced from another, a stale
 * read means a progress bar that never moves — or worse, one that moves after
 * the job has already failed.
 */
const memo = new Map<string, { workspace: Workspace; mtimeMs: number }>();

async function currentOwner(): Promise<string> {
  const viewer = await getViewer();
  if (viewer.userId === null) {
    throw new Error("No signed-in user, so there is no store to open.");
  }
  return viewer.userId;
}

export async function loadWorkspace(): Promise<Workspace> {
  const owner = await currentOwner();
  const path = storePathFor(owner);
  try {
    const stats = await stat(path);
    const cached = memo.get(path);
    if (cached !== undefined && cached.mtimeMs === stats.mtimeMs)
      return cached.workspace;
    const parsed = JSON.parse(await readFile(path, "utf8")) as Workspace;
    const workspace = { ...emptyWorkspace(parsed.userId ?? owner), ...parsed };
    memo.set(path, { workspace, mtimeMs: stats.mtimeMs });
    return workspace;
  } catch {
    // No store yet, or an unreadable one. Start empty. Deliberately NOT
    // seeded with sample data: a fabricated highlight reel of a child who
    // does not exist is exactly the kind of invention principle 10 forbids,
    // and a demo game video is not something this app can honestly conjure.
    return emptyWorkspace(owner);
  }
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const path = storePathFor(await currentOwner());
  await mkdir(dirname(path), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous file intact
  // rather than a truncated one.
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(workspace, null, 2), "utf8");
  await rename(temporary, path);
  const stats = await stat(path);
  memo.set(path, { workspace, mtimeMs: stats.mtimeMs });
}

/** Read, mutate, write. The only way the app changes stored state. */
export async function updateWorkspace<T>(
  mutate: (workspace: Workspace) => T | Promise<T>,
): Promise<T> {
  const working = structuredClone(await loadWorkspace());
  const result = await mutate(working);
  await saveWorkspace(working);
  return result;
}

/**
 * The shared media root, as an absolute path.
 *
 * The vision service is pointed at this same directory, and both sides address
 * files inside it by relative key. See lib/media.ts for the rule.
 */
export function mediaRoot(): string {
  const dir = config().mediaRoot;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

export function resetStoreCache(): void {
  memo.clear();
}

export async function storageDescription(): Promise<string> {
  const owner = await getViewer();
  const where = owner.userId === null ? config().dataDir : storePathFor(owner.userId);
  return `JSON store at ${where}, with video files under ${mediaRoot()}. One account per file. The PostgreSQL schema for this data is written and tested (migration 0049) but has not been applied to any project, so nothing here is in a database yet.`;
}
