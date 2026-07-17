import { describe, expect, it } from "vitest";
import { DOT, LABEL, type Health } from "./index.js";

const ALL: readonly Health[] = ["green", "yellow", "red", "unknown"];

describe("shared status vocabulary", () => {
  it("has a color for every status", () => {
    for (const h of ALL) {
      expect(DOT[h]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("has a non-empty human label for every status", () => {
    for (const h of ALL) {
      expect(LABEL[h].length).toBeGreaterThan(0);
    }
  });

  it("labels never leak a raw status name", () => {
    for (const h of ALL) {
      expect(LABEL[h].toLowerCase()).not.toBe(h);
    }
  });
});
