import { describe, expect, it } from "vitest";

import { codeMatches, decideAccess, deriveToken, isAllowed } from "./access";

describe("deriveToken", () => {
  it("is stable, so a phone stays unlocked across restarts", () => {
    expect(deriveToken("713904")).toBe(deriveToken("713904"));
  });

  it("is not the code itself", () => {
    expect(deriveToken("713904")).not.toContain("713904");
    expect(deriveToken("713904")).toHaveLength(64);
  });

  it("ignores surrounding whitespace, because a phone keyboard adds it", () => {
    expect(deriveToken(" 713904 ")).toBe(deriveToken("713904"));
  });

  it("separates different codes", () => {
    expect(deriveToken("713904")).not.toBe(deriveToken("713905"));
  });
});

describe("decideAccess", () => {
  it("is unguarded when no code is set", () => {
    // The default `next start` binds to localhost; the operating system is the
    // door. The launcher writes a code before binding any wider.
    expect(decideAccess({ configuredCode: "", cookieToken: "" })).toEqual({
      state: "unguarded",
    });
  });

  it("treats whitespace-only as no code", () => {
    expect(decideAccess({ configuredCode: "   \n", cookieToken: "" }).state).toBe(
      "unguarded",
    );
  });

  it("locks a visitor with no token once a code is set", () => {
    const state = decideAccess({ configuredCode: "713904", cookieToken: "" });
    expect(state.state).toBe("locked");
  });

  it("locks a visitor with the wrong token", () => {
    const state = decideAccess({
      configuredCode: "713904",
      cookieToken: deriveToken("000000"),
    });
    expect(state.state).toBe("locked");
  });

  it("locks a visitor who presents the raw code instead of the token", () => {
    // The cookie holds a hash. Sending the code where the token goes must not
    // work, or the hash would be decoration.
    expect(
      decideAccess({ configuredCode: "713904", cookieToken: "713904" }).state,
    ).toBe("locked");
  });

  it("opens for the right token", () => {
    expect(
      decideAccess({
        configuredCode: "713904",
        cookieToken: deriveToken("713904"),
      }).state,
    ).toBe("open");
  });

  it("requires the code from every visitor, including this machine", () => {
    // There is deliberately no host or address input. A check that reads the
    // Host header can be turned off by anything on the network that sends
    // `Host: localhost`, so there is no exemption to get wrong.
    const locked = decideAccess({ configuredCode: "713904", cookieToken: "" });
    expect(locked.state).toBe("locked");
    expect(isAllowed(locked)).toBe(false);
  });

  it("allows unguarded and open, and only those", () => {
    expect(isAllowed({ state: "unguarded" })).toBe(true);
    expect(isAllowed({ state: "open" })).toBe(true);
    expect(isAllowed({ state: "locked", reason: "no" })).toBe(false);
  });
});

describe("codeMatches", () => {
  it("matches the configured code", () => {
    expect(codeMatches("713904", "713904")).toBe(true);
    expect(codeMatches("713904", " 713904 ")).toBe(true);
  });

  it("rejects a wrong code", () => {
    expect(codeMatches("713904", "713905")).toBe(false);
    expect(codeMatches("713904", "")).toBe(false);
  });

  it("never matches when no code is configured", () => {
    // Otherwise an empty code file would let an empty form submission in.
    expect(codeMatches("", "")).toBe(false);
    expect(codeMatches("  ", "anything")).toBe(false);
  });

  it("compares codes of different lengths without throwing", () => {
    expect(codeMatches("713904", "7")).toBe(false);
    expect(codeMatches("7", "713904")).toBe(false);
  });
});
