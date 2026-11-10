/**
 * A copy that cannot fit is stopped before it starts. The drive once filled up
 * partway through 34.5 GB of videos and Windows stopped with "insufficient disk
 * space". The server now compares what is to come with what the drive has the
 * moment the phone has been listed, and refuses, copying nothing.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const GB = 1024 ** 3;
let free: number | null = 10 * GB;
let neededBytes = 50 * GB;
let abortedDuringCopy = false;
let copied = 0;

vi.mock("@/lib/free-space.ts", () => ({
  freeBytes: () => Promise.resolve(free),
}));
vi.mock("@/lib/keep-awake.ts", () => ({
  keepAwake: () => Promise.resolve({ held: true, release: () => undefined }),
}));
vi.mock("@/lib/iphone.ts", () => ({
  copyFromIphone: (
    _folder: string,
    _kind: string,
    _days: number | null,
    options: { preview: boolean },
    onLine: (l: Record<string, unknown>) => void,
    signal: AbortSignal,
  ) => {
    onLine({
      type: "found",
      device: "Apple iPhone",
      total: 3,
      bytes: neededBytes,
      todo: 3,
      todoBytes: neededBytes,
    });
    abortedDuringCopy = signal.aborted;
    if (options.preview) {
      onLine({ type: "previewed" });
    } else if (!signal.aborted) {
      copied += 1;
      onLine({ type: "done" });
    }
    return Promise.resolve();
  },
}));

const { POST } = await import("./route");

const local = { host: "127.0.0.1:4604", "Content-Type": "application/json" };
const press = (body: unknown) =>
  POST(
    new Request("http://127.0.0.1:4604/api/iphone", {
      method: "POST",
      headers: local,
      body: JSON.stringify(body),
    }),
  );
interface Line {
  type: string;
  enough?: boolean;
  free?: number | null;
  needed?: number;
}
async function lines(res: Response): Promise<Line[]> {
  return (await res.text())
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Line);
}
const reset = (f: number | null, needed: number) => {
  free = f;
  neededBytes = needed;
  abortedDuringCopy = false;
  copied = 0;
};

describe("room on the drive before a copy", () => {
  it("stops a copy that will not fit, and copies nothing", async () => {
    reset(30.8 * GB, 120 * GB);
    const out = await lines(await press({ folder: "C:\\V", kind: "videos" }));
    const space = out.find((l) => l.type === "space");
    expect(space).toMatchObject({ enough: false, free: 30.8 * GB, needed: 120 * GB });
    expect(abortedDuringCopy).toBe(true);
    expect(copied).toBe(0);
    expect(out.some((l) => l.type === "done")).toBe(false);
  });

  it("lets a copy that fits go ahead", async () => {
    reset(500 * GB, 50 * GB);
    const out = await lines(await press({ folder: "D:\\V", kind: "videos" }));
    expect(out.find((l) => l.type === "space")).toMatchObject({ enough: true });
    expect(abortedDuringCopy).toBe(false);
    expect(copied).toBe(1);
    expect(out.some((l) => l.type === "done")).toBe(true);
  });

  it("does not stop 'Check size first': it reports the shortfall and finishes", async () => {
    reset(10 * GB, 50 * GB);
    const out = await lines(
      await press({ folder: "D:\\V", kind: "videos", preview: true }),
    );
    expect(out.find((l) => l.type === "space")).toMatchObject({ enough: false });
    expect(abortedDuringCopy).toBe(false);
    expect(out.some((l) => l.type === "previewed")).toBe(true);
  });

  it("does not block when the free space cannot be read", async () => {
    reset(null, 50 * GB);
    const out = await lines(await press({ folder: "D:\\V", kind: "videos" }));
    expect(out.find((l) => l.type === "space")).toMatchObject({
      enough: true,
      free: null,
    });
    expect(copied).toBe(1);
  });
});
