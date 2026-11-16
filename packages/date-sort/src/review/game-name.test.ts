import { describe, expect, it } from "vitest";

import { gameNameFor } from "./game-name";

describe("the name a folder gets on the website", () => {
  it("keeps a typed name, trimmed", () => {
    expect(gameNameFor("  Caz vs Wheatfield ", "2026-11-14")).toBe("Caz vs Wheatfield");
  });

  it("names an unnamed folder after its date, so a send is never blocked", () => {
    expect(gameNameFor("", "2026-11-14")).toBe("Photos from November 14, 2026");
    expect(gameNameFor("   ", "2026-01-09")).toBe("Photos from January 9, 2026");
  });

  it("never exceeds 200 characters", () => {
    expect(gameNameFor("x".repeat(500), "2026-11-14")).toHaveLength(200);
  });

  it("still gives a name for an odd date", () => {
    expect(gameNameFor("", "not-a-date")).toBe("Photos from not-a-date");
  });
});
