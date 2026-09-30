/**
 * The local project store.
 *
 * One JSON file for projects and one folder per project for its media, under
 * a data directory on this computer. A deliberate choice for this version:
 *
 *   - It works with no credentials, no network and no migration, so the app
 *     is usable the moment it starts.
 *   - Every record is a plain serialisable object with the same shape as the
 *     `hype` schema (migration 0051), so moving to Supabase is a different
 *     implementation of `HypeStore`, not a rewrite of the app.
 *
 * Writes are atomic (write a temp file, then rename over the old one) and
 * serialised through one queue, so two quick clicks cannot interleave and
 * leave a half-written file.
 *
 * No `server-only` import here, so the store can be tested against a temp
 * directory; `store.ts` is the server-only wrapper the app uses.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import type { HypeProject, MediaItem } from "@hl-bos/hype-video";

import { isId } from "./media.ts";

interface StoreFile {
  readonly version: 1;
  readonly projects: readonly HypeProject[];
}

export interface HypeStore {
  list(): Promise<readonly HypeProject[]>;
  get(id: string): Promise<HypeProject | null>;
  insert(project: HypeProject): Promise<void>;
  /** Apply `change` to the stored project atomically. Returns the new value. */
  update(id: string, change: (p: HypeProject) => HypeProject): Promise<HypeProject>;
  /** Removes the project AND every file uploaded to it. */
  remove(id: string): Promise<void>;
  writeMedia(
    projectId: string,
    mediaId: string,
    extension: string,
    bytes: Uint8Array,
  ): Promise<void>;
  readMedia(projectId: string, item: MediaItem): Promise<Buffer>;
  deleteMedia(projectId: string, item: MediaItem): Promise<void>;
}

const EXT: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function extensionFor(mimeType: string): string {
  const ext = EXT[mimeType];
  if (ext === undefined) throw new Error(`No stored file type for ${mimeType}.`);
  return ext;
}

export function createFileStore(dataDir: string): HypeStore {
  const base = isAbsolute(dataDir)
    ? dataDir
    : resolve(/*turbopackIgnore: true*/ process.cwd(), dataDir);
  const dbPath = join(base, "projects.json");
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  async function load(): Promise<StoreFile> {
    try {
      const parsed = JSON.parse(await readFile(dbPath, "utf8")) as StoreFile;
      return { version: 1, projects: parsed.projects };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, projects: [] };
      throw error;
    }
  }

  async function save(file: StoreFile): Promise<void> {
    await mkdir(base, { recursive: true });
    const tmp = `${dbPath}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
    await rename(tmp, dbPath);
  }

  const mediaDir = (projectId: string): string => {
    if (!isId(projectId)) throw new Error("Refusing a malformed project id.");
    return join(base, "media", projectId);
  };
  const mediaPath = (projectId: string, mediaId: string, extension: string): string => {
    if (!isId(mediaId)) throw new Error("Refusing a malformed media id.");
    return join(mediaDir(projectId), `${mediaId}.${extension}`);
  };

  return {
    async list() {
      const { projects } = await load();
      return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async get(id) {
      if (!isId(id)) return null;
      return (await load()).projects.find((p) => p.id === id) ?? null;
    },

    insert(project) {
      return serial(async () => {
        const file = await load();
        await save({ version: 1, projects: [...file.projects, project] });
      });
    },

    update(id, change) {
      return serial(async () => {
        const file = await load();
        const current = file.projects.find((p) => p.id === id);
        if (current === undefined) throw new Error("That project no longer exists.");
        const next = {
          ...change(current),
          id: current.id,
          updatedAt: new Date().toISOString(),
        };
        await save({
          version: 1,
          projects: file.projects.map((p) => (p.id === id ? next : p)),
        });
        return next;
      });
    },

    remove(id) {
      return serial(async () => {
        const file = await load();
        await save({ version: 1, projects: file.projects.filter((p) => p.id !== id) });
        await rm(mediaDir(id), { recursive: true, force: true });
      });
    },

    async writeMedia(projectId, mediaId, extension, bytes) {
      await mkdir(mediaDir(projectId), { recursive: true });
      await writeFile(mediaPath(projectId, mediaId, extension), bytes);
    },

    readMedia(projectId, item) {
      return readFile(mediaPath(projectId, item.id, extensionFor(item.mimeType)));
    },

    async deleteMedia(projectId, item) {
      await rm(mediaPath(projectId, item.id, extensionFor(item.mimeType)), {
        force: true,
      });
    },
  };
}
