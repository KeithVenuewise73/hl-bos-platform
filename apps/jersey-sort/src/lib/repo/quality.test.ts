import { describe, expect, it } from "vitest";

import { ingestPhoto } from "../ingest.ts";
import { account, freshDb, jpeg } from "../test-helpers.ts";
import { createEvent } from "./events.ts";
import { ensureQuality, parseFlags } from "./quality.ts";

async function setup() {
  const { db, dataDir } = freshDb();
  const { userId, organizationId: org } = account(db);
  const eventId = createEvent(db, org, userId, {
    name: "G",
    sport: "Hockey",
    teamName: "Varsity",
    opponent: "",
    eventDate: "2026-10-24",
    location: "",
    season: "2026",
    notes: "",
  });
  const r = await ingestPhoto(db, dataDir, {
    org,
    userId,
    eventId,
    filename: "a.jpg",
    bytes: await jpeg("a"),
  });
  if (!r.ok) throw new Error(r.reason);
  return { db, dataDir, org, id: r.photoId };
}

describe("remembered quality hints", () => {
  it("measures a photo once and keeps the answer", async () => {
    const s = await setup();
    expect(await ensureQuality(s.db, s.dataDir, s.org, [s.id])).toBe(1);
    const row = s.db.get<{ flags: string; sharpness: number }>(
      "select flags, sharpness from photo_quality where photo_id = :id",
      { id: s.id },
    );
    expect(row).toBeDefined();
    expect(typeof row!.sharpness).toBe("number");
    expect(await ensureQuality(s.db, s.dataDir, s.org, [s.id])).toBe(0);
  });

  it("does not touch another organization's photo", async () => {
    const s = await setup();
    expect(await ensureQuality(s.db, s.dataDir, "someone-else", [s.id])).toBe(0);
  });

  it("a missing preview file leaves the photo without hints instead of failing", async () => {
    const s = await setup();
    s.db.run("update photos set preview_path = 'previews/nope.jpg' where id = :id", {
      id: s.id,
    });
    expect(await ensureQuality(s.db, s.dataDir, s.org, [s.id])).toBe(0);
  });

  it("reads stored flags", () => {
    expect(parseFlags("soft,dark")).toEqual(["soft", "dark"]);
    expect(parseFlags("")).toEqual([]);
    expect(parseFlags(null)).toEqual([]);
    expect(parseFlags("bogus")).toEqual([]);
  });
});
