/**
 * Sending a date's photos to the website's REVIEW area.
 *
 * Nothing sent here is public. The photos land in a private review area on
 * 5starsportsmedia.com and wait for the owner to approve them there. This file
 * is also the written-down contract the website's review service must meet:
 *
 *   POST /review/register  {key_sha256}                     connect this computer (one-time window)
 *   POST /review/batch     {label, folder, counts, hashes}  -> {batch_id, known:[hash]}
 *   POST /review/uploads   {batch_id, files:[{hash,kind}]}  -> {uploads:[{hash,kind,url}]}
 *                          (kind: web, thumb, large, or video for a short clip's .mp4)
 *   PUT  <url>             the bytes                        (kind is "web", "thumb" or "large";
 *                                                            "large" may name the photo's own batch_id)
 *   POST /review/commit    {batch_id, photos:[...]}         -> {added}
 *   POST /review/large     {items:[{hash,bytes}]}           -> {attached}   (after the large file is up)
 *
 * /review/batch also answers need_large:[{hash,batch_id}], the photos already
 * there that still lack a large copy; they are topped up from the originals.
 *
 *   POST /review/known    {hashes:[...]}                    -> {known:[hash]}   (read only)
 *   POST /review/status   {}                                -> {days:[{date,photos,waiting,approved,rejected}]}
 *
 * Every call except /register carries the publisher key in x-review-publisher-key.
 * A photo whose fingerprint is already known to the service (in review, or
 * already published) is skipped, so sending twice is safe and cheap, and an
 * interrupted send simply carries on next time.
 */

import { createHash } from "node:crypto";

import {
  hashOf,
  listForReview,
  prepare,
  prepareLarge,
  type PreparedPhoto,
  type ReviewCandidate,
} from "./prepare";
import { findTools, prepareClip, type PreparedClip, type Tools } from "./video";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface GameLabel {
  /** The game's name as on the folder, e.g. "Varsity vs Wheatfield". */
  readonly name: string;
  readonly sport: string;
  /** "YYYY-MM-DD" */
  readonly date: string;
}

export interface SendProgress {
  readonly phase: "reading" | "checking" | "sending" | "large" | "clips" | "done";
  readonly done: number;
  readonly total: number;
  readonly current: string | null;
}

export interface SendResult {
  readonly batchId: string;
  /** Photos newly sent for review. */
  readonly sent: number;
  /** Photos the website already had, so not sent again. */
  readonly alreadyThere: number;
  /** Photos that already were there and just got their large (3,600 px) copy. */
  readonly largeAdded: number;
  /** Photos that could not be read or sent, each with the reason. */
  readonly failed: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  /** Files that are not photos or cannot be sent (raw, too big…), with the reason. */
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  /** Short clips newly sent for review. */
  readonly clipsSent: number;
  /** Clips the website already had. */
  readonly clipsAlreadyThere: number;
  /** Clips left unsent because ffmpeg (the free video tool) is not on this computer. */
  readonly videosNotSent: number;
  /** Words about a clip that was sent but may not look right (for example HDR colours). */
  readonly clipNotes: readonly string[];
}

/** A problem to tell the person in plain words. */
export class ReviewError extends Error {
  constructor(
    message: string,
    /** What had been sent before it stopped. */
    readonly sent = 0,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export const fingerprint = (key: string): string =>
  createHash("sha256").update(key).digest("hex");

const CHUNK = 10;

/** Waits (ms) before each retry of a failed request: three retries. */
const RETRY_DELAYS_MS = [2_000, 6_000, 15_000] as const;
/**
 * Statuses that mean a passing problem somewhere between here and the website's storage: the server
 * (500, 502, 504), a request that timed out or was rate-limited (408, 429), and the proxy in front
 * of the storage answering "unknown error" or "unreachable" (520 to 524). 503 is not here: the
 * service answers it when the review area is not switched on, which trying again cannot change.
 */
const RETRY_STATUSES: readonly number[] = [
  500, 502, 504, 408, 429, 520, 521, 522, 523, 524,
];
/** One request that has not answered in this long is given up on and tried again. */
const ATTEMPT_TIMEOUT_MS = 60_000;

/**
 * A fetch that tries again when the website or its storage has a passing
 * problem: no answer, a dropped connection, or a 500, 502, 504, 408, 429 or 520 to 524. Everything
 * DateSort sends is safe to repeat (uploads overwrite, commits skip what is
 * already there). A refusal that will not change by trying again (401, 409,
 * 503, anything 4xx) is returned at once. Stopping the send stops the retries.
 */
export function withRetry(
  fetchImpl: Fetch,
  delaysMs: readonly number[] = RETRY_DELAYS_MS,
  attemptTimeoutMs: number = ATTEMPT_TIMEOUT_MS,
  signal?: AbortSignal,
): Fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= delaysMs.length;
      const guard = AbortSignal.timeout(attemptTimeoutMs);
      const attemptInit: RequestInit = {
        ...init,
        signal: signal ? AbortSignal.any([signal, guard]) : guard,
      };
      try {
        const res = await fetchImpl(input, attemptInit);
        if (last || !RETRY_STATUSES.includes(res.status)) return res;
      } catch (e) {
        if (last || signal?.aborted === true) throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  };
}

async function call(
  fetchImpl: Fetch,
  base: string,
  key: string | null,
  route: string,
  body: unknown,
  sent: number,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(`${base}${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key === null ? {} : { "x-review-publisher-key": key }),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ReviewError(
      `Lost the connection to the website${sent > 0 ? ` after sending ${sent}` : ""}. Send again: what is already there is skipped.`,
      sent,
    );
  }
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401)
    throw new ReviewError(
      "This computer is not connected to the website's review area yet. Connect it first.",
      sent,
    );
  if (res.status === 503)
    throw new ReviewError("The website's review area is not switched on yet.", sent);
  if (!res.ok)
    throw new ReviewError(
      `The website refused this (${res.status}${typeof out["error"] === "string" ? `: ${out["error"]}` : ""}).`,
      sent,
    );
  return out;
}

/** Connect this computer, once, while the website's connect window is open. */
export async function connectReview(
  base: string,
  key: string,
  fetchImpl: Fetch,
): Promise<"connected" | "taken" | "closed"> {
  const res = await fetchImpl(`${base}/review/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key_sha256: fingerprint(key) }),
  }).catch(() => null);
  if (res === null)
    throw new ReviewError(
      "Could not reach the website. Check the internet and try again.",
    );
  const out = (await res.json().catch(() => ({}))) as { status?: string };
  if (out.status === "connected" || out.status === "taken" || out.status === "closed")
    return out.status;
  throw new ReviewError(`The website did not accept the connection (${res.status}).`);
}

async function put(
  fetchImpl: Fetch,
  url: string,
  bytes: Buffer,
  sent: number,
  contentType = "image/jpeg",
): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "PUT",
      headers: { "content-type": contentType, "x-upsert": "true" },
      body: new Uint8Array(bytes),
    });
  } catch {
    throw new ReviewError(
      `Lost the connection while uploading${sent > 0 ? ` after sending ${sent}` : ""}. Send again to finish.`,
      sent,
    );
  }
  if (!res.ok)
    throw new ReviewError(
      `An upload was refused (${res.status}). Send again to retry it.`,
      sent,
    );
}

export interface SendOptions {
  readonly folder: string;
  readonly game: GameLabel;
  readonly serviceUrl: string;
  readonly key: string;
  readonly fetch: Fetch;
  readonly onProgress?: (p: SendProgress) => void;
  readonly signal?: AbortSignal;
  /** Send only the photos, or only the clips, of the folder (the other kind waits for another send). */
  readonly only?: "photos" | "clips";
  /** Waits before each retry of a failed request (tests use short ones). */
  readonly retryDelaysMs?: readonly number[];
  /** Tests only: where ffmpeg is, and how a clip is made ready. */
  readonly findTools?: () => Promise<Tools | null>;
  readonly makeClip?: (
    root: string,
    c: ReviewCandidate,
    tools: Tools,
    signal?: AbortSignal,
  ) => Promise<PreparedClip>;
}

/** Send every photo in the folder for review. Never changes the folder. */
export async function sendForReview(o: SendOptions): Promise<SendResult> {
  const progress = (p: SendProgress) => o.onProgress?.(p);
  const net = withRetry(o.fetch, o.retryDelaysMs, ATTEMPT_TIMEOUT_MS, o.signal);
  const stopped = () => {
    if (o.signal?.aborted === true) throw new ReviewError("Stopped.");
  };

  progress({ phase: "reading", done: 0, total: 0, current: null });
  let listing;
  try {
    listing = await listForReview(o.folder, o.signal ? { signal: o.signal } : {});
  } catch (e) {
    if (o.signal?.aborted === true) throw new ReviewError("Stopped.");
    throw e;
  }
  const photos = o.only === "clips" ? [] : listing.photos;
  const clips = o.only === "photos" ? [] : listing.clips;
  if (photos.length === 0 && clips.length === 0)
    throw new ReviewError(
      o.only === undefined
        ? "There are no photos or clips in that folder to send for review."
        : `There are no ${o.only} in that folder to send for review.`,
    );

  // Fingerprint every original, to ask what the website already has.
  const hashes = new Map<string, ReviewCandidate>();
  const failed: { path: string; reason: string }[] = [];
  let n = 0;
  for (const c of photos) {
    stopped();
    progress({ phase: "checking", done: n, total: photos.length, current: c.path });
    try {
      hashes.set(await hashOf(o.folder, c.path), c);
    } catch (e) {
      failed.push({
        path: c.path,
        reason: `Could not be read: ${e instanceof Error ? e.message : "unknown error"}`,
      });
    }
    n += 1;
  }

  // Clips are fingerprinted the same way (the SHA-256 of the original), so 5Star can say which it has.
  const clipHashes = new Map<string, ReviewCandidate>();
  for (const c of clips) {
    stopped();
    progress({
      phase: "checking",
      done: n,
      total: photos.length + clips.length,
      current: c.path,
    });
    try {
      clipHashes.set(await hashOf(o.folder, c.path), c);
    } catch (e) {
      failed.push({
        path: c.path,
        reason: `Could not be read: ${e instanceof Error ? e.message : "unknown error"}`,
      });
    }
    n += 1;
  }

  const batch = await call(
    net,
    o.serviceUrl,
    o.key,
    "/review/batch",
    {
      label: o.game,
      folder: o.folder.split(/[\\/]/).filter(Boolean).pop() ?? "",
      counts: {
        photos: photos.length,
        videos: o.only === "photos" ? 0 : listing.videos,
      },
      hashes: [...hashes.keys(), ...clipHashes.keys()],
    },
    0,
  );
  const batchId = typeof batch["batch_id"] === "string" ? batch["batch_id"] : "";
  if (batchId === "")
    throw new ReviewError("The website did not start a review batch.");
  const known = new Set((batch["known"] as string[] | undefined) ?? []);
  const todo = [...hashes.entries()].filter(([h]) => !known.has(h));
  const needLarge = new Map(
    ((batch["need_large"] ?? []) as { hash: string; batch_id: string }[]).map((n) => [
      n.hash,
      n.batch_id,
    ]),
  );
  const topUp = [...hashes.entries()].filter(([h]) => known.has(h) && needLarge.has(h));

  let sent = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    const ready: PreparedPhoto[] = [];
    for (const [, c] of chunk) {
      stopped();
      progress({ phase: "sending", done: sent, total: todo.length, current: c.path });
      try {
        ready.push(await prepare(o.folder, c));
      } catch (e) {
        failed.push({
          path: c.path,
          reason: e instanceof Error ? e.message : "Could not be read.",
        });
      }
    }
    if (ready.length === 0) continue;
    const out = await call(
      net,
      o.serviceUrl,
      o.key,
      "/review/uploads",
      {
        batch_id: batchId,
        files: ready.flatMap((p) => [
          { hash: p.hash, kind: "web" },
          { hash: p.hash, kind: "thumb" },
          { hash: p.hash, kind: "large" },
        ]),
      },
      sent,
    );
    const urls = new Map(
      ((out["uploads"] ?? []) as { hash: string; kind: string; url: string }[]).map(
        (u) => [`${u.hash}:${u.kind}`, u.url],
      ),
    );
    for (const p of ready) {
      const web = urls.get(`${p.hash}:web`);
      const thumb = urls.get(`${p.hash}:thumb`);
      const large = urls.get(`${p.hash}:large`);
      if (!web || !thumb || !large)
        throw new ReviewError("The website gave no upload address.", sent);
      await put(net, web, p.web, sent);
      await put(net, thumb, p.thumb, sent);
      await put(net, large, p.large, sent);
    }
    await call(
      net,
      o.serviceUrl,
      o.key,
      "/review/commit",
      {
        batch_id: batchId,
        photos: ready.map((p) => ({
          hash: p.hash,
          filename: p.filename,
          taken_at: p.takenAt,
          date_estimated: p.dateEstimated,
          width: p.width,
          height: p.height,
          sharpness: p.sharpness,
          brightness: p.brightness,
          flags: p.flags,
          web_bytes: p.web.length,
        })),
      },
      sent,
    );
    await call(
      net,
      o.serviceUrl,
      o.key,
      "/review/large",
      { items: ready.map((p) => ({ hash: p.hash, bytes: p.large.length })) },
      sent,
    );
    sent += ready.length;
  }

  // Photos sent before large copies existed: make the large copy from the original.
  let largeAdded = 0;
  for (let i = 0; i < topUp.length; i += CHUNK) {
    const chunk = topUp.slice(i, i + CHUNK);
    const ready: { hash: string; large: Buffer; batchId: string }[] = [];
    for (const [h, c] of chunk) {
      stopped();
      progress({
        phase: "large",
        done: largeAdded,
        total: topUp.length,
        current: c.path,
      });
      try {
        const made = await prepareLarge(o.folder, c);
        ready.push({ ...made, hash: h, batchId: needLarge.get(h)! });
      } catch (e) {
        failed.push({
          path: c.path,
          reason: e instanceof Error ? e.message : "Could not be read.",
        });
      }
    }
    if (ready.length === 0) continue;
    const out = await call(
      net,
      o.serviceUrl,
      o.key,
      "/review/uploads",
      {
        batch_id: batchId,
        files: ready.map((p) => ({ hash: p.hash, kind: "large", batch_id: p.batchId })),
      },
      sent,
    );
    const urls = new Map(
      ((out["uploads"] ?? []) as { hash: string; kind: string; url: string }[]).map(
        (u) => [`${u.hash}:${u.kind}`, u.url],
      ),
    );
    for (const p of ready) {
      const url = urls.get(`${p.hash}:large`);
      if (!url) throw new ReviewError("The website gave no upload address.", sent);
      await put(net, url, p.large, sent);
    }
    await call(
      net,
      o.serviceUrl,
      o.key,
      "/review/large",
      { items: ready.map((p) => ({ hash: p.hash, bytes: p.large.length })) },
      sent,
    );
    largeAdded += ready.length;
  }
  // Short clips: converted to a small web video with a poster frame, then sent like a photo.
  const clipTodo = [...clipHashes.entries()].filter(([h]) => !known.has(h));
  let clipsSent = 0;
  let needTool = 0;
  const clipNotes: string[] = [];
  if (clipTodo.length > 0) {
    const tools = await (o.findTools ?? findTools)();
    if (tools === null) {
      needTool = clipTodo.length;
    } else {
      for (const [, c] of clipTodo) {
        stopped();
        progress({
          phase: "clips",
          done: clipsSent,
          total: clipTodo.length,
          current: c.path,
        });
        let clip: PreparedClip;
        try {
          clip = await (o.makeClip ?? prepareClip)(o.folder, c, tools, o.signal);
        } catch (e) {
          if (o.signal?.aborted === true) throw new ReviewError("Stopped.");
          failed.push({
            path: c.path,
            reason: e instanceof Error ? e.message : "Could not be converted.",
          });
          continue;
        }
        const out = await call(
          net,
          o.serviceUrl,
          o.key,
          "/review/uploads",
          {
            batch_id: batchId,
            files: [
              { hash: clip.hash, kind: "web" },
              { hash: clip.hash, kind: "thumb" },
              { hash: clip.hash, kind: "video" },
            ],
          },
          sent + clipsSent,
        );
        const urls = new Map(
          ((out["uploads"] ?? []) as { hash: string; kind: string; url: string }[]).map(
            (u) => [`${u.hash}:${u.kind}`, u.url],
          ),
        );
        const web = urls.get(`${clip.hash}:web`);
        const thumb = urls.get(`${clip.hash}:thumb`);
        const video = urls.get(`${clip.hash}:video`);
        if (!web || !thumb || !video)
          throw new ReviewError(
            "The website gave no upload address.",
            sent + clipsSent,
          );
        await put(net, web, clip.web, sent + clipsSent);
        await put(net, thumb, clip.thumb, sent + clipsSent);
        await put(net, video, clip.video, sent + clipsSent, "video/mp4");
        await call(
          net,
          o.serviceUrl,
          o.key,
          "/review/commit",
          {
            batch_id: batchId,
            photos: [
              {
                hash: clip.hash,
                kind: "video",
                filename: clip.filename,
                taken_at: clip.takenAt,
                date_estimated: clip.dateEstimated,
                width: clip.width,
                height: clip.height,
                flags: [],
                web_bytes: clip.web.length,
                video_bytes: clip.video.length,
                duration: clip.durationSeconds,
              },
            ],
          },
          sent + clipsSent,
        );
        clipsSent += 1;
        clipNotes.push(...clip.notes);
      }
    }
  }
  progress({
    phase: "done",
    done: sent + clipsSent,
    total: todo.length + clipTodo.length,
    current: null,
  });
  return {
    batchId,
    sent,
    alreadyThere: hashes.size - todo.length,
    largeAdded,
    failed,
    skipped: listing.skipped,
    clipsSent,
    clipsAlreadyThere: clipHashes.size - clipTodo.length,
    videosNotSent: needTool,
    clipNotes,
  };
}

/** How many photos the website holds for one date (all states). */
export interface ReviewDay {
  readonly date: string;
  readonly photos: number;
  /** Short clips held for this date (a clip is never counted as a photo). */
  readonly clips: number;
  readonly waiting: number;
  readonly approved: number;
  readonly rejected: number;
}

/** Which dates already have photos on the website, so each date card can say so. */
export async function reviewStatus(
  base: string,
  key: string,
  fetchImpl: Fetch,
): Promise<ReviewDay[]> {
  const net = withRetry(fetchImpl);
  const out = await call(net, base, key, "/review/status", {}, 0);
  const days = Array.isArray(out["days"])
    ? (out["days"] as Record<string, unknown>[])
    : [];
  return days
    .filter((d) => typeof d["date"] === "string")
    .map((d) => ({
      date: String(d["date"]),
      photos: Number(d["photos"] ?? 0),
      clips: Number(d["clips"] ?? 0),
      waiting: Number(d["waiting"] ?? 0),
      approved: Number(d["approved"] ?? 0),
      rejected: Number(d["rejected"] ?? 0),
    }));
}

/**
 * Which of these original-file fingerprints does 5Star already hold? Read only.
 * Throws when 5Star cannot be asked: the caller must then treat every photo as NOT on 5Star.
 */
export async function reviewKnown(
  base: string,
  key: string,
  hashes: readonly string[],
  fetchImpl: Fetch,
): Promise<Set<string>> {
  const net = withRetry(fetchImpl);
  const known = new Set<string>();
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += 5000) {
    const out = await call(
      net,
      base,
      key,
      "/review/known",
      { hashes: unique.slice(i, i + 5000) },
      0,
    );
    for (const h of Array.isArray(out["known"]) ? (out["known"] as unknown[]) : [])
      if (typeof h === "string") known.add(h);
  }
  return known;
}

/** One game the website already holds for a date. */
export interface SiteGame {
  readonly name: string;
  readonly sport: string;
  readonly team: string | null;
  readonly photos: number;
  readonly clips: number;
  /** When the game's first and last item were taken, "HH:MM" (24 hours); null when it holds none. */
  readonly firstAt: string | null;
  readonly lastAt: string | null;
}

/**
 * Which games does the website already hold on this date? Read only. Throws when the website
 * cannot be asked: the caller must not guess, because sending under a slightly different name
 * would start a second game for the same day.
 */
export async function reviewGames(
  base: string,
  key: string,
  date: string,
  fetchImpl: Fetch,
): Promise<SiteGame[]> {
  const net = withRetry(fetchImpl);
  const out = await call(net, base, key, "/review/games", { date }, 0);
  const games = Array.isArray(out["games"])
    ? (out["games"] as Record<string, unknown>[])
    : [];
  return games
    .filter((g) => typeof g["name"] === "string")
    .map((g) => ({
      name: String(g["name"]),
      sport: typeof g["sport"] === "string" ? g["sport"] : "",
      team: typeof g["team"] === "string" ? g["team"] : null,
      photos: Number(g["photos"] ?? 0),
      clips: Number(g["clips"] ?? 0),
      firstAt: typeof g["first_at"] === "string" ? g["first_at"] : null,
      lastAt: typeof g["last_at"] === "string" ? g["last_at"] : null,
    }));
}
