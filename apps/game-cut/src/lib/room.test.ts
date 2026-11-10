/**
 * A job that will not fit is refused in plain words BEFORE it starts. A long job
 * that fills the drive an hour in is the failure this project has already had twice.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const GB = 1024 ** 3;
let free: number | null = 500 * GB;
let planFiles = { a: "", b: "" };

vi.mock("@hl-bos/game-cut", async (original) => ({
  ...(await original<typeof import("@hl-bos/game-cut")>()),
  freeBytes: () => Promise.resolve(free),
}));
vi.mock("./engine.ts", () => ({
  findTools: () => ({ ffmpeg: "ffmpeg", ffprobe: "ffprobe" }),
  isStop: () => false,
  toolStatus: () => Promise.resolve({ found: true }),
}));
vi.mock("./plans.ts", () => ({
  newPlanId: () => "plan-x",
  savePlan: () => undefined,
  // A two-hour broadcast in one piece.
  getPlan: (id: string) =>
    id === "plan-x"
      ? {
          kind: "broadcast",
          id,
          fileA: planFiles.a,
          fileB: planFiles.b,
          analysis: {
            moments: [
              { startSeconds: 0, endSeconds: 7200, camera: "A", clipStartSeconds: 0 },
            ],
            factsA: {},
            factsB: {},
          },
        }
      : undefined,
}));

const { checkMake } = await import("./work.ts");

describe("room on the drive, checked before a long job starts", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "room-"));
    planFiles = { a: join(dir, "A.mp4"), b: join(dir, "B.mp4") };
    await writeFile(planFiles.a, "x");
    await writeFile(planFiles.b, "x");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const out = () => join(dir, "Game.mp4");

  it("refuses a two-hour full-quality video (about 17 GB at its peak) on a drive with 15 GB free, with the numbers", async () => {
    free = 15 * GB;
    const r = await checkMake({ planId: "plan-x", outFile: out(), quality: "full" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.message).toMatch(/will not fit/);
      expect(r.message).toMatch(/only 15\.0 GB free/);
      expect(r.message).toMatch(/Draft/); // and says what would help
    }
  });

  it("the same drive is enough for a draft, which is smaller", async () => {
    free = 20 * GB;
    expect(
      (await checkMake({ planId: "plan-x", outFile: out(), quality: "draft" })).ok,
    ).toBe(true);
  });

  it("allows it with room to spare, with no warning", async () => {
    free = 500 * GB;
    const r = await checkMake({ planId: "plan-x", outFile: out(), quality: "full" });
    expect(r).toMatchObject({ ok: true, seconds: 7200 });
    // On Windows the temp folder is on C:, and saving there is warned about, correctly.
    if (r.ok) {
      if (/^c:/i.test(out())) expect(r.warning).toMatch(/laptop's own drive \(C:\)/);
      else expect(r.warning).toBeNull();
    }
  });

  it("does not block when the free space cannot be read, and says it could not", async () => {
    free = null;
    const r = await checkMake({ planId: "plan-x", outFile: out(), quality: "full" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toMatch(/Could not read how much room/);
  });

  it("refuses a plan that no longer exists, in words", async () => {
    const r = await checkMake({ planId: "plan-gone", outFile: out(), quality: "full" });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses to replace a game video, or to save somewhere that is not there", async () => {
    free = 500 * GB;
    expect(
      await checkMake({ planId: "plan-x", outFile: planFiles.a, quality: "full" }),
    ).toMatchObject({ ok: false });
    expect(
      await checkMake({
        planId: "plan-x",
        outFile: join(dir, "nope", "x.mp4"),
        quality: "full",
      }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("refuses when a game video has moved since it was planned", async () => {
    free = 500 * GB;
    const saved = planFiles.b;
    planFiles.b = join(dir, "moved.mp4");
    const r = await checkMake({ planId: "plan-x", outFile: out(), quality: "full" });
    planFiles.b = saved;
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toMatch(/moved or is no longer there/);
  });
});
