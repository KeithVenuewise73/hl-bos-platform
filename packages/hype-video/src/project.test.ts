import { describe, expect, it } from "vitest";

import { FULL } from "./fixtures.test-helpers.ts";
import { advanceStatus, checkConsent, readiness, type HypeProject } from "./project.ts";
import { TEMPLATES } from "./templates.ts";
import { TEMPLATE_KEYS } from "./types.ts";
import { normalizeDetails, validateDetails } from "./validation.ts";

const consented = {
  mediaRightsConfirmed: true,
  featuresMinor: true,
  guardianConsentConfirmed: true,
  guardianName: "Maria Reyes",
  confirmedAt: "2026-09-30T00:00:00.000Z",
};

function project(overrides: Partial<HypeProject> = {}): HypeProject {
  return {
    id: "p1",
    name: "Jordan game day",
    creatorRole: "parent",
    template: "game_day",
    tone: "aggressive",
    outputTypes: ["hype_script"],
    accent: "red",
    visibility: "private",
    status: "draft",
    consent: consented,
    details: FULL,
    media: [],
    generations: [],
    packageStale: false,
    exportedAt: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("status", () => {
  it("only moves forward", () => {
    expect(advanceStatus("draft", "media_uploaded")).toBe("media_uploaded");
    expect(advanceStatus("generated", "media_uploaded")).toBe("generated");
    expect(advanceStatus("exported", "generated")).toBe("exported");
  });

  it("cannot claim a payment is pending while payments are not connected", () => {
    expect(() => advanceStatus("exported", "paid_download_pending")).toThrow(
      /not connected/,
    );
  });
});

describe("consent", () => {
  it("requires media rights always", () => {
    expect(checkConsent({ ...consented, mediaRightsConfirmed: false }).ok).toBe(false);
  });

  it("requires a named guardian for a minor", () => {
    expect(checkConsent({ ...consented, guardianConsentConfirmed: false }).ok).toBe(
      false,
    );
    expect(checkConsent({ ...consented, guardianName: "  " }).ok).toBe(false);
  });

  it("does not ask for a guardian for an adult athlete", () => {
    expect(
      checkConsent({
        ...consented,
        featuresMinor: false,
        guardianConsentConfirmed: false,
        guardianName: "",
      }).ok,
    ).toBe(true);
  });
});

describe("readiness", () => {
  it("is ready with consent and complete details", () => {
    expect(readiness(project())).toEqual({ canGenerate: true, missing: [] });
  });

  it("lists what is missing in plain English", () => {
    const r = readiness(
      project({
        details: null,
        consent: { ...consented, mediaRightsConfirmed: false },
      }),
    );
    expect(r.canGenerate).toBe(false);
    expect(r.missing).toHaveLength(2);
  });
});

describe("validation", () => {
  it("requires name, sport and team for an athlete template", () => {
    const v = validateDetails(normalizeDetails({}), "game_day");
    expect(Object.keys(v.problems).sort()).toEqual([
      "athleteName",
      "sport",
      "teamOrSchool",
    ]);
  });

  it("does not require a person's name for a team intro", () => {
    const v = validateDetails(
      normalizeDetails({ sport: "Volleyball", teamOrSchool: "Eagles" }),
      "team_intro",
    );
    expect(v.ok).toBe(true);
  });

  it("rejects a jersey number that is not one or two digits", () => {
    expect(
      validateDetails(normalizeDetails({ ...FULL, jerseyNumber: "7a" }), "game_day").ok,
    ).toBe(false);
    expect(normalizeDetails({ jerseyNumber: "#00" }).jerseyNumber).toBe("00");
  });

  it("splits achievements by line, strips bullets and caps the count", () => {
    const d = normalizeDetails({
      achievements: "- one\n• two\n\n* three\n" + "x\n".repeat(20),
    });
    expect(d.achievements.slice(0, 3)).toEqual(["one", "two", "three"]);
    expect(d.achievements).toHaveLength(8);
  });
});

describe("templates", () => {
  it("has exactly the eight seed templates, one per key", () => {
    expect(TEMPLATES.map((t) => t.key)).toEqual([...TEMPLATE_KEYS]);
  });
});
