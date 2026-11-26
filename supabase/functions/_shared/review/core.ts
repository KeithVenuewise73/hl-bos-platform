// Photo review — the request handling behind the media-review Edge Function
// (migration 0055), written against injected ports so it is tested offline
// (supabase/functions/tests/media_review.test.ts) and wired to Postgres,
// Storage and Supabase Auth in media-review/index.ts.
//
// Two audiences, kept apart:
//
//   * THE PUBLISHER (the photographer's DateSort). It makes a key on his
//     computer and registers only the key's SHA-256 fingerprint, once, during
//     the connect window migration 0055 opens. Every other /review/* call
//     must carry the key (x-review-publisher-key).
//   * THE OWNER, reviewing. Signs in with Supabase Auth (an email link) and
//     sends the access token as "Authorization: Bearer ...". The token is
//     checked with Supabase Auth, the email must be CONFIRMED, and it must be
//     on the owner list the function is configured with. Nobody else, signed
//     in or not, gets anything. With no owner configured the owner routes
//     refuse everyone (503): the safe default.
//
// Photos are only ever handed to the owner as signed links that expire.
// Nothing here makes a photo public: approving only marks it approved.

import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";

export const PHOTO_URL_SECONDS = 60 * 60;
export const MAX_FILES_PER_CALL = 200;
export const MAX_HASHES_PER_BATCH = 20_000;
export const PAGE = 60;
/** How long a "Download large" link works: long enough to start the download. */
export const LARGE_LINK_SECONDS = 5 * 60;

export type Status = "waiting" | "approved" | "rejected";

export interface FolderRow {
  id: string;
  name: string;
  sport: string | null;
  event_date: string;
  team_id: string | null;
  team_name: string | null;
  waiting: number;
  approved: number;
  rejected: number;
  same_day: number;
  /** How many of those are short video clips, by state (the rest are photos). */
  clips_waiting?: number;
  clips_approved?: number;
  clips_rejected?: number;
}

export interface PhotoRow {
  id: string;
  filename: string;
  taken_at: string | null;
  date_estimated: boolean;
  width: number | null;
  height: number | null;
  flags: string[];
  status: Status;
  reason: string | null;
  web_path: string;
  thumb_path: string;
  total: number;
  /** A clip's mp4 and length; null for a photo. (A clip's web/thumb are its poster still.) */
  video_path?: string | null;
  duration_seconds?: number | null;
}

export interface PageRow {
  slug: string;
  title: string;
  blurb: string;
  href: string;
  menu_label: string;
  menu_order: number;
  paths: string[];
  enabled: boolean;
  coming_soon: boolean;
}

export interface OwnerPageRow extends PageRow {
  interest: number;
}

/** A photo to copy to, or remove from, the public bucket. */
export interface PublicRow {
  id: string;
  web_path: string;
  thumb_path: string;
  /** A clip's mp4, copied with its poster; null for a photo. */
  video_path?: string | null;
}

export interface PublicTeamRow {
  slug: string;
  name: string;
  albums: number;
  photos: number;
  cover_thumb: string | null;
}

export interface PublicTeamPage {
  team: { slug: string; name: string };
  /** The owner's switch for the "Download large" button. */
  large_downloads?: boolean;
  albums: {
    id: string;
    name: string;
    sport: string | null;
    event_date: string;
    photos: {
      id: string;
      filename: string;
      taken_at: string | null;
      width: number | null;
      height: number | null;
      /** Whether a large copy exists (never where it is kept). */
      large?: boolean;
      /** A short clip: its poster is web/thumb, its mp4 is video_path. */
      video?: boolean;
      duration?: number | null;
      video_path?: string | null;
      web_path: string;
      thumb_path: string;
    }[];
  }[];
}

export interface TeamRow {
  id: string;
  slug: string;
  name: string;
  visibility: "public" | "private";
  folders: number;
}

export interface SocialAccountRow {
  id: string;
  platform: "instagram" | "facebook_page";
  display_name: string;
  status: "active" | "disabled";
}

/** One account a post is going to, claimed to be worked on (migration 0058). */
export interface ClaimedTarget {
  target_id: string;
  platform: "instagram" | "facebook_page";
  external_account_id: string;
  display_name: string;
  facebook_page_id: string | null;
  /** The NAME of the secret that holds the login token, never the token. */
  token_secret_name: string;
  caption: string;
  attempt_no: number;
}

export interface SocialOutcome {
  status: "published" | "failed";
  externalPostId?: string;
  permalink?: string;
  error?: string;
  attempts: {
    phase: string;
    ok: boolean;
    httpStatus?: number;
    request?: unknown;
    response?: unknown;
    error?: string;
  }[];
}

/** Posts to Instagram or Facebook. Absent until the accounts are connected. */
export interface SocialPublisher {
  publish(
    target: ClaimedTarget,
    photos: { public_url: string; filename: string }[],
  ): Promise<SocialOutcome>;
}

export interface SocialPostStatus {
  id: string;
  status: string;
  caption: string;
  approved_at: string;
  photos: number;
  targets: {
    account: string;
    platform: string;
    status: string;
    permalink: string | null;
    error: string | null;
  }[];
}

/** The review schema's functions (migration 0055). */
export interface ReviewStore {
  /** 'connected' | 'taken' (another computer) | 'closed' (no window open). */
  registerPublisher(sha256: string): Promise<string>;
  createBatch(p: {
    name: string;
    sport: string;
    date: string;
    source: string;
    photos: number;
    videos: number;
    hashes: string[];
  }): Promise<{
    batchId: string;
    known: string[];
    /** Known photos that still have no large copy, and the batch their files live under. */
    needLarge: { hash: string; batch_id: string }[];
  }>;
  commitPhotos(batchId: string, photos: Record<string, unknown>[]): Promise<number>;
  /** Which of these items are short clips (they cannot be posted as photos yet). */
  videoIds(ids: string[]): Promise<string[]>;
  /** Which of these fingerprints the review area already holds (their files are stored). */
  knownHashes(hashes: string[]): Promise<string[]>;
  /** Per date: photos and clips held, and how many are waiting, approved and rejected. */
  statusDays(): Promise<
    {
      date: string;
      photos: number;
      clips: number;
      waiting: number;
      approved: number;
      rejected: number;
    }[]
  >;
  folders(): Promise<FolderRow[]>;
  folderPhotos(
    folder: string,
    status: string,
    limit: number,
    offset: number,
    /** Only clips ("video"), only photos ("photo"), or both ("all", the default). */
    kind?: "all" | "video" | "photo",
  ): Promise<PhotoRow[]>;
  decide(ids: string[], status: Status, reason: string, by: string): Promise<number>;
  approveWaiting(folder: string, by: string): Promise<number>;
  renameFolder(folder: string, name: string): Promise<void>;
  /** Deletes a folder that holds no photo; refuses (22023) one that still does. */
  deleteFolder(folder: string): Promise<void>;
  /**
   * Permanently deletes photos that are NOT approved (waiting or rejected) and not
   * on the public page. An approved photo is never deleted. Returns how many were
   * deleted and the private files that belonged to them (for the caller to remove).
   */
  deletePhotos(ids: string[]): Promise<{ deleted: number; paths: string[] }>;
  /** Renames a team. Its page address does not change, so existing links keep working. */
  renameTeam(team: string, name: string): Promise<void>;
  movePhotos(ids: string[], folder: string): Promise<number>;
  newFolderFromPhotos(
    ids: string[],
    name: string,
    sport: string,
    date: string | null,
  ): Promise<string>;
  setFolderTeam(folder: string, team: string | null): Promise<void>;
  teams(): Promise<TeamRow[]>;
  createTeam(name: string): Promise<string>;
  setTeamVisibility(team: string, visibility: string): Promise<void>;
  /** Migration 0056: the website's page switches. */
  publicPages(): Promise<PageRow[]>;
  ownerPages(): Promise<OwnerPageRow[]>;
  setPage(
    slug: string,
    enabled: boolean | null,
    comingSoon: boolean | null,
  ): Promise<void>;
  /** True when counted; false when this visitor had already asked for it today. */
  recordInterest(slug: string, voter: string): Promise<boolean>;
  /** Migration 0057: approved photos on a public team's page. */
  publicWanted(): Promise<PublicRow[]>;
  publicUnwanted(): Promise<PublicRow[]>;
  markPublic(ids: string[]): Promise<number>;
  clearPublic(ids: string[]): Promise<number>;
  publicTeams(): Promise<PublicTeamRow[]>;
  publicTeam(slug: string): Promise<PublicTeamPage | null>;
  /** Migration 0059: a large copy of each photo, offered as a download. */
  attachLarge(hash: string, bytes: number): Promise<boolean>;
  largeSettings(): Promise<{
    enabled: boolean;
    large_photos: number;
    public_photos: number;
  }>;
  setLargeDownloads(enabled: boolean): Promise<void>;
  /** null: no such photo. path null: it does not qualify (switch off, not public, no copy). */
  publicLarge(photo: string): Promise<{ path: string | null; enabled: boolean } | null>;
  /** Migration 0058: posting approved photos to Instagram and Facebook. */
  socialAccounts(): Promise<SocialAccountRow[]>;
  socialAlreadyPosted(
    photos: string[],
  ): Promise<
    { photo_id: string; platform: string; account: string; posted_at: string }[]
  >;
  socialCreatePost(
    photos: string[],
    caption: string,
    accounts: string[],
    by: string,
  ): Promise<string>;
  socialFailStale(post: string): Promise<number>;
  socialClaim(post: string): Promise<ClaimedTarget | null>;
  socialPhotoPaths(post: string): Promise<{ web_path: string; filename: string }[]>;
  socialRecordAttempt(
    target: string,
    phase: string,
    ok: boolean,
    http: number | null,
    request: unknown,
    response: unknown,
    error: string | null,
  ): Promise<void>;
  socialFinish(
    target: string,
    published: boolean,
    external: string | null,
    permalink: string | null,
    error: string | null,
  ): Promise<string>;
  socialPostStatus(post: string): Promise<SocialPostStatus | null>;
  socialRecent(limit: number): Promise<
    {
      id: string;
      status: string;
      caption: string;
      approved_at: string;
      folder_name: string | null;
      photos: number;
      targets: SocialPostStatus["targets"];
    }[]
  >;
}

export interface ReviewFiles {
  signedUrls(paths: string[], seconds: number): Promise<Map<string, string>>;
  signedUploadUrl(path: string): Promise<string>;
  /** Copy a photo from the private bucket to the public one, same path. */
  copyToPublic(path: string): Promise<void>;
  removePublic(paths: string[]): Promise<void>;
  /** Remove files from the PRIVATE bucket (for photos that were deleted). */
  removePrivate(paths: string[]): Promise<void>;
  /** A short-lived link that downloads a private file under the given name. */
  signedDownload(path: string, filename: string, seconds: number): Promise<string>;
  /** The public address of a copied photo. */
  publicUrl(path: string): string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface ReviewDeps {
  store: ReviewStore;
  files: ReviewFiles;
  /** SHA-256 (hex) of the registered publisher's key; null until DateSort connects. */
  publisherKeySha256: string | null;
  /** Who may review. Lower-case emails. Empty: nobody (the owner routes answer 503). */
  ownerEmails: string[];
  /** Check an access token with Supabase Auth; null when it is not a valid, confirmed sign-in. */
  verifyUser(token: string): Promise<AuthUser | null>;
  /**
   * A secret only this function holds, mixed into the one-way fingerprint that
   * keeps one visitor from being counted twice a day. Empty: counting is off (503).
   */
  voterSalt?: string;
  /** Posts to Instagram / Facebook; absent until the accounts are connected (routes answer 503). */
  social?: SocialPublisher;
  now?: () => number;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Does this key's fingerprint match the registered publisher's? */
export function keyMatches(key: string, registeredSha256: string | null): boolean {
  if (!key || !registeredSha256 || !/^[0-9a-f]{64}$/.test(registeredSha256))
    return false;
  return timingSafeEqual(Buffer.from(sha256(key)), Buffer.from(registeredSha256));
}

/**
 * What Supabase Auth's /auth/v1/user answers, reduced to a signed-in person:
 * it needs an id and an email, and the email must be confirmed (a person who
 * only typed an address, without opening the link, is nobody).
 */
export function userFromAuth(j: unknown): AuthUser | null {
  if (j === null || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const id = typeof o["id"] === "string" ? o["id"] : "";
  const email = typeof o["email"] === "string" ? o["email"].trim().toLowerCase() : "";
  const confirmed = o["email_confirmed_at"] ?? o["confirmed_at"];
  if (
    !UUID.test(id) ||
    !email.includes("@") ||
    typeof confirmed !== "string" ||
    confirmed === ""
  )
    return null;
  return { id, email };
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
          "content-type, authorization, x-review-publisher-key",
        vary: "origin",
      }
    : { vary: "origin" };
}

function json(req: Request, status: number, body: unknown, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": cache,
      ...cors(req),
    },
  });
}

/**
 * A one-way fingerprint of this visitor for one day: not their address, and not
 * reversible. It only lets one person be counted once per page per day.
 */
export function voterFingerprint(salt: string, ip: string, nowMs: number): string {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return sha256(`${salt}|${day}|${ip}`);
}

/** The visitor's address as the platform saw it: the proxy's own header, else the LAST forwarded hop. */
export function clientAddress(req: Request): string {
  const direct = req.headers.get("cf-connecting-ip");
  if (direct) return direct.trim();
  const fwd = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return fwd.length > 0 ? fwd[fwd.length - 1]! : "unknown";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The route after the function's own name: /functions/v1/media-review/<route>. */
export function routeOf(url: URL): string {
  const i = url.pathname.indexOf("/media-review");
  const rest = i >= 0 ? url.pathname.slice(i + "/media-review".length) : url.pathname;
  return rest.replace(/\/+$/, "") || "/";
}

type Body = Record<string, unknown>;

async function body(req: Request): Promise<Body> {
  try {
    const b: unknown = await req.json();
    return b !== null && typeof b === "object" && !Array.isArray(b) ? (b as Body) : {};
  } catch {
    return {};
  }
}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const ids = (v: unknown): string[] | null => {
  if (!Array.isArray(v) || v.length === 0 || v.length > 1000) return null;
  const out = v.map(text);
  return out.every((x) => UUID.test(x)) ? [...new Set(out)] : null;
};
const num = (v: unknown, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : dflt;

/** The service's own plain-English refusals (from the database's raise exception). */
function userMessage(e: unknown): string | null {
  const o = e as { code?: string; message?: string } | null;
  if (
    o &&
    typeof o === "object" &&
    (o.code === "22023" || o.code === "23505") &&
    o.message
  )
    return o.message;
  return null;
}

export async function handle(req: Request, deps: ReviewDeps): Promise<Response> {
  const url = new URL(req.url);
  const route = routeOf(url);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(req) });
  // --- the public site (visitors; no sign-in): which pages are on, and "I'd like this" ----
  if (req.method === "GET" && route === "/site/pages") {
    const pages = await deps.store.publicPages();
    // Names and addresses only. Never a count of how many people asked for a page.
    return json(req, 200, { pages }, "public, max-age=60");
  }
  if (req.method === "GET" && route === "/site/teams") {
    const teams = await deps.store.publicTeams();
    return json(
      req,
      200,
      {
        teams: teams.map((t) => ({
          slug: t.slug,
          name: t.name,
          albums: Number(t.albums),
          photos: Number(t.photos),
          cover_url: t.cover_thumb ? deps.files.publicUrl(t.cover_thumb) : null,
        })),
      },
      "public, max-age=60",
    );
  }
  if (req.method === "GET" && route === "/site/team") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120)
      return json(req, 404, { error: "That team page was not found." });
    const page = await deps.store.publicTeam(slug);
    if (page === null)
      return json(req, 404, { error: "That team page was not found." });
    return json(
      req,
      200,
      {
        team: page.team,
        large_downloads: page.large_downloads === true,
        albums: page.albums.map((a) => ({
          ...a,
          photos: a.photos.map((p) => ({
            id: p.id,
            filename: p.filename,
            taken_at: p.taken_at,
            width: p.width,
            height: p.height,
            large: p.large === true,
            video: p.video === true,
            duration: p.video === true ? (p.duration ?? null) : null,
            video_url:
              p.video === true && p.video_path
                ? deps.files.publicUrl(p.video_path)
                : null,
            thumb_url: deps.files.publicUrl(p.thumb_path),
            web_url: deps.files.publicUrl(p.web_path),
          })),
        })),
      },
      "public, max-age=60",
    );
  }
  if (req.method === "GET" && route === "/site/large") {
    // "Download large": a short-lived link to the private large copy, only while the owner's
    // switch is on and the photo is on a public page. Nothing is public by address.
    const photo = url.searchParams.get("photo") ?? "";
    if (!UUID.test(photo))
      return json(req, 404, { error: "A large copy is not available." });
    const found = await deps.store.publicLarge(photo);
    if (found === null || (found.enabled && found.path === null))
      return json(req, 404, { error: "A large copy is not available." });
    if (!found.enabled || found.path === null)
      return json(req, 403, { error: "Large downloads are switched off right now." });
    let name = (url.searchParams.get("name") ?? "photo.jpg")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 150);
    if (!/\.jpe?g$/i.test(name)) name = `${name || "photo"}.jpg`;
    const link = await deps.files.signedDownload(found.path, name, LARGE_LINK_SECONDS);
    return new Response(null, {
      status: 302,
      headers: { location: link, "cache-control": "no-store", ...cors(req) },
    });
  }
  if (req.method !== "POST") return json(req, 405, { error: "POST only." });

  try {
    if (route === "/site/interest") return await interest(req, deps);
    // --- the publisher (DateSort) ----------------------------------------------
    if (route.startsWith("/review/")) return await publisher(req, route, deps);
    // --- the owner ---------------------------------------------------------------
    if (route.startsWith("/owner/")) return await owner(req, route, deps);
    return json(req, 404, { error: "Not found." });
  } catch (e) {
    const m = userMessage(e);
    if (m !== null) return json(req, 400, { error: m });
    throw e;
  }
}

export interface SyncResult {
  published: number;
  unpublished: number;
  failed: number;
  /** Photos still waiting to be copied in or taken down: ask again until 0. */
  remaining: number;
}

/** One sync handles at most this many photos, so a big approval never outruns the time limit. */
export const SYNC_PHOTOS = 100;
const SYNC_PARALLEL = 6;

/** Run `fn` over `items`, at most `limit` at a time. */
async function inParallel<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Keep the public bucket in step with the decisions: copy newly qualifying photos
 * (approved, in a folder filed under a public team), take down photos that no
 * longer qualify. It does at most SYNC_PHOTOS photos a call (six copies at a
 * time) and reports how many are `remaining`, so a very large approval finishes
 * over a few calls instead of timing out. A photo is marked public only after BOTH
 * its files were copied, and a failure leaves it unmarked so the next sync retries
 * it. Never throws.
 */
export async function syncPublic(deps: ReviewDeps): Promise<SyncResult> {
  const out: SyncResult = { published: 0, unpublished: 0, failed: 0, remaining: 0 };
  try {
    const wanted = await deps.store.publicWanted();
    const done: string[] = [];
    await inParallel(wanted.slice(0, SYNC_PHOTOS), SYNC_PARALLEL, async (p) => {
      try {
        await deps.files.copyToPublic(p.web_path);
        await deps.files.copyToPublic(p.thumb_path);
        // A clip is public only once its mp4 is copied too.
        if (p.video_path) await deps.files.copyToPublic(p.video_path);
        done.push(p.id);
      } catch {
        out.failed += 1;
      }
    });
    if (done.length > 0) out.published = await deps.store.markPublic(done);
    out.remaining += wanted.length - done.length;

    const unwanted = await deps.store.publicUnwanted();
    const down = unwanted.slice(0, SYNC_PHOTOS);
    let cleared = 0;
    if (down.length > 0) {
      try {
        await deps.files.removePublic(
          down.flatMap((p) =>
            p.video_path
              ? [p.web_path, p.thumb_path, p.video_path]
              : [p.web_path, p.thumb_path],
          ),
        );
        cleared = await deps.store.clearPublic(down.map((p) => p.id));
        out.unpublished = cleared;
      } catch {
        out.failed += down.length;
      }
    }
    out.remaining += unwanted.length - cleared;
  } catch {
    out.failed += 1;
  }
  return out;
}

async function interest(req: Request, deps: ReviewDeps): Promise<Response> {
  if (!deps.voterSalt)
    return json(req, 503, { error: "Asking for a page is not switched on yet." });
  const slug = text((await body(req))["slug"]);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60)
    return json(req, 400, { error: "That page is not listed as coming soon." });
  const voter = voterFingerprint(
    deps.voterSalt,
    clientAddress(req),
    (deps.now ?? Date.now)(),
  );
  // true: counted. false: this visitor already asked for it today. Either way the visitor is thanked.
  return json(req, 200, {
    ok: true,
    counted: await deps.store.recordInterest(slug, voter),
  });
}

async function publisher(
  req: Request,
  route: string,
  deps: ReviewDeps,
): Promise<Response> {
  if (route === "/review/register") {
    const sha = text((await body(req))["key_sha256"]);
    if (!HASH.test(sha))
      return json(req, 400, { error: "key_sha256 must be 64 hex characters." });
    const result = await deps.store.registerPublisher(sha);
    if (result === "connected") return json(req, 200, { status: "connected" });
    if (result === "taken")
      return json(req, 409, {
        status: "taken",
        error: "The review area is connected to another computer's DateSort.",
      });
    return json(req, 403, {
      status: "closed",
      error: "The one-time connect window is closed.",
    });
  }
  if (
    !keyMatches(
      req.headers.get("x-review-publisher-key") ?? "",
      deps.publisherKeySha256,
    )
  )
    return json(req, 401, { error: "Not the publisher." });

  const b = await body(req);
  if (route === "/review/batch") {
    const label = (b["label"] ?? {}) as Record<string, unknown>;
    const counts = (b["counts"] ?? {}) as Record<string, unknown>;
    const hashes = Array.isArray(b["hashes"]) ? b["hashes"].map(text) : [];
    const date = text(label["date"]);
    if (!DAY.test(date))
      return json(req, 400, { error: "label.date must be YYYY-MM-DD." });
    if (hashes.length > MAX_HASHES_PER_BATCH || !hashes.every((h) => HASH.test(h)))
      return json(req, 400, { error: "hashes must be SHA-256 fingerprints." });
    const out = await deps.store.createBatch({
      name: text(label["name"]),
      sport: text(label["sport"]),
      date,
      source: text(b["folder"]),
      photos: num(counts["photos"], 0),
      videos: num(counts["videos"], 0),
      hashes,
    });
    return json(req, 200, {
      batch_id: out.batchId,
      known: out.known,
      need_large: out.needLarge,
    });
  }
  if (route === "/review/large") {
    // After the large copies are uploaded: record them (each only if its file is really there).
    const items = Array.isArray(b["items"])
      ? (b["items"] as Record<string, unknown>[])
      : [];
    if (items.length === 0 || items.length > MAX_FILES_PER_CALL)
      return json(req, 400, {
        error: `Send 1 to ${MAX_FILES_PER_CALL} photos at a time.`,
      });
    if (!items.every((p) => HASH.test(text(p["hash"])) && num(p["bytes"], 0) > 0))
      return json(req, 400, {
        error: "every item needs its fingerprint as hash and its size as bytes.",
      });
    let attached = 0;
    for (const p of items)
      if (await deps.store.attachLarge(text(p["hash"]), num(p["bytes"], 0)))
        attached += 1;
    return json(req, 200, { attached });
  }
  if (route === "/review/known") {
    // Read only: which photos does 5Star already hold? DateSort asks before it offers to
    // free up a card; it never changes anything here.
    const hashes = Array.isArray(b["hashes"]) ? b["hashes"].map(text) : [];
    if (
      hashes.length === 0 ||
      hashes.length > MAX_HASHES_PER_BATCH ||
      !hashes.every((h) => HASH.test(h))
    )
      return json(req, 400, { error: "hashes must be SHA-256 fingerprints." });
    return json(req, 200, { known: await deps.store.knownHashes(hashes) });
  }
  if (route === "/review/status") {
    // Which dates already have photos and clips in review (any state), so DateSort can say so on
    // each date. Photos and clips are counted apart: a clip is never a photo.
    return json(req, 200, { days: await deps.store.statusDays() });
  }
  const batch = text(b["batch_id"]);
  if (!UUID.test(batch)) return json(req, 400, { error: "batch_id must be a uuid." });

  if (route === "/review/uploads") {
    const files = Array.isArray(b["files"])
      ? (b["files"] as Record<string, unknown>[])
      : [];
    if (files.length === 0 || files.length > MAX_FILES_PER_CALL)
      return json(req, 400, {
        error: `Ask for 1 to ${MAX_FILES_PER_CALL} files at a time.`,
      });
    const uploads: { hash: string; kind: string; url: string }[] = [];
    for (const f of files) {
      const hash = text(f["hash"]);
      const kind = text(f["kind"]);
      if (!HASH.test(hash))
        return json(req, 400, { error: "hash must be a SHA-256 fingerprint." });
      if (kind !== "web" && kind !== "thumb" && kind !== "large" && kind !== "video")
        return json(req, 400, {
          error: 'kind must be "web", "thumb", "large" or "video".',
        });
      // A large copy for a photo sent earlier goes under the batch that photo was first
      // stored in (its files are pinned there). Nothing else can name another place.
      let into = batch;
      if (kind === "large" && f["batch_id"] !== undefined) {
        const other = text(f["batch_id"]);
        if (!UUID.test(other))
          return json(req, 400, { error: "batch_id must be a uuid." });
        into = other;
      }
      uploads.push({
        hash,
        kind,
        url: await deps.files.signedUploadUrl(
          `${into}/${hash}-${kind}.${kind === "video" ? "mp4" : "jpg"}`,
        ),
      });
    }
    return json(req, 200, { uploads });
  }
  if (route === "/review/commit") {
    const photos = Array.isArray(b["photos"])
      ? (b["photos"] as Record<string, unknown>[])
      : [];
    if (photos.length === 0 || photos.length > MAX_FILES_PER_CALL)
      return json(req, 400, {
        error: `Send 1 to ${MAX_FILES_PER_CALL} photos at a time.`,
      });
    if (!photos.every((p) => HASH.test(text(p["hash"]))))
      return json(req, 400, {
        error: "every photo needs its SHA-256 fingerprint as hash.",
      });
    const added = await deps.store.commitPhotos(batch, photos);
    return json(req, 200, { added });
  }
  return json(req, 404, { error: "Not found." });
}

const FINAL_POST = ["published", "partly_published", "failed", "cancelled"];

/** Posting approved photos to Instagram and Facebook (owner only; the caller has already checked). */
async function social(
  req: Request,
  route: string,
  b: Body,
  by: string,
  deps: ReviewDeps,
): Promise<Response> {
  if (route === "/owner/social/accounts")
    return json(req, 200, {
      enabled: deps.social !== undefined,
      accounts: await deps.store.socialAccounts(),
    });
  if (route === "/owner/social/recent")
    return json(req, 200, { posts: await deps.store.socialRecent(30) });
  if (route === "/owner/social/posted") {
    const list = ids(b["ids"]);
    if (list === null)
      return json(req, 400, { error: "ids must be a list of photo ids." });
    return json(req, 200, { posted: await deps.store.socialAlreadyPosted(list) });
  }
  if (route === "/owner/social/status") {
    const post = text(b["post"]);
    if (!UUID.test(post)) return json(req, 400, { error: "post must be an id." });
    const s = await deps.store.socialPostStatus(post);
    if (s === null) return json(req, 404, { error: "That post was not found." });
    return json(req, 200, { post: s, done: FINAL_POST.includes(s.status) });
  }
  if (route === "/owner/social/post") {
    // Pressing Post IS the approval: it is recorded with who and when, and nothing else posts.
    if (deps.social === undefined)
      return json(req, 503, {
        error: "Posting to Instagram and Facebook is not switched on yet.",
      });
    const photos = ids(b["photos"]);
    const accounts = ids(b["accounts"]);
    if (photos === null || photos.length > 10)
      return json(req, 400, { error: "Choose 1 to 10 photos." });
    if (accounts === null) return json(req, 400, { error: "Choose where to post." });
    if ((await deps.store.videoIds(photos)).length > 0)
      return json(req, 400, {
        error:
          "Short clips can't be posted to Instagram and Facebook yet. Choose photos.",
      });
    const post = await deps.store.socialCreatePost(
      photos,
      text(b["caption"]),
      accounts,
      by,
    );
    return json(req, 200, { post });
  }
  if (route === "/owner/social/publish") {
    // One account per call, so a slow Instagram upload never outruns a request. The page
    // calls again until `done`.
    if (deps.social === undefined)
      return json(req, 503, {
        error: "Posting to Instagram and Facebook is not switched on yet.",
      });
    const post = text(b["post"]);
    if (!UUID.test(post)) return json(req, 400, { error: "post must be an id." });
    await deps.store.socialFailStale(post);
    const claimed = await deps.store.socialClaim(post);
    if (claimed !== null) {
      const photos = (await deps.store.socialPhotoPaths(post)).map((p) => ({
        public_url: deps.files.publicUrl(p.web_path),
        filename: p.filename,
      }));
      let outcome: SocialOutcome;
      try {
        outcome = await deps.social.publish(claimed, photos);
      } catch (e) {
        outcome = {
          status: "failed",
          error: `It could not be posted: ${e instanceof Error ? e.message : String(e)}`,
          attempts: [],
        };
      }
      for (const a of outcome.attempts)
        await deps.store.socialRecordAttempt(
          claimed.target_id,
          a.phase,
          a.ok,
          a.httpStatus ?? null,
          a.request ?? null,
          a.response ?? null,
          a.error ?? null,
        );
      // "Published" is only ever what the platform answered, with its own id.
      const published = outcome.status === "published" && !!outcome.externalPostId;
      await deps.store.socialFinish(
        claimed.target_id,
        published,
        published ? (outcome.externalPostId ?? null) : null,
        published ? (outcome.permalink ?? null) : null,
        published ? null : (outcome.error ?? "It did not post."),
      );
    }
    const s = await deps.store.socialPostStatus(post);
    if (s === null) return json(req, 404, { error: "That post was not found." });
    return json(req, 200, { post: s, done: FINAL_POST.includes(s.status) });
  }
  return json(req, 404, { error: "Not found." });
}

async function owner(req: Request, route: string, deps: ReviewDeps): Promise<Response> {
  if (deps.ownerEmails.length === 0)
    return json(req, 503, { error: "No owner is set up for the review area yet." });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(req, 401, { error: "Sign in first." });
  const user = await deps.verifyUser(token);
  if (user === null) return json(req, 401, { error: "Sign in first." });
  if (!deps.ownerEmails.includes(user.email))
    return json(req, 403, { error: "Only the owner can review photos." });

  const b = await body(req);
  const by = user.id;

  if (route === "/owner/me") return json(req, 200, { email: user.email });
  if (route === "/owner/folders")
    return json(req, 200, { folders: await deps.store.folders() });
  if (route === "/owner/teams")
    return json(req, 200, { teams: await deps.store.teams() });
  if (route === "/owner/pages")
    return json(req, 200, { pages: await deps.store.ownerPages() });
  if (route === "/owner/large") return json(req, 200, await deps.store.largeSettings());
  if (route === "/owner/large-downloads") {
    if (typeof b["enabled"] !== "boolean")
      return json(req, 400, { error: "enabled must be true or false." });
    await deps.store.setLargeDownloads(b["enabled"]);
    return json(req, 200, await deps.store.largeSettings());
  }
  if (route === "/owner/page-set") {
    const slug = text(b["slug"]);
    const flag = (v: unknown) => (typeof v === "boolean" ? v : null);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60)
      return json(req, 400, { error: "slug must be a page name." });
    const enabled = flag(b["enabled"]);
    const comingSoon = flag(b["coming_soon"]);
    if (enabled === null && comingSoon === null)
      return json(req, 400, { error: "Say what to change: enabled or coming_soon." });
    await deps.store.setPage(slug, enabled, comingSoon);
    return json(req, 200, { ok: true });
  }

  if (route === "/owner/photos") {
    const folder = text(b["folder"]);
    const status = text(b["status"]) || "waiting";
    if (!UUID.test(folder)) return json(req, 400, { error: "folder must be a uuid." });
    if (!["waiting", "approved", "rejected", "all"].includes(status))
      return json(req, 400, { error: "status is waiting, approved, rejected or all." });
    const kindRaw = text(b["kind"]) || "all";
    if (!["all", "video", "photo"].includes(kindRaw))
      return json(req, 400, { error: "kind is all, video or photo." });
    const kind = kindRaw as "all" | "video" | "photo";
    const limit = Math.min(Math.max(num(b["limit"], PAGE), 1), 200);
    const offset = Math.max(num(b["offset"], 0), 0);
    const rows = await deps.store.folderPhotos(folder, status, limit, offset, kind);
    const urls = await deps.files.signedUrls(
      rows.flatMap((p) =>
        p.video_path
          ? [p.thumb_path, p.web_path, p.video_path]
          : [p.thumb_path, p.web_path],
      ),
      PHOTO_URL_SECONDS,
    );
    return json(req, 200, {
      total: rows[0]?.total ?? 0,
      expires_in: PHOTO_URL_SECONDS,
      photos: rows.map((p) => ({
        id: p.id,
        filename: p.filename,
        taken_at: p.taken_at,
        date_estimated: p.date_estimated,
        width: p.width,
        height: p.height,
        flags: p.flags,
        status: p.status,
        reason: p.reason,
        thumb_url: urls.get(p.thumb_path) ?? null,
        web_url: urls.get(p.web_path) ?? null,
        video: !!p.video_path,
        duration: p.video_path ? (p.duration_seconds ?? null) : null,
        video_url: p.video_path ? (urls.get(p.video_path) ?? null) : null,
      })),
    });
  }
  if (route === "/owner/decide") {
    const list = ids(b["ids"]);
    const status = text(b["status"]);
    if (list === null)
      return json(req, 400, { error: "ids must be a list of photo ids." });
    if (status !== "waiting" && status !== "approved" && status !== "rejected")
      return json(req, 400, { error: "status is waiting, approved or rejected." });
    return json(req, 200, {
      changed: await deps.store.decide(list, status, text(b["reason"]), by),
      public: await syncPublic(deps),
    });
  }
  if (route === "/owner/approve-waiting") {
    const folder = text(b["folder"]);
    if (!UUID.test(folder)) return json(req, 400, { error: "folder must be a uuid." });
    return json(req, 200, {
      changed: await deps.store.approveWaiting(folder, by),
      public: await syncPublic(deps),
    });
  }
  if (route === "/owner/rename") {
    const folder = text(b["folder"]);
    if (!UUID.test(folder)) return json(req, 400, { error: "folder must be a uuid." });
    await deps.store.renameFolder(folder, text(b["name"]));
    return json(req, 200, { ok: true });
  }
  if (route.startsWith("/owner/social/")) return await social(req, route, b, by, deps);
  if (route === "/owner/delete-photos") {
    const list = ids(b["ids"]);
    if (list === null)
      return json(req, 400, { error: "ids must be a list of photo ids." });
    // A rejected photo that is still on the public page comes down first, so it can be deleted.
    const pub = await syncPublic(deps);
    const gone = await deps.store.deletePhotos(list);
    // The rows are gone first; a file that cannot be removed now is only leftover storage.
    let leftover = 0;
    for (let i = 0; i < gone.paths.length; i += 100) {
      const chunk = gone.paths.slice(i, i + 100);
      try {
        await deps.files.removePrivate(chunk);
      } catch {
        leftover += chunk.length;
      }
    }
    return json(req, 200, {
      deleted: gone.deleted,
      kept: list.length - gone.deleted,
      leftover_files: leftover,
      public: pub,
    });
  }
  if (route === "/owner/rename-team") {
    const team = text(b["team"]);
    if (!UUID.test(team)) return json(req, 400, { error: "team must be an id." });
    await deps.store.renameTeam(team, text(b["name"]));
    return json(req, 200, { ok: true });
  }
  if (route === "/owner/delete-folder") {
    const folder = text(b["folder"]);
    if (!UUID.test(folder)) return json(req, 400, { error: "folder must be a uuid." });
    await deps.store.deleteFolder(folder);
    return json(req, 200, { ok: true });
  }
  if (route === "/owner/move") {
    const list = ids(b["ids"]);
    const folder = text(b["folder"]);
    if (list === null || !UUID.test(folder))
      return json(req, 400, { error: "ids and folder are needed." });
    return json(req, 200, {
      moved: await deps.store.movePhotos(list, folder),
      public: await syncPublic(deps),
    });
  }
  if (route === "/owner/new-folder") {
    const list = ids(b["ids"]);
    const date = text(b["date"]);
    if (list === null) return json(req, 400, { error: "Tick the photos first." });
    if (date !== "" && !DAY.test(date))
      return json(req, 400, { error: "date must be YYYY-MM-DD." });
    const folder = await deps.store.newFolderFromPhotos(
      list,
      text(b["name"]),
      text(b["sport"]),
      date || null,
    );
    return json(req, 200, { folder, public: await syncPublic(deps) });
  }
  if (route === "/owner/set-team") {
    const folder = text(b["folder"]);
    const team = text(b["team"]);
    if (!UUID.test(folder) || (team !== "" && !UUID.test(team)))
      return json(req, 400, { error: "folder and team must be ids." });
    await deps.store.setFolderTeam(folder, team === "" ? null : team);
    return json(req, 200, { ok: true, public: await syncPublic(deps) });
  }
  if (route === "/owner/create-team") {
    return json(req, 200, { team: await deps.store.createTeam(text(b["name"])) });
  }
  if (route === "/owner/team-visibility") {
    const team = text(b["team"]);
    if (!UUID.test(team)) return json(req, 400, { error: "team must be an id." });
    await deps.store.setTeamVisibility(team, text(b["visibility"]));
    return json(req, 200, { ok: true, public: await syncPublic(deps) });
  }
  if (route === "/owner/sync")
    return json(req, 200, { public: await syncPublic(deps) });
  return json(req, 404, { error: "Not found." });
}
