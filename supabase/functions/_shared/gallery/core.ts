// Team galleries, online — the request handling behind the team-gallery Edge
// Function, written against injected ports so it is tested offline
// (supabase/functions/tests/team_gallery.test.ts) and wired to Postgres and
// Storage in team-gallery/index.ts.
//
// Two audiences, kept apart:
//
//   * VISITORS (a coach, a parent) on 5starsportsmedia.com. They have a link
//     and a team password. /unlock checks the password against the scrypt
//     hash JerseySort made and returns an ACCESS PASS bound to that gallery
//     and to that hash, so changing the password, or switching the gallery
//     off, ends every pass at once. Photos are only ever handed out as
//     signed URLs that expire.
//   * THE PUBLISHER (the photographer's JerseySort). It makes its key on his
//     computer and registers only the key's SHA-256 fingerprint, once, during
//     the connect window migration 0054 opens (/publish/register). Every other
//     /publish/* call must carry the key; its fingerprint is compared with the
//     registered one in constant time.
//
// /listing is the only thing anyone may read without a password: the games
// the website lists, with the cover photo the photographer chose. No photo
// paths, no hashes, no other photos.

import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const ACCESS_DAYS = 30;
export const PHOTO_URL_SECONDS = 60 * 60;
export const MAX_FAILURES = 10;

export interface GalleryRow {
  id: string;
  slug: string;
  brand: string;
  group_name: string | null;
  name: string;
  password_hash: string;
}

export interface GameRow {
  id: string;
  slug: string;
  title: string;
  sport: string | null;
  opponent: string | null;
  location: string | null;
  event_date: string;
  photo_count: number;
  first_thumb: string | null;
}

export interface PhotoRow {
  id: string;
  filename: string;
  captured_at: string | null;
  width: number | null;
  height: number | null;
  web_path: string;
  thumb_path: string;
}

export interface ListingRow {
  gallery_slug: string;
  brand: string;
  group_name: string | null;
  gallery_name: string;
  link_token: string;
  game_slug: string;
  title: string;
  sport: string | null;
  opponent: string | null;
  location: string | null;
  event_date: string;
  photo_count: number;
  cover_path: string | null;
}

/** The gallery schema's functions (migration 0053). */
export interface GalleryStore {
  galleryForLink(link: string): Promise<GalleryRow | undefined>;
  visitorGames(galleryId: string): Promise<GameRow[]>;
  visitorPhotos(galleryId: string, gameId: string): Promise<PhotoRow[]>;
  publicListing(): Promise<ListingRow[]>;
  publishGallery(p: Record<string, unknown>): Promise<void>;
  publishGame(
    galleryId: string,
    game: Record<string, unknown>,
    photos: Record<string, unknown>[],
  ): Promise<string[]>;
  removeGamesExcept(galleryId: string, keep: string[]): Promise<string[]>;
  removeGallery(galleryId: string): Promise<string[]>;
  recordFailure(galleryId: string): Promise<number>;
  recentFailures(galleryId: string): Promise<number>;
  /** 'connected' | 'taken' (another computer) | 'closed' (no window open). */
  registerPublisher(sha256: string): Promise<string>;
}

export type Bucket = "gallery-photos" | "gallery-covers";

/** Storage. */
export interface GalleryFiles {
  signedUrls(paths: string[], seconds: number): Promise<Map<string, string>>;
  signedUploadUrl(bucket: Bucket, path: string): Promise<string>;
  publicUrl(bucket: Bucket, path: string): string;
  remove(bucket: Bucket, paths: string[]): Promise<void>;
}

export interface GalleryDeps {
  store: GalleryStore;
  files: GalleryFiles;
  accessSecret: string;
  /** SHA-256 (hex) of the registered publisher's key; null until JerseySort connects. */
  publisherKeySha256: string | null;
  now?: () => number;
}

// --- passwords and access passes ------------------------------------------------

/** Check a password against JerseySort's "scrypt$<salt>$<hash>" (N=16384, r=8, p=1). */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length < 16) return false;
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function sign(
  secret: string,
  galleryId: string,
  exp: number,
  passwordHash: string,
): string {
  return createHmac("sha256", secret)
    .update(`${galleryId}.${exp}.${sha256(passwordHash)}`)
    .digest("base64url");
}

export function issuePass(secret: string, gallery: GalleryRow, nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + ACCESS_DAYS * 86_400;
  return `${exp}.${sign(secret, gallery.id, exp, gallery.password_hash)}`;
}

export function passIsValid(
  secret: string,
  gallery: GalleryRow,
  pass: string | null,
  nowMs: number,
): boolean {
  if (!pass) return false;
  const [expText, mac] = pass.split(".");
  const exp = Number(expText);
  if (!Number.isInteger(exp) || !mac || exp * 1000 < nowMs) return false;
  const want = Buffer.from(sign(secret, gallery.id, exp, gallery.password_hash));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Does this key's fingerprint match the registered publisher's? */
export function keyMatches(key: string, registeredSha256: string | null): boolean {
  if (!key || !registeredSha256 || !/^[0-9a-f]{64}$/.test(registeredSha256))
    return false;
  return timingSafeEqual(Buffer.from(sha256(key)), Buffer.from(registeredSha256));
}

// --- HTTP ----------------------------------------------------------------------

const ALLOWED_ORIGIN =
  /^https:\/\/(www\.)?5starsportsmedia\.com$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGIN.test(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers":
          "content-type, authorization, x-gallery-publisher-key",
        vary: "origin",
      }
    : { vary: "origin" };
}

function json(
  req: Request,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...cors(req),
      ...extra,
    },
  });
}

const NOT_FOUND = {
  error:
    "This gallery link isn't working. Ask your coach or photographer for the current one.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LINK = /^[A-Za-z0-9_-]{16,64}$/;

/** The route after the function's own name: /functions/v1/team-gallery/<route>. */
export function routeOf(url: URL): string {
  const i = url.pathname.indexOf("/team-gallery");
  const rest = i >= 0 ? url.pathname.slice(i + "/team-gallery".length) : url.pathname;
  return rest.replace(/\/+$/, "") || "/";
}

/** What the routes read from a request body; anything may be missing or wrong. */
interface Body {
  link?: unknown;
  password?: unknown;
  key_sha256?: unknown;
  gallery_id?: unknown;
  gallery?: unknown;
  keep_games?: unknown;
  game_id?: unknown;
  files?: unknown;
  game?: unknown;
  photos?: unknown;
}
interface FileRequest {
  photo_id?: unknown;
  kind?: unknown;
}

async function body(req: Request): Promise<Body> {
  try {
    const b: unknown = await req.json();
    return b !== null && typeof b === "object" ? (b as Body) : {};
  } catch {
    return {};
  }
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

export async function handle(req: Request, deps: GalleryDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const url = new URL(req.url);
  const route = routeOf(url);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(req) });

  // --- public -----------------------------------------------------------------
  if (req.method === "GET" && route === "/listing") {
    const rows = await deps.store.publicListing();
    return json(
      req,
      200,
      {
        games: rows.map((r) => ({
          ...r,
          cover_url: r.cover_path
            ? deps.files.publicUrl("gallery-covers", r.cover_path)
            : null,
        })),
      },
      { "cache-control": "public, max-age=300" },
    );
  }

  if (req.method === "POST" && route === "/unlock") {
    const b = await body(req);
    const link = text(b.link);
    const g = LINK.test(link) ? await deps.store.galleryForLink(link) : undefined;
    if (g === undefined) {
      // Same work as a real check, so timing does not tell links apart.
      verifyPassword(
        text(b.password),
        "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      );
      return json(req, 404, NOT_FOUND);
    }
    if ((await deps.store.recentFailures(g.id)) >= MAX_FAILURES) {
      return json(req, 429, {
        error: "Too many wrong passwords. Wait 15 minutes and try again.",
      });
    }
    if (!verifyPassword(text(b.password), g.password_hash)) {
      await deps.store.recordFailure(g.id);
      return json(req, 401, {
        error:
          "That password is not right. Ask your coach or photographer for the team password.",
      });
    }
    return json(req, 200, { pass: issuePass(deps.accessSecret, g, now()) });
  }

  if (req.method === "GET" && (route === "/gallery" || route === "/game")) {
    const link = url.searchParams.get("link") ?? "";
    const g = LINK.test(link) ? await deps.store.galleryForLink(link) : undefined;
    if (g === undefined) return json(req, 404, NOT_FOUND);
    const pass =
      url.searchParams.get("pass") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      null;
    if (!passIsValid(deps.accessSecret, g, pass, now())) {
      return json(req, 401, {
        error: "Enter the team password.",
        gallery: publicHeader(g),
      });
    }
    if (route === "/gallery") {
      const games = await deps.store.visitorGames(g.id);
      const thumbs = await deps.files.signedUrls(
        games.map((x) => x.first_thumb).filter((p): p is string => p !== null),
        PHOTO_URL_SECONDS,
      );
      return json(req, 200, {
        gallery: publicHeader(g),
        games: games.map(({ first_thumb, ...x }) => ({
          ...x,
          cover_thumb_url: first_thumb ? (thumbs.get(first_thumb) ?? null) : null,
        })),
      });
    }
    const game = url.searchParams.get("game") ?? "";
    if (!UUID.test(game))
      return json(req, 404, { error: "That game is not in this gallery." });
    const games = await deps.store.visitorGames(g.id);
    const meta = games.find((x) => x.id === game);
    if (meta === undefined)
      return json(req, 404, { error: "That game is not in this gallery." });
    const photos = await deps.store.visitorPhotos(g.id, game);
    const urls = await deps.files.signedUrls(
      photos.flatMap((p) => [p.thumb_path, p.web_path]),
      PHOTO_URL_SECONDS,
    );
    const { first_thumb: _unused, ...gameInfo } = meta;
    return json(req, 200, {
      gallery: publicHeader(g),
      game: gameInfo,
      expires_in: PHOTO_URL_SECONDS,
      photos: photos.map((p) => ({
        id: p.id,
        filename: p.filename,
        captured_at: p.captured_at,
        width: p.width,
        height: p.height,
        thumb_url: urls.get(p.thumb_path) ?? null,
        web_url: urls.get(p.web_path) ?? null,
      })),
    });
  }

  // --- the publisher ------------------------------------------------------------
  if (route.startsWith("/publish/")) {
    if (req.method !== "POST") return json(req, 405, { error: "POST only." });
    if (route === "/publish/register") {
      const sha = text((await body(req)).key_sha256);
      if (!/^[0-9a-f]{64}$/.test(sha)) {
        return json(req, 400, { error: "key_sha256 must be 64 hex characters." });
      }
      const result = await deps.store.registerPublisher(sha);
      if (result === "connected") return json(req, 200, { connected: true });
      if (result === "taken") {
        return json(req, 409, {
          error: "The galleries are connected to another computer's JerseySort.",
          reason: "taken",
        });
      }
      return json(req, 403, {
        error: "The one-time connect window is closed.",
        reason: "closed",
      });
    }
    if (
      !keyMatches(
        req.headers.get("x-gallery-publisher-key") ?? "",
        deps.publisherKeySha256,
      )
    ) {
      return json(req, 401, { error: "Not the publisher." });
    }
    if (route === "/publish/check") return json(req, 200, { connected: true });
    const b = await body(req);
    const galleryId = text(b.gallery_id);
    if (!UUID.test(galleryId))
      return json(req, 400, { error: "gallery_id must be a uuid." });

    if (route === "/publish/gallery") {
      const g = (b.gallery ?? {}) as Record<string, unknown>;
      await deps.store.publishGallery({ ...g, id: galleryId });
      const keep = Array.isArray(b.keep_games)
        ? b.keep_games.map(text).filter((x) => UUID.test(x))
        : [];
      const removed = await deps.store.removeGamesExcept(galleryId, keep);
      await removeFiles(deps.files, removed);
      return json(req, 200, { ok: true, removed: removed.length });
    }
    if (route === "/publish/uploads") {
      const gameId = text(b.game_id);
      if (!UUID.test(gameId))
        return json(req, 400, { error: "game_id must be a uuid." });
      const files = Array.isArray(b.files) ? (b.files as FileRequest[]) : [];
      const out: { photo_id: string; kind: string; url: string }[] = [];
      for (const f of files) {
        const photoId = text(f.photo_id);
        const kind = text(f.kind);
        if (!UUID.test(photoId))
          return json(req, 400, { error: "photo_id must be a uuid." });
        const target =
          kind === "web"
            ? (["gallery-photos", `${galleryId}/${gameId}/${photoId}-web.jpg`] as const)
            : kind === "thumb"
              ? ([
                  "gallery-photos",
                  `${galleryId}/${gameId}/${photoId}-thumb.jpg`,
                ] as const)
              : kind === "cover"
                ? (["gallery-covers", `${gameId}/${photoId}.jpg`] as const)
                : null;
        if (target === null)
          return json(req, 400, { error: "kind must be web, thumb or cover." });
        out.push({
          photo_id: photoId,
          kind,
          url: await deps.files.signedUploadUrl(target[0], target[1]),
        });
      }
      return json(req, 200, { uploads: out });
    }
    if (route === "/publish/game") {
      const game = (b.game ?? {}) as Record<string, unknown>;
      if (!UUID.test(text(game["id"])))
        return json(req, 400, { error: "game.id must be a uuid." });
      const photos = Array.isArray(b.photos)
        ? (b.photos as Record<string, unknown>[])
        : [];
      const removed = await deps.store.publishGame(galleryId, game, photos);
      await removeFiles(deps.files, removed);
      return json(req, 200, { ok: true, removed: removed.length });
    }
    if (route === "/publish/remove") {
      const removed = await deps.store.removeGallery(galleryId);
      await removeFiles(deps.files, removed);
      return json(req, 200, { ok: true, removed: removed.length });
    }
  }
  return json(req, 404, { error: "Not found." });
}

function publicHeader(g: GalleryRow) {
  return { brand: g.brand, group_name: g.group_name, name: g.name, slug: g.slug };
}

/** Paths from the store: "cover:<path>" is a public cover, the rest are photos. */
export async function removeFiles(files: GalleryFiles, paths: string[]): Promise<void> {
  const covers = paths.filter((p) => p.startsWith("cover:")).map((p) => p.slice(6));
  const photos = paths.filter((p) => !p.startsWith("cover:"));
  if (photos.length > 0) await files.remove("gallery-photos", photos);
  if (covers.length > 0) await files.remove("gallery-covers", covers);
}
