import { describe, it, expect } from "vitest";
import { validateIntake, nextStepFor, referenceFor } from "./intake";

const valid = {
  kind: "visibility_assessment" as const,
  businessName: "Acme Co",
  website: "https://acme.example",
  industry: "Logistics",
  contactName: "Dana Lee",
  email: "dana@acme.example",
  phone: "",
  goals: "Grow inbound",
  challenges: "Low visibility",
  consent: true,
  source: { utm_source: "linkedin" },
};

describe("assessment intake validation", () => {
  it("accepts a complete submission and builds a lead record", () => {
    const r = validateIntake(valid);
    expect(r.ok).toBe(true);
    expect(r.lead?.organization.name).toBe("Acme Co");
    expect(r.lead?.contact.email).toBe("dana@acme.example");
    // Source attribution is preserved end-to-end.
    expect(r.lead?.attribution["utm_source"]).toBe("linkedin");
  });

  it("records the assessment as REQUESTED — never completed (Principle 10)", () => {
    const r = validateIntake(valid);
    expect(r.lead?.assessment.status).toBe("requested");
    expect(nextStepFor("visibility_assessment").toLowerCase()).not.toContain(
      "results are ready now",
    );
  });

  it("rejects missing required fields", () => {
    const r = validateIntake({ ...valid, businessName: "", contactName: "" });
    expect(r.ok).toBe(false);
    expect(r.lead).toBeNull();
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects an invalid email", () => {
    const r = validateIntake({ ...valid, email: "not-an-email" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/valid email/i);
  });

  it("requires consent", () => {
    const r = validateIntake({ ...valid, consent: false });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/consent/i);
  });

  it("produces a stable, clock-free reference id", () => {
    const a = referenceFor(validateIntake(valid).lead!);
    const b = referenceFor(validateIntake(valid).lead!);
    expect(a).toBe(b);
    expect(a).toMatch(/^HLD-/);
  });
});
