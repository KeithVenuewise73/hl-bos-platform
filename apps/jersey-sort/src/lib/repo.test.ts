import {
  galleryNumbers,
  DEFAULT_THRESHOLDS,
  type ImageAnalysisProvider,
  type ProviderReading,
} from "@hl-bos/jersey-sort";
import { describe, expect, it } from "vitest";

import { AuthError, createAccount, sessionUser, signIn } from "./auth-core.ts";
import { ingestPhoto } from "./ingest.ts";
import { drain, processPhoto, retryFailed } from "./queue-core.ts";
import { dashboardStats, progress } from "./repo/dashboard.ts";
import { createEvent, eventStats, numberGroups } from "./repo/events.ts";
import { getPhoto, listPhotos, photoDetections, photoPlayers } from "./repo/photos.ts";
import { createPlayer, listPlayers } from "./repo/players.ts";
import {
  addNumber,
  changeNumber,
  confirmDetection,
  flagPhoto,
  nextInQueue,
  rejectDetection,
} from "./repo/review.ts";
import { saveThresholds } from "./repo/settings.ts";
import { account, freshDb, jpeg } from "./test-helpers.ts";

const EVENT = {
  name: "West Seneca vs Orchard Park",
  sport: "Football",
  teamName: "West Seneca",
  opponent: "Orchard Park",
  eventDate: "2026-10-03",
  location: "West Seneca West",
  season: "2026",
  notes: "",
};

/** A provider that answers from a script keyed by the photo's preview size. */
function scripted(
  answers: Map<string, ProviderReading[]>,
  byIndex: string[],
): ImageAnalysisProvider {
  let i = 0;
  return {
    info: {
      id: "scripted",
      model: "s-1",
      label: "Scripted",
      method: "vision_model",
      understandsContext: true,
    },
    analyze: () => {
      const key = byIndex[i++] ?? "";
      return Promise.resolve({
        athletesPresent: true,
        athleteCount: 1,
        readings: answers.get(key) ?? [],
      });
    },
  };
}

function setup() {
  const { db, dataDir } = freshDb();
  const { userId, organizationId: org } = account(db);
  const eventId = createEvent(db, org, userId, EVENT);
  return { db, dataDir, userId, org, eventId };
}

describe("database rows", () => {
  it("are plain objects, which React can pass to the browser", () => {
    const { db } = freshDb();
    account(db);
    const row = db.get<object>("select * from organizations");
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(db.all<object>("select * from users")[0])).toBe(
      Object.prototype,
    );
  });
});

describe("accounts", () => {
  it("signs up, signs in, and refuses a wrong password", () => {
    const { db } = freshDb();
    const { organizationId } = account(db);
    const token = signIn(db, "Coach@Example.com", "correct horse battery");
    expect(sessionUser(db, token)?.organizationId).toBe(organizationId);
    expect(() => signIn(db, "coach@example.com", "wrong password!")).toThrow(AuthError);
    expect(sessionUser(db, "x".repeat(40))).toBeNull();
  });
  it("refuses a short password and a duplicate email", () => {
    const { db } = freshDb();
    account(db);
    expect(() => account(db)).toThrow("already exists");
    expect(() =>
      createAccount(db, {
        email: "a@b.co",
        password: "short",
        displayName: "",
        organizationName: "X",
      }),
    ).toThrow("10 characters");
  });
});

describe("upload", () => {
  it("keeps the original byte for byte, reads the EXIF date, and queues the photo", async () => {
    const { db, dataDir, userId, org, eventId } = setup();
    const bytes = await jpeg("24", { exifDate: "2026:10:03 19:31:05" });
    const r = await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: "IMG_4492.JPG",
      bytes,
    });
    expect(r).toMatchObject({ ok: true, status: "queued", dateSource: "exif" });
    if (!r.ok) return;
    const photo = getPhoto(db, org, userId, r.photoId);
    expect(photo?.captured_at).toBe("2026-10-03T19:31:05");
    expect(photo?.camera_make).toBe("Canon");
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    expect(
      new Uint8Array(readFileSync(path.join(dataDir, photo?.storage_path ?? ""))),
    ).toEqual(bytes);
    expect(photo?.width).toBe(800);
  });

  it("marks the date as inferred when there is no EXIF", async () => {
    const { db, dataDir, userId, org, eventId } = setup();
    const r = await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: "a.jpg",
      bytes: await jpeg("7"),
      now: new Date(2026, 9, 5, 8),
    });
    expect(r).toMatchObject({ ok: true, dateSource: "upload" });
    if (r.ok)
      expect(getPhoto(db, org, userId, r.photoId)?.captured_at).toBe(
        "2026-10-05T08:00:00",
      );
  });

  it("refuses a duplicate and names the original", async () => {
    const { db, dataDir, userId, org, eventId } = setup();
    const bytes = await jpeg("24");
    await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: "first.jpg",
      bytes,
    });
    const again = await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: "copy.jpg",
      bytes,
    });
    expect(again).toMatchObject({ ok: false, duplicateOf: "first.jpg" });
  });

  it("refuses a file that is not a photo whatever it is called", async () => {
    const { db, dataDir, userId, org, eventId } = setup();
    const r = await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: "x.jpg",
      bytes: new TextEncoder().encode("MZ not a jpeg"),
    });
    expect(r).toMatchObject({ ok: false, reason: "Not a JPG, PNG or HEIC photo." });
  });

  it("refuses an upload into another organization's event", async () => {
    const { db, dataDir, eventId } = setup();
    const other = account(db, "rival@example.com", "Orchard Park");
    const r = await ingestPhoto(db, dataDir, {
      org: other.organizationId,
      userId: other.userId,
      eventId,
      filename: "x.jpg",
      bytes: await jpeg("1"),
    });
    expect(r).toMatchObject({ ok: false, reason: "That event was not found." });
  });
});

describe("analysis, galleries and review", () => {
  async function analysed() {
    const s = setup();
    const names = ["IMG_4492.jpg", "IMG_4493.jpg", "IMG_4494.jpg", "IMG_4495.jpg"];
    const ids: string[] = [];
    for (const [i, n] of names.entries()) {
      const r = await ingestPhoto(s.db, s.dataDir, {
        org: s.org,
        userId: s.userId,
        eventId: s.eventId,
        filename: n,
        bytes: await jpeg(String(i)),
      });
      if (r.ok) ids.push(r.photoId);
    }
    const answers = new Map<string, ProviderReading[]>([
      [
        "IMG_4492.jpg",
        [
          { text: "24", confidence: 0.94, location: "jersey_back", box: null },
          { text: "18", confidence: 0.78, location: "jersey_front", box: null },
          { text: "52", confidence: 0.62, location: "helmet", box: null },
          { text: "14", confidence: 0.99, location: "scoreboard", box: null },
        ],
      ],
      [
        "IMG_4493.jpg",
        [{ text: "24", confidence: 0.91, location: "jersey_back", box: null }],
      ],
      [
        "IMG_4494.jpg",
        [{ text: "7", confidence: 0.4, location: "jersey_front", box: null }],
      ],
      ["IMG_4495.jpg", []],
    ]);
    const provider = scripted(answers, names);
    const processed = await drain(
      { db: s.db, dataDir: s.dataDir, provider: () => provider },
      1,
    );
    return { ...s, ids, processed };
  }

  it("files one photo under every athlete in it, without copying it", async () => {
    const { db, org, userId, eventId, ids, processed } = await analysed();
    expect(processed).toBe(4);
    const groups = numberGroups(db, org, eventId, 0.6);
    const byNumber = Object.fromEntries(groups.map((g) => [g.value, g.photo_count]));
    expect(byNumber).toEqual({ "24": 2, "18": 1, "52": 1 });
    expect(db.get<{ n: number }>("select count(*) as n from photos")?.n).toBe(4);
    // The scoreboard 14 is nowhere.
    expect(
      listPhotos(db, org, userId, DEFAULT_THRESHOLDS, { eventId, number: "14" }).total,
    ).toBe(0);
    expect(getPhoto(db, org, userId, ids[0] ?? "")?.status).toBe("needs_review");
    expect(getPhoto(db, org, userId, ids[1] ?? "")?.status).toBe("completed");
  });

  it("puts low readings and empty photos in Unidentified and the review queue", async () => {
    const { db, org, userId, eventId } = await analysed();
    const un = listPhotos(db, org, userId, DEFAULT_THRESHOLDS, {
      eventId,
      confidence: "unidentified",
    });
    expect(un.tiles.map((t) => t.original_filename).sort()).toEqual([
      "IMG_4494.jpg",
      "IMG_4495.jpg",
    ]);
    expect(eventStats(db, org, eventId, 0.6, userId)).toMatchObject({
      photos: 4,
      needsReview: 3,
      numbers: 3,
      unidentified: 2,
    });
    expect(progress(db, org, eventId)).toMatchObject({ total: 4, done: 4 });
  });

  it("agrees with the engine's gallery rule on every photo", async () => {
    const { db, org, userId, eventId, ids } = await analysed();
    for (const id of ids) {
      const dets = photoDetections(db, org, id).map((d) => ({
        value: d.detected_value,
        confidence: d.confidence,
        status: d.status,
      }));
      const sqlNumbers = numberGroups(db, org, eventId, 0.6)
        .filter((g) =>
          listPhotos(db, org, userId, DEFAULT_THRESHOLDS, {
            eventId,
            number: g.value,
          }).tiles.some((t) => t.id === id),
        )
        .map((g) => g.value)
        .sort();
      expect(sqlNumbers).toEqual(galleryNumbers(dets, DEFAULT_THRESHOLDS).sort());
    }
  });

  it("lets a person confirm, delete, change and add numbers, and the queue follows", async () => {
    const { db, org, userId, ids } = await analysed();
    const photo = ids[0] ?? "";
    const dets = photoDetections(db, org, photo);
    const d18 = dets.find((d) => d.detected_value === "18");
    const d52 = dets.find((d) => d.detected_value === "52");
    confirmDetection(db, org, d18?.id ?? "", DEFAULT_THRESHOLDS);
    expect(getPhoto(db, org, userId, photo)?.status).toBe("needs_review"); // #52 still uncertain
    rejectDetection(db, org, d52?.id ?? "", DEFAULT_THRESHOLDS);
    expect(getPhoto(db, org, userId, photo)?.status).toBe("completed");

    const low = ids[2] ?? "";
    const d7 = photoDetections(db, org, low)[0];
    changeNumber(db, org, userId, d7?.id ?? "", "#1", DEFAULT_THRESHOLDS);
    const after = photoDetections(db, org, low);
    expect(after.map((d) => [d.detected_value, d.status, d.method])).toEqual([
      ["1", "confirmed", "manual"],
      ["7", "rejected", "vision_model"],
    ]);
    expect(getPhoto(db, org, userId, low)?.status).toBe("completed");

    addNumber(db, org, userId, ids[3] ?? "", "33", DEFAULT_THRESHOLDS);
    expect(getPhoto(db, org, userId, ids[3] ?? "")?.status).toBe("completed");
    expect(() =>
      addNumber(db, org, userId, ids[3] ?? "", "123", DEFAULT_THRESHOLDS),
    ).toThrow("one or two digits");
  });

  it("serves the review queue in order, honours skip, no-jersey and unusable", async () => {
    const { db, org, userId, ids } = await analysed();
    expect(nextInQueue(db, org, null, null)?.photo_id).toBe(ids[0]);
    flagPhoto(db, org, userId, ids[0] ?? "", "skip", DEFAULT_THRESHOLDS);
    expect(nextInQueue(db, org, null, null)?.photo_id).toBe(ids[2]);
    flagPhoto(db, org, userId, ids[2] ?? "", "no_jersey", DEFAULT_THRESHOLDS);
    flagPhoto(db, org, userId, ids[3] ?? "", "unusable", DEFAULT_THRESHOLDS);
    expect(nextInQueue(db, org, null, null)?.photo_id).toBe(ids[0]); // the skipped one comes back last
    flagPhoto(db, org, userId, ids[0] ?? "", "reviewed", DEFAULT_THRESHOLDS);
    expect(nextInQueue(db, org, null, null)).toBeUndefined();
    // "Done" accepts what is left: the gallery-band suggestions become confirmed.
    expect(
      photoDetections(db, org, ids[0] ?? "")
        .filter((d) => d.status === "confirmed")
        .map((d) => d.detected_value)
        .sort(),
    ).toEqual(["18", "24", "52"]);
  });

  it("re-sorts every gallery when thresholds move", async () => {
    const { db, org, userId, eventId } = await analysed();
    saveThresholds(db, org, { high: 0.95, medium: 0.5 });
    const t = { high: 0.95, medium: 0.5 };
    expect(listPhotos(db, org, userId, t, { eventId, number: "18" }).total).toBe(1);
    expect(listPhotos(db, org, userId, t, { eventId, confidence: "high" }).total).toBe(
      0,
    );
    expect(() => saveThresholds(db, org, { high: 0.5, medium: 0.7 })).toThrow();
  });
});

describe("players", () => {
  it("connects #24 to a player for this team and season only", async () => {
    const s = setup();
    const a = await ingestPhoto(s.db, s.dataDir, {
      org: s.org,
      userId: s.userId,
      eventId: s.eventId,
      filename: "a.jpg",
      bytes: await jpeg("24"),
    });
    // Next season, a different athlete wears #24.
    const nextYear = createEvent(s.db, s.org, s.userId, {
      ...EVENT,
      eventDate: "2027-09-10",
      season: "2027",
    });
    const b = await ingestPhoto(s.db, s.dataDir, {
      org: s.org,
      userId: s.userId,
      eventId: nextYear,
      filename: "b.jpg",
      bytes: await jpeg("24"),
    });
    const provider = scripted(
      new Map([
        ["x", [{ text: "24", confidence: 0.95, location: "jersey_back", box: null }]],
      ]),
      ["x", "x"],
    );
    await drain({ db: s.db, dataDir: s.dataDir, provider: () => provider }, 1);

    const dominic = createPlayer(s.db, s.org, s.userId, {
      firstName: "Dominic",
      lastName: "Herman",
      jerseyNumber: "24",
      teamName: "west seneca",
      sport: "Football",
      season: "2026",
      position: "Defense",
      graduationYear: "2029",
    });
    const gallery = listPhotos(s.db, s.org, s.userId, DEFAULT_THRESHOLDS, {
      playerId: dominic,
    });
    expect(gallery.tiles.map((t) => t.original_filename)).toEqual(["a.jpg"]);
    expect(listPlayers(s.db, s.org, 0.6)[0]?.photo_count).toBe(1);
    if (a.ok)
      expect(photoPlayers(s.db, s.org, a.photoId, 0.6).map((p) => p.name)).toEqual([
        "Dominic Herman",
      ]);
    if (b.ok) expect(photoPlayers(s.db, s.org, b.photoId, 0.6)).toEqual([]);
    expect(numberGroups(s.db, s.org, s.eventId, 0.6)[0]?.player_name).toBe(
      "Dominic Herman",
    );
    expect(() =>
      createPlayer(s.db, s.org, s.userId, {
        firstName: "Other",
        lastName: "Kid",
        jerseyNumber: "24",
        teamName: "West Seneca",
        sport: "",
        season: "2026",
        position: "",
        graduationYear: "",
      }),
    ).toThrow("already Dominic Herman's number");
  });
});

describe("search", () => {
  it("finds photos by number, name, date, team and sport", async () => {
    const s = setup();
    await ingestPhoto(s.db, s.dataDir, {
      org: s.org,
      userId: s.userId,
      eventId: s.eventId,
      filename: "a.jpg",
      bytes: await jpeg("24", { exifDate: "2026:10:03 19:00:00" }),
    });
    await ingestPhoto(s.db, s.dataDir, {
      org: s.org,
      userId: s.userId,
      eventId: s.eventId,
      filename: "b.jpg",
      bytes: await jpeg("7", { exifDate: "2026:10:03 19:05:00" }),
    });
    const provider = scripted(
      new Map([
        ["a", [{ text: "24", confidence: 0.95, location: "jersey_back", box: null }]],
        ["b", [{ text: "7", confidence: 0.95, location: "jersey_back", box: null }]],
      ]),
      ["a", "b"],
    );
    await drain({ db: s.db, dataDir: s.dataDir, provider: () => provider }, 1);
    createPlayer(s.db, s.org, s.userId, {
      firstName: "Dominic",
      lastName: "Herman",
      jerseyNumber: "24",
      teamName: "West Seneca",
      sport: "Football",
      season: "2026",
      position: "",
      graduationYear: "",
    });
    const q = (text: string) =>
      listPhotos(s.db, s.org, s.userId, DEFAULT_THRESHOLDS, { q: text }).tiles.map(
        (t) => t.original_filename,
      );
    expect(q("24")).toEqual(["a.jpg"]);
    expect(q("#24")).toEqual(["a.jpg"]);
    expect(q("Dominic Herman")).toEqual(["a.jpg"]);
    expect(q("October 3")).toEqual(["a.jpg", "b.jpg"]);
    expect(q("October 4")).toEqual([]);
    expect(q("West Seneca")).toEqual(["a.jpg", "b.jpg"]);
    expect(q("football 7")).toEqual(["b.jpg"]);
    expect(q("100%_")).toEqual([]);
  });

  it("never shows another organization's photos", async () => {
    const s = setup();
    await ingestPhoto(s.db, s.dataDir, {
      org: s.org,
      userId: s.userId,
      eventId: s.eventId,
      filename: "a.jpg",
      bytes: await jpeg("24"),
    });
    const other = account(s.db, "rival@example.com", "Orchard Park");
    expect(
      listPhotos(s.db, other.organizationId, other.userId, DEFAULT_THRESHOLDS, {})
        .total,
    ).toBe(0);
    expect(dashboardStats(s.db, other.organizationId, 0.6).photos).toBe(0);
  });
});

describe("failures", () => {
  it("marks a photo failed with the provider's message, and retry re-queues it", async () => {
    const s = setup();
    const r = await ingestPhoto(s.db, s.dataDir, {
      org: s.org,
      userId: s.userId,
      eventId: s.eventId,
      filename: "a.jpg",
      bytes: await jpeg("24"),
    });
    if (!r.ok) throw new Error("ingest failed");
    s.db.run("update photos set status = 'processing' where id = :id", {
      id: r.photoId,
    });
    const broken: ImageAnalysisProvider = {
      info: {
        id: "b",
        model: "b",
        label: "b",
        method: "vision_model",
        understandsContext: true,
      },
      analyze: () => Promise.reject(new Error("rate limited")),
    };
    await processPhoto(
      { db: s.db, dataDir: s.dataDir, provider: () => broken },
      r.photoId,
      s.org,
    );
    const p = getPhoto(s.db, s.org, s.userId, r.photoId);
    expect(p?.status).toBe("failed");
    expect(p?.error).toBe("rate limited");
    expect(photoDetections(s.db, s.org, r.photoId)).toEqual([]);
    expect(retryFailed(s.db, s.org, {})).toBe(1);
    expect(getPhoto(s.db, s.org, s.userId, r.photoId)?.status).toBe("queued");
  });

  it("with analysis switched off, every photo goes to review and nothing is invented", async () => {
    const s = setup();
    await ingestPhoto(s.db, s.dataDir, {
      org: s.org,
      userId: s.userId,
      eventId: s.eventId,
      filename: "a.jpg",
      bytes: await jpeg("24"),
    });
    await drain({ db: s.db, dataDir: s.dataDir, provider: () => null }, 1);
    expect(progress(s.db, s.org, null)).toMatchObject({ needsReview: 1 });
    expect(
      s.db.get<{ n: number }>("select count(*) as n from photo_detections")?.n,
    ).toBe(0);
    expect(
      s.db.get<{ n: number }>("select count(*) as n from ai_analysis_jobs")?.n,
    ).toBe(0);
  });
});
