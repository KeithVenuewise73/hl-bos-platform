/**
 * Instagram drafts: who can see them, which photos they may hold, and the
 * order those photos appear in. A real database in a temp dir, real photos.
 */
import { describe, expect, it } from "vitest";

import { ingestPhoto } from "../ingest.ts";
import { MAX_PHOTOS } from "../instagram-core.ts";
import { account, freshDb, jpeg } from "../test-helpers.ts";
import { createEvent, ValidationError } from "./events.ts";
import {
  createDraft,
  deleteDraft,
  draftPhotos,
  getDraft,
  listDrafts,
  saveDraft,
} from "./instagram.ts";

const game = (name: string) => ({
  name,
  sport: "Hockey",
  teamName: "Varsity",
  opponent: "",
  eventDate: "2026-10-24",
  location: "",
  season: "2026",
  notes: "",
});

function setup() {
  const { db, dataDir } = freshDb();
  const { userId, organizationId: org } = account(db);
  const eventId = createEvent(db, org, userId, game("Varsity vs Wheatfield"));
  return { db, dataDir, userId, org, eventId };
}

/** Bring in a photo taken at the given second of the game; returns its id. */
async function photo(
  s: ReturnType<typeof setup>,
  eventId: string,
  name: string,
  second: number,
): Promise<string> {
  const r = await ingestPhoto(s.db, s.dataDir, {
    org: s.org,
    userId: s.userId,
    eventId,
    filename: name,
    bytes: await jpeg(name, {
      exifDate: `2026:10:24 18:00:${String(second).padStart(2, "0")}`,
    }),
  });
  if (!r.ok) throw new Error(r.reason);
  return r.photoId;
}

const input = (
  photoIds: string[],
  over: Partial<{ caption: string; format: string; fit: string }> = {},
) => ({
  caption: "Varsity vs Wheatfield",
  format: "portrait",
  fit: "fill",
  photoIds,
  ...over,
});

describe("Instagram drafts", () => {
  it("belong to one organization and one game of it", () => {
    const s = setup();
    const other = account(s.db, "other@example.com", "Another Org");
    const theirGame = createEvent(
      s.db,
      other.organizationId,
      other.userId,
      game("Theirs"),
    );
    // Not another organization's game:
    expect(() => createDraft(s.db, s.org, s.userId, theirGame, "")).toThrow(
      ValidationError,
    );
    const id = createDraft(s.db, s.org, s.userId, s.eventId, "Hello");
    expect(getDraft(s.db, s.org, id)?.caption).toBe("Hello");
    // ...and not readable, listable, saved or deleted from another organization.
    expect(getDraft(s.db, other.organizationId, id)).toBeUndefined();
    expect(listDrafts(s.db, other.organizationId, s.eventId)).toEqual([]);
    expect(() => saveDraft(s.db, other.organizationId, id, input([]))).toThrow(
      ValidationError,
    );
    deleteDraft(s.db, other.organizationId, id);
    expect(getDraft(s.db, s.org, id)).toBeDefined();
    deleteDraft(s.db, s.org, id);
    expect(getDraft(s.db, s.org, id)).toBeUndefined();
  });

  it("keep the photos in the order they were taken, not the order they were sent", async () => {
    const s = setup();
    const late = await photo(s, s.eventId, "late.jpg", 50);
    const early = await photo(s, s.eventId, "early.jpg", 10);
    const middle = await photo(s, s.eventId, "middle.jpg", 30);
    const id = createDraft(s.db, s.org, s.userId, s.eventId, "");
    saveDraft(s.db, s.org, id, input([late, middle, early, early]));
    const d = getDraft(s.db, s.org, id)!;
    expect(d.photo_ids).toEqual([early, middle, late]);
    expect(draftPhotos(s.db, s.org, d).map((p) => p.original_filename)).toEqual([
      "early.jpg",
      "middle.jpg",
      "late.jpg",
    ]);
  });

  it("hold only this game's usable photos", async () => {
    const s = setup();
    const mine = await photo(s, s.eventId, "mine.jpg", 5);
    const otherGame = createEvent(s.db, s.org, s.userId, game("Another game"));
    const elsewhere = await photo(s, otherGame, "elsewhere.jpg", 6);
    const bad = await photo(s, s.eventId, "unusable.jpg", 7);
    s.db.run("update photos set unusable = 1 where id = :id", { id: bad });
    const id = createDraft(s.db, s.org, s.userId, s.eventId, "");
    expect(() => saveDraft(s.db, s.org, id, input([mine, elsewhere]))).toThrow(
      /not a usable photo of this game/,
    );
    expect(() => saveDraft(s.db, s.org, id, input([mine, bad]))).toThrow(
      /not a usable photo of this game/,
    );
    expect(() => saveDraft(s.db, s.org, id, input([mine, "no-such-photo"]))).toThrow(
      ValidationError,
    );
    // Nothing was saved by the refused attempts.
    expect(getDraft(s.db, s.org, id)?.photo_ids).toEqual([]);
    saveDraft(s.db, s.org, id, input([mine]));
    expect(getDraft(s.db, s.org, id)?.photo_ids).toEqual([mine]);
  });

  it("hold at most ten pictures", async () => {
    const s = setup();
    const ids: string[] = [];
    for (let i = 0; i < MAX_PHOTOS + 1; i++)
      ids.push(await photo(s, s.eventId, `p${i}.jpg`, i));
    const id = createDraft(s.db, s.org, s.userId, s.eventId, "");
    expect(() => saveDraft(s.db, s.org, id, input(ids))).toThrow(
      /at most 10 pictures; 11/,
    );
    saveDraft(s.db, s.org, id, input(ids.slice(0, MAX_PHOTOS)));
    expect(getDraft(s.db, s.org, id)?.photo_ids).toHaveLength(MAX_PHOTOS);
  });

  it("refuse a caption Instagram would refuse, and an unknown shape or fit", () => {
    const s = setup();
    const id = createDraft(s.db, s.org, s.userId, s.eventId, "");
    expect(() =>
      saveDraft(s.db, s.org, id, input([], { caption: "x".repeat(2201) })),
    ).toThrow(/2,201 characters/);
    expect(() => saveDraft(s.db, s.org, id, input([], { format: "wide" }))).toThrow(
      /picture shape/,
    );
    expect(() => saveDraft(s.db, s.org, id, input([], { fit: "stretch" }))).toThrow(
      /fit/,
    );
    saveDraft(s.db, s.org, id, input([], { format: "square", fit: "bars" }));
    const d = getDraft(s.db, s.org, id)!;
    expect([d.format, d.fit]).toEqual(["square", "bars"]);
  });

  it("drop out of a draft when their photo is gone, and with their game", async () => {
    const s = setup();
    const a = await photo(s, s.eventId, "a.jpg", 1);
    const b = await photo(s, s.eventId, "b.jpg", 2);
    const id = createDraft(s.db, s.org, s.userId, s.eventId, "");
    saveDraft(s.db, s.org, id, input([a, b]));
    s.db.run("update photos set unusable = 1 where id = :id", { id: b });
    expect(
      draftPhotos(s.db, s.org, getDraft(s.db, s.org, id)!).map((p) => p.id),
    ).toEqual([a]);
    s.db.run("delete from events where id = :e", { e: s.eventId });
    expect(getDraft(s.db, s.org, id)).toBeUndefined();
  });
});
