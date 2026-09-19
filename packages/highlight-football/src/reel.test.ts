import { describe, expect, it } from "vitest";
import { assembleReel, summarizeSeason } from "./reel";
import type { ReelInput, ReelOptions } from "./reel";
import type { ReelProfileCard } from "./types";

const profile: ReelProfileCard = {
  name: "Dominic Herman",
  number: "23",
  team: "West Seneca",
  positions: "Safety / WR",
  season: "2026",
};

const clip = (over: Partial<ReelInput> & { candidateId: string }): ReelInput => ({
  gameId: "game-1",
  playId: `play-${over.candidateId}`,
  window: { startSeconds: 100, endSeconds: 115 },
  score: 4,
  title: "Tackle",
  ...over,
});

const base: ReelOptions = { mode: "game", profile };

describe("assembleReel — the cards", () => {
  it("opens with the athlete's name, number, team, position and season", () => {
    const reel = assembleReel([clip({ candidateId: "a" })], base);
    expect(reel.opening?.headline).toBe("DOMINIC HERMAN");
    expect(reel.opening?.lines).toEqual(["#23", "WEST SENECA", "SAFETY / WR", "2026"]);
  });

  it("closes with a season card in season mode and a game card in game mode", () => {
    const season = assembleReel([clip({ candidateId: "a" })], {
      ...base,
      mode: "season",
    });
    expect(season.closing?.lines).toContain("2026 SEASON HIGHLIGHTS");
    const game = assembleReel([clip({ candidateId: "a" })], base);
    expect(game.closing?.lines).toContain("2026 GAME HIGHLIGHTS");
  });

  it("can be built without cards", () => {
    const reel = assembleReel([clip({ candidateId: "a" })], {
      ...base,
      includeOpeningCard: false,
      includeClosingCard: false,
    });
    expect(reel.opening).toBeNull();
    expect(reel.closing).toBeNull();
    expect(reel.totalSeconds).toBe(15);
  });

  it("counts the cards in the total duration", () => {
    const reel = assembleReel([clip({ candidateId: "a" })], base);
    expect(reel.totalSeconds).toBe(15 + 3 + 3);
  });
});

describe("assembleReel — ordering", () => {
  const clips = [
    clip({
      candidateId: "c",
      score: 5,
      window: { startSeconds: 300, endSeconds: 310 },
    }),
    clip({
      candidateId: "a",
      score: 3,
      window: { startSeconds: 100, endSeconds: 110 },
    }),
    clip({
      candidateId: "b",
      score: 4,
      window: { startSeconds: 200, endSeconds: 210 },
    }),
  ];

  it("defaults to chronological, because a game has a narrative", () => {
    const reel = assembleReel(clips, base);
    expect(reel.clips.map((c) => c.candidateId)).toEqual(["a", "b", "c"]);
  });

  it("can order by rank for a recruiting reel", () => {
    const reel = assembleReel(clips, { ...base, order: "ranked" });
    expect(reel.clips.map((c) => c.candidateId)).toEqual(["c", "b", "a"]);
  });

  it("uses an explicit sort key across games in season mode", () => {
    const seasonClips = [
      clip({
        candidateId: "g2",
        gameId: "game-2",
        sortKey: 2000,
        window: { startSeconds: 50, endSeconds: 60 },
      }),
      clip({
        candidateId: "g1",
        gameId: "game-1",
        sortKey: 1000,
        window: { startSeconds: 900, endSeconds: 910 },
      }),
    ];
    const reel = assembleReel(seasonClips, { ...base, mode: "season" });
    expect(reel.clips.map((c) => c.candidateId)).toEqual(["g1", "g2"]);
  });
});

describe("assembleReel — limits are explained, never silent", () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    clip({
      candidateId: `c${i}`,
      score: 5 - i * 0.1,
      window: { startSeconds: i * 100, endSeconds: i * 100 + 15 },
    }),
  );

  it("caps the clip count and names every clip it dropped", () => {
    const reel = assembleReel(many, { ...base, maxClips: 4 });
    expect(reel.clips).toHaveLength(4);
    expect(reel.omitted).toHaveLength(6);
    expect(reel.omitted[0]?.reason).toContain("limited to 4 clips");
  });

  it("caps total duration and names what it dropped", () => {
    const reel = assembleReel(many, { ...base, maxTotalSeconds: 50 });
    expect(reel.totalSeconds).toBeLessThanOrEqual(50);
    expect(reel.omitted.length).toBeGreaterThan(0);
  });

  it("never drops a starred clip to satisfy a clip-count limit", () => {
    const starred = many.map((c, i) => (i === 9 ? { ...c, starred: true } : c));
    const reel = assembleReel(starred, { ...base, maxClips: 3 });
    expect(reel.clips.some((c) => c.candidateId === "c9")).toBe(true);
    expect(reel.omitted.some((o) => o.candidateId === "c9")).toBe(false);
  });

  it("never drops a starred clip to satisfy a duration limit", () => {
    const starred = many.map((c, i) => (i === 9 ? { ...c, starred: true } : c));
    const reel = assembleReel(starred, { ...base, maxTotalSeconds: 30 });
    expect(reel.clips.some((c) => c.candidateId === "c9")).toBe(true);
  });

  it("keeps the highest-scoring clips when it has to choose", () => {
    const reel = assembleReel(many, { ...base, maxClips: 2 });
    expect(reel.clips.map((c) => c.candidateId).sort()).toEqual(["c0", "c1"]);
  });
});

describe("assembleReel — season mode does not let one blowout dominate", () => {
  const seasonClips = [
    ...Array.from({ length: 6 }, (_, i) =>
      clip({
        candidateId: `blowout-${i}`,
        gameId: "game-blowout",
        score: 5,
        window: { startSeconds: i * 100, endSeconds: i * 100 + 10 },
      }),
    ),
    clip({
      candidateId: "other-1",
      gameId: "game-2",
      score: 4,
      window: { startSeconds: 50, endSeconds: 60 },
      sortKey: 9000,
    }),
    clip({
      candidateId: "other-2",
      gameId: "game-3",
      score: 4,
      window: { startSeconds: 50, endSeconds: 60 },
      sortKey: 9500,
    }),
  ];

  it("enforces a per-game cap", () => {
    const reel = assembleReel(seasonClips, { ...base, mode: "season", maxPerGame: 2 });
    const fromBlowout = reel.clips.filter((c) => c.gameId === "game-blowout");
    expect(fromBlowout).toHaveLength(2);
    expect(reel.clips).toHaveLength(4);
    expect(reel.omitted[0]?.reason).toContain("Already using 2 clips");
  });

  it("does not apply the per-game cap in game mode", () => {
    const reel = assembleReel(seasonClips, { ...base, mode: "game", maxPerGame: 2 });
    expect(reel.clips).toHaveLength(8);
  });

  it("exempts a starred clip from the per-game cap", () => {
    const withStar = seasonClips.map((c) =>
      c.candidateId === "blowout-5" ? { ...c, starred: true } : c,
    );
    const reel = assembleReel(withStar, { ...base, mode: "season", maxPerGame: 2 });
    expect(reel.clips.some((c) => c.candidateId === "blowout-5")).toBe(true);
  });
});

describe("summarizeSeason", () => {
  it("sums real counts and nothing else", () => {
    const summary = summarizeSeason(
      [
        { playsAnalyzed: 64, playerAppearances: 48, candidates: 7 },
        { playsAnalyzed: 71, playerAppearances: 55, candidates: 9 },
      ],
      12,
    );
    expect(summary).toEqual({
      games: 2,
      playsAnalyzed: 135,
      playerAppearances: 103,
      candidateHighlights: 16,
      topHighlights: 12,
    });
  });

  it("reports zeroes for an empty season rather than a projection", () => {
    expect(summarizeSeason([], 0)).toEqual({
      games: 0,
      playsAnalyzed: 0,
      playerAppearances: 0,
      candidateHighlights: 0,
      topHighlights: 0,
    });
  });
});
