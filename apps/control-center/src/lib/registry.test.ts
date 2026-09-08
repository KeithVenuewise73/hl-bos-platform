import { describe, it, expect } from "vitest";
import { PORTFOLIO, PORTFOLIO_NOTE, type Product } from "./registry";

/**
 * The portfolio card is the CEO's home screen. Principle 10 forbids inventing
 * operational metrics, and the operating contract forbids a control that reads
 * as protection it does not provide. These tests encode the honesty rules that
 * the registry's own doc comment states, so a future edit cannot quietly break
 * them -- the previous version of this file had no test and drifted for weeks,
 * omitting several products that had shipped code.
 */

const byStage = (s: Product["stage"]) => PORTFOLIO.filter((p) => p.stage === s);

describe("the portfolio never invents a product's health", () => {
  it("gives every product a non-empty plain-English status", () => {
    for (const p of PORTFOLIO) {
      expect(p.name.trim(), `${p.name} has no name`).toBeTruthy();
      expect(p.status.trim().length, `${p.name} has no status`).toBeGreaterThan(0);
    }
  });

  it("never shows a placeholder version number", () => {
    // `version` exists for the day something really ships. Until then it is null
    // for every product -- a "v1.0" next to undeployed software is a lie.
    for (const p of PORTFOLIO) expect(p.version, p.name).toBeNull();
  });

  it("lists each product exactly once", () => {
    const names = PORTFOLIO.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("stage and location cannot contradict each other", () => {
  it("a product that has not started has nowhere for its code to live", () => {
    for (const p of byStage("not-started")) {
      expect(p.location, `${p.name} is not-started but claims a location`).toBeNull();
    }
  });

  it("a product past not-started names where its code actually is", () => {
    for (const p of PORTFOLIO) {
      if (p.stage === "not-started") continue;
      expect(
        p.location?.trim(),
        `${p.name} is ${p.stage} but names no code`,
      ).toBeTruthy();
    }
  });

  it("says plainly that a not-started product has no code", () => {
    for (const p of byStage("not-started")) {
      // Accepts a qualified denial too ("no HL-BOS code yet"), but still requires
      // the word "no" to govern "code" in the same sentence.
      expect(p.status.toLowerCase(), p.name).toMatch(/\bno\b[^.]*\bcode\b/);
    }
  });
});

describe("the four products the CEO asked about are all represented", () => {
  const find = (needle: string) =>
    PORTFOLIO.find((p) => p.name.toLowerCase().includes(needle.toLowerCase()));

  it("names the HSCS consultation website, and does not call it live", () => {
    const p = find("HSCS Consultation Website");
    expect(p).toBeDefined();
    expect(p!.stage).not.toBe("production");
  });

  it("names the Business Transformation product", () => {
    expect(find("Business Transformation Intelligence")).toBeDefined();
  });

  it("carries the two undefined items as not-started, not as progress", () => {
    for (const needle of ["Delivery Service Provider course", "OSPlatform"]) {
      const p = find(needle);
      expect(p, needle).toBeDefined();
      expect(p!.stage, needle).toBe("not-started");
      expect(p!.location, needle).toBeNull();
    }
  });
});

describe("the note that frames the card", () => {
  it("warns that 'development' does not mean a customer can use it", () => {
    expect(PORTFOLIO_NOTE).toMatch(/deployed/i);
  });
});
