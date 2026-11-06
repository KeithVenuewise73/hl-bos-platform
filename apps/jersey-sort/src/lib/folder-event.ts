/**
 * Which event already holds a folder's photos, if any.
 *
 * "Publish to 5 Star" in DateSort may be pressed for a date whose folder was
 * already brought in ("Find jersey numbers", or an earlier publish). A photo
 * can be in JerseySort only once (by its bytes), so a second event made from
 * the same folder would stay empty. Instead, the event that already holds the
 * folder's photos is found by their bytes and used again.
 *
 * Free of `server-only` so it can be tested against a temp dir.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Db } from "./db-core.ts";
import type { FolderContents } from "./folder-import.ts";
import { sha256 } from "./media-core.ts";

/** How many of the folder's photos are looked up (enough, and quick). */
const SAMPLE = 5;

export async function eventForFolder(
  db: Db,
  org: string,
  contents: FolderContents,
): Promise<string | null> {
  for (const name of contents.photos.slice(0, SAMPLE)) {
    const bytes = await readFile(path.join(contents.folder, name)).catch(() => null);
    if (bytes === null) continue;
    const hit = db.get<{ event_id: string }>(
      "select event_id from photos where organization_id = :org and file_hash = :hash",
      { org, hash: sha256(new Uint8Array(bytes)) },
    );
    if (hit !== undefined) return hit.event_id;
  }
  return null;
}
