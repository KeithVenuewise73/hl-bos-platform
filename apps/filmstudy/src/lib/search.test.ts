import { describe, expect, it } from "vitest";
import { parseFilmQuery } from "@hl-bos/football";
import { matchPlays } from "./search";
import type { ParticipationRow, PlayRow, PlayerRow } from "./types";

function play(overrides: Partial<PlayRow>): PlayRow {
  return {
    id: overrides.id ?? "p",
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

const PLAYS: PlayRow[] = [
  play({
    id: "1",
    formation: "Trips Right",
    concept: "Inside Zone",
    family: "run",
    down: 1,
    distance: 10,
  }),
  play({
    id: "2",
    formation: "Doubles",
    concept: "Mesh",
    family: "pass",
    down: 3,
    distance: 9,
    explosive: true,
  }),
  play({
    id: "3",
    formation: "Trips Right",
    concept: "Power",
    family: "run",
    down: 3,
    distance: 2,
    coverage: "Cover 3",
  }),
  play({ id: "4", formation: null, concept: null, down: 2, distance: 5 }),
  play({ id: "5", pressure: "A-gap blitz", family: "pass", down: 3, distance: 8 }),
];

function ids(rows: readonly PlayRow[]): string[] {
  return rows.map((p) => p.id).sort();
}

describe("matchPlays", () => {
  it("narrows by formation", () => {
    expect(ids(matchPlays(PLAYS, parseFilmQuery("Trips Right"), [], []))).toEqual([
      "1",
      "3",
    ]);
  });

  // An untagged play is not a maybe. Treating it as one makes every result
  // list longer and every one of them less true.
  it("never matches a play whose tag is missing", () => {
    const matches = matchPlays(PLAYS, parseFilmQuery("Doubles"), [], []);
    expect(ids(matches)).toEqual(["2"]);
    expect(matches.some((p) => p.id === "4")).toBe(false);
  });

  it("combines a situation with a formation", () => {
    expect(
      ids(matchPlays(PLAYS, parseFilmQuery("Trips Right on third and short"), [], [])),
    ).toEqual(["3"]);
  });

  it("matches pressure as a substring, because coaches tag 'A-gap blitz'", () => {
    expect(ids(matchPlays(PLAYS, parseFilmQuery("blitz"), [], []))).toEqual(["5"]);
  });

  it("finds explosive plays", () => {
    expect(ids(matchPlays(PLAYS, parseFilmQuery("explosive"), [], []))).toEqual(["2"]);
  });

  // The one inference in the matcher, and it is a lookup rather than a guess:
  // a play tagged "Power" with no family is still a run.
  it("falls back to the concept's family when run/pass is untagged", () => {
    const rows = [play({ id: "9", concept: "Outside Zone", family: null })];
    expect(ids(matchPlays(rows, parseFilmQuery("runs"), [], []))).toEqual(["9"]);
    expect(matchPlays(rows, parseFilmQuery("passes"), [], [])).toEqual([]);
  });

  it("does not guess a family for a concept it does not know", () => {
    const rows = [play({ id: "9", concept: "Stretch", family: null })];
    expect(matchPlays(rows, parseFilmQuery("runs"), [], [])).toEqual([]);
  });

  it("resolves a jersey number through participation", () => {
    const players: PlayerRow[] = [
      {
        id: "player-24",
        jersey_number: 24,
        first_name: "Dominic",
        last_name: "Reyes",
        position: "OLB",
        unit: "defense",
        class_year: null,
        height_inches: null,
        weight_pounds: null,
        active: true,
      },
    ];
    const participation: ParticipationRow[] = [
      {
        id: "a",
        play_id: "2",
        player_id: "player-24",
        unit: "defense",
        position: null,
        assignment: null,
      },
    ];
    expect(
      ids(matchPlays(PLAYS, parseFilmQuery("#24"), players, participation)),
    ).toEqual(["2"]);
  });

  it("returns nothing for a number nobody wears", () => {
    expect(matchPlays(PLAYS, parseFilmQuery("#99"), [], [])).toEqual([]);
  });
});
