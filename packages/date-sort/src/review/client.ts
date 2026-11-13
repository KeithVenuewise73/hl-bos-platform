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
 *   PUT  <url>             the bytes                        (kind is "web" or "thumb")
 *   POST /review/commit    {batch_id, photos:[...]}         -> {added}
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
  type PreparedPhoto,
  type ReviewCandidate,
} from "./prepare";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface GameLabel {
  /** The game's name as on the folder, e.g. "Varsity vs Wheatfield". */
  readonly name: string;
  readonly sport: string;
  /** "YYYY-MM-DD" */
  readonly date: string;
}

export interface SendProgress {
  readonly phase: "reading" | "checking" | "sending" | "done";
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
  /** Photos that could not be read or sent, each with the reason. */
  readonly failed: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  /** Files that are not photos or cannot be sent (raw, too big…), with the reason. */
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
  /** Videos in the folder: not sent yet. */
  readonly videosNotSent: number;
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
): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "PUT",
      headers: { "content-type": "image/jpeg", "x-upsert": "true" },
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
}

/** Send every photo in the folder for review. Never changes the folder. */
export async function sendForReview(o: SendOptions): Promise<SendResult> {
  const progress = (p: SendProgress) => o.onProgress?.(p);
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
  const photos = listing.photos;
  if (photos.length === 0)
    throw new ReviewError("There are no photos in that folder to send for review.");

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

  const batch = await call(
    o.fetch,
    o.serviceUrl,
    o.key,
    "/review/batch",
    {
      label: o.game,
      folder: o.folder.split(/[\\/]/).filter(Boolean).pop() ?? "",
      counts: { photos: photos.length, videos: listing.videos },
      hashes: [...hashes.keys()],
    },
    0,
  );
  const batchId = typeof batch["batch_id"] === "string" ? batch["batch_id"] : "";
  if (batchId === "")
    throw new ReviewError("The website did not start a review batch.");
  const known = new Set((batch["known"] as string[] | undefined) ?? []);
  const todo = [...hashes.entries()].filter(([h]) => !known.has(h));

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
      o.fetch,
      o.serviceUrl,
      o.key,
      "/review/uploads",
      {
        batch_id: batchId,
        files: ready.flatMap((p) => [
          { hash: p.hash, kind: "web" },
          { hash: p.hash, kind: "thumb" },
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
      if (!web || !thumb)
        throw new ReviewError("The website gave no upload address.", sent);
      await put(o.fetch, web, p.web, sent);
      await put(o.fetch, thumb, p.thumb, sent);
    }
    await call(
      o.fetch,
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
    sent += ready.length;
  }
  progress({ phase: "done", done: sent, total: todo.length, current: null });
  return {
    batchId,
    sent,
    alreadyThere: hashes.size - todo.length,
    failed,
    skipped: listing.skipped,
    videosNotSent: listing.videos,
  };
}
