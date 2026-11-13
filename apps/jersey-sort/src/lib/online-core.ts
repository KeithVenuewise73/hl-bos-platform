/**
 * Publishing team galleries ONLINE, to the team-gallery service that serves
 * the 5starsportsmedia.com galleries pages.
 *
 * What goes online, and what never does:
 *   - each assigned game's photos at web size (about 2400 px) plus a 480 px
 *     thumbnail, never the originals;
 *   - the ONE cover photo the photographer picked for a game, which is the
 *     only image the website shows publicly (none picked, none shown);
 *   - the team password's scrypt HASH, never the password.
 *
 * Connecting: this computer makes its own publisher key and keeps it in the
 * data folder. Only the key's SHA-256 fingerprint is sent, once, during the
 * one-time connect window. Every publish call then carries the key.
 *
 * Publishing again uploads only photos not yet online, and makes the online
 * copy match: games unticked or photos removed here are removed there.
 *
 * Free of `server-only` and of the network: `fetch` is passed in, so the tests
 * publish against the real team-gallery handler.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { nowIso, type Db } from "./db-core.ts";
import { renderWebVariants, sniff } from "./media-core.ts";
import { APPROVED_PHOTO } from "./repo/approvals.ts";
import { ValidationError } from "./repo/events.ts";
import { getObject } from "./storage.ts";

export type Fetch = typeof fetch;

/** A gallery's page on the website (part 3), opened with the team password. */
export const websiteLink = (linkToken: string) =>
  `https://5starsportsmedia.com/galleries/view/#${linkToken}`;

// --- connecting --------------------------------------------------------------

interface PublisherFile {
  key: string;
  connectedAt: string | null;
}

const publisherPath = (dataDir: string) => path.join(dataDir, "gallery-publisher.json");

export async function readPublisher(dataDir: string): Promise<PublisherFile | null> {
  try {
    const p = JSON.parse(
      await readFile(publisherPath(dataDir), "utf8"),
    ) as PublisherFile;
    return typeof p.key === "string" && p.key.length >= 40 ? p : null;
  } catch {
    return null;
  }
}

async function writePublisher(dataDir: string, p: PublisherFile): Promise<void> {
  await writeFile(publisherPath(dataDir), JSON.stringify(p, null, 2), { mode: 0o600 });
}

export const fingerprint = (key: string) =>
  createHash("sha256").update(key).digest("hex");

export type ConnectResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "off" | "closed" | "taken" | "unreachable";
      readonly message: string;
    };

/** Connect this computer's JerseySort as the galleries' publisher. */
export async function connect(
  serviceUrl: string,
  dataDir: string,
  fetchImpl: Fetch,
): Promise<ConnectResult> {
  let p = await readPublisher(dataDir);
  if (p === null) {
    p = { key: randomBytes(32).toString("base64url"), connectedAt: null };
    await writePublisher(dataDir, p);
  }
  let res: Response;
  try {
    res = await fetchImpl(`${serviceUrl}/publish/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key_sha256: fingerprint(p.key) }),
    });
  } catch {
    return {
      ok: false,
      reason: "unreachable",
      message:
        "Could not reach the galleries service. Check the internet connection and try again.",
    };
  }
  if (res.ok) {
    await writePublisher(dataDir, { ...p, connectedAt: p.connectedAt ?? nowIso() });
    return { ok: true };
  }
  if (res.status === 503) {
    return {
      ok: false,
      reason: "off",
      message:
        "Online galleries are not switched on yet. That needs your approval of the database change and the gallery service first.",
    };
  }
  if (res.status === 409) {
    return {
      ok: false,
      reason: "taken",
      message:
        "The online galleries are connected to another computer's JerseySort, not this one. If that was not you, tell your engineer: it can be reset safely.",
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      reason: "closed",
      message:
        "The one-time connect window has closed. Your engineer can open a new one (it needs your approval).",
    };
  }
  return {
    ok: false,
    reason: "unreachable",
    message: `The galleries service answered ${res.status}. Try again in a minute.`,
  };
}

// --- what to publish -----------------------------------------------------------

export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100)
      .replace(/-+$/g, "") || "gallery"
  );
}

/** The cover photo picked for one game of one gallery (null: none, nothing public). */
export function setCover(
  db: Db,
  org: string,
  galleryId: string,
  eventId: string,
  photoId: string | null,
): void {
  db.tx(() => {
    const ok = db.get(
      `select 1 from shared_galleries g join shared_gallery_events ge on ge.gallery_id = g.id
        where g.id = :g and g.organization_id = :org and ge.event_id = :e`,
      { g: galleryId, org, e: eventId },
    );
    if (ok === undefined)
      throw new ValidationError("That game is not in this team gallery.");
    if (photoId === null) {
      db.run(
        "delete from shared_gallery_covers where gallery_id = :g and event_id = :e",
        {
          g: galleryId,
          e: eventId,
        },
      );
      return;
    }
    const photo = db.get(
      `select 1 from photos where id = :p and event_id = :e and organization_id = :org
          and unusable = 0 and preview_path is not null and ${APPROVED_PHOTO}`,
      { p: photoId, e: eventId, org },
    );
    if (photo === undefined)
      throw new ValidationError(
        "That photo is not in this game, or has not been approved yet.",
      );
    db.run(
      `insert into shared_gallery_covers (gallery_id, event_id, photo_id) values (:g, :e, :p)
       on conflict (gallery_id, event_id) do update set photo_id = excluded.photo_id`,
      { g: galleryId, e: eventId, p: photoId },
    );
  });
}

export function coverFor(db: Db, galleryId: string, eventId: string): string | null {
  return (
    db.get<{ photo_id: string }>(
      "select photo_id from shared_gallery_covers where gallery_id = :g and event_id = :e",
      { g: galleryId, e: eventId },
    )?.photo_id ?? null
  );
}

export interface OnlineStatus {
  readonly publishedAt: string;
  readonly games: number;
  readonly photos: number;
}

export function onlineStatus(db: Db, galleryId: string): OnlineStatus | null {
  const r = db.get<{ published_at: string; games: number; photos: number }>(
    "select published_at, games, photos from published_galleries where gallery_id = :g",
    { g: galleryId },
  );
  return r === undefined
    ? null
    : { publishedAt: r.published_at, games: r.games, photos: r.photos };
}

// --- publishing ------------------------------------------------------------------

export interface PublishProgress {
  total: number;
  done: number;
  uploaded: number;
  phase: "preparing" | "uploading" | "finishing" | "done" | "failed";
  message: string | null;
  finished: boolean;
}

export const newPublishProgress = (): PublishProgress => ({
  total: 0,
  done: 0,
  uploaded: 0,
  phase: "preparing",
  message: null,
  finished: false,
});

class PublishError extends Error {}

async function call(
  fetchImpl: Fetch,
  serviceUrl: string,
  key: string,
  route: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(`${serviceUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-gallery-publisher-key": key },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PublishError(
      "Lost the connection to the galleries service. Publish again: what is already online is skipped.",
    );
  }
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) {
    throw new PublishError(
      "This computer is not connected as the galleries' publisher. Press Connect first.",
    );
  }
  if (res.status === 503)
    throw new PublishError("Online galleries are not switched on yet.");
  if (!res.ok) {
    throw new PublishError(
      `The galleries service refused this (${res.status}${typeof out["error"] === "string" ? `: ${out["error"]}` : ""}).`,
    );
  }
  return out;
}

async function put(fetchImpl: Fetch, url: string, bytes: Buffer): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "PUT",
      headers: { "content-type": "image/jpeg", "x-upsert": "true" },
      body: new Uint8Array(bytes),
    });
  } catch {
    throw new PublishError(
      "Lost the connection while uploading. Publish again to finish.",
    );
  }
  if (!res.ok)
    throw new PublishError(
      `An upload was refused (${res.status}). Publish again to retry it.`,
    );
}

interface EventRow {
  id: string;
  name: string;
  sport: string;
  opponent: string | null;
  location: string | null;
  event_date: string;
}

/**
 * Make the online copy of one team gallery match this computer: its games,
 * their photos (only new ones uploaded), each game's chosen cover, and
 * whether the gallery is switched on.
 */
export async function publishGallery(
  db: Db,
  dataDir: string,
  input: {
    readonly org: string;
    readonly galleryId: string;
    readonly serviceUrl: string;
    readonly fetch: Fetch;
    readonly progress: PublishProgress;
  },
): Promise<void> {
  const { org, galleryId, serviceUrl, progress } = input;
  const fetchImpl = input.fetch;
  try {
    const publisher = await readPublisher(dataDir);
    if (publisher === null || publisher.connectedAt === null) {
      throw new PublishError(
        "This computer is not connected to the online galleries yet. Press Connect first.",
      );
    }
    const key = publisher.key;
    const g = db.get<{
      id: string;
      group_name: string | null;
      name: string;
      token: string;
      password_hash: string;
      active: number;
      brand: string;
    }>(
      `select g.id, g.group_name, g.name, g.token, g.password_hash, g.active, o.name as brand
         from shared_galleries g join organizations o on o.id = g.organization_id
        where g.id = :g and g.organization_id = :org`,
      { g: galleryId, org },
    );
    if (g === undefined) throw new PublishError("That team gallery was not found.");

    const events = db.all<EventRow>(
      `select e.id, e.name, e.sport, e.opponent, e.location, e.event_date
         from shared_gallery_events ge join events e on e.id = ge.event_id and e.organization_id = :org
        where ge.gallery_id = :g order by e.event_date, e.name`,
      { g: galleryId, org },
    );

    // Slugs: readable, and unique among this photographer's galleries / games.
    const others = new Set(
      db
        .all<{ id: string; group_name: string | null; name: string }>(
          "select id, group_name, name from shared_galleries where organization_id = :org and id <> :g",
          { org, g: galleryId },
        )
        .map((o) => slugify(`${o.group_name ?? ""} ${o.name}`)),
    );
    let slug = slugify(`${g.group_name ?? ""} ${g.name}`);
    for (let n = 2; others.has(slug); n += 1)
      slug = `${slugify(`${g.group_name ?? ""} ${g.name}`)}-${n}`;

    await call(fetchImpl, serviceUrl, key, "/publish/gallery", {
      gallery_id: g.id,
      gallery: {
        slug,
        link_token: g.token,
        password_hash: g.password_hash,
        brand: g.brand,
        group_name: g.group_name,
        name: g.name,
        active: g.active === 1,
      },
      keep_games: events.map((e) => e.id),
    });
    // Games no longer in the gallery are gone online too.
    db.run(
      `delete from published_photos where gallery_id = :g
         and event_id not in (select event_id from shared_gallery_events where gallery_id = :g)`,
      { g: galleryId },
    );
    db.run(
      `delete from published_covers where gallery_id = :g
         and event_id not in (select event_id from shared_gallery_events where gallery_id = :g)`,
      { g: galleryId },
    );

    const perEvent = events.map((e) => ({
      event: e,
      photos: db.all<{
        id: string;
        original_filename: string;
        captured_at: string;
        storage_path: string;
        preview_path: string;
      }>(
        `select id, original_filename, captured_at, storage_path, preview_path from photos
          where event_id = :e and organization_id = :org and unusable = 0 and preview_path is not null
            and ${APPROVED_PHOTO}
          order by captured_at, original_filename`,
        { e: e.id, org },
      ),
    }));
    const online = new Map(
      db
        .all<{
          photo_id: string;
          web_bytes: number;
          width: number | null;
          height: number | null;
        }>(
          "select photo_id, web_bytes, width, height from published_photos where gallery_id = :g",
          { g: galleryId },
        )
        .map((r) => [r.photo_id, r]),
    );
    progress.total = perEvent.reduce((n, x) => n + x.photos.length, 0);
    progress.done = perEvent.reduce(
      (n, x) => n + x.photos.filter((p) => online.has(p.id)).length,
      0,
    );
    progress.phase = "uploading";

    const usedSlugs = new Set<string>();
    let totalPhotos = 0;
    for (const { event, photos } of perEvent) {
      // Upload what is not online yet, a batch at a time.
      const fresh = photos.filter((p) => !online.has(p.id));
      for (let i = 0; i < fresh.length; i += 20) {
        const batch = fresh.slice(i, i + 20);
        const out = await call(fetchImpl, serviceUrl, key, "/publish/uploads", {
          gallery_id: g.id,
          game_id: event.id,
          files: batch.flatMap((p) => [
            { photo_id: p.id, kind: "web" },
            { photo_id: p.id, kind: "thumb" },
          ]),
        });
        const urls = new Map(
          (
            (out["uploads"] ?? []) as { photo_id: string; kind: string; url: string }[]
          ).map((u) => [`${u.photo_id}:${u.kind}`, u.url]),
        );
        for (const p of batch) {
          const original = await getObject(dataDir, p.storage_path);
          const kind = sniff(new Uint8Array(original));
          if (kind === null)
            throw new PublishError(`${p.original_filename} could not be read.`);
          const v = await renderWebVariants(new Uint8Array(original), kind);
          const webUrl = urls.get(`${p.id}:web`);
          const thumbUrl = urls.get(`${p.id}:thumb`);
          if (!webUrl || !thumbUrl)
            throw new PublishError("The galleries service gave no upload address.");
          await put(fetchImpl, webUrl, v.web);
          await put(fetchImpl, thumbUrl, v.thumb);
          db.run(
            `insert into published_photos (gallery_id, photo_id, event_id, web_bytes, width, height, published_at)
             values (:g, :p, :e, :b, :w, :h, :t)
             on conflict (gallery_id, photo_id) do update set web_bytes = excluded.web_bytes,
               width = excluded.width, height = excluded.height, published_at = excluded.published_at`,
            {
              g: galleryId,
              p: p.id,
              e: event.id,
              b: v.web.length,
              w: v.width,
              h: v.height,
              t: nowIso(),
            },
          );
          online.set(p.id, {
            photo_id: p.id,
            web_bytes: v.web.length,
            width: v.width,
            height: v.height,
          });
          progress.done += 1;
          progress.uploaded += 1;
        }
      }

      // The public cover: the photographer's pick, or none. Uploaded when it changes.
      const cover = coverFor(db, galleryId, event.id);
      const coverOk = cover !== null && photos.some((p) => p.id === cover);
      const lastCover =
        db.get<{ photo_id: string }>(
          "select photo_id from published_covers where gallery_id = :g and event_id = :e",
          { g: galleryId, e: event.id },
        )?.photo_id ?? null;
      if (coverOk && cover !== lastCover) {
        const p = photos.find((x) => x.id === cover);
        if (p !== undefined) {
          const out = await call(fetchImpl, serviceUrl, key, "/publish/uploads", {
            gallery_id: g.id,
            game_id: event.id,
            files: [{ photo_id: p.id, kind: "cover" }],
          });
          const url = ((out["uploads"] ?? []) as { url: string }[])[0]?.url;
          if (!url)
            throw new PublishError("The galleries service gave no upload address.");
          // The 1600 px preview: plenty for a web page, smaller than the download.
          await put(fetchImpl, url, await getObject(dataDir, p.preview_path));
        }
      }

      let gameSlug = slugify(`${event.event_date} ${event.name}`);
      for (let n = 2; usedSlugs.has(gameSlug); n += 1) {
        gameSlug = `${slugify(`${event.event_date} ${event.name}`)}-${n}`;
      }
      usedSlugs.add(gameSlug);
      progress.phase = "finishing";
      await call(fetchImpl, serviceUrl, key, "/publish/game", {
        gallery_id: g.id,
        game: {
          id: event.id,
          slug: gameSlug,
          title: event.name,
          sport: event.sport,
          opponent: event.opponent,
          location: event.location,
          event_date: event.event_date,
          cover_photo_id: coverOk ? cover : null,
        },
        photos: photos.map((p) => {
          const o = online.get(p.id);
          return {
            id: p.id,
            filename: p.original_filename,
            captured_at: p.captured_at,
            width: o?.width ?? null,
            height: o?.height ?? null,
            web_bytes: o?.web_bytes ?? 1,
          };
        }),
      });
      // Photos removed here are gone online now; forget them.
      db.run(
        `delete from published_photos where gallery_id = :g and event_id = :e
           and photo_id not in (select id from photos where event_id = :e and unusable = 0 and ${APPROVED_PHOTO})`,
        { g: galleryId, e: event.id },
      );
      if (coverOk) {
        db.run(
          `insert into published_covers (gallery_id, event_id, photo_id) values (:g, :e, :p)
           on conflict (gallery_id, event_id) do update set photo_id = excluded.photo_id`,
          { g: galleryId, e: event.id, p: cover },
        );
      } else {
        db.run("delete from published_covers where gallery_id = :g and event_id = :e", {
          g: galleryId,
          e: event.id,
        });
      }
      totalPhotos += photos.length;
    }

    db.run(
      `insert into published_galleries (gallery_id, published_at, games, photos) values (:g, :t, :n, :p)
       on conflict (gallery_id) do update set published_at = excluded.published_at,
         games = excluded.games, photos = excluded.photos`,
      { g: galleryId, t: nowIso(), n: events.length, p: totalPhotos },
    );
    progress.phase = "done";
  } catch (e) {
    progress.phase = "failed";
    progress.message =
      e instanceof PublishError
        ? e.message
        : "Publishing stopped unexpectedly. Publish again: what is already online is skipped.";
    if (!(e instanceof PublishError)) console.error("[jerseysort] publish failed:", e);
  } finally {
    progress.finished = true;
  }
}

/** Take a gallery offline entirely (it is being deleted here). */
export async function unpublishGallery(
  db: Db,
  dataDir: string,
  input: {
    readonly galleryId: string;
    readonly serviceUrl: string;
    readonly fetch: Fetch;
  },
): Promise<void> {
  if (onlineStatus(db, input.galleryId) === null) return;
  const publisher = await readPublisher(dataDir);
  if (publisher === null) return;
  await call(input.fetch, input.serviceUrl, publisher.key, "/publish/remove", {
    gallery_id: input.galleryId,
  });
}
