import { describe, expect, it } from "vitest";
import {
  athleteTrackForPlay,
  buildReel,
  clipTitle,
  cropPathFor,
  demoAnalysis,
  overlayFrames,
  playRows,
  qualityMetrics,
  seasonSummary,
  selectionFor,
  spotlightFor,
} from "./analysis";
import { JOB_STATUSES } from "@hl-bos/highlight-football";

const analysis = demoAnalysis();

describe("the app shows the engine's conclusions, not its own", () => {
  it("memoises one analysis so every screen agrees", () => {
    // Two screens asking for the analysis must get the same object. The
    // alternative is a dashboard that says 8 candidates and a plays page that
    // says 7, with nobody able to say which is right.
    expect(demoAnalysis()).toBe(analysis);
  });

  it("builds one row per detected play", () => {
    expect(playRows(analysis)).toHaveLength(analysis.result.plays.length);
  });

  it("carries the engine's own numbers into the rows, unchanged", () => {
    const rows = playRows(analysis);
    for (const row of rows) {
      const inv = analysis.result.involvements.find((i) => i.playId === row.playId);
      expect(row.involvement).toBe(inv?.involvement ?? 0);
      expect(row.identityConfidence).toBe(inv?.identityConfidence ?? 0);
      const candidate = analysis.result.candidates.find((c) => c.playId === row.playId);
      expect(row.score).toBe(candidate?.score ?? null);
    }
  });

  it("marks plays the athlete missed as absent rather than scoring them", () => {
    const rows = playRows(analysis);
    const absent = rows.filter((r) => !r.playerPresent);
    expect(absent.length).toBeGreaterThan(0);
    for (const row of absent) {
      expect(row.involvement).toBe(0);
      expect(row.score).toBeNull();
    }
  });
});

describe("overlay geometry is the tracker's real output", () => {
  const involved = playRows(analysis).find(
    (r) => r.playerPresent && r.involvement >= 2,
  );

  it("has a play to draw", () => {
    expect(involved).toBeDefined();
  });

  it("returns boxes that came from the athlete's own track", () => {
    if (involved === undefined) return;
    const track = athleteTrackForPlay(analysis, involved.playId);
    expect(track).not.toBeNull();
    const frames = overlayFrames(analysis, involved.playId, 30);
    expect(frames.length).toBeGreaterThan(0);
    const boxes = new Set(track?.detections.map((d) => JSON.stringify(d.box)) ?? []);
    for (const f of frames) expect(boxes.has(JSON.stringify(f.player))).toBe(true);
  });

  it("returns nothing for a play the athlete was not in", () => {
    const absent = playRows(analysis).find((r) => !r.playerPresent);
    expect(absent).toBeDefined();
    if (absent !== undefined) {
      expect(overlayFrames(analysis, absent.playId)).toEqual([]);
      expect(athleteTrackForPlay(analysis, absent.playId)).toBeNull();
    }
  });

  it("returns nothing for a play id that does not exist", () => {
    expect(overlayFrames(analysis, "no-such-play")).toEqual([]);
    expect(spotlightFor(analysis, "no-such-play")).toBeNull();
  });

  it("plans a spotlight that identifies the athlete before the snap", () => {
    if (involved === undefined) return;
    const plan = spotlightFor(analysis, involved.playId);
    expect(plan).not.toBeNull();
    expect(plan?.markers.length ?? 0).toBeGreaterThan(0);
    if (plan?.freeze != null && involved.snapSeconds !== null) {
      expect(plan.freeze.atSeconds).toBeLessThan(involved.snapSeconds);
      expect(plan.freeze.headline).toContain("DOMINIC HERMAN");
    }
  });

  it("plans a vertical crop with one window per sampled frame", () => {
    if (involved === undefined) return;
    const path = cropPathFor(analysis, involved.playId);
    expect(path.length).toBe(overlayFrames(analysis, involved.playId, 400).length);
  });
});

describe("the reel the editor shows is the reel an export would render", () => {
  it("contains one clip per selected candidate, with the engine's windows", () => {
    const selection = selectionFor(analysis, "involved_plays");
    const reel = buildReel(analysis, selection);
    expect(reel.clips).toHaveLength(selection.length);
    for (const clip of reel.clips) {
      const candidate = selection.find((c) => c.candidateId === clip.candidateId);
      expect(clip.window).toEqual(candidate?.window);
    }
  });

  it("opens and closes with the athlete's card", () => {
    const reel = buildReel(analysis, selectionFor(analysis, "involved_plays"));
    expect(reel.opening?.headline).toBe("DOMINIC HERMAN");
    expect(reel.closing?.lines).toContain("2026 GAME HIGHLIGHTS");
  });

  it("narrows as the selection tightens", () => {
    const all = selectionFor(analysis, "all_plays").length;
    const involved = selectionFor(analysis, "involved_plays").length;
    const best = selectionFor(analysis, "best_plays").length;
    const elite = selectionFor(analysis, "elite_highlights").length;
    expect(all).toBeGreaterThanOrEqual(involved);
    expect(involved).toBeGreaterThanOrEqual(best);
    expect(best).toBeGreaterThanOrEqual(elite);
  });

  it("titles clips in football words", () => {
    for (const candidate of analysis.result.candidates) {
      const title = clipTitle(candidate);
      expect(title).not.toContain("_");
      expect(title.charAt(0)).toBe(title.charAt(0).toUpperCase());
    }
  });
});

describe("metrics say 'not measured' rather than inventing a number", () => {
  const metrics = qualityMetrics(analysis);

  it("reports the metrics the demo game's labels actually support", () => {
    expect(metrics.selectedPlayerPrecision).toBe(1);
    expect(metrics.selectedPlayerRecall).toBe(1);
    expect(metrics.playsMissed).toBe(0);
    expect(metrics.playsInvented).toBe(0);
    expect(metrics.jerseyOcrAccuracy ?? 0).toBeGreaterThan(0.75);
  });

  it("returns null for everything that needs a human and has not had one", () => {
    expect(metrics.highlightAcceptanceRate).toBeNull();
    expect(metrics.manualCorrectionRate).toBeNull();
    expect(metrics.meaningfulPlayRecall).toBeNull();
  });

  it("summarises the season from real counts only", () => {
    const season = seasonSummary(analysis);
    expect(season.games).toBe(1);
    expect(season.playsAnalyzed).toBe(analysis.result.summary.playsAnalyzed);
    expect(season.playerAppearances).toBe(analysis.result.summary.playerAppearances);
  });
});

describe("demo output is labelled", () => {
  it("flags the analysis as demo and names all nine adapters", () => {
    expect(analysis.isDemo).toBe(true);
    expect(analysis.adapterNames).toHaveLength(9);
    for (const name of analysis.adapterNames) expect(name).toContain("demo");
  });
});

describe("the database's job statuses match the engine's", () => {
  it("has not drifted from migration 0049's highlight.job_status enum", () => {
    // Listed here rather than imported: the point is to notice when the two
    // sides diverge, and importing one from the other would hide exactly that.
    expect([...JOB_STATUSES]).toEqual([
      "uploaded",
      "transcoding",
      "detecting_players",
      "identifying_teams",
      "reading_numbers",
      "tracking_player",
      "segmenting_plays",
      "detecting_ball",
      "analyzing_actions",
      "generating_highlights",
      "ready",
      "failed",
    ]);
  });
});
