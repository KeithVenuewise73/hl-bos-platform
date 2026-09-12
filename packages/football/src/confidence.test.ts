import { describe, expect, it } from "vitest";
import { canAutoConfirm, describeConfidence } from "./confidence";

describe("describeConfidence", () => {
  it("bands the score rather than showing false precision", () => {
    expect(describeConfidence(0.91).band).toBe("high");
    expect(describeConfidence(0.72).band).toBe("moderate");
    expect(describeConfidence(0.4).band).toBe("low");
  });

  it("still gives a whole percent for the one place a number helps", () => {
    expect(describeConfidence(0.826).percent).toBe(83);
  });

  it("clamps a score outside [0,1] instead of rendering it", () => {
    expect(describeConfidence(1.4).percent).toBe(100);
    expect(describeConfidence(-2).percent).toBe(0);
  });

  // Even at 99%, the guidance says "confirm". That is the product's position
  // and it is tested so a later change to the copy has to be deliberate.
  it("never tells a coach a suggestion is settled", () => {
    expect(describeConfidence(0.99).guidance).toContain("Confirm");
  });
});

describe("canAutoConfirm", () => {
  it("is false, always", () => {
    expect(canAutoConfirm()).toBe(false);
  });
});
