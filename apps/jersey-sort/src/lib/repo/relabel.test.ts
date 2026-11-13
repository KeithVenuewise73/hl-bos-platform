import { describe, expect, it } from "vitest";

import { ingestPhoto } from "../ingest.ts";
import { account, freshDb, jpeg } from "../test-helpers.ts";
import { approvePhotos, reviewCounts, NotAllowed } from "./approvals.ts";
import { createEvent } from "./events.ts";
import { createGameFromPhotos, movePhotos } from "./relabel.ts";

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

async function setup() {
  const { db, dataDir } = freshDb();
  const { userId, organizationId: org } = account(db);
  const a = createEvent(db, org, userId, game("Game A"));
  const b = createEvent(db, org, userId, game("Game B"));
  const r = await ingestPhoto(db, dataDir, {
    org,
    userId,
    eventId: a,
    filename: "x.jpg",
    bytes: await jpeg("x"),
  });
  if (!r.ok) throw new Error(r.reason);
  return { db, org, userId, a, b, photo: r.photoId };
}

const eventOf = (s: Awaited<ReturnType<typeof setup>>) =>
  s.db.get<{ event_id: string }>("select event_id from photos where id = :id", {
    id: s.photo,
  })!.event_id;

describe("changing a photo's game", () => {
  it("moves it, and an approval given under the old game is dropped", async () => {
    const s = await setup();
    approvePhotos(s.db, s.org, s.userId, "owner", [s.photo]);
    expect(reviewCounts(s.db, s.org, s.a).approved).toBe(1);
    expect(movePhotos(s.db, s.org, "owner", [s.photo], s.b)).toBe(1);
    expect(eventOf(s)).toBe(s.b);
    expect(reviewCounts(s.db, s.org, s.b).approved).toBe(0);
    expect(reviewCounts(s.db, s.org, s.b).pending).toBe(1);
  });

  it("only the owner may, and nothing changes when a member tries", async () => {
    const s = await setup();
    expect(() => movePhotos(s.db, s.org, "member", [s.photo], s.b)).toThrow(NotAllowed);
    expect(eventOf(s)).toBe(s.a);
  });

  it("refuses another organization's game and leaves the photo where it was", async () => {
    const s = await setup();
    const other = account(s.db, "o@example.com", "Other");
    const theirs = createEvent(
      s.db,
      other.organizationId,
      other.userId,
      game("Theirs"),
    );
    expect(() => movePhotos(s.db, s.org, "owner", [s.photo], theirs)).toThrow(
      NotAllowed,
    );
    expect(eventOf(s)).toBe(s.a);
  });

  it("ignores photo ids that are not this organization's", async () => {
    const s = await setup();
    expect(movePhotos(s.db, s.org, "owner", ["nope"], s.b)).toBe(0);
  });

  it("starts a new game from photos, pending", async () => {
    const s = await setup();
    const id = createGameFromPhotos(
      s.db,
      s.org,
      s.userId,
      "owner",
      [s.photo],
      game("Game C"),
    );
    expect(eventOf(s)).toBe(id);
    expect(() =>
      createGameFromPhotos(s.db, s.org, s.userId, "member", [s.photo], game("D")),
    ).toThrow(NotAllowed);
  });
});
