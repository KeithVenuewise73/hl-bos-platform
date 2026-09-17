/**
 * The regression this file exists for.
 *
 * A line was found being exported with `validation: "verified"` stored on it
 * while carrying no evidence and quoting figures that appear nowhere in the
 * user's facts. The export filtered on the stored verdict, so it trusted the
 * database instead of checking. A signed-in user can write their own rows
 * directly, which makes that the wrong shape for the one guarantee this
 * product sells.
 */
import { describe, expect, it } from "vitest";
import { buildDemoDataset, isExportable } from "@hl-bos/ats-resume";
import type { GeneratedLine } from "@hl-bos/ats-resume";

import { recheckClaims } from "./recheck.ts";

const OWNER = "99999999-9999-4999-8999-999999999999";

function fixture() {
  const demo = buildDemoDataset(OWNER);
  return {
    resume: demo.generated,
    context: { facts: demo.facts, analyses: [demo.analysis] },
  };
}

const FABRICATED: GeneratedLine = {
  id: "tampered-0001",
  section: "summary",
  text: "Directed a $250M P&L across 14 countries and 900 drivers.",
  evidenceFactIds: [],
  evidenceText: [],
  addressesRequirementIds: [],
  rationale: "Injected.",
  // The lie: a verdict written directly, bypassing the validator.
  validation: "verified",
  validationNotes: [],
};

describe("recheckClaims", () => {
  it("downgrades a fabricated line whose stored verdict claims it is verified", () => {
    const { resume, context } = fixture();
    const tampered = { ...resume, summary: [FABRICATED, ...resume.summary] };

    const checked = recheckClaims(tampered, context);
    const line = checked.summary[0];

    expect(line?.validation).toBe("unsupported");
    expect(isExportable(line!)).toBe(false);
  });

  it("leaves genuinely verified lines alone", () => {
    const { resume, context } = fixture();
    const checked = recheckClaims(resume, context);

    expect(checked.summary.map((l) => l.validation)).toEqual(
      resume.summary.map((l) => l.validation),
    );
    expect(checked.headline.validation).toBe(resume.headline.validation);
  });

  it("never upgrades a line the user still has to confirm", () => {
    const { resume, context } = fixture();
    const needsConfirmation: GeneratedLine = {
      ...resume.summary[0]!,
      validation: "needs_confirmation",
      validationNotes: ["Waiting on you."],
    };
    const checked = recheckClaims({ ...resume, summary: [needsConfirmation] }, context);

    // Even though the validator would pass this text, a pending confirmation
    // is the user's decision to make, not ours to overrule.
    expect(checked.summary[0]?.validation).toBe("needs_confirmation");
  });

  it("checks experience bullets, not only the summary", () => {
    const { resume, context } = fixture();
    const entry = resume.experience[0];
    expect(entry).toBeDefined();
    const tampered = {
      ...resume,
      experience: [
        { ...entry!, bullets: [{ ...FABRICATED, groupId: entry!.entryId }] },
        ...resume.experience.slice(1),
      ],
    };

    const checked = recheckClaims(tampered, context);
    expect(checked.experience[0]?.bullets[0]?.validation).toBe("unsupported");
  });

  it("checks the headline", () => {
    const { resume, context } = fixture();
    const checked = recheckClaims(
      { ...resume, headline: { ...FABRICATED, section: "header" } },
      context,
    );
    expect(checked.headline.validation).toBe("unsupported");
  });
});
