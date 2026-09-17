import { describe, expect, it } from "vitest";
import { makeFact } from "./career-facts.ts";
import { isExportable, validateClaim } from "./claims.ts";

const PROFILE = "11111111-1111-4111-8111-111111111111";

const bullet = makeFact(PROFILE, {
  category: "accomplishment",
  source: "resume",
  text: "Led middle-mile operations supporting 85 daily routes and 11 independent contractors while maintaining 98.5% on-time performance.",
  context: "Meridian Logistics Group — Senior Operations Manager",
});

describe("validateClaim — the guardrail", () => {
  it("verifies a sentence that only restates its evidence", () => {
    const verdict = validateClaim(
      "Led middle-mile operations supporting 85 daily routes.",
      { evidence: [bullet] },
    );
    expect(verdict.status).toBe("verified");
  });

  it("refuses a sentence with no evidence attached at all", () => {
    const verdict = validateClaim("Managed a national fleet.", { evidence: [] });
    expect(verdict.status).toBe("unsupported");
  });

  it("refuses an inflated number", () => {
    // The evidence says 85 routes. This says 850.
    const verdict = validateClaim(
      "Led middle-mile operations supporting 850 daily routes.",
      { evidence: [bullet] },
    );
    expect(verdict.status).toBe("unsupported");
    expect(verdict.notes.join(" ")).toContain("850");
  });

  it("refuses a number that is merely absent from the evidence", () => {
    const verdict = validateClaim(
      "Led operations across 85 routes and a $40M budget.",
      { evidence: [bullet] },
    );
    expect(verdict.status).toBe("unsupported");
    expect(verdict.notes.join(" ")).toContain("40m");
  });

  it("flags an unsupported skill rather than accepting or deleting it", () => {
    const verdict = validateClaim(
      "Led middle-mile operations and implemented SAP across the network.",
      { evidence: [bullet] },
    );
    expect(verdict.status).toBe("needs_confirmation");
    expect(verdict.notes.join(" ")).toContain("sap");
    expect(isExportable({ validation: verdict.status } as never)).toBe(false);
  });

  it("accepts licensed terminology, because the analysis proved the work", () => {
    const verdict = validateClaim(
      "Fleet and transportation operations — led middle-mile operations supporting 85 daily routes.",
      { evidence: [bullet], licensedTerms: ["fleet and transportation operations"] },
    );
    expect(verdict.status).toBe("verified");
  });

  it("does not accept terminology that was never licensed", () => {
    const verdict = validateClaim(
      "Aviation ground operations — led middle-mile operations supporting 85 daily routes.",
      { evidence: [bullet], licensedTerms: ["fleet and transportation operations"] },
    );
    expect(verdict.status).toBe("needs_confirmation");
  });

  it("marks a claim built on a user-supplied fact as user-confirmed", () => {
    const confirmed = makeFact(PROFILE, {
      category: "certification",
      source: "user_confirmed",
      text: "Certified Transportation Professional (CTP).",
    });
    const verdict = validateClaim("Certified Transportation Professional.", {
      evidence: [confirmed],
    });
    expect(verdict.status).toBe("user_confirmed");
    expect(isExportable({ validation: verdict.status } as never)).toBe(true);
  });
});
