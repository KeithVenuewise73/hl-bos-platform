/**
 * Quality hints, worked out once per photo and remembered (photo_quality).
 * They only ever help a reviewer look; see quality-core.ts. Local-only.
 */

import type { Db } from "../db-core.ts";
import { flagsFor, measure, type QualityFlag } from "../quality-core.ts";
import { getObject } from "../storage.ts";

interface Row {
  id: string;
  preview_path: string;
  width: number | null;
  height: number | null;
}

/**
 * Make sure each of these photos has its hints. Photos already measured are
 * skipped. A preview that cannot be read is simply left without hints (the
 * reviewer still sees the photo); it is not an error for the page.
 * Returns how many were newly measured.
 */
export async function ensureQuality(
  db: Db,
  dataDir: string,
  org: string,
  photoIds: readonly string[],
): Promise<number> {
  let done = 0;
  for (const id of photoIds) {
    const row = db.get<Row>(
      `select p.id, p.preview_path, p.width, p.height from photos p
        where p.id = :id and p.organization_id = :org and p.preview_path is not null
          and not exists (select 1 from photo_quality q where q.photo_id = p.id)`,
      { id, org },
    );
    if (row === undefined) continue;
    try {
      const reading = await measure(await getObject(dataDir, row.preview_path));
      const longEdge =
        row.width !== null && row.height !== null
          ? Math.max(row.width, row.height)
          : null;
      db.run(
        `insert or replace into photo_quality (photo_id, sharpness, brightness, long_edge, flags, computed_at)
         values (:id, :s, :b, :l, :f, :at)`,
        {
          id,
          s: reading.sharpness,
          b: reading.brightness,
          l: longEdge,
          f: flagsFor(reading, longEdge).join(","),
          at: new Date().toISOString(),
        },
      );
      done += 1;
    } catch {
      /* unreadable preview: no hints for this one */
    }
  }
  return done;
}

/** The flags stored for a photo ("" means measured and fine). */
export function parseFlags(stored: string | null): QualityFlag[] {
  return (stored ?? "")
    .split(",")
    .filter((f): f is QualityFlag => ["soft", "dark", "bright", "small"].includes(f));
}
