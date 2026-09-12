import { describe, expect, it } from "vitest";
import { playerSeason, reviewStatus, taggingProgress, teamSnapshot } from "./summary";
import type { GradeRow, ParticipationRow, PlayRow } from "./types";

function play(overrides: Partial<PlayRow> = {}): PlayRow {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    film_asset_id: "film-1",
    game_id: null,
    play_number: 1,
    start_seconds: 0,
    end_seconds: 9,
    snap_seconds: null,
    quarter: null,
    clock: null,
    down: null,
    distance: null,
    yard_line: null,
    hash: null,
    possession: null,
    personnel: null,
    formation: null,
    strength: null,
    motion: null,
    play_call: null,
    family: null,
    concept: null,
    direction: null,
    defensive_front: null,
    box_count: null,
    coverage: null,
    pressure: null,
    result: null,
    yards: null,
    touchdown: false,
    first_down: false,
    turnover: false,
    penalty: false,
    explosive: false,
    red_zone: false,
    third_down: false,
    goal_line: false,
    ...overrides,
  };
}

describe("teamSnapshot", () => {
  it("counts only what is tagged", () => {
    const snapshot = teamSnapshot([
      play({ possession: "offense", explosive: true }),
      play({ possession: "offense", turnover: true }),
      play({ possession: "defense" }),
      play({}), // segmented but not yet tagged with a possession
    ]);
    expect(snapshot.offensivePlays).toBe(2);
    expect(snapshot.defensivePlays).toBe(1);
    expect(snapshot.untaggedPossession).toBe(1);
    expect(snapshot.totalPlays).toBe(4);
    expect(snapshot.explosive).toBe(1);
    expect(snapshot.turnovers).toBe(1);
  });

  // A 0% conversion rate on zero third downs is a claim about a team that
  // never faced one. It has to be null, and the dashboard renders "Not
  // recorded" from that.
  it("returns a null third-down rate when no third down is tagged", () => {
    const snapshot = teamSnapshot([play({ possession: "offense" })]);
    expect(snapshot.thirdDownConversion.sample).toBe(0);
    expect(snapshot.thirdDownConversion.percent).toBeNull();
  });

  it("counts a third down as converted on a first down or a touchdown", () => {
    const snapshot = teamSnapshot([
      play({ possession: "offense", third_down: true, first_down: true }),
      play({ possession: "offense", third_down: true, touchdown: true }),
      play({ possession: "offense", third_down: true }),
      play({ possession: "offense", third_down: true }),
    ]);
    expect(snapshot.thirdDownConversion.sample).toBe(4);
    expect(snapshot.thirdDownConversion.hits).toBe(2);
    expect(snapshot.thirdDownConversion.percent).toBe(50);
  });

  // The opponent's third downs are not ours. Only plays with our offence on
  // the field count toward our conversion rate.
  it("excludes defensive plays from our conversion rate", () => {
    const snapshot = teamSnapshot([
      play({ possession: "defense", third_down: true, first_down: true }),
      play({ possession: "offense", third_down: true }),
    ]);
    expect(snapshot.thirdDownConversion.sample).toBe(1);
    expect(snapshot.thirdDownConversion.hits).toBe(0);
  });

  it("counts nothing from nothing", () => {
    const snapshot = teamSnapshot([]);
    expect(snapshot.totalPlays).toBe(0);
    expect(snapshot.thirdDownConversion.percent).toBeNull();
  });
});

function participation(
  playId: string,
  unit: ParticipationRow["unit"],
): ParticipationRow {
  return {
    id: `${playId}-p`,
    play_id: playId,
    player_id: "player-1",
    unit,
    position: null,
    assignment: null,
  };
}

function grade(playId: string, symbol: GradeRow["symbol"]): GradeRow {
  return {
    id: `${playId}-g`,
    play_id: playId,
    player_id: "player-1",
    category_key: "assignment",
    symbol,
    numeric_value: null,
  };
}

describe("playerSeason", () => {
  it("counts snaps by unit", () => {
    const season = playerSeason(
      [
        participation("a", "defense"),
        participation("b", "defense"),
        participation("c", "offense"),
      ],
      [],
    );
    expect(season.snaps).toBe(3);
    expect(season.defensiveSnaps).toBe(2);
    expect(season.offensiveSnaps).toBe(1);
  });

  // The line that keeps a player page honest: a player nobody has graded is
  // not a player who grades zero.
  it("returns a null average for an ungraded player, never 0", () => {
    const season = playerSeason([participation("a", "defense")], []);
    expect(season.graded).toBe(0);
    expect(season.averageGrade).toBeNull();
    expect(season.ungraded).toBe(1);
  });

  it("reports how many tagged snaps are still ungraded", () => {
    const season = playerSeason(
      [
        participation("a", "defense"),
        participation("b", "defense"),
        participation("c", "defense"),
      ],
      [grade("a", "positive")],
    );
    expect(season.snaps).toBe(3);
    expect(season.graded).toBe(1);
    expect(season.ungraded).toBe(2);
    expect(season.positive).toBe(1);
  });
});

describe("taggingProgress", () => {
  it("is null, not 0%, when there are no plays to chart", () => {
    expect(taggingProgress([], []).percent).toBeNull();
  });

  it("reports a fully charted film as 100%", () => {
    const p = play({
      id: "x",
      down: 1,
      distance: 10,
      formation: "Trips Right",
      yards: 5,
    });
    expect(taggingProgress([p], [participation("x", "offense")]).percent).toBe(100);
  });

  it("reports a partly charted film honestly", () => {
    const p = play({ id: "x", down: 1, distance: 10 });
    const progress = taggingProgress([p], []);
    expect(progress.percent).toBe(25);
    expect(progress.withFormation).toBe(0);
    expect(progress.withParticipation).toBe(0);
  });
});

describe("reviewStatus", () => {
  it("splits assigned, watched and completed", () => {
    const status = reviewStatus([
      { status: "assigned" },
      { status: "viewed" },
      { status: "acknowledged" },
      { status: "completed" },
    ]);
    expect(status.assigned).toBe(4);
    expect(status.outstanding).toBe(1);
    expect(status.viewed).toBe(2);
    expect(status.completed).toBe(1);
  });
});
