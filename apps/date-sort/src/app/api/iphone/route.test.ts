/**
 * Photos and videos come from one phone over one cable, into separate
 * folders. They must not refuse each other: the second press waits for the
 * first, says so, and then runs by itself. The same button twice is refused.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Call {
  folder: string;
  kind: string;
  days: number | null;
  size: string;
  preview: boolean;
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
    options: { size: string; preview: boolean },
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
      body: JSON.stringify(body),
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

describe("bringing in the iPhone's photos and videos", () => {
  it("refuses a press that does not say photos or videos", async () => {
    const res = await press({ folder: "D:\\Seagate\\iPhone Photos" });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("passes the kind and how far back to the copy, and ignores nonsense days", async () => {
    const a = await press({ folder: "D:\\P", kind: "photos", days: 30 });
    expect(a.status).toBe(200);
    gates.get("photos")?.();
    await lines(a);
    const b = await press({ folder: "D:\\P", kind: "photos", days: -5 });
    gates.get("photos")?.();
    await lines(b);
    const c = await press({ folder: "D:\\P", kind: "photos", days: "30; rm -rf" });
    gates.get("photos")?.();
    await lines(c);
    expect(calls.map((x) => x.days)).toEqual([30, null, null]);
    expect(calls.every((x) => x.kind === "photos")).toBe(true);
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
      gates.get("videos")?.();
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
    gates.get("photos")?.();
    await tick();
    expect(order).toEqual(["start photos", "end photos", "start videos"]);
    gates.get("videos")?.();
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
    gates.get("videos")?.();
    await lines(first);
    // ...and it is free again afterwards.
    const later = await press({ folder: "D:\\Videos", kind: "videos", days: null });
    expect(later.status).toBe(200);
    gates.get("videos")?.();
    await lines(later);
  });
});
