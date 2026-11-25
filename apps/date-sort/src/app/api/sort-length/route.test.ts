import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@hl-bos/date-sort/review", () => ({
  MAX_CLIP_SECONDS: 300,
  findTools: () => Promise.resolve({ ffmpeg: "x", ffprobe: "y", tonemap: false }),
  probeSeconds: (_t: unknown, f: string) => Promise.resolve(/long/.test(f) ? 4867 : 30),
  sortByLength: async (o: {
    clipsRoot: string;
    gamesRoot: string;
    apply: boolean;
    probe: (f: string) => Promise<number | null>;
  }) => {
    const { sortByLength } = await vi.importActual<
      typeof import("../../../../../../packages/date-sort/src/review/sort-length")
    >("../../../../../../packages/date-sort/src/review/sort-length");
    return sortByLength(o);
  },
}));

const { POST } = await import("./route");
const work = mkdtempSync(join(tmpdir(), "sort-route-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
const local = { host: "127.0.0.1:4604", "Content-Type": "application/json" };
const post = (body: unknown) =>
  POST(
    new Request("http://127.0.0.1:4604/api/sort-length", {
      method: "POST",
      headers: local,
      body: JSON.stringify(body),
    }),
  );

describe("sorting a phone's clips by length", () => {
  it("accepts only a folder named Short Clips", async () => {
    expect((await post({ clipsFolder: "relative" })).status).toBe(400);
    expect((await post({ clipsFolder: work })).status).toBe(400);
    expect((await post({ clipsFolder: join(work, "Photos") })).status).toBe(400);
  });

  it("checks without moving, then moves the long one into Game Footage beside it", async () => {
    const clips = join(work, "Phone", "Short Clips");
    mkdirSync(join(clips, "202611_a"), { recursive: true });
    writeFileSync(join(clips, "202611_a", "long.MOV"), "x");
    writeFileSync(join(clips, "202611_a", "quick.MOV"), "x");
    const check = (await (await post({ clipsFolder: clips })).json()) as {
      moved: number;
      long: unknown[];
    };
    expect(check.long).toHaveLength(1);
    expect(check.moved).toBe(0);
    expect(readdirSync(join(clips, "202611_a"))).toHaveLength(2);
    const done = (await (await post({ clipsFolder: clips, apply: true })).json()) as {
      moved: number;
    };
    expect(done.moved).toBe(1);
    expect(readdirSync(join(work, "Phone", "Game Footage", "202611_a"))).toEqual([
      "long.MOV",
    ]);
    expect(readdirSync(join(clips, "202611_a"))).toEqual(["quick.MOV"]);
  });
});
