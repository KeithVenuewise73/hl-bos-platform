import { describe, it, expect } from "vitest";
import {
  optionsFor,
  classifyRootCause,
  recommend,
  type TransformationOption,
} from "./reasoning";

const NUM = /\$\s?\d|\d+\s?%|\b\d+\s*(rankings?|leads?|visitors?|conversions?|roi)\b/i;

describe("classifyRootCause", () => {
  it("marks an evidence-backed cause Inferred, never Verified", () => {
    const c = classifyRootCause("No repeatable lead-generation system", true);
    expect(c.certainty).toBe("Inferred");
    expect(c.statement).toContain("lead-generation");
  });
  it("marks a bare-rating cause as Discovery required", () => {
    expect(classifyRootCause("something", false).certainty).toBe("Discovery required");
  });
});

describe("recommend", () => {
  const lead = optionsFor("lead_generation"); // 3 options: depth 1,2,3
  const ctx = (over: Partial<Parameters<typeof recommend>[3]> = {}) => ({
    rootCause: "No repeatable lead-generation system",
    successMetrics: ["Qualified leads/month", "Cost per lead"],
    fallbackAction: "Fix the thing",
    ...over,
  });

  it("returns a single-path recommendation (with measurement) when there are no options", () => {
    const r = recommend([], 3, "High", ctx());
    expect(r.mode).toBe("single");
    if (r.mode === "single") expect(r.measurement.length).toBeGreaterThan(0);
  });

  it("returns discovery-required when confidence is Low", () => {
    expect(recommend(lead, 4, "Low", ctx()).mode).toBe("discovery");
  });

  it("does not invent alternatives for a one-option finding", () => {
    const one = optionsFor("security");
    expect(one.length).toBe(1);
    const r = recommend(
      one,
      4,
      "High",
      ctx({ successMetrics: ["Findings remediated"] }),
    );
    expect(r.mode).toBe("selected");
    if (r.mode === "selected") {
      expect(r.whyNotLighter).toBe("");
      expect(r.optionTitle).toBe(one[0]!.title);
    }
  });

  it("why-not-lighter and why-not-heavier are specific to the actual options", () => {
    const r = recommend(lead, 3, "High", ctx()); // chooses depth-2
    expect(r.mode).toBe("selected");
    if (r.mode === "selected") {
      // Lighter = "Add an inquiry or booking path" → its own trade-off text.
      expect(r.whyNotLighter).toContain("Add an inquiry or booking path");
      // Heavier = "Full customer-acquisition system" → its own dependency text.
      expect(r.whyNotHeavier).toContain("Full customer-acquisition system");
      expect(r.whyNotHeavier.toLowerCase()).toContain("crm adoption");
      // A leading acronym stays intact when the fragment flows mid-sentence.
      expect(r.whyNotHeavier).toContain("CRM adoption");
      expect(r.whyNotHeavier).not.toContain("cRM");
      // No generic wrapper.
      expect(r.whyNotLighter.toLowerCase()).not.toContain("leave part of the gap open");
    }
  });

  it("the why references this finding's specific evidence", () => {
    const r = recommend(
      lead,
      3,
      "High",
      ctx({ evidenceHint: "No form found — no on-page lead capture" }),
    );
    if (r.mode === "selected") expect(r.why).toContain("No form found");
  });

  it("reads grammatically — a 'Fits when' rationale gets a subject, never 'because fits'", () => {
    const r = recommend(lead, 3, "High", ctx());
    if (r.mode === "selected") {
      expect(r.why).not.toMatch(/because fits\b/i);
      expect(r.why.toLowerCase()).toContain("because it fits when");
    }
  });

  it("names what evidence could change the recommendation", () => {
    const r = recommend(lead, 3, "High", ctx());
    if (r.mode === "selected")
      expect(r.changeTrigger.toLowerCase()).toMatch(/would justify|discovery|already/);
  });

  it("an aligned goal changes the prose; an unrelated operational goal triggers a discovery caveat", () => {
    const aligned = recommend(
      lead,
      2,
      "High",
      ctx({
        goal: {
          desiredState: "a steady flow of new customers",
          observable: true,
          aligned: true,
        },
      }),
    );
    const operational = recommend(
      lead,
      2,
      "High",
      ctx({
        goal: { desiredState: "lower labor cost", observable: false, aligned: false },
      }),
    );
    if (aligned.mode === "selected")
      expect(aligned.why.toLowerCase()).toContain("a steady flow of new customers");
    if (operational.mode === "selected")
      expect(operational.why.toLowerCase()).toContain(
        "operational discovery is required",
      );
    // The two must not read identically.
    if (aligned.mode === "selected" && operational.mode === "selected")
      expect(aligned.why).not.toBe(operational.why);
  });

  it("classifies each success metric by how it can be observed", () => {
    const r = recommend(lead, 3, "High", ctx());
    if (r.mode === "selected") {
      const byMetric = Object.fromEntries(
        r.measurement.map((m) => [m.metric, m.source]),
      );
      expect(byMetric["Cost per lead"]).toBe("Client data required");
      const struct = recommend(
        optionsFor("ai_search_optimization"),
        4,
        "High",
        ctx({
          successMetrics: ["AI-answer citations", "Structured-data coverage"],
        }),
      );
      if (struct.mode === "selected") {
        const m = Object.fromEntries(
          struct.measurement.map((x) => [x.metric, x.source]),
        );
        expect(m["Structured-data coverage"]).toBe("Available now");
        expect(m["AI-answer citations"]).toBe("Instrumentation required");
      }
    }
  });
});

describe("option catalog honesty", () => {
  const dims = [
    "security",
    "seo",
    "ai_search_optimization",
    "google_business_profile",
    "social_media",
    "content",
    "conversion",
    "lead_generation",
    "website",
    "technology_stack",
  ];
  const all: TransformationOption[] = dims.flatMap((d) => optionsFor(d));

  it("never fabricates a number in any option", () => {
    for (const o of all) {
      for (const s of [
        o.whatChanges,
        o.whyFit,
        o.expectedOutcome,
        o.tradeoffs,
        o.dependencies,
      ]) {
        expect(s, `${o.title}: ${s}`).not.toMatch(NUM);
      }
    }
  });

  it("does not force three options — security has exactly one credible path", () => {
    expect(optionsFor("security").length).toBe(1);
    for (const d of dims) expect(optionsFor(d).length).toBeLessThanOrEqual(3);
  });

  it("options within a dimension are materially different (distinct title + depth)", () => {
    for (const d of dims) {
      const os = optionsFor(d);
      if (os.length > 1) {
        expect(new Set(os.map((o) => o.title)).size).toBe(os.length);
        expect(new Set(os.map((o) => o.depth)).size).toBe(os.length);
      }
    }
  });

  it("every option requires at least one capability to execute (no empty upsell)", () => {
    for (const o of all) expect(o.capabilities.length).toBeGreaterThan(0);
  });
});
