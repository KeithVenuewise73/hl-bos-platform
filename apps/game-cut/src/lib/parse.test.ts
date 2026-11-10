import { describe, expect, it } from "vitest";

import { asPadding, asPath, asQuality, asQuietCut, asTimesText } from "./parse.ts";

describe("reading what the page sent", () => {
  it("takes full Windows, network and Unix paths, and refuses anything else", () => {
    expect(asPath("D:\\Hockey Videos\\IMG_0056.MOV")).toBe(
      "D:\\Hockey Videos\\IMG_0056.MOV",
    );
    expect(asPath("  d:/a/b.mov ")).toBe("d:/a/b.mov");
    expect(asPath("\\\\nas\\share\\a.mov")).toBe("\\\\nas\\share\\a.mov");
    expect(asPath("/home/a.mov")).toBe("/home/a.mov");
    for (const bad of ["", "  ", "relative\\a.mov", "a.mov", null, undefined, 5, {}])
      expect(asPath(bad)).toBeNull();
  });

  it("quality is draft only when asked; anything else is full", () => {
    expect(asQuality("draft")).toBe("draft");
    for (const v of ["full", "DRAFT", "", null, undefined, 3])
      expect(asQuality(v)).toBe("full");
  });

  it("the quiet-cut choice is a sensible number of seconds, 'never', or the default 90", () => {
    expect(asQuietCut(30)).toBe(30);
    expect(asQuietCut("never")).toBeNull();
    expect(asQuietCut(null)).toBeNull();
    for (const v of [5, 99999, "x", undefined, Number.NaN, -3])
      expect(asQuietCut(v)).toBe(90);
  });

  it("padding is 0 to 120 seconds, else the fallback", () => {
    expect(asPadding(0, 8)).toBe(0);
    expect(asPadding(12, 8)).toBe(12);
    for (const v of [-1, 121, "5", null, Number.NaN]) expect(asPadding(v, 8)).toBe(8);
  });

  it("the list of times is text of a sensible size", () => {
    expect(asTimesText("12:34 hit")).toBe("12:34 hit");
    expect(asTimesText("x".repeat(20_001))).toBeNull();
    expect(asTimesText(5)).toBeNull();
  });
});
