/**
 * Sending for review, against a stand-in for the website's review service that
 * enforces the same rules the real one must: it needs the publisher key,
 * remembers fingerprints so nothing is stored twice, and stores only what is
 * committed.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  connectReview,
  fingerprint,
  ReviewError,
  sendForReview,
  type Fetch,
  type SendProgress,
  withRetry,
} from "./client";

const KEY = "test-key-test-key-test-key-test-key-test-key-1234";
const BASE = "https://service.test";

/** What the stand-in reads from a request body. */
interface Data {
  key_sha256?: string;
  hashes?: string[];
  batch_id?: string;
  files?: { hash: string; kind: string }[];
  photos?: (Stored & { hash: string })[];
  [other: string]: unknown;
}

interface Stored {
  filename: string;
  taken_at: string | null;
  flags: string[];
  web_bytes: number;
}

function service(
  opts: { key?: string; off?: boolean; dropAfterUploads?: number } = {},
) {
  const key = opts.key ?? KEY;
  let registered: string | null = null;
  let windowOpen = true;
  const known = new Map<string, Stored>(); // committed photos by hash
  const storage = new Map<string, Buffer>(); // uploaded files by url
  const uploaded = new Set<string>();
  const batches: Record<string, unknown>[] = [];
  let puts = 0;
  const handle = (input: string, init?: RequestInit): Response => {
    const url = new URL(input);
    const body = init?.body ? (typeof init.body === "string" ? init.body : null) : null;
    const json = (o: unknown, status = 200) => Response.json(o, { status });
    if (url.origin !== BASE) {
      // storage
      if (init?.method !== "PUT") return new Response("no", { status: 405 });
      puts += 1;
      if (opts.dropAfterUploads !== undefined && puts > opts.dropAfterUploads)
        throw new TypeError("network down");
      storage.set(input, Buffer.from(init.body as Uint8Array));
      return new Response(null, { status: 200 });
    }
    if (opts.off) return json({ error: "off" }, 503);
    const data = body ? (JSON.parse(body) as Data) : {};
    if (url.pathname === "/review/register") {
      if (!windowOpen) return json({ status: "closed" });
      if (registered !== null && registered !== data.key_sha256)
        return json({ status: "taken" });
      registered = data.key_sha256 ?? null;
      return json({ status: "connected" });
    }
    const sent = new Headers(init?.headers).get("x-review-publisher-key");
    if (
      sent === null ||
      fingerprint(sent) !== fingerprint(key) ||
      (registered !== null && registered !== fingerprint(sent))
    )
      return json({ error: "no" }, 401);
    if (url.pathname === "/review/batch") {
      batches.push(data);
      return json({
        batch_id: `b${batches.length}`,
        known: (data.hashes ?? []).filter((h) => known.has(h)),
      });
    }
    if (url.pathname === "/review/uploads") {
      return json({
        uploads: (data.files ?? []).map((f) => ({
          ...f,
          url: `https://storage.test/${data.batch_id}/${f.hash}-${f.kind}.jpg`,
        })),
      });
    }
    if (url.pathname === "/review/commit") {
      for (const p of data.photos ?? []) {
        // Only photos whose files were really uploaded can be committed.
        const web = `https://storage.test/${data.batch_id}/${p.hash}-web.jpg`;
        const thumb = `https://storage.test/${data.batch_id}/${p.hash}-thumb.jpg`;
        if (!storage.has(web) || !storage.has(thumb))
          return json({ error: "files missing" }, 409);
        known.set(p.hash, p);
        uploaded.add(p.hash);
      }
      return json({ added: (data.photos ?? []).length });
    }
    return json({ error: "unknown" }, 404);
  };
  const fetch: Fetch = (input, init) => {
    try {
      return Promise.resolve(handle(input, init));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  };
  return {
    fetch,
    known,
    storage,
    batches,
    get puts() {
      return puts;
    },
    closeWindow: () => (windowOpen = false),
  };
}

const noise = (w = 700, h = 450) =>
  sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: "gaussian", mean: 128, sigma: 55 },
    },
  });

async function photo(date: string): Promise<Buffer> {
  return noise()
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "Canon", Copyright: "private-camera-detail" },
      IFD2: { DateTimeOriginal: date },
    })
    .toBuffer();
}

async function dayFolder(n = 3): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "review-day-"));
  for (let i = 0; i < n; i++)
    writeFileSync(join(dir, `IMG_${i}.jpg`), await photo(`2026:10:24 18:0${i}:00`));
  return dir;
}

const GAME = { name: "Varsity vs Wheatfield", sport: "Hockey", date: "2026-10-24" };
const run = (
  dir: string,
  svc: { fetch: Fetch },
  extra: Partial<Parameters<typeof sendForReview>[0]> = {},
) =>
  sendForReview({
    folder: dir,
    game: GAME,
    serviceUrl: BASE,
    key: KEY,
    fetch: svc.fetch,
    retryDelaysMs: [1, 1],
    ...extra,
  });

const snapshot = (dir: string) =>
  Object.fromEntries(
    readdirSync(dir).map((f) => [
      f,
      createHash("sha256")
        .update(readFileSync(join(dir, f)))
        .digest("hex"),
    ]),
  );

describe("sending a day's photos for review", () => {
  it("sends every photo with its game, time and quality hints, and changes nothing in the folder", async () => {
    const dir = await dayFolder(3);
    const before = snapshot(dir);
    const svc = service();
    const phases: string[] = [];
    const r = await run(dir, svc, {
      onProgress: (p: SendProgress) => phases.push(p.phase),
    });
    expect(r).toMatchObject({ sent: 3, alreadyThere: 0, failed: [], videosNotSent: 0 });
    expect(svc.known.size).toBe(3);
    expect(svc.batches[0]).toMatchObject({
      label: GAME,
      counts: { photos: 3, videos: 0 },
    });
    const first = [...svc.known.values()].find((p) => p.filename === "IMG_0.jpg")!;
    expect(first.taken_at).toBe("2026-10-24T18:00:00");
    expect(Array.isArray(first.flags)).toBe(true);
    expect(phases).toContain("sending");
    expect(phases.at(-1)).toBe("done");
    expect(snapshot(dir)).toEqual(before);
  });

  it("sends nothing that carries the camera's details", async () => {
    const dir = await dayFolder(2);
    const svc = service();
    await run(dir, svc);
    expect(svc.storage.size).toBe(4); // a web copy and a thumbnail each
    for (const bytes of svc.storage.values()) {
      expect(bytes.includes(Buffer.from("private-camera-detail"))).toBe(false);
      expect(bytes.includes(Buffer.from("Canon"))).toBe(false);
    }
  });

  it("sending again uploads nothing; a new photo later is the only one sent", async () => {
    const dir = await dayFolder(3);
    const svc = service();
    await run(dir, svc);
    const putsAfterFirst = svc.puts;
    const again = await run(dir, svc);
    expect(again).toMatchObject({ sent: 0, alreadyThere: 3 });
    expect(svc.puts).toBe(putsAfterFirst);
    writeFileSync(join(dir, "IMG_9.jpg"), await photo("2026:10:24 19:00:00"));
    const third = await run(dir, svc);
    expect(third).toMatchObject({ sent: 1, alreadyThere: 3 });
    expect(svc.puts).toBe(putsAfterFirst + 2);
  });

  it("an unreadable file is reported by name and the rest are still sent", async () => {
    const dir = await dayFolder(2);
    writeFileSync(
      join(dir, "broken.jpg"),
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]),
    );
    const svc = service();
    const r = await run(dir, svc);
    expect(r.sent).toBe(2);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.path).toBe("broken.jpg");
    expect(r.failed[0]!.reason).toMatch(/could not be read as a picture/);
  });

  it("counts videos as not sent, and explains raw files it cannot send", async () => {
    const dir = await dayFolder(1);
    writeFileSync(
      join(dir, "clip.mov"),
      Buffer.concat([
        Buffer.from([0, 0, 0, 20]),
        Buffer.from("ftypqt  "),
        Buffer.alloc(32),
      ]),
    );
    const r = await run(dir, service());
    expect(r.videosNotSent).toBe(1);
    expect(r.sent).toBe(1);
  });

  it("refuses an empty folder in words", async () => {
    const dir = mkdtempSync(join(tmpdir(), "review-empty-"));
    await expect(run(dir, service())).rejects.toThrow(/no photos in that folder/);
  });
});

describe("when the website cannot take them", () => {
  it("says this computer is not connected when the key is not accepted", async () => {
    const dir = await dayFolder(1);
    const err = await run(
      dir,
      service({ key: "some-other-key-some-other-key-some-other-key-123" }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReviewError);
    expect((err as Error).message).toMatch(/not connected/);
  });

  it("says plainly that the review area is not switched on", async () => {
    const dir = await dayFolder(1);
    await expect(run(dir, service({ off: true }))).rejects.toThrow(
      /not switched on yet/,
    );
  });

  it("when the connection drops part way, says how many went and finishes on the next try without resending them", async () => {
    const dir = await dayFolder(25); // three chunks
    const svc = service({ dropAfterUploads: 22 }); // drops during the second chunk
    const err = (await run(dir, svc).catch((e: unknown) => e)) as ReviewError;
    expect(err).toBeInstanceOf(ReviewError);
    expect(err.sent).toBe(10);
    expect(err.message).toMatch(/after sending 10/);
    expect(svc.known.size).toBe(10);
    // A healthy service with the same memory: finish.
    const healthy = service();
    for (const [h, p] of svc.known) healthy.known.set(h, p);
    const r = await run(dir, healthy);
    expect(r).toMatchObject({ sent: 15, alreadyThere: 10 });
    expect(healthy.known.size).toBe(25);
  }, 60_000);

  it("stops when asked, before sending anything else", async () => {
    const dir = await dayFolder(3);
    const ctl = new AbortController();
    ctl.abort();
    await expect(run(dir, service(), { signal: ctl.signal })).rejects.toThrow(
      /Stopped/,
    );
  });
});

describe("retrying a passing problem", () => {
  const ok = () => new Response("{}", { status: 200 });
  const fail = (status: number) => new Response("{}", { status });

  it("tries again after a 504 and carries on when the next try works", async () => {
    let calls = 0;
    const f = withRetry(
      () => Promise.resolve(++calls < 3 ? fail(504) : ok()),
      [1, 1, 1],
    );
    expect((await f("https://x.test/a")).status).toBe(200);
    expect(calls).toBe(3);
  });

  it("tries again after a dropped connection, then gives up after the last retry", async () => {
    let calls = 0;
    const f = withRetry(() => {
      calls++;
      return Promise.reject(new Error("socket hang up"));
    }, [1, 1]);
    await expect(f("https://x.test/a")).rejects.toThrow(/socket hang up/);
    expect(calls).toBe(3);
  });

  it("does not repeat a refusal that trying again cannot change", async () => {
    for (const status of [401, 409, 503, 400]) {
      let calls = 0;
      const f = withRetry(() => Promise.resolve((calls++, fail(status))), [1, 1]);
      expect((await f("https://x.test/a")).status).toBe(status);
      expect(calls).toBe(1);
    }
  });

  it("gives up on a request that never answers and tries again", async () => {
    let calls = 0;
    const f = withRetry(
      (_url, init) => {
        calls++;
        if (calls > 1) return Promise.resolve(ok());
        return new Promise<Response>((_res, rej) =>
          init?.signal?.addEventListener("abort", () => rej(new Error("timed out"))),
        );
      },
      [1],
      30,
    );
    expect((await f("https://x.test/a")).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("a whole send survives one 504 in the middle and still sends every photo", async () => {
    const dir = await dayFolder(12);
    const svc = service();
    let hiccup = true;
    const flaky: Fetch = (input, init) => {
      if (hiccup && input.endsWith("/review/uploads")) {
        hiccup = false;
        return Promise.resolve(fail(504));
      }
      return svc.fetch(input, init);
    };
    const r = await run(dir, { fetch: flaky });
    expect(r).toMatchObject({ sent: 12 });
    expect(svc.known.size).toBe(12);
  }, 60_000);

  it("stops retrying when the send is stopped", async () => {
    const ctl = new AbortController();
    let calls = 0;
    const f = withRetry(
      () => {
        calls++;
        ctl.abort();
        return Promise.reject(new Error("down"));
      },
      [1, 1, 1],
      60_000,
      ctl.signal,
    );
    await expect(f("https://x.test/a")).rejects.toThrow(/down/);
    expect(calls).toBe(1);
  });
});

describe("connecting this computer", () => {
  it("connects once, refuses a second computer, and says when the window is closed", async () => {
    const svc = service();
    expect(await connectReview(BASE, KEY, svc.fetch)).toBe("connected");
    expect(await connectReview(BASE, KEY, svc.fetch)).toBe("connected");
    expect(
      await connectReview(
        BASE,
        "another-computer-another-computer-another-12345",
        svc.fetch,
      ),
    ).toBe("taken");
    const closed = service();
    closed.closeWindow();
    expect(await connectReview(BASE, KEY, closed.fetch)).toBe("closed");
  });
});
