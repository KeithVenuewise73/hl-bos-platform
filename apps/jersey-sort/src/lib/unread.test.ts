/**
 * Photos can be brought in without reading their jersey numbers (Publish to
 * 5 Star's default): they are "not read yet", not queued, not counted as
 * being analysed, and they are read only when someone asks.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { importFolder, newProgress, readImportFolder } from "./folder-import.ts";
import { readUnread, retryFailed } from "./queue-core.ts";
import { progress } from "./repo/dashboard.ts";
import { createEvent, listEvents } from "./repo/events.ts";
import { account, freshDb, jpeg } from "./test-helpers.ts";

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

async function folder(names: string[]): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "unread-"));
  mkdirSync(dir, { recursive: true });
  for (const n of names) writeFileSync(path.join(dir, `IMG_${n}.JPG`), await jpeg(n));
  return dir;
}

describe("photos brought in without reading jersey numbers", () => {
  it("come in as 'uploaded': not queued, not 'being analysed', counted as unread", async () => {
    const { db, dataDir } = freshDb();
    const { userId, organizationId: org } = account(db);
    const eventId = createEvent(db, org, userId, game);
    const c = await readImportFolder(await folder(["01", "02", "03"]));
    const p = await importFolder(db, dataDir, {
      org,
      userId,
      eventId,
      contents: c,
      progress: newProgress(c),
      analyze: false,
    });
    expect(p.added).toBe(3);
    const statuses = db
      .all<{ status: string }>("select status from photos where event_id = :e", {
        e: eventId,
      })
      .map((r) => r.status);
    expect(statuses).toEqual(["uploaded", "uploaded", "uploaded"]);
    expect(progress(db, org, eventId)).toMatchObject({
      total: 3,
      queued: 0,
      processing: 0,
      unread: 3,
      done: 0,
    });
    expect(listEvents(db, org)[0]).toMatchObject({
      photo_count: 3,
      processing_count: 0,
    });
  });

  it("are queued by 'Find jersey numbers', once, and nothing else is touched", async () => {
    const { db, dataDir } = freshDb();
    const { userId, organizationId: org } = account(db);
    const eventId = createEvent(db, org, userId, game);
    const other = createEvent(db, org, userId, { ...game, name: "Another game" });
    const c = await readImportFolder(await folder(["01", "02"]));
    await importFolder(db, dataDir, {
      org,
      userId,
      eventId,
      contents: c,
      progress: newProgress(c),
      analyze: false,
    });
    const c2 = await readImportFolder(await folder(["11"]));
    await importFolder(db, dataDir, {
      org,
      userId,
      eventId: other,
      contents: c2,
      progress: newProgress(c2),
      analyze: false,
    });
    expect(readUnread(db, org, { eventId })).toBe(2);
    expect(progress(db, org, eventId)).toMatchObject({ queued: 2, unread: 0 });
    expect(progress(db, org, other)).toMatchObject({ queued: 0, unread: 1 });
    expect(readUnread(db, org, { eventId })).toBe(0);
  });

  it("are not touched by 'Retry failed'", async () => {
    const { db, dataDir } = freshDb();
    const { userId, organizationId: org } = account(db);
    const eventId = createEvent(db, org, userId, game);
    const c = await readImportFolder(await folder(["01"]));
    await importFolder(db, dataDir, {
      org,
      userId,
      eventId,
      contents: c,
      progress: newProgress(c),
      analyze: false,
    });
    expect(retryFailed(db, org, { eventId })).toBe(0);
    expect(progress(db, org, eventId).unread).toBe(1);
  });

  it("reading is still the default: a folder import without the option queues them", async () => {
    const { db, dataDir } = freshDb();
    const { userId, organizationId: org } = account(db);
    const eventId = createEvent(db, org, userId, game);
    const c = await readImportFolder(await folder(["01", "02"]));
    await importFolder(db, dataDir, {
      org,
      userId,
      eventId,
      contents: c,
      progress: newProgress(c),
    });
    expect(progress(db, org, eventId)).toMatchObject({ queued: 2, unread: 0 });
  });
});
