/**
 * Publishing team galleries online, against the REAL team-gallery handler
 * (supabase/functions/_shared/gallery/core.ts) — the code the online service
 * runs — with its database and storage replaced by in-memory stand-ins that
 * follow migration 0053's rules (exact publishing, files handed back for
 * deletion, covers only from the game's own photos). No network.
 */
import { createHash } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  handle,
  type GalleryDeps,
  type GalleryRow,
  type GameRow,
  type ListingRow,
  type PhotoRow,
} from "../../../../supabase/functions/_shared/gallery/core.ts";
import { ingestPhoto } from "./ingest.ts";
import {
  connect,
  newPublishProgress,
  onlineStatus,
  publishGallery,
  readPublisher,
  setCover,
  unpublishGallery,
  type Fetch,
} from "./online-core.ts";
import { createEvent, ValidationError } from "./repo/events.ts";
import {
  createGallery,
  getGallery,
  setGalleryActive,
  setGalleryEvents,
} from "./repo/galleries.ts";
import { account, freshDb } from "./test-helpers.ts";

const SERVICE = "https://svc.test/functions/v1/team-gallery";
const UPLOAD = "https://upload.test/";

interface GalleryIn {
  id: string;
  slug: string;
  brand: string;
  group_name?: string | null;
  name: string;
  password_hash: string;
  link_token: string;
  active?: boolean;
}
interface GameIn {
  id: string;
  slug: string;
  title: string;
  sport?: string | null;
  opponent?: string | null;
  location?: string | null;
  event_date: string;
  cover_photo_id?: string | null;
}
interface PhotoIn {
  id: string;
  filename: string;
  captured_at?: string | null;
  width?: number | null;
  height?: number | null;
}

/** The online service, in memory: migration 0053's rules + the real handler. */
function onlineService() {
  const galleries = new Map<string, GalleryRow & { link: string; active: boolean }>();
  const games = new Map<
    string,
    Omit<GameRow, "first_thumb" | "photo_count"> & {
      gallery_id: string;
      cover_path: string | null;
    }
  >();
  const photos = new Map<
    string,
    PhotoRow & { game_id: string; gallery_id: string; position: number }
  >();
  const files = new Map<string, Buffer>(); // "<bucket>/<path>"
  const settings = {
    publisher: null as string | null,
    windowOpen: false,
  };
  const pathsOf = (p: PhotoRow) => [p.web_path, p.thumb_path];
  const deps: GalleryDeps = {
    accessSecret: "s".repeat(44),
    get publisherKeySha256() {
      return settings.publisher;
    },
    store: {
      galleryForLink: (link) =>
        Promise.resolve(
          [...galleries.values()].find((g) => g.link === link && g.active),
        ),
      visitorGames: (id) =>
        Promise.resolve(
          galleries.get(id)?.active
            ? [...games.values()]
                .filter((g) => g.gallery_id === id)
                .map((g) => {
                  const ps = [...photos.values()].filter((p) => p.game_id === g.id);
                  return {
                    id: g.id,
                    slug: g.slug,
                    title: g.title,
                    sport: g.sport,
                    opponent: g.opponent,
                    location: g.location,
                    event_date: g.event_date,
                    photo_count: ps.length,
                    first_thumb:
                      ps.sort((a, b) => a.position - b.position)[0]?.thumb_path ?? null,
                  };
                })
            : [],
        ),
      visitorPhotos: (id, game) =>
        Promise.resolve(
          galleries.get(id)?.active
            ? [...photos.values()]
                .filter((p) => p.gallery_id === id && p.game_id === game)
                .sort((a, b) => a.position - b.position)
            : [],
        ),
      publicListing: () =>
        Promise.resolve(
          [...games.values()].flatMap((gm): ListingRow[] => {
            const g = galleries.get(gm.gallery_id);
            if (!g?.active) return [];
            return [
              {
                gallery_slug: g.slug,
                brand: g.brand,
                group_name: g.group_name,
                gallery_name: g.name,
                link_token: g.link,
                game_slug: gm.slug,
                title: gm.title,
                sport: gm.sport,
                opponent: gm.opponent,
                location: gm.location,
                event_date: gm.event_date,
                photo_count: [...photos.values()].filter((p) => p.game_id === gm.id)
                  .length,
                cover_path: gm.cover_path,
              },
            ];
          }),
        ),
      publishGallery: (raw) => {
        const p = raw as unknown as GalleryIn;
        galleries.set(String(p.id), {
          id: String(p.id),
          slug: String(p.slug),
          brand: String(p.brand),
          group_name: (p.group_name as string | null) ?? null,
          name: String(p.name),
          password_hash: String(p.password_hash),
          link: String(p.link_token),
          active: p.active !== false,
        });
        return Promise.resolve();
      },
      publishGame: (galleryId, rawGame, rawList) => {
        const game = rawGame as unknown as GameIn;
        const list = rawList as unknown as PhotoIn[];
        const id = String(game.id);
        const old = games.get(id);
        if (old !== undefined && old.gallery_id !== galleryId)
          throw new Error("another gallery's game");
        const coverId = (game.cover_photo_id as string | null) ?? null;
        if (coverId !== null && !list.some((p) => p.id === coverId))
          throw new Error("cover not a game photo");
        const keep = new Set(list.map((p) => String(p.id)));
        const removed: string[] = [];
        for (const p of [...photos.values()]) {
          if (p.game_id === id && !keep.has(p.id)) {
            removed.push(...pathsOf(p));
            photos.delete(p.id);
          }
        }
        const cover = coverId === null ? null : `${id}/${coverId}.jpg`;
        if (old?.cover_path && old.cover_path !== cover)
          removed.push(`cover:${old.cover_path}`);
        games.set(id, {
          id,
          gallery_id: galleryId,
          slug: String(game.slug),
          title: String(game.title),
          sport: (game.sport as string | null) ?? null,
          opponent: (game.opponent as string | null) ?? null,
          location: (game.location as string | null) ?? null,
          event_date: String(game.event_date),
          cover_path: cover,
        });
        list.forEach((p, i) => {
          photos.set(String(p.id), {
            id: String(p.id),
            game_id: id,
            gallery_id: galleryId,
            filename: String(p.filename),
            captured_at: (p.captured_at as string | null) ?? null,
            width: (p.width as number | null) ?? null,
            height: (p.height as number | null) ?? null,
            position: i + 1,
            web_path: `${galleryId}/${id}/${String(p.id)}-web.jpg`,
            thumb_path: `${galleryId}/${id}/${String(p.id)}-thumb.jpg`,
          });
        });
        return Promise.resolve(removed);
      },
      removeGamesExcept: (galleryId, keep) => {
        const removed: string[] = [];
        for (const g of [...games.values()]) {
          if (g.gallery_id === galleryId && !keep.includes(g.id)) {
            for (const p of [...photos.values()]) {
              if (p.game_id === g.id) {
                removed.push(...pathsOf(p));
                photos.delete(p.id);
              }
            }
            if (g.cover_path) removed.push(`cover:${g.cover_path}`);
            games.delete(g.id);
          }
        }
        return Promise.resolve(removed);
      },
      removeGallery: async (galleryId) => {
        const removed = await deps.store.removeGamesExcept(galleryId, []);
        galleries.delete(galleryId);
        return removed;
      },
      recordFailure: () => Promise.resolve(1),
      recentFailures: () => Promise.resolve(0),
      registerPublisher: (sha) => {
        if (settings.publisher === sha) return Promise.resolve("connected");
        if (settings.publisher !== null) return Promise.resolve("taken");
        if (!settings.windowOpen) return Promise.resolve("closed");
        settings.publisher = sha;
        settings.windowOpen = false;
        return Promise.resolve("connected");
      },
    },
    files: {
      signedUrls: (paths) =>
        Promise.resolve(new Map(paths.map((p) => [p, `signed:${p}`]))),
      signedUploadUrl: (bucket, p) => Promise.resolve(`${UPLOAD}${bucket}/${p}`),
      publicUrl: (bucket, p) => `public:${bucket}/${p}`,
      remove: (bucket, paths) => {
        for (const p of paths) files.delete(`${bucket}/${p}`);
        return Promise.resolve();
      },
    },
  };
  let uploads = 0;
  const fetchImpl: Fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(UPLOAD)) {
      // (the URL is always a string here: the publisher passes strings)
      uploads += 1;
      files.set(url.slice(UPLOAD.length), Buffer.from(init?.body as Uint8Array));
      return new Response(null, { status: 200 });
    }
    return handle(new Request(url, init), deps);
  };
  return {
    fetch: fetchImpl,
    files,
    settings,
    get uploads() {
      return uploads;
    },
    get: (p: string) => handle(new Request(SERVICE + p), deps),
    post: (p: string, b: unknown) =>
      handle(
        new Request(SERVICE + p, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(b),
        }),
        deps,
      ),
  };
}

let seq = 0;
async function wide(number: string): Promise<Uint8Array> {
  seq += 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2400">
    <rect width="3600" height="2400" fill="#1e3a8a"/>
    <text x="1800" y="1400" text-anchor="middle" font-size="600" fill="#fff">${number}</text>
    <text x="40" y="2360" font-size="60" fill="#fff">${seq}</text></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
}

async function setup() {
  const { db, dataDir } = freshDb();
  const { userId, organizationId: org } = account(
    db,
    "keith@example.com",
    "5 Star Sports Media",
  );
  const game = (name: string, date: string) => ({
    name,
    sport: "Hockey",
    teamName: "Varsity",
    opponent: name.split(" vs ")[1] ?? "",
    eventDate: date,
    location: "",
    season: "2026",
    notes: "",
  });
  const a = createEvent(db, org, userId, game("Varsity vs Wheatfield", "2026-10-24"));
  const b = createEvent(db, org, userId, game("Varsity vs Lockport", "2026-10-31"));
  const add = async (eventId: string, name: string, n: string) => {
    const r = await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: name,
      bytes: await wide(n),
    });
    if (!r.ok) throw new Error(r.reason);
    return r.photoId;
  };
  const a1 = await add(a, "A_0001.JPG", "24");
  const a2 = await add(a, "A_0002.JPG", "7");
  const b1 = await add(b, "B_0001.JPG", "12");
  const gallery = createGallery(db, org, userId, {
    group: "Cazenovia Hockey",
    name: "Varsity",
    password: "goblue26",
  });
  setGalleryEvents(db, org, gallery, [a, b]);
  return { db, dataDir, org, userId, a, b, a1, a2, b1, gallery, add };
}

describe("publishing team galleries online", () => {
  it("connects by fingerprint during the window only, and refuses a second computer", async () => {
    const t = await setup();
    const svc = onlineService();
    const closed = await connect(SERVICE, t.dataDir, svc.fetch);
    expect(closed).toMatchObject({ ok: false, reason: "closed" });
    svc.settings.windowOpen = true;
    expect(await connect(SERVICE, t.dataDir, svc.fetch)).toEqual({ ok: true });
    const key = (await readPublisher(t.dataDir))?.key ?? "";
    expect(svc.settings.publisher).toBe(createHash("sha256").update(key).digest("hex"));
    expect(svc.settings.publisher).not.toContain(key);
    // Connecting again from the same computer is fine; another is refused.
    expect(await connect(SERVICE, t.dataDir, svc.fetch)).toEqual({ ok: true });
    const other = freshDb();
    expect(await connect(SERVICE, other.dataDir, svc.fetch)).toMatchObject({
      ok: false,
      reason: "taken",
    });
  });

  it("publishes web-size photos, thumbnails and only the chosen cover; the team password opens it", async () => {
    const t = await setup();
    const svc = onlineService();
    svc.settings.windowOpen = true;
    await connect(SERVICE, t.dataDir, svc.fetch);
    setCover(t.db, t.org, t.gallery, t.a, t.a2);
    expect(() => setCover(t.db, t.org, t.gallery, t.a, t.b1)).toThrow(ValidationError);

    const progress = newPublishProgress();
    await publishGallery(t.db, t.dataDir, {
      org: t.org,
      galleryId: t.gallery,
      serviceUrl: SERVICE,
      fetch: svc.fetch,
      progress,
    });
    expect(progress).toMatchObject({
      phase: "done",
      total: 3,
      done: 3,
      uploaded: 3,
      finished: true,
    });
    // 3 web + 3 thumbs + 1 cover.
    expect(svc.uploads).toBe(7);
    const web = [...svc.files.entries()].find(([k]) => k.endsWith(`${t.a1}-web.jpg`));
    const meta = await sharp(web?.[1]).metadata();
    expect(meta.width).toBe(2400);
    expect(meta.format).toBe("jpeg");
    expect(
      [...svc.files.keys()].filter((k) => k.startsWith("gallery-covers/")),
    ).toEqual([`gallery-covers/${t.a}/${t.a2}.jpg`]);
    expect(onlineStatus(t.db, t.gallery)).toMatchObject({ games: 2, photos: 3 });

    const listing = (await (await svc.get("/listing")).json()) as {
      games: (ListingRow & { cover_url: string | null })[];
    };
    expect(listing.games.map((g) => [g.title, g.cover_url !== null])).toEqual([
      ["Varsity vs Wheatfield", true],
      ["Varsity vs Lockport", false],
    ]);
    expect(listing.games[0]?.brand).toBe("5 Star Sports Media");
    expect(listing.games[0]?.game_slug).toBe("2026-10-24-varsity-vs-wheatfield");

    const link = getGallery(t.db, t.org, t.gallery)?.token ?? "";
    expect((await svc.post("/unlock", { link, password: "wrong-one" })).status).toBe(
      401,
    );
    const unlocked = await svc.post("/unlock", { link, password: "goblue26" });
    expect(unlocked.status).toBe(200);
    const { pass } = (await unlocked.json()) as { pass: string };
    const game = (await (
      await svc.get(`/game?link=${link}&pass=${pass}&game=${t.a}`)
    ).json()) as {
      photos: { filename: string }[];
    };
    expect(game.photos.map((p) => p.filename)).toEqual(["A_0001.JPG", "A_0002.JPG"]);
  });

  it("publishing again uploads only new photos, follows unticked games and a new cover", async () => {
    const t = await setup();
    const svc = onlineService();
    svc.settings.windowOpen = true;
    await connect(SERVICE, t.dataDir, svc.fetch);
    setCover(t.db, t.org, t.gallery, t.a, t.a1);
    const publish = async () => {
      const p = newPublishProgress();
      await publishGallery(t.db, t.dataDir, {
        org: t.org,
        galleryId: t.gallery,
        serviceUrl: SERVICE,
        fetch: svc.fetch,
        progress: p,
      });
      expect(p.phase).toBe("done");
      return p;
    };
    await publish();
    const before = svc.uploads;

    await t.add(t.a, "A_0003.JPG", "91");
    const second = await publish();
    expect(second.uploaded).toBe(1);
    expect(svc.uploads - before).toBe(2); // its web copy and thumbnail, nothing else

    setCover(t.db, t.org, t.gallery, t.a, t.a2);
    setGalleryEvents(t.db, t.org, t.gallery, [t.a]);
    await publish();
    const keys = [...svc.files.keys()];
    expect(keys.some((k) => k.includes(t.b1))).toBe(false); // unticked game gone
    expect(keys.filter((k) => k.startsWith("gallery-covers/"))).toEqual([
      `gallery-covers/${t.a}/${t.a2}.jpg`,
    ]); // old cover removed
    const listing = (await (await svc.get("/listing")).json()) as { games: unknown[] };
    expect(listing.games).toHaveLength(1);
  });

  it("a gallery switched off here is switched off online; deleting it removes it", async () => {
    const t = await setup();
    const svc = onlineService();
    svc.settings.windowOpen = true;
    await connect(SERVICE, t.dataDir, svc.fetch);
    const publish = () =>
      publishGallery(t.db, t.dataDir, {
        org: t.org,
        galleryId: t.gallery,
        serviceUrl: SERVICE,
        fetch: svc.fetch,
        progress: newPublishProgress(),
      });
    await publish();
    setGalleryActive(t.db, t.org, t.gallery, false);
    await publish();
    expect(
      ((await (await svc.get("/listing")).json()) as { games: unknown[] }).games,
    ).toEqual([]);
    const link = getGallery(t.db, t.org, t.gallery)?.token ?? "";
    expect((await svc.post("/unlock", { link, password: "goblue26" })).status).toBe(
      404,
    );
    await unpublishGallery(t.db, t.dataDir, {
      galleryId: t.gallery,
      serviceUrl: SERVICE,
      fetch: svc.fetch,
    });
    expect(svc.files.size).toBe(0);
  });

  it("says plainly what is wrong instead of pretending", async () => {
    const t = await setup();
    const svc = onlineService();
    const notConnected = newPublishProgress();
    await publishGallery(t.db, t.dataDir, {
      org: t.org,
      galleryId: t.gallery,
      serviceUrl: SERVICE,
      fetch: svc.fetch,
      progress: notConnected,
    });
    expect(notConnected.phase).toBe("failed");
    expect(notConnected.message).toMatch(/not connected/);
    const off: Fetch = () => Promise.resolve(new Response("{}", { status: 503 }));
    expect(await connect(SERVICE, t.dataDir, off)).toMatchObject({
      ok: false,
      reason: "off",
    });
    const down: Fetch = () => Promise.reject(new Error("offline"));
    expect(await connect(SERVICE, t.dataDir, down)).toMatchObject({
      ok: false,
      reason: "unreachable",
    });
  });
});
