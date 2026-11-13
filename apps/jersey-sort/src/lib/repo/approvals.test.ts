/**
 * Review before publishing: who may decide, what may be decided, and what a
 * photo is before anyone has looked at it. A real database in a temp dir and
 * real photos.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openDb } from "../db-core.ts";

import { ingestPhoto } from "../ingest.ts";
import { account, freshDb, jpeg } from "../test-helpers.ts";
import {
  APPROVED_PHOTO,
  approvePhotos,
  approveRemaining,
  gamesForReview,
  NotAllowed,
  pendingTotal,
  rejectPhotos,
  resetAfterRelabel,
  resetPhotos,
  reviewCounts,
  reviewPhotos,
} from "./approvals.ts";
import { createEvent } from "./events.ts";

const game = (name: string, date = "2026-10-24", sport = "Hockey") => ({
  name,
  sport,
  teamName: "Varsity",
  opponent: "",
  eventDate: date,
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

/** Bring in a photo taken at a given minute of the evening; returns its id. */
async function photo(
  s: ReturnType<typeof setup>,
  name: string,
  minute: number,
  eventId = s.eventId,
): Promise<string> {
  const r = await ingestPhoto(s.db, s.dataDir, {
    org: s.org,
    userId: s.userId,
    eventId,
    filename: name,
    bytes: await jpeg(name, {
      exifDate: `2026:10:24 18:${String(minute).padStart(2, "0")}:00`,
    }),
  });
  if (!r.ok) throw new Error(r.reason);
  return r.photoId;
}

describe("a photo before anyone has looked at it", () => {
  it("is pending: every photo starts there, with no row at all", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    await photo(s, "b", 2);
    expect(reviewCounts(s.db, s.org, s.eventId)).toMatchObject({
      pending: 2,
      approved: 0,
      rejected: 0,
    });
    expect(
      s.db.get("select 1 from photo_approvals where photo_id = :a", { a }),
    ).toBeUndefined();
    expect(pendingTotal(s.db, s.org)).toBe(2);
  });

  it("photos in a database from before this existed are pending too: reopening it adds the tables and backfills nothing", async () => {
    const s = setup();
    await photo(s, "old", 1);
    await photo(s, "older", 2);
    // Make the file look like one written by the previous version: no approval tables at all.
    s.db.raw.exec("drop table photo_approvals; drop table photo_quality;");
    s.db.raw.close();
    const reopened = openDb(path.join(s.dataDir, "test.db"));
    expect(reviewCounts(reopened, s.org, s.eventId)).toMatchObject({
      pending: 2,
      approved: 0,
      rejected: 0,
    });
    expect(reopened.get("select 1 from photo_approvals")).toBeUndefined();
  });
});

describe("who may decide", () => {
  it("the owner approves and rejects; the decision is recorded with who and when", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    const b = await photo(s, "b", 2);
    expect(approvePhotos(s.db, s.org, s.userId, "owner", [a])).toEqual({
      changed: 1,
      skipped: 0,
    });
    expect(
      rejectPhotos(s.db, s.org, s.userId, "owner", [b], "  out of focus  "),
    ).toEqual({ changed: 1, skipped: 0 });
    expect(reviewCounts(s.db, s.org, s.eventId)).toMatchObject({
      pending: 0,
      approved: 1,
      rejected: 1,
    });
    const row = s.db.get<{ reason: string; decided_by: string; decided_at: string }>(
      "select reason, decided_by, decided_at from photo_approvals where photo_id = :b",
      { b },
    );
    expect(row?.reason).toBe("out of focus");
    expect(row?.decided_by).toBe(s.userId);
    expect(row?.decided_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("a member cannot approve, reject, reset or approve the rest: nothing is written", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    const calls = [
      () => approvePhotos(s.db, s.org, s.userId, "member", [a]),
      () => rejectPhotos(s.db, s.org, s.userId, "member", [a], "no"),
      () => resetPhotos(s.db, s.org, "member", [a]),
      () => approveRemaining(s.db, s.org, s.userId, "member", s.eventId),
    ];
    for (const call of calls) expect(call).toThrow(NotAllowed);
    expect(s.db.get("select 1 from photo_approvals")).toBeUndefined();
  });

  it("a member cannot undo the owner's decision either", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    approvePhotos(s.db, s.org, s.userId, "owner", [a]);
    expect(() => resetPhotos(s.db, s.org, "member", [a])).toThrow(/Only the owner/);
    expect(reviewCounts(s.db, s.org, s.eventId).approved).toBe(1);
  });
});

describe("what may be decided", () => {
  it("another organization's photos can never be decided, even with the right id", async () => {
    const s = setup();
    const other = account(s.db, "other@example.com", "Another Org");
    const theirGame = createEvent(
      s.db,
      other.organizationId,
      other.userId,
      game("Their game"),
    );
    const theirs = await photo(
      { ...s, org: other.organizationId, userId: other.userId },
      "theirs",
      5,
      theirGame,
    );
    expect(approvePhotos(s.db, s.org, s.userId, "owner", [theirs])).toEqual({
      changed: 0,
      skipped: 1,
    });
    expect(s.db.get("select 1 from photo_approvals")).toBeUndefined();
  });

  it("a photo that is not ready to publish (marked unusable) cannot be approved", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    const b = await photo(s, "b", 2);
    s.db.run("update photos set unusable = 1 where id = :a", { a });
    expect(approvePhotos(s.db, s.org, s.userId, "owner", [a, b])).toEqual({
      changed: 1,
      skipped: 1,
    });
    expect(reviewCounts(s.db, s.org, s.eventId)).toMatchObject({
      approved: 1,
      notReady: 1,
    });
  });

  it("a photo with no web-size preview yet cannot be approved", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    s.db.run("update photos set preview_path = null where id = :a", { a });
    expect(approvePhotos(s.db, s.org, s.userId, "owner", [a]).changed).toBe(0);
  });

  it("deciding the same photo again replaces the decision, never duplicates it", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    approvePhotos(s.db, s.org, s.userId, "owner", [a]);
    rejectPhotos(s.db, s.org, s.userId, "owner", [a], "blurry");
    expect(s.db.all("select 1 from photo_approvals")).toHaveLength(1);
    expect(reviewCounts(s.db, s.org, s.eventId)).toMatchObject({
      approved: 0,
      rejected: 1,
    });
  });
});

describe("approving the rest, and taking a decision back", () => {
  it("approves what is still pending and never overrides a rejection", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    const b = await photo(s, "b", 2);
    await photo(s, "c", 3);
    rejectPhotos(s.db, s.org, s.userId, "owner", [b], "dark");
    expect(approveRemaining(s.db, s.org, s.userId, "owner", s.eventId)).toBe(2);
    expect(reviewCounts(s.db, s.org, s.eventId)).toMatchObject({
      pending: 0,
      approved: 2,
      rejected: 1,
    });
    expect(a).toBeDefined();
  });

  it("approving the rest does not touch another game", async () => {
    const s = setup();
    const other = createEvent(
      s.db,
      s.org,
      s.userId,
      game("Other game", "2026-10-24", "Football"),
    );
    await photo(s, "a", 1);
    await photo(s, "z", 40, other);
    approveRemaining(s.db, s.org, s.userId, "owner", s.eventId);
    expect(reviewCounts(s.db, s.org, other)).toMatchObject({ pending: 1, approved: 0 });
  });

  it("a reset puts a photo back to pending", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    approvePhotos(s.db, s.org, s.userId, "owner", [a]);
    expect(resetPhotos(s.db, s.org, "owner", [a])).toBe(1);
    expect(reviewCounts(s.db, s.org, s.eventId)).toMatchObject({
      pending: 1,
      approved: 0,
    });
  });

  it("a relabel takes the decision away, because the label it was made under has changed", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    approvePhotos(s.db, s.org, s.userId, "owner", [a]);
    resetAfterRelabel(s.db, s.org, [a]);
    expect(reviewCounts(s.db, s.org, s.eventId).pending).toBe(1);
  });

  it("deleting a photo removes its decision with it", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    approvePhotos(s.db, s.org, s.userId, "owner", [a]);
    s.db.run("delete from photos where id = :a", { a });
    expect(s.db.get("select 1 from photo_approvals")).toBeUndefined();
  });
});

describe("what publishing may use", () => {
  it("the publishing filter lets through approved photos only: not pending, not rejected", async () => {
    const s = setup();
    const a = await photo(s, "a", 1);
    const b = await photo(s, "b", 2);
    await photo(s, "c", 3);
    approvePhotos(s.db, s.org, s.userId, "owner", [a]);
    rejectPhotos(s.db, s.org, s.userId, "owner", [b]);
    const ids = s.db
      .all<{ id: string }>(
        `select id from photos where event_id = :e and ${APPROVED_PHOTO}`,
        { e: s.eventId },
      )
      .map((r) => r.id);
    expect(ids).toEqual([a]);
  });
});

describe("the review list", () => {
  it("lists a game's photos in the order they were taken, with a filter and paging", async () => {
    const s = setup();
    const late = await photo(s, "late", 30);
    const early = await photo(s, "early", 2);
    const mid = await photo(s, "mid", 10);
    approvePhotos(s.db, s.org, s.userId, "owner", [mid]);
    const all = reviewPhotos(s.db, s.org, s.eventId, "all");
    expect(all.tiles.map((t) => t.id)).toEqual([early, mid, late]);
    expect(all.total).toBe(3);
    expect(
      reviewPhotos(s.db, s.org, s.eventId, "pending").tiles.map((t) => t.id),
    ).toEqual([early, late]);
    expect(
      reviewPhotos(s.db, s.org, s.eventId, "approved").tiles.map((t) => t.id),
    ).toEqual([mid]);
    const page2 = reviewPhotos(s.db, s.org, s.eventId, "all", 2, 2);
    expect(page2.tiles.map((t) => t.id)).toEqual([late]);
    expect(page2.total).toBe(3);
    expect(all.tiles[1]!.status).toBe("approved");
  });

  it("never shows another organization's photos", async () => {
    const s = setup();
    const other = account(s.db, "other@example.com", "Another Org");
    await photo(s, "mine", 1);
    expect(reviewPhotos(s.db, other.organizationId, s.eventId, "all").tiles).toEqual(
      [],
    );
  });

  it("the games list gives each game's counts, and notes when a day has more than one game", async () => {
    const s = setup();
    const football = createEvent(
      s.db,
      s.org,
      s.userId,
      game("Football game", "2026-10-24", "Football"),
    );
    const lonely = createEvent(
      s.db,
      s.org,
      s.userId,
      game("Another day", "2026-10-31"),
    );
    await photo(s, "h1", 1);
    await photo(s, "f1", 40, football);
    await photo(s, "f2", 41, football);
    approvePhotos(s.db, s.org, s.userId, "owner", [await photo(s, "x", 50, lonely)]);
    const list = gamesForReview(s.db, s.org);
    const byName = Object.fromEntries(list.map((g) => [g.name, g]));
    expect(byName["Football game"]).toMatchObject({
      pending: 2,
      sameDay: 1,
      sport: "Football",
    });
    expect(byName["Varsity vs Wheatfield"]).toMatchObject({ pending: 1, sameDay: 1 });
    expect(byName["Another day"]).toMatchObject({
      approved: 1,
      pending: 0,
      sameDay: 0,
    });
    // newest first
    expect(list[0]!.name).toBe("Another day");
  });
});

describe("quality hints on review tiles", () => {
  it("shows stored flags, and says when a photo has not been checked yet", async () => {
    const s = setup();
    const id = await photo(s, "q.jpg", 1);
    let t = reviewPhotos(s.db, s.org, s.eventId, "pending").tiles[0]!;
    expect([t.flags, t.qualityChecked]).toEqual([[], false]);
    s.db.run(
      "insert into photo_quality (photo_id, sharpness, brightness, long_edge, flags, computed_at) values (:id, 1, 100, 800, 'soft,small', 'x')",
      { id },
    );
    t = reviewPhotos(s.db, s.org, s.eventId, "pending").tiles[0]!;
    expect([t.flags, t.qualityChecked]).toEqual([["soft", "small"], true]);
  });
});
