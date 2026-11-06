/**
 * "Publish to 5 Star" pressed for a folder already in JerseySort must use the
 * game it is in, never make a second, empty one (a photo can be in
 * JerseySort only once). Real folders, real JPEGs, a real database.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { eventForFolder } from "./folder-event.ts";
import { importFolder, newProgress, readImportFolder } from "./folder-import.ts";
import { createEvent } from "./repo/events.ts";
import { account, freshDb, jpeg } from "./test-helpers.ts";

async function folder(names: string[]): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "publish-folder-"));
  mkdirSync(dir, { recursive: true });
  for (const n of names) writeFileSync(path.join(dir, `IMG_${n}.JPG`), await jpeg(n));
  return dir;
}

const game = {
  name: "Varsity vs Wheatfield",
  sport: "Hockey",
  teamName: "Varsity",
  opponent: "",
  eventDate: "2026-10-24",
  location: "",
  season: "2026",
  notes: "",
};

describe("which game holds a folder", () => {
  it("none, for a folder never brought in", async () => {
    const { db } = freshDb();
    const { organizationId: org } = account(db);
    const c = await readImportFolder(await folder(["01", "02"]));
    expect(await eventForFolder(db, org, c)).toBeNull();
  });

  it("the game it was brought into, found by the photos' bytes", async () => {
    const { db, dataDir } = freshDb();
    const { userId, organizationId: org } = account(db);
    const c = await readImportFolder(await folder(["01", "02", "03"]));
    const eventId = createEvent(db, org, userId, game);
    await importFolder(db, dataDir, {
      org,
      userId,
      eventId,
      contents: c,
      progress: newProgress(c),
    });
    expect(await eventForFolder(db, org, c)).toBe(eventId);
  });

  it("only within this organization", async () => {
    const { db, dataDir } = freshDb();
    const a = account(db);
    const b = account(db, "other@example.com", "Another Org");
    const c = await readImportFolder(await folder(["01"]));
    const eventId = createEvent(db, a.organizationId, a.userId, game);
    await importFolder(db, dataDir, {
      org: a.organizationId,
      userId: a.userId,
      eventId,
      contents: c,
      progress: newProgress(c),
    });
    expect(await eventForFolder(db, b.organizationId, c)).toBeNull();
  });
});
