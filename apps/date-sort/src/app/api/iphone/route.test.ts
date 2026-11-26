/**
 * Photos and videos come from one phone over one cable, into separate
 * folders. They must not refuse each other: the second press waits for the
 * first, says so, and then runs by itself. The same button twice is refused.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Call {
  folder: string;
  kind: string;
  days: number | null;
  size: string;
  preview: boolean;
  dates?: string[];
  list?: boolean;
  alsoIn?: string;
}
const calls: Call[] = [];
const order: string[] = [];
/** Each fake copy finishes when its gate is opened. */
const gates = new Map<string, () => void>();

vi.mock("@/lib/iphone.ts", () => ({
  copyFromIphone: (
    folder: string,
    kind: string,
    days: number | null,
    options: {
      size: string;
      preview: boolean;
      dates?: string[];
      list?: boolean;
      alsoIn?: string;
    },
    onLine: (l: { type: string }) => void,
  ) => {
    calls.push({ folder, kind, days, ...options });
    order.push(`start ${kind}`);
    onLine({ type: "done" });
    return new Promise<void>((resolve) => {
      gates.set(kind, () => {
        order.push(`end ${kind}`);
        resolve();
      });
    });
  },
}));
vi.mock("@/lib/free-space.ts", () => ({
  freeBytes: () => Promise.resolve(null),
}));
vi.mock("@/lib/keep-awake.ts", () => ({
  keepAwake: () => Promise.resolve({ held: true, release: () => undefined }),
}));

const { POST } = await import("./route");

const local = { host: "127.0.0.1:4604", "Content-Type": "application/json" };
const press = (body: unknown, signal?: AbortSignal) =>
  POST(
    new Request("http://127.0.0.1:4604/api/iphone", {
      method: "POST",
      headers: local,
      body: JSON.stringify({ allDates: true, ...(body as object) }),
      ...(signal ? { signal } : {}),
    }),
  );

async function lines(res: Response): Promise<{ type: string }[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as { type: string });
}
const tick = () => new Promise((r) => setTimeout(r, 20));
/** Let a copy finish once it has actually started (it starts a moment after the press). */
async function open(kind: string): Promise<void> {
  for (let i = 0; i < 200 && !gates.has(kind); i += 1) {
    await new Promise((r) => setTimeout(r, 2));
  }
  gates.get(kind)?.();
  gates.delete(kind);
}

describe("bringing in the iPhone's photos and videos", () => {
  it("refuses a press that does not say photos or videos", async () => {
    const res = await press({ folder: "D:\\Seagate\\iPhone Photos" });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("passes the kind and how far back to the copy, and ignores nonsense days", async () => {
    const a = await press({ folder: "D:\\P", kind: "photos", days: 30 });
    expect(a.status).toBe(200);
    await open("photos");
    await lines(a);
    const b = await press({ folder: "D:\\P", kind: "photos", days: -5 });
    await open("photos");
    await lines(b);
    const c = await press({ folder: "D:\\P", kind: "photos", days: "30; rm -rf" });
    await open("photos");
    await lines(c);
    const d = await press({ folder: "D:\\V", kind: "videos", days: 7 });
    await open("videos");
    await lines(d);
    expect(calls.map((x) => x.days)).toEqual([30, null, null, 7]);
    expect(calls.slice(0, 3).every((x) => x.kind === "photos")).toBe(true);
  });

  it("refuses to bring in anything unless days are named or the phone is marked 5 Star only", async () => {
    calls.length = 0;
    const post = (body: unknown) =>
      POST(
        new Request("http://127.0.0.1:4604/api/iphone", {
          method: "POST",
          headers: local,
          body: JSON.stringify(body),
        }),
      );
    for (const body of [
      { folder: "D:\\V", kind: "videos" },
      { folder: "D:\\V", kind: "videos", dates: [] },
      { folder: "D:\\V", kind: "videos", dates: ["yesterday", "*", 7] },
      { folder: "D:\\V", kind: "videos", allDates: "yes" },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    expect(calls).toHaveLength(0); // the phone was never asked for a single file
    const ok = await post({
      folder: "D:\\V",
      kind: "videos",
      dates: ["2026-11-23", "bad"],
    });
    expect(ok.status).toBe(200);
    await open("videos");
    await lines(ok);
    expect(calls.at(-1)?.dates).toEqual(["2026-11-23"]); // only the real day is passed on
  });

  it("counts Game Footage as already brought in when copying into Short Clips, and only then", async () => {
    calls.length = 0;
    for (const folder of [
      join(tmpdir(), "P", "Short Clips"),
      join(tmpdir(), "P", "Photos"),
    ]) {
      const res = await POST(
        new Request("http://127.0.0.1:4604/api/iphone", {
          method: "POST",
          headers: local,
          body: JSON.stringify({ folder, kind: "videos", allDates: true }),
        }),
      );
      expect(res.status).toBe(200);
      await open("videos");
      await lines(res);
    }
    expect(calls[0]?.alsoIn).toBe(join(tmpdir(), "P", "Game Footage"));
    expect(calls[1]?.alsoIn).toBeUndefined();
  });

  it("counts the phone's days without a kind, and without copying", async () => {
    calls.length = 0;
    const res = await POST(
      new Request("http://127.0.0.1:4604/api/iphone", {
        method: "POST",
        headers: local,
        body: JSON.stringify({ list: true, folder: "D:\\V", days: 30 }),
      }),
    );
    expect(res.status).toBe(200);
    await open("videos");
    await lines(res);
    expect(calls.at(-1)?.list).toBe(true);
  });

  it("passes the size choice and the check-only request, and ignores nonsense", async () => {
    calls.length = 0;
    for (const body of [
      { size: "small", preview: true },
      { size: "large" },
      { size: "everything; del *", preview: "yes" },
    ]) {
      const res = await press({ folder: "D:\\V", kind: "videos", ...body });
      expect(res.status).toBe(200);
      await open("videos");
      await lines(res);
    }
    expect(calls.map((c) => [c.size, c.preview])).toEqual([
      ["small", true],
      ["large", false],
      ["all", false],
    ]);
  });

  it("makes a video press wait for a running photo copy, then start by itself", async () => {
    calls.length = 0;
    order.length = 0;
    const photos = await press({ folder: "D:\\Photos", kind: "photos", days: 30 });
    expect(photos.status).toBe(200);
    const videos = await press({ folder: "D:\\Videos", kind: "videos", days: 30 });
    expect(videos.status).toBe(200); // not refused
    const videoLines = lines(videos);
    await tick();
    expect(order).toEqual(["start photos"]); // the video copy has not started
    await open("photos");
    await tick();
    expect(order).toEqual(["start photos", "end photos", "start videos"]);
    await open("videos");
    const seen = (await videoLines).map((l) => l.type);
    expect(seen[0]).toBe("waiting");
    expect(seen).toContain("done");
    await lines(photos);
    expect(calls.map((c) => [c.kind, c.folder])).toEqual([
      ["photos", "D:\\Photos"],
      ["videos", "D:\\Videos"],
    ]);
  });

  it("refuses the same button twice while it is running or waiting", async () => {
    calls.length = 0;
    const first = await press({ folder: "D:\\Videos", kind: "videos", days: null });
    const again = await press({ folder: "D:\\Videos", kind: "videos", days: null });
    expect(again.status).toBe(409);
    await open("videos");
    await lines(first);
    // ...and it is free again afterwards.
    const later = await press({ folder: "D:\\Videos", kind: "videos", days: null });
    expect(later.status).toBe(200);
    await open("videos");
    await lines(later);
  });
});
