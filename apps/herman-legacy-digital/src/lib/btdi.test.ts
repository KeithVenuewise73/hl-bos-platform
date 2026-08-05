import { describe, it, expect } from "vitest";
import {
  validateBtdi,
  referenceFor,
  confirmationMessage,
  INTERNAL_NEXT_STEP,
  BTDI_SECTIONS,
  MAX_TEXT,
  type BtdiInput,
} from "./btdi";

// A minimal submission that satisfies every required field in the catalog.
function validInput(overrides: Partial<BtdiInput> = {}): BtdiInput {
  const base: BtdiInput = {
    businessName: "Acme Logistics",
    primaryContact: "Dana Lee",
    contactTitle: "Owner",
    email: "Dana@Acme.Example",
    phone: "555-0100",
    location: "Tulsa, OK",
    industry: "Logistics",
    employeeCount: "12",
    yearEstablished: "2015",
    businessStage: "3–10 years",
    businessDescription: "Regional freight brokerage.",
    topChallenges: "Time, visibility, hiring.",
    goals90Day: "Book 20 discovery calls.",
    consentPrivacy: true,
    consentContact: true,
    source: { utm_source: "linkedin", path: "/business-transformation-intake" },
  };
  return { ...base, ...overrides };
}

describe("BTDI validation", () => {
  it("accepts a complete submission and builds a normalized record", () => {
    const r = validateBtdi(validInput());
    expect(r.ok).toBe(true);
    expect(r.record?.contact.businessName).toBe("Acme Logistics");
    // Email is normalized to lowercase.
    expect(r.record?.contact.email).toBe("dana@acme.example");
    // Source attribution preserved end-to-end.
    expect(r.record?.attribution["utm_source"]).toBe("linkedin");
    // Answers are grouped by section, not one blob.
    expect(r.record?.sections["company"]?.["industry"]).toBe("Logistics");
    expect(r.record?.sections["challenges"]?.["topChallenges"]).toContain("visibility");
  });

  it("records status 'new' — a REQUEST, never a completed assessment (Principle 10)", () => {
    const r = validateBtdi(validInput());
    expect(r.record?.status).toBe("new");
    expect(INTERNAL_NEXT_STEP).toBe("Business Transformation Investigation Pending");
    expect(confirmationMessage().toLowerCase()).toContain("no assessment has been run");
  });

  it("rejects missing required fields with field-specific errors", () => {
    const r = validateBtdi(validInput({ businessName: "", email: "" }));
    expect(r.ok).toBe(false);
    expect(r.record).toBeNull();
    expect(r.errors.join(" ")).toMatch(/business name/i);
  });

  it("rejects an invalid email", () => {
    const r = validateBtdi(validInput({ email: "not-an-email" }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/valid email/i);
  });

  it("rejects an invalid URL but accepts a valid one", () => {
    const bad = validateBtdi(validInput({ website: "javascript:alert(1)" }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/valid url/i);

    const good = validateBtdi(validInput({ website: "https://acme.example" }));
    expect(good.ok).toBe(true);
    expect(good.record?.sections["company"]?.["website"]).toBe("https://acme.example");
  });

  it("rejects excessively long input", () => {
    const r = validateBtdi(
      validInput({ businessDescription: "x".repeat(MAX_TEXT + 1) }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/too long/i);
  });

  it("requires the privacy and contact consents", () => {
    const r = validateBtdi(
      validInput({ consentPrivacy: false, consentContact: false }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("silently rejects a filled honeypot", () => {
    const r = validateBtdi(validInput({ company_website_hp: "http://spam.example" }));
    expect(r.ok).toBe(false);
    expect(r.record).toBeNull();
  });

  it("captures checkbox-group answers as arrays", () => {
    const r = validateBtdi(validInput({ discoveryChannels: ["Google", "Referrals"] }));
    expect(r.ok).toBe(true);
    expect(r.record?.sections["marketing"]?.["discoveryChannels"]).toEqual([
      "Google",
      "Referrals",
    ]);
  });

  it("keeps optional personal (work-life) answers optional", () => {
    // Section 9 has no required fields.
    const worklife = BTDI_SECTIONS.find((s) => s.key === "worklife")!;
    expect(worklife.fields.some((f) => f.required)).toBe(false);
    const r = validateBtdi(validInput());
    expect(r.ok).toBe(true);
  });

  it("builds a handoff summary and a stable, clock-free reference id", () => {
    const r = validateBtdi(validInput({ highestImpactProblem: "Manual scheduling" }));
    expect(r.record?.summary.mainChallenge).toBe("Manual scheduling");
    expect(r.record?.summary.ninetyDayGoal).toBe("Book 20 discovery calls.");
    const a = referenceFor(validateBtdi(validInput()).record!);
    const b = referenceFor(validateBtdi(validInput()).record!);
    expect(a).toBe(b);
    expect(a).toMatch(/^HLD-BT-/);
  });
});
