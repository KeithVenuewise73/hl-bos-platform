import { describe, expect, it } from "vitest";
import {
  CastError,
  addReference,
  buildCast,
  describeForPrompt,
  keepOnly,
  labelFor,
  memberIds,
  referenceMap,
} from "./cast.js";

const attestation = { adultConfirmed: true, permissionConfirmed: true };

function detected(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    referencePath: `u/c/${i}.jpg`,
    sortOrder: n - i, // deliberately reversed, to prove sorting happens
  }));
}

describe("buildCast", () => {
  it("assigns stable ids left to right regardless of input order", () => {
    const cast = buildCast("c1", detected(4), attestation);
    expect(memberIds(cast)).toEqual(["person_a", "person_b", "person_c", "person_d"]);
    // sortOrder 1 was the leftmost, so it must be Person A.
    expect(cast.members[0]?.referencePaths[0]).toBe("u/c/3.jpg");
  });

  it("is reproducible: the same photograph gives the same ids", () => {
    const a = buildCast("c1", detected(5), attestation);
    const b = buildCast("c1", detected(5), attestation);
    expect(memberIds(a)).toEqual(memberIds(b));
  });

  it("labels members Person A..Person H", () => {
    const cast = buildCast("c1", detected(3), attestation);
    expect(cast.members.map((m) => m.label)).toEqual([
      "Person A",
      "Person B",
      "Person C",
    ]);
  });

  it("refuses fewer than two or more than eight subjects", () => {
    expect(() => buildCast("c1", detected(1), attestation)).toThrow(CastError);
    expect(() => buildCast("c1", detected(9), attestation)).toThrow(CastError);
    expect(() => buildCast("c1", detected(8), attestation)).not.toThrow();
  });

  it("carries the attestation onto the cast rather than assuming it", () => {
    const cast = buildCast("c1", detected(2), {
      adultConfirmed: true,
      permissionConfirmed: false,
    });
    expect(cast.permissionConfirmed).toBe(false);
  });
});

describe("keepOnly", () => {
  it("does not renumber the survivors", () => {
    const cast = buildCast("c1", detected(5), attestation);
    const kept = keepOnly(cast, ["person_a", "person_c", "person_e"]);
    // The critical assertion: Person C is still person_c. Renumbering would
    // repoint every stored scene and interaction at a different human being.
    expect(memberIds(kept)).toEqual(["person_a", "person_c", "person_e"]);
  });

  it("refuses to leave fewer than two people in the story", () => {
    const cast = buildCast("c1", detected(3), attestation);
    expect(() => keepOnly(cast, ["person_a"])).toThrow(CastError);
  });
});

describe("describeForPrompt", () => {
  it("omits traits the photograph did not show instead of inventing them", () => {
    const cast = buildCast("c1", detected(2), attestation);
    const line = describeForPrompt(cast.members[0]!);
    expect(line).toContain("preserve exactly as shown");
    expect(line).not.toMatch(/\b(mid-thirties|athletic|brown hair)\b/);
  });

  it("states only the traits that are present", () => {
    const cast = buildCast(
      "c1",
      [
        {
          referencePath: "u/c/0.jpg",
          sortOrder: 0,
          appearance: { hair: "short dark hair" },
        },
        { referencePath: "u/c/1.jpg", sortOrder: 1 },
      ],
      attestation,
    );
    const line = describeForPrompt(cast.members[0]!);
    expect(line).toContain("short dark hair");
    expect(line).not.toContain("build");
  });

  it("says how many reference images back each character", () => {
    const cast = buildCast("c1", detected(2), attestation);
    expect(describeForPrompt(cast.members[0]!)).toContain("1 reference image supplied");
  });
});

describe("references", () => {
  it("adds a reference without duplicating it", () => {
    let cast = buildCast("c1", detected(2), attestation);
    cast = addReference(cast, "person_a", "u/c/extra.jpg");
    cast = addReference(cast, "person_a", "u/c/extra.jpg");
    expect(cast.members[0]?.referencePaths).toHaveLength(2);
  });

  it("caps references per member", () => {
    let cast = buildCast("c1", detected(2), attestation);
    for (let i = 0; i < 4; i += 1) cast = addReference(cast, "person_a", `x${i}.jpg`);
    expect(() => addReference(cast, "person_a", "one-too-many.jpg")).toThrow(CastError);
  });

  it("maps every member to its references for the generator", () => {
    const cast = buildCast("c1", detected(3), attestation);
    expect(Object.keys(referenceMap(cast))).toEqual([
      "person_a",
      "person_b",
      "person_c",
    ]);
  });
});

describe("labelFor", () => {
  it("renders the user-facing label", () => {
    expect(labelFor("person_d")).toBe("Person D");
  });
});
