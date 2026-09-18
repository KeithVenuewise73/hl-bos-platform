import { describe, expect, it } from "vitest";

import {
  EmptyReelError,
  buildReel,
  reelSubtitle,
  reelTitle,
  renderPlan,
} from "./reel.ts";
import {
  InvalidTrimError,
  acceptedClips,
  decide,
  reorder,
  reviewProgress,
  trim,
} from "./review.ts";
import type { Clip, HighlightProject } from "./types.ts";

const PROJECT: HighlightProject = {
  id: "p-1",
  ownerId: "u-1",
  name: "Squirt A vs Northstars",
  gameDate: "2026-02-14",
  team: "Riverside Squirt A",
  opponent: "Northstars",
  athlete: {
    id: "a-1",
    name: "Sam Herman",
    jerseyNumber: "17",
    jerseyColorId: "navy",
    position: "forward",
  },
  createdAt: "2026-02-15T10:00:00.000Z",
  updatedAt: "2026-02-15T10:00:00.000Z",
};

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "c-1",
    projectId: "p-1",
    eventId: "e-1",
    startTime: 100,
    endTime: 110,
    decision: "pending",
    trimmedStart: null,
    trimmedEnd: null,
    note: null,
    mediaAssetId: null,
    order: 0,
    ...overrides,
  };
}

describe("review", () => {
  it("counts what is done and what is left", () => {
    const progress = reviewProgress([
      clip({ id: "a", decision: "accepted" }),
      clip({ id: "b", decision: "rejected" }),
      clip({ id: "c" }),
    ]);
    expect(progress).toMatchObject({ total: 3, accepted: 1, rejected: 1, pending: 1 });
    expect(progress.canBuildReel).toBe(true);
    expect(progress.summary).toContain("still to review");
  });

  it("says so plainly when a game produced no clips at all", () => {
    const progress = reviewProgress([]);
    expect(progress.canBuildReel).toBe(false);
    expect(progress.summary).toBe("No clips were produced from this game.");
  });

  it("will not offer a reel when everything was rejected", () => {
    expect(reviewProgress([clip({ decision: "rejected" })]).canBuildReel).toBe(false);
  });

  it("lets a trim shorten a clip", () => {
    const trimmed = trim(clip(), 102, 108);
    expect(trimmed.trimmedStart).toBe(102);
    expect(trimmed.trimmedEnd).toBe(108);
  });

  it("refuses a trim that would extend past what was detected", () => {
    expect(() => trim(clip(), 90, 120)).toThrow(InvalidTrimError);
  });

  it("refuses an inverted or empty trim", () => {
    // A zero-length clip renders to a file that will not play, and export time
    // is far too late to find that out.
    expect(() => trim(clip(), 108, 102)).toThrow(InvalidTrimError);
    expect(() => trim(clip(), 105, 105)).toThrow(InvalidTrimError);
  });

  it("refuses a trim built from nonsense", () => {
    expect(() => trim(clip(), Number.NaN, 108)).toThrow(InvalidTrimError);
  });

  it("returns only accepted clips, in order", () => {
    const kept = acceptedClips([
      clip({ id: "b", decision: "accepted", order: 1 }),
      clip({ id: "a", decision: "accepted", order: 0 }),
      clip({ id: "c", decision: "pending", order: 2 }),
    ]);
    expect(kept.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps order dense and stable after a drag", () => {
    const reordered = reorder(
      [
        clip({ id: "a", order: 0 }),
        clip({ id: "b", order: 1 }),
        clip({ id: "c", order: 2 }),
      ],
      "c",
      0,
    );
    expect(reordered.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(reordered.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it("records a reviewer's note alongside the decision", () => {
    expect(decide(clip(), "rejected", "that's the other kid").note).toBe(
      "that's the other kid",
    );
  });
});

describe("reel assembly", () => {
  it("refuses to build a reel from clips nobody approved", () => {
    expect(() =>
      buildReel(PROJECT, [clip(), clip({ id: "c-2", decision: "rejected" })], {
        id: "r-1",
        now: "2026-02-15T11:00:00.000Z",
      }),
    ).toThrow(EmptyReelError);
  });

  // The rule that matters most in this package.
  it("cannot be tricked into including a pending or rejected clip", () => {
    const reel = buildReel(
      PROJECT,
      [
        clip({ id: "yes", decision: "accepted", order: 0 }),
        clip({ id: "no", decision: "pending", order: 1 }),
        clip({ id: "never", decision: "rejected", order: 2 }),
      ],
      { id: "r-1", now: "2026-02-15T11:00:00.000Z" },
    );
    expect(reel.entries.map((e) => e.clipId)).toEqual(["yes"]);
  });

  it("lays clips end to end with correct offsets", () => {
    const reel = buildReel(
      PROJECT,
      [
        clip({ id: "a", decision: "accepted", order: 0, startTime: 100, endTime: 110 }),
        clip({ id: "b", decision: "accepted", order: 1, startTime: 200, endTime: 206 }),
      ],
      { id: "r-1", now: "2026-02-15T11:00:00.000Z" },
    );
    expect(reel.entries[0]?.reelOffset).toBe(0);
    expect(reel.entries[1]?.reelOffset).toBe(10);
    expect(reel.totalDurationSeconds).toBe(16);
  });

  it("honours a human trim when laying out the reel", () => {
    const reel = buildReel(
      PROJECT,
      [clip({ decision: "accepted", trimmedStart: 103, trimmedEnd: 107 })],
      { id: "r-1", now: "2026-02-15T11:00:00.000Z" },
    );
    expect(reel.entries[0]).toMatchObject({ startTime: 103, endTime: 107 });
    expect(reel.totalDurationSeconds).toBe(4);
  });

  it("titles the reel from what the user typed and nothing else", () => {
    expect(reelTitle(PROJECT)).toBe("Sam Herman · #17");
    const title = reelTitle(PROJECT);
    expect(title).not.toMatch(/season|best|top|amazing|highlight of/i);
  });

  it("gets the game date right regardless of the viewer's timezone", () => {
    // `new Date("2026-02-14")` is UTC midnight, which renders as the 13th for
    // anyone west of Greenwich. A date that is a day off on a family's keepsake
    // is how people come to distrust everything else on the screen.
    expect(reelSubtitle(PROJECT)).toContain("February 14, 2026");
  });

  it("leaves the rendered file null until something has actually rendered", () => {
    const reel = buildReel(PROJECT, [clip({ decision: "accepted" })], {
      id: "r-1",
      now: "2026-02-15T11:00:00.000Z",
    });
    expect(reel.mediaAssetId).toBeNull();
  });

  it("renders from the original upload, never from the analysis proxy", () => {
    // The proxy is a downscaled copy made so a model can look at it cheaply.
    // Rendering a family's keepsake from it hands them a soft, blocky video.
    const reel = buildReel(PROJECT, [clip({ decision: "accepted" })], {
      id: "r-1",
      now: "2026-02-15T11:00:00.000Z",
    });
    const plan = renderPlan(reel, "originals/game.mp4");
    expect(plan.sourceStorageKey).toBe("originals/game.mp4");
    expect(plan.sourceStorageKey).not.toContain("proxy");
    expect(plan.cuts).toEqual([{ start: 100, end: 110 }]);
  });
});
