import { describe, expect, it } from "vitest";
import {
  classifySituation,
  distanceBucket,
  isExplosive,
  isGoalLine,
  isRedZone,
  isThirdDown,
  situationLabel,
  yardLineLabel,
} from "./situations";

describe("isExplosive", () => {
  it("uses the high-school thresholds by default: 12 run, 16 pass", () => {
    expect(isExplosive("run", 12)).toBe(true);
    expect(isExplosive("run", 11)).toBe(false);
    expect(isExplosive("pass", 16)).toBe(true);
    expect(isExplosive("pass", 15)).toBe(false);
  });

  it("uses a lower bar for youth football", () => {
    expect(isExplosive("run", 10, "youth")).toBe(true);
    expect(isExplosive("run", 10)).toBe(false);
  });

  // The whole point of the flag is that it is a claim from data. An untagged
  // play is not an explosive play and is not a non-explosive play; it is
  // untagged, and false is the only safe thing to store.
  it("is false when yardage or family is unknown", () => {
    expect(isExplosive("run", undefined)).toBe(false);
    expect(isExplosive(undefined, 40)).toBe(false);
    expect(isExplosive("special_teams", 40)).toBe(false);
  });

  it("never calls a loss explosive", () => {
    expect(isExplosive("run", -14)).toBe(false);
  });
});

describe("field position", () => {
  it("reads the red zone from the possessing team's perspective", () => {
    expect(isRedZone({ yardLine: 82, possession: "offense" })).toBe(true);
    expect(isRedZone({ yardLine: 79, possession: "offense" })).toBe(false);
    // Our defence on the field: the same number means the OPPONENT is close.
    expect(isRedZone({ yardLine: 18, possession: "defense" })).toBe(true);
    expect(isRedZone({ yardLine: 21, possession: "defense" })).toBe(false);
  });

  it("reads the goal line the same way", () => {
    expect(isGoalLine({ yardLine: 97, possession: "offense" })).toBe(true);
    expect(isGoalLine({ yardLine: 94, possession: "offense" })).toBe(false);
    expect(isGoalLine({ yardLine: 3, possession: "defense" })).toBe(true);
  });

  it("returns false rather than guessing when possession is not tagged", () => {
    expect(isRedZone({ yardLine: 90 })).toBe(false);
    expect(isGoalLine({ yardLine: 98 })).toBe(false);
  });
});

describe("classifySituation", () => {
  it("produces all four flags at once", () => {
    expect(
      classifySituation(
        { down: 3, distance: 8, yardLine: 85, possession: "offense" },
        { family: "pass", yards: 20 },
      ),
    ).toEqual({ explosive: true, redZone: true, thirdDown: true, goalLine: false });
  });

  it("flags nothing from an untagged play", () => {
    expect(classifySituation({}, {})).toEqual({
      explosive: false,
      redZone: false,
      thirdDown: false,
      goalLine: false,
    });
  });
});

describe("distanceBucket", () => {
  it("splits short / medium / long", () => {
    expect(distanceBucket(1)).toBe("short");
    expect(distanceBucket(3)).toBe("short");
    expect(distanceBucket(4)).toBe("medium");
    expect(distanceBucket(6)).toBe("medium");
    expect(distanceBucket(7)).toBe("long");
  });

  it("is null when distance is unknown", () => {
    expect(distanceBucket(undefined)).toBeNull();
  });
});

describe("labels", () => {
  it("writes down and distance the way a coach does", () => {
    expect(situationLabel({ down: 3, distance: 7 })).toBe("3rd & 7");
    expect(situationLabel({ down: 1, distance: 10 })).toBe("1st & 10");
    expect(situationLabel({ down: 2, distance: 0 })).toBe("2nd & Goal");
    expect(situationLabel({ down: 4 })).toBe("4th");
    expect(situationLabel({})).toBeNull();
  });

  it("writes the yard line the way a coach does", () => {
    expect(yardLineLabel(38, "offense")).toBe("Own 38");
    expect(yardLineLabel(88, "offense")).toBe("Opp 12");
    expect(yardLineLabel(50, "offense")).toBe("50");
    expect(yardLineLabel(undefined, "offense")).toBeNull();
    expect(yardLineLabel(120, "offense")).toBeNull();
  });
});

describe("isThirdDown", () => {
  it("is exactly third down", () => {
    expect(isThirdDown({ down: 3 })).toBe(true);
    expect(isThirdDown({ down: 4 })).toBe(false);
    expect(isThirdDown({})).toBe(false);
  });
});
