import { describe, expect, it } from "vitest";
import {
  matchRequirements,
  rewriteWithTerminology,
  shouldRewrite,
} from "./evidence.ts";
import { makeFact } from "./career-facts.ts";
import { newId } from "./text.ts";
import { TERMINOLOGY_GROUPS } from "./vocabulary.ts";
import type {
  JobRequirement,
  RequirementImportance,
  RequirementKind,
} from "./types.ts";
import { tokenize, stem } from "./text.ts";

const PROFILE = "22222222-2222-4222-8222-222222222222";

function requirement(
  text: string,
  kind: RequirementKind = "qualification",
  importance: RequirementImportance = "critical",
): JobRequirement {
  return {
    id: newId(),
    text,
    kind,
    importance,
    sourceSection: "required",
    terms: [...new Set(tokenize(text).map(stem))],
  };
}

const routeBullet = makeFact(PROFILE, {
  category: "accomplishment",
  source: "resume",
  text: "Managed drivers and daily delivery routes across three metro stations.",
  context: "Meridian Logistics Group — Senior Operations Manager",
});

const budgetBullet = makeFact(PROFILE, {
  category: "accomplishment",
  source: "resume",
  text: "Owned an operating budget of $18M covering linehaul and station labor.",
  context: "Meridian Logistics Group — Senior Operations Manager",
});

describe("matchRequirements", () => {
  it("reports work stated in different words as a terminology match", () => {
    const { matches, terminology } = matchRequirements(
      [requirement("Proven fleet management experience.")],
      [routeBullet],
    );
    expect(matches[0]?.status).toBe("terminology_match");
    expect(matches[0]?.evidence).toBe(routeBullet.text);
    expect(terminology[0]?.recommendedRewrite).toContain(
      "Fleet and transportation operations",
    );
  });

  it("refuses to turn budget ownership into P&L ownership", () => {
    // The defect this test exists for: an earlier build happily rewrote
    // "owned an $18M budget" into "P&L ownership". A P&L has a revenue line.
    const { matches, terminology } = matchRequirements(
      [requirement("Demonstrated P&L responsibility for a budget of $25M or greater.")],
      [budgetBullet],
    );
    expect(matches[0]?.status).toBe("partial_match");
    expect(matches[0]?.recommendedAction).toContain("not the same as P&L ownership");
    expect(terminology).toHaveLength(0);
  });

  it("will not infer a certification from adjacent work", () => {
    const improvement = makeFact(PROFILE, {
      category: "accomplishment",
      source: "resume",
      text: "Streamlined the dock process and reduced waste across two shifts.",
    });
    const { matches } = matchRequirements(
      [requirement("Lean Six Sigma certification.", "certification", "preferred")],
      [improvement],
    );
    expect(matches[0]?.status).toBe("not_evidenced");
  });

  it("matches a certification the candidate actually holds", () => {
    const cert = makeFact(PROFILE, {
      category: "certification",
      source: "resume",
      text: "Lean Six Sigma Green Belt",
    });
    const { matches } = matchRequirements(
      [requirement("Lean Six Sigma certification.", "certification", "preferred")],
      [cert],
    );
    expect(matches[0]?.status).not.toBe("not_evidenced");
  });

  it("says plainly when there is no evidence, and offers no rewrite", () => {
    const { matches } = matchRequirements(
      [requirement("Experience with Kubernetes and Terraform.", "software")],
      [routeBullet, budgetBullet],
    );
    expect(matches[0]?.status).toBe("not_evidenced");
    expect(matches[0]?.evidence).toBe("");
    expect(matches[0]?.evidenceSource).toBe("No supporting evidence found");
    expect(matches[0]?.suggestedPlacement).toHaveLength(0);
  });

  it("ignores informational lines entirely", () => {
    const { matches } = matchRequirements(
      [
        requirement(
          "We are an equal opportunity employer.",
          "qualification",
          "informational",
        ),
      ],
      [routeBullet],
    );
    expect(matches).toHaveLength(0);
  });
});

describe("rewriteWithTerminology", () => {
  const fleet = TERMINOLOGY_GROUPS.find((g) => g.id === "fleet-operations");

  it("keeps the original sentence word for word", () => {
    const original = "Led middle-mile operations supporting 85 daily routes.";
    const rewritten = rewriteWithTerminology(original, fleet!);
    expect(rewritten).toContain(
      "led middle-mile operations supporting 85 daily routes",
    );
    expect(rewritten.startsWith("Fleet and transportation operations")).toBe(true);
  });

  it("leaves a bullet alone when it already uses the wording", () => {
    const original = "Ran fleet and transportation operations for the region.";
    expect(shouldRewrite(original, fleet!)).toBe(false);
    expect(rewriteWithTerminology(original, fleet!)).toBe(`${original}`);
  });
});
