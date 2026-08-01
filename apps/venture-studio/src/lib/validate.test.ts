import { describe, it, expect } from "vitest";
import {
  validateOpportunity,
  validateEvidenceType,
  validateDecision,
  isHttpUrl,
} from "./validate";

describe("opportunity validation", () => {
  it("requires a title of at least 3 chars", () => {
    const r = validateOpportunity({ title: "ab" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("Title"))).toBe(true);
  });

  it("accepts a valid opportunity and trims fields", () => {
    const r = validateOpportunity({
      title: "  Real idea  ",
      summary: " x ",
      tags: ["a", " b ", ""],
    });
    expect(r.ok).toBe(true);
    expect(r.value?.title).toBe("Real idea");
    expect(r.value?.tags).toEqual(["a", "b"]);
  });

  it("rejects a malformed source URL", () => {
    const r = validateOpportunity({
      title: "Valid",
      source_url: "javascript:alert(1)",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("URL"))).toBe(true);
  });

  it("rejects an invalid opportunity type", () => {
    const r = validateOpportunity({ title: "Valid", opportunity_type: "nonsense" });
    expect(r.ok).toBe(false);
  });
});

describe("url + enum validators", () => {
  it("isHttpUrl accepts http/https only", () => {
    expect(isHttpUrl("https://x.com")).toBe(true);
    expect(isHttpUrl("http://x.com")).toBe(true);
    expect(isHttpUrl("ftp://x.com")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });
  it("validateEvidenceType gates the enum", () => {
    expect(validateEvidenceType("verified_fact")).toBe("verified_fact");
    expect(validateEvidenceType("hearsay")).toBeNull();
  });
  it("validateDecision gates the enum", () => {
    expect(validateDecision("build")).toBe("build");
    expect(validateDecision("nuke")).toBeNull();
  });
});
