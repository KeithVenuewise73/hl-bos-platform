import { describe, expect, it } from "vitest";

import {
  type EventTeams,
  jerseyConflict,
  otherShade,
  parseJerseyShade,
  suggestOtherJersey,
  teamSideFor,
} from "./teams.ts";

const caz: EventTeams = { homeJersey: "dark", awayJersey: "light", hasAwayTeam: true };

describe("teamSideFor: TEAM + NUMBER, not number", () => {
  it("puts a dark #22 with the dark team and a light #22 with the light team", () => {
    expect(teamSideFor("dark", caz)).toBe("home");
    expect(teamSideFor("light", caz)).toBe("away");
  });

  it("follows the event's colors, whichever side wears which", () => {
    const flipped: EventTeams = { ...caz, homeJersey: "light", awayJersey: "dark" };
    expect(teamSideFor("dark", flipped)).toBe("away");
    expect(teamSideFor("light", flipped)).toBe("home");
  });

  it("never guesses a team for a jersey it could not see, in a two-team game", () => {
    expect(teamSideFor(null, caz)).toBeNull();
  });

  it("never guesses when the event's colors are not set yet", () => {
    const unset: EventTeams = { homeJersey: null, awayJersey: null, hasAwayTeam: true };
    expect(teamSideFor("dark", unset)).toBeNull();
    expect(teamSideFor(null, unset)).toBeNull();
  });

  it("keeps how one-team events always worked: the event's team", () => {
    const legacy: EventTeams = {
      homeJersey: null,
      awayJersey: null,
      hasAwayTeam: false,
    };
    expect(teamSideFor(null, legacy)).toBe("home");
    expect(teamSideFor("dark", legacy)).toBe("home");
  });

  it("does not give a one-team event the opponent's athletes", () => {
    // Home wears dark; the opponent (no roster) wears light.
    const oneTeam: EventTeams = {
      homeJersey: "dark",
      awayJersey: "light",
      hasAwayTeam: false,
    };
    expect(teamSideFor("dark", oneTeam)).toBe("home");
    expect(teamSideFor("light", oneTeam)).toBeNull();
    const homeOnly: EventTeams = {
      homeJersey: "dark",
      awayJersey: null,
      hasAwayTeam: false,
    };
    expect(teamSideFor("light", homeOnly)).toBeNull();
    expect(teamSideFor(null, homeOnly)).toBe("home");
  });
});

describe("jersey settings", () => {
  it("reads only light or dark", () => {
    expect(parseJerseyShade("light")).toBe("light");
    expect(parseJerseyShade("dark")).toBe("dark");
    expect(parseJerseyShade("unknown")).toBeNull();
    expect(parseJerseyShade("")).toBeNull();
    expect(parseJerseyShade(undefined)).toBeNull();
  });

  it("suggests the opposite shade for the other team", () => {
    expect(otherShade("light")).toBe("dark");
    expect(suggestOtherJersey("dark")).toBe("light");
    expect(suggestOtherJersey(null)).toBeNull();
  });

  it("refuses two teams in the same shade, and says why", () => {
    expect(jerseyConflict("light", "light")).toContain("Both teams are set to light");
    expect(jerseyConflict("dark", "light")).toBeNull();
    expect(jerseyConflict(null, null)).toBeNull();
    expect(jerseyConflict("dark", null)).toBeNull();
  });
});
