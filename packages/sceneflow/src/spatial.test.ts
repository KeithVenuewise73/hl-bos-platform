import { describe, expect, it } from "vitest";
import {
  closeDistance,
  defaultSpatialMap,
  isBackground,
  place,
  renderSpatialMap,
  validateSpatialMap,
} from "./spatial";
import { labelFor } from "./cast";
import type { CastMemberId } from "./types";

describe("defaultSpatialMap", () => {
  it("puts a couple side by side, not at opposite edges", () => {
    expect(defaultSpatialMap(["person_a", "person_b"])).toEqual({
      person_a: "center-left",
      person_b: "center-right",
    });
  });

  it("fills outwards from the centre for a group", () => {
    const map = defaultSpatialMap(["person_a", "person_b", "person_c", "person_d"]);
    expect(map["person_a"]).toBe("center");
    expect(map["person_b"]).toBe("center-left");
    expect(map["person_c"]).toBe("center-right");
  });

  it("places a cast of eight without dropping anyone", () => {
    const cast: CastMemberId[] = [
      "person_a",
      "person_b",
      "person_c",
      "person_d",
      "person_e",
      "person_f",
      "person_g",
      "person_h",
    ];
    const map = defaultSpatialMap(cast);
    expect(Object.keys(map)).toHaveLength(8);
    expect(isBackground(map["person_h"]!)).toBe(true);
  });
});

describe("validateSpatialMap", () => {
  const cast: CastMemberId[] = ["person_a", "person_b"];

  it("passes a complete map", () => {
    expect(validateSpatialMap(defaultSpatialMap(cast), cast)).toEqual([]);
  });

  it("reports someone who is not in the cast", () => {
    const issues = validateSpatialMap(
      { person_a: "left", person_b: "right", person_h: "center" },
      cast,
    );
    expect(issues.map((i) => i.code)).toContain("unknown_member");
  });

  it("reports a cast member with nowhere to stand", () => {
    const issues = validateSpatialMap({ person_a: "left" }, cast);
    expect(issues.map((i) => i.code)).toContain("missing_placement");
  });

  it("allows three in one slot but flags a fourth", () => {
    const three: CastMemberId[] = ["person_a", "person_b", "person_c"];
    expect(
      validateSpatialMap(
        { person_a: "center", person_b: "center", person_c: "center" },
        three,
      ),
    ).toEqual([]);

    const four: CastMemberId[] = [...three, "person_d"];
    const issues = validateSpatialMap(
      {
        person_a: "center",
        person_b: "center",
        person_c: "center",
        person_d: "center",
      },
      four,
    );
    expect(issues.map((i) => i.code)).toContain("slot_overcrowded");
  });
});

describe("renderSpatialMap", () => {
  it("writes the back row and the front row, each left to right", () => {
    const text = renderSpatialMap(
      {
        person_a: "right",
        person_b: "far-left",
        person_c: "background-center",
      },
      labelFor,
    );
    expect(text.split("\n")[0]).toBe("BACK: Person C background-center");
    expect(text.split("\n")[1]).toBe("FRONT: Person B far-left, Person A right");
  });

  it("omits an empty row", () => {
    const text = renderSpatialMap({ person_a: "center" }, labelFor);
    expect(text).toBe("FRONT: Person A center");
  });
});

describe("moving people", () => {
  it("moves one subject and leaves the rest alone", () => {
    const before = defaultSpatialMap(["person_a", "person_b"]);
    const after = place(before, "person_a", "far-left");
    expect(after["person_a"]).toBe("far-left");
    expect(after["person_b"]).toBe(before["person_b"]);
  });

  it("brings the focus characters together towards the centre", () => {
    const before = { person_a: "far-left", person_d: "far-right" } as const;
    const after = closeDistance(before, ["person_a", "person_d"]);
    expect(after["person_a"]).toBe("center-left");
    expect(after["person_d"]).toBe("center");
  });
});
