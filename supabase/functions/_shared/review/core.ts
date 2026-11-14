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

export interface TeamRow {
  id: string;
  slug: string;
  name: string;
  visibility: "public" | "private";
  folders: number;
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
  }): Promise<{ batchId: string; known: string[] }>;
  commitPhotos(batchId: string, photos: Record<string, unknown>[]): Promise<number>;
  folders(): Promise<FolderRow[]>;
  folderPhotos(
    folder: string,
    status: string,
    limit: number,
    offset: number,
  ): Promise<PhotoRow[]>;
  decide(ids: string[], status: Status, reason: string, by: string): Promise<number>;
  approveWaiting(folder: string, by: string): Promise<number>;
  renameFolder(folder: string, name: string): Promise<void>;
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
}

export interface ReviewFiles {
  signedUrls(paths: string[], seconds: number): Promise<Map<string, string>>;
  signedUploadUrl(path: string): Promise<string>;
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
    return json(req, 200, { batch_id: out.batchId, known: out.known });
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
      if (kind !== "web" && kind !== "thumb")
        return json(req, 400, { error: 'kind must be "web" or "thumb".' });
      // Only ever this batch's own paths: nothing a caller sends can name another place.
      uploads.push({
        hash,
        kind,
        url: await deps.files.signedUploadUrl(`${batch}/${hash}-${kind}.jpg`),
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
    const limit = Math.min(Math.max(num(b["limit"], PAGE), 1), 200);
    const offset = Math.max(num(b["offset"], 0), 0);
    const rows = await deps.store.folderPhotos(folder, status, limit, offset);
    const urls = await deps.files.signedUrls(
      rows.flatMap((p) => [p.thumb_path, p.web_path]),
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
    });
  }
  if (route === "/owner/approve-waiting") {
    const folder = text(b["folder"]);
    if (!UUID.test(folder)) return json(req, 400, { error: "folder must be a uuid." });
    return json(req, 200, { changed: await deps.store.approveWaiting(folder, by) });
  }
  if (route === "/owner/rename") {
    const folder = text(b["folder"]);
    if (!UUID.test(folder)) return json(req, 400, { error: "folder must be a uuid." });
    await deps.store.renameFolder(folder, text(b["name"]));
    return json(req, 200, { ok: true });
  }
  if (route === "/owner/move") {
    const list = ids(b["ids"]);
    const folder = text(b["folder"]);
    if (list === null || !UUID.test(folder))
      return json(req, 400, { error: "ids and folder are needed." });
    return json(req, 200, { moved: await deps.store.movePhotos(list, folder) });
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
    return json(req, 200, { folder });
  }
  if (route === "/owner/set-team") {
    const folder = text(b["folder"]);
    const team = text(b["team"]);
    if (!UUID.test(folder) || (team !== "" && !UUID.test(team)))
      return json(req, 400, { error: "folder and team must be ids." });
    await deps.store.setFolderTeam(folder, team === "" ? null : team);
    return json(req, 200, { ok: true });
  }
  if (route === "/owner/create-team") {
    return json(req, 200, { team: await deps.store.createTeam(text(b["name"])) });
  }
  if (route === "/owner/team-visibility") {
    const team = text(b["team"]);
    if (!UUID.test(team)) return json(req, 400, { error: "team must be an id." });
    await deps.store.setTeamVisibility(team, text(b["visibility"]));
    return json(req, 200, { ok: true });
  }
  return json(req, 404, { error: "Not found." });
}
