import { beforeEach, describe, expect, it } from "vitest";
import { buildReport, minimumText, reportText } from "./report";
import { clockText, percentText } from "./format";
import { computeGameState } from "./participation";
import {
  end,
  endPeriod,
  log,
  now,
  playerIn,
  playerOut,
  resetSeq,
  start,
  startPeriod,
} from "./test-support";

beforeEach(resetSeq);

const LABELS: Record<string, string> = {
  p22: "#22 Dominic Herman",
  p18: "#18 Marcus Reed",
  p7: "#7 Eli Vance",
};

function finishedGame() {
  // A 4x12 game. Every quarter played in full, no stoppages.
  const events = log("g", [
    start(0),
    playerIn(0, "p22"),
    playerIn(0, "p18"),
    endPeriod(720, 1),
    startPeriod(900, 2),
    playerOut(1500, "p18"),
    playerIn(1500, "p7"),
    endPeriod(1620, 2),
    startPeriod(1800, 3),
    playerOut(2100, "p22"),
    endPeriod(2520, 3),
    startPeriod(2700, 4),
    end(3420),
  ]);
  const state = computeGameState({
    gameId: "g",
    rosterPlayerIds: ["p22", "p18", "p7"],
    periodCount: 4,
    periodSeconds: 720,
    minimum: { kind: "percent", percent: 25 },
    events,
    now: now(9_999),
  });
  return buildReport({
    state,
    teamName: "Orchard Park U12",
    sport: "football",
    opponent: "West Seneca",
    gameDate: "2026-09-12",
    minimum: { kind: "percent", percent: 25 },
    score: { us: 21, them: 14 },
    periodsPlayed: 4,
    label: (id) => LABELS[id] ?? id,
  });
}

describe("buildReport", () => {
  it("reports the tracked game clock, not the wall clock", () => {
    // 3420s of wall time, minus three 180s breaks = 2880s = regulation.
    expect(finishedGame().gameSeconds).toBe(2880);
  });

  it("marks the game complete only once it has been ended", () => {
    expect(finishedGame().complete).toBe(true);
  });

  it("ranks by playing time", () => {
    // p7 enters at 1500 and is never taken off, so the final whistle checks
    // them out at 3420 -- ahead of p18, who came off at 1500.
    expect(finishedGame().rows.map((r) => r.playerId)).toEqual(["p22", "p7", "p18"]);
    expect(finishedGame().rows.map((r) => r.secondsPlayed)).toEqual([1740, 1560, 1320]);
  });

  it("resolves minimum-met against the configured target", () => {
    const rows = finishedGame().rows;
    // 25% of 2880 = 720s required.
    expect(rows.find((r) => r.playerId === "p22")?.status).toBe("minimum_met");
    expect(rows.find((r) => r.playerId === "p18")?.status).toBe("minimum_met");
    expect(rows.find((r) => r.playerId === "p7")?.status).toBe("minimum_met");
  });

  it("names an athlete below the target rather than softening it", () => {
    const events = log("g", [
      start(0),
      playerIn(0, "p22"),
      playerIn(2400, "p7"),
      end(2880),
    ]);
    const state = computeGameState({
      gameId: "g",
      rosterPlayerIds: ["p22", "p7"],
      periodCount: 4,
      periodSeconds: 720,
      minimum: { kind: "percent", percent: 25 },
      events,
      now: now(2880),
    });
    const report = buildReport({
      state,
      teamName: "T",
      sport: "football",
      opponent: "O",
      gameDate: "2026-09-12",
      minimum: { kind: "percent", percent: 25 },
      score: null,
      periodsPlayed: 4,
      label: (id) => id,
    });
    expect(report.rows.find((r) => r.playerId === "p7")?.status).toBe("below_minimum");
  });

  it("counts athletes who never took the field", () => {
    const state = computeGameState({
      gameId: "g",
      rosterPlayerIds: ["p22", "bench1", "bench2"],
      periodCount: 4,
      periodSeconds: 720,
      minimum: { kind: "none" },
      events: log("g", [start(0), playerIn(0, "p22"), end(600)]),
      now: now(600),
    });
    const report = buildReport({
      state,
      teamName: "T",
      sport: "football",
      opponent: "O",
      gameDate: "2026-09-12",
      minimum: { kind: "none" },
      score: null,
      periodsPlayed: 1,
      label: (id) => id,
    });
    expect(report.didNotPlay).toBe(2);
  });
});

describe("reportText", () => {
  const text = () => reportText(finishedGame());

  it("leads with what it is", () => {
    expect(text().startsWith("PLAYTIME REPORT")).toBe(true);
  });

  it("includes every athlete with time and share", () => {
    const t = text();
    expect(t).toContain("#22 Dominic Herman");
    expect(t).toContain("Playing time: 29:00");
    expect(t).toContain("Game participation: 60%");
  });

  it("states that the minimum is the user's own, not a league ruling", () => {
    expect(text()).toContain("not a league ruling");
  });

  it("warns when a game has not been ended", () => {
    const state = computeGameState({
      gameId: "g",
      rosterPlayerIds: ["p22"],
      periodCount: 4,
      periodSeconds: 720,
      minimum: { kind: "none" },
      events: log("g", [start(0), playerIn(0, "p22")]),
      now: now(600),
    });
    const t = reportText(
      buildReport({
        state,
        teamName: "T",
        sport: "football",
        opponent: "O",
        gameDate: "2026-09-12",
        minimum: { kind: "none" },
        score: null,
        periodsPlayed: 1,
        label: (id) => id,
      }),
    );
    expect(t).toContain("has not been ended");
  });
});

describe("minimumText", () => {
  it("says plainly when there is no target", () => {
    expect(minimumText({ kind: "none" })).toContain("No minimum");
  });
  it("renders a percentage target", () => {
    expect(minimumText({ kind: "percent", percent: 25 })).toContain("25%");
  });
  it("renders an absolute target as a clock", () => {
    expect(minimumText({ kind: "seconds", seconds: 720 })).toContain("12:00");
  });
});

describe("formatting", () => {
  it("renders seconds as a game clock", () => {
    expect([0, 59, 258, 1602, 3600, 3661].map(clockText)).toEqual([
      "0:00",
      "0:59",
      "4:18",
      "26:42",
      "1:00:00",
      "1:01:01",
    ]);
  });

  it("never renders a negative clock", () => {
    expect(clockText(-90)).toBe("0:00");
  });

  it("renders an unknown share as an em dash, not as zero", () => {
    expect(percentText(null)).toBe("—");
    expect(percentText(0)).toBe("0%");
    expect(percentText(0.564)).toBe("56%");
  });
});
