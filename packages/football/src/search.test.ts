import { describe, expect, it } from "vitest";
import { describeFilter, parseFilmQuery } from "./search";

describe("parseFilmQuery", () => {
  it("reads the brief's own example searches", () => {
    expect(parseFilmQuery("third and long").down).toBe(3);
    expect(parseFilmQuery("third and long").distanceBucket).toBe("long");
    expect(parseFilmQuery("red zone").redZone).toBe(true);
    expect(parseFilmQuery("Trips Right").formations).toEqual(["Trips Right"]);
    expect(parseFilmQuery("Cover 3").coverages).toEqual(["Cover 3"]);
    expect(parseFilmQuery("counter").concepts).toEqual(["Counter"]);
    expect(parseFilmQuery("explosive runs").explosive).toBe(true);
    expect(parseFilmQuery("explosive runs").family).toBe("run");
  });

  it("reads a jersey number only when it is marked as one", () => {
    expect(parseFilmQuery("#24 tackles").jerseyNumbers).toEqual([24]);
    expect(parseFilmQuery("number 24").jerseyNumbers).toEqual([24]);
    // Bare "11" is a personnel grouping far more often than a jersey number,
    // so it is never silently read as a player.
    expect(parseFilmQuery("11 personnel").jerseyNumbers).toEqual([]);
    expect(parseFilmQuery("11 personnel").personnel).toEqual(["11"]);
  });

  it("combines terms across categories", () => {
    const filter = parseFilmQuery(
      "show me every explosive run vs Cover 3 from Trips Right",
    );
    expect(filter.explosive).toBe(true);
    expect(filter.family).toBe("run");
    expect(filter.coverages).toEqual(["Cover 3"]);
    expect(filter.formations).toEqual(["Trips Right"]);
    expect(filter.unrecognized).toEqual([]);
  });

  it("prefers the longest match, so 'Trips Right' does not become 'Trips'", () => {
    expect(parseFilmQuery("Trips Right").formations).toEqual(["Trips Right"]);
    expect(parseFilmQuery("trips").formations).toEqual(["Trips"]);
  });

  // The honesty requirement. A query that matched half of what was asked must
  // not look like a query that matched all of it.
  it("reports the words it could not place", () => {
    const filter = parseFilmQuery("show me every wildcat bubble from Trips Right");
    expect(filter.formations).toEqual(["Trips Right"]);
    expect(filter.unrecognized).toContain("wildcat");
    expect(filter.unrecognized).toContain("bubble");
    expect(filter.empty).toBe(false);
  });

  it("says plainly when it understood nothing", () => {
    const filter = parseFilmQuery("asdf qwerty");
    expect(filter.empty).toBe(true);
    expect(filter.unrecognized).toEqual(["asdf", "qwerty"]);
    expect(describeFilter(filter)).toBe("No football terms recognised in that search.");
  });

  it("treats an empty query as empty rather than as 'everything'", () => {
    expect(parseFilmQuery("").empty).toBe(true);
    expect(parseFilmQuery("   ").empty).toBe(true);
  });

  it("consumes every repeat of a phrase rather than leaving fragments behind", () => {
    const filter = parseFilmQuery("third down third down");
    expect(filter.down).toBe(3);
    expect(filter.unrecognized).toEqual([]);
  });

  // Both orderings of a two-pass matcher were wrong, each in its own way.
  // These two assertions are the regression.
  it("does not let a short term swallow part of a longer one", () => {
    // "Zone" is a coverage; "red zone" must still win.
    const redZone = parseFilmQuery("red zone");
    expect(redZone.redZone).toBe(true);
    expect(redZone.coverages).toEqual([]);
    // "right" is a direction; "Trips Right" must still win.
    const trips = parseFilmQuery("Trips Right");
    expect(trips.formations).toEqual(["Trips Right"]);
    expect(trips.direction).toBeUndefined();
  });

  it("reads quarters", () => {
    expect(parseFilmQuery("q3 turnovers").quarter).toBe(3);
    expect(parseFilmQuery("4th quarter").quarter).toBe(4);
  });

  it("is case- and punctuation-insensitive", () => {
    const filter = parseFilmQuery("COVER 3, INSIDE ZONE!");
    expect(filter.coverages).toEqual(["Cover 3"]);
    expect(filter.concepts).toEqual(["Inside Zone"]);
  });
});

describe("describeFilter", () => {
  it("echoes back what the search actually did", () => {
    const filter = parseFilmQuery("#24 explosive runs on third and long");
    const description = describeFilter(filter);
    expect(description).toContain("#24");
    expect(description).toContain("explosive");
    expect(description).toContain("runs");
    expect(description).toContain("3rd & long");
  });
});
