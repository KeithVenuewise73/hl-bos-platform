import { describe, expect, it } from "vitest";
import { lbs, miles, parseNumberInput, perMile, usd } from "./format";

describe("format", () => {
  it("formats money, including losses", () => {
    expect(usd(1450)).toBe("$1,450");
    expect(usd(-27.5, 2)).toBe("−$27.50");
    expect(perMile(3.75)).toBe("$3.75/mi");
  });
  it("formats distance and weight", () => {
    expect(miles(1249.6)).toBe("1,250 mi");
    expect(lbs(48000)).toBe("48,000 lb");
  });
  it("refuses to turn junk into a number", () => {
    expect(parseNumberInput("$1,200")).toBe(1200);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("abc")).toBeNull();
  });
});
