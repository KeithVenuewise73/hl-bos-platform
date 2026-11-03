/**
 * Team galleries: what a team can see is exactly what was assigned to it,
 * and only with the link AND the current team password.
 */
import { describe, expect, it } from "vitest";

import { ingestPhoto } from "./ingest.ts";
import { createEvent } from "./repo/events.ts";
import {
  createGallery,
  galleryEvents,
  galleryForLink,
  galleryPhotoFiles,
  galleryPhotos,
  galleryThrottled,
  getGallery,
  listGalleries,
  newGalleryLink,
  recordGalleryFailure,
  setGalleryActive,
  setGalleryEvents,
  setGalleryPassword,
  unlockGallery,
  visitorGallery,
} from "./repo/galleries.ts";
import { ValidationError } from "./repo/events.ts";
import { account, freshDb, jpeg } from "./test-helpers.ts";

const game = (name: string, team: string, date: string) => ({
  name,
  sport: "Hockey",
  teamName: team,
  opponent: "",
  eventDate: date,
  location: "",
  season: "2026",
  notes: "",
});

async function setup() {
  const { db, dataDir } = freshDb();
  const { userId, organizationId: org } = account(
    db,
    "keith@example.com",
    "5 Star Sports Media",
  );
  const varsityGame = createEvent(
    db,
    org,
    userId,
    game("Varsity vs Wheatfield", "Varsity", "2026-10-24"),
  );
  const jvGame = createEvent(
    db,
    org,
    userId,
    game("JV vs Lockport", "JV", "2026-10-25"),
  );
  const unshared = createEvent(
    db,
    org,
    userId,
    game("Practice", "Varsity", "2026-10-20"),
  );
  const photo = async (eventId: string, name: string, number: string) => {
    const r = await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: name,
      bytes: await jpeg(number),
    });
    if (!r.ok) throw new Error(r.reason);
    return r.photoId;
  };
  const varsityPhoto = await photo(varsityGame, "IMG_0001.JPG", "24");
  const jvPhoto = await photo(jvGame, "IMG_0002.JPG", "7");
  const practicePhoto = await photo(unshared, "IMG_0003.JPG", "91");

  const varsity = createGallery(db, org, userId, {
    group: "Cazenovia Hockey",
    name: "Varsity",
    password: "goblue26",
  });
  const jv = createGallery(db, org, userId, {
    group: "Cazenovia Hockey",
    name: "JV",
    password: "gojv2026",
  });
  setGalleryEvents(db, org, varsity, [varsityGame]);
  setGalleryEvents(db, org, jv, [jvGame]);
  const link = (id: string) => getGallery(db, org, id)?.token ?? "";
  return {
    db,
    org,
    userId,
    varsity,
    jv,
    link,
    varsityGame,
    jvGame,
    unshared,
    varsityPhoto,
    jvPhoto,
    practicePhoto,
  };
}

describe("team galleries", () => {
  it("lets a team in only with its link and its password", async () => {
    const t = await setup();
    expect(galleryForLink(t.db, t.link(t.varsity))?.name).toBe("Varsity");
    expect(unlockGallery(t.db, t.link(t.varsity), "wrong-password")).toBeNull();
    // JV's password does not open Varsity.
    expect(unlockGallery(t.db, t.link(t.varsity), "gojv2026")).toBeNull();
    // A made-up link opens nothing.
    expect(unlockGallery(t.db, "AAAAAAAAAAAAAAAAAAAAAA", "goblue26")).toBeNull();
    const access = unlockGallery(t.db, t.link(t.varsity), "goblue26");
    expect(access).not.toBeNull();
    const g = visitorGallery(t.db, t.link(t.varsity), access ?? undefined);
    expect(g?.organizationName).toBe("5 Star Sports Media");
    expect(g?.groupName).toBe("Cazenovia Hockey");
    // Varsity's access does not open JV.
    expect(visitorGallery(t.db, t.link(t.jv), access ?? undefined)).toBeUndefined();
    expect(visitorGallery(t.db, t.link(t.varsity), undefined)).toBeUndefined();
  });

  it("shows a team exactly the events and photos assigned to it", async () => {
    const t = await setup();
    const access = unlockGallery(t.db, t.link(t.varsity), "goblue26") ?? undefined;
    const g = visitorGallery(t.db, t.link(t.varsity), access);
    if (g === undefined) throw new Error("not let in");
    const events = galleryEvents(t.db, g);
    expect(events.map((e) => e.name)).toEqual(["Varsity vs Wheatfield"]);
    expect(events[0]?.photos).toBe(1);
    expect(galleryPhotos(t.db, g, t.varsityGame).map((p) => p.id)).toEqual([
      t.varsityPhoto,
    ]);
    // Another team's event, or one never assigned: nothing, even by id.
    expect(galleryPhotos(t.db, g, t.jvGame)).toEqual([]);
    expect(galleryPhotos(t.db, g, t.unshared)).toEqual([]);
    expect(galleryPhotoFiles(t.db, g, t.varsityPhoto)?.original_filename).toBe(
      "IMG_0001.JPG",
    );
    expect(galleryPhotoFiles(t.db, g, t.jvPhoto)).toBeUndefined();
    expect(galleryPhotoFiles(t.db, g, t.practicePhoto)).toBeUndefined();
  });

  it("never lets another organization's events into a gallery", async () => {
    const t = await setup();
    const other = account(t.db, "rival@example.com", "Rival Studio");
    const theirs = createEvent(
      t.db,
      other.organizationId,
      other.userId,
      game("Their game", "Varsity", "2026-10-26"),
    );
    setGalleryEvents(t.db, t.org, t.varsity, [t.varsityGame, theirs]);
    expect(getGallery(t.db, t.org, t.varsity)?.eventIds).toEqual([t.varsityGame]);
    // And they cannot manage ours.
    expect(() =>
      setGalleryEvents(t.db, other.organizationId, t.varsity, [theirs]),
    ).toThrow(ValidationError);
    expect(listGalleries(t.db, other.organizationId)).toEqual([]);
  });

  it("ends every open visit when the password changes", async () => {
    const t = await setup();
    const access = unlockGallery(t.db, t.link(t.varsity), "goblue26") ?? undefined;
    expect(visitorGallery(t.db, t.link(t.varsity), access)).toBeDefined();
    setGalleryPassword(t.db, t.org, t.varsity, "newpass26");
    expect(visitorGallery(t.db, t.link(t.varsity), access)).toBeUndefined();
    expect(unlockGallery(t.db, t.link(t.varsity), "goblue26")).toBeNull();
    expect(unlockGallery(t.db, t.link(t.varsity), "newpass26")).not.toBeNull();
  });

  it("stops the old link when a new one is made, and all of it when switched off", async () => {
    const t = await setup();
    const old = t.link(t.varsity);
    const access = unlockGallery(t.db, old, "goblue26") ?? undefined;
    const fresh = newGalleryLink(t.db, t.org, t.varsity);
    expect(fresh).not.toBe(old);
    expect(galleryForLink(t.db, old)).toBeUndefined();
    expect(visitorGallery(t.db, fresh, access)).toBeUndefined();

    const again = unlockGallery(t.db, fresh, "goblue26") ?? undefined;
    setGalleryActive(t.db, t.org, t.varsity, false);
    expect(galleryForLink(t.db, fresh)).toBeUndefined();
    expect(unlockGallery(t.db, fresh, "goblue26")).toBeNull();
    expect(visitorGallery(t.db, fresh, again)).toBeUndefined();
    setGalleryActive(t.db, t.org, t.varsity, true);
    expect(unlockGallery(t.db, fresh, "goblue26")).not.toBeNull();
  });

  it("refuses a weak team password and a gallery with no name", async () => {
    const t = await setup();
    expect(() =>
      createGallery(t.db, t.org, t.userId, {
        group: "",
        name: "Family",
        password: "123",
      }),
    ).toThrow(/at least 6/);
    expect(() =>
      createGallery(t.db, t.org, t.userId, {
        group: "",
        name: " ",
        password: "family26",
      }),
    ).toThrow(ValidationError);
  });

  it("slows down guessing after ten wrong passwords", () => {
    const link = "throttle-test-link-0001";
    for (let i = 0; i < 9; i++) recordGalleryFailure(link, 1_000);
    expect(galleryThrottled(link, 2_000)).toBe(false);
    recordGalleryFailure(link, 1_000);
    expect(galleryThrottled(link, 2_000)).toBe(true);
    expect(galleryThrottled(link, 1_000 + 16 * 60_000)).toBe(false);
  });

  it("lists each team gallery with its event and photo counts", async () => {
    const t = await setup();
    const list = listGalleries(t.db, t.org);
    expect(list.map((g) => [g.group_name, g.name, g.events, g.photos])).toEqual([
      ["Cazenovia Hockey", "JV", 1, 1],
      ["Cazenovia Hockey", "Varsity", 1, 1],
    ]);
  });
});
