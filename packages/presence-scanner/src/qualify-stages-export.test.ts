import { describe, expect, it } from "vitest";

import { matchChain } from "./chains.ts";
import { csvCell, CSV_COLUMNS, leadSummaryHtml, prospectsToCsv } from "./export.ts";
import { normalizePlace } from "./places.ts";
import {
  addNote,
  clearQualificationOverride,
  correctField,
  overrideQualification,
  ReviewerInputError,
} from "./prospect-ops.ts";
import { effectiveQualification, qualify, type QualifyInput } from "./qualify.ts";
import { scoreOpportunity } from "./score.ts";
import {
  canTransition,
  LEAD_STAGES,
  STAGE_TO_HLBOS,
  StageTransitionError,
  transitionStage,
} from "./stages.ts";
import { NOW } from "./test-helpers.ts";
import type { Prospect } from "./types.ts";

const base: QualifyInput = {
  name: "Smith Roofing",
  vertical: "contractor",
  source: "google_places",
  place: normalizePlace({
    id: "P",
    primaryType: "roofing_contractor",
    businessStatus: "OPERATIONAL",
  }),
  phone: "716-555-0101",
  email: undefined,
  website: "https://smith.example",
  websiteStatus: "ok",
  distanceMiles: 3,
  radiusMiles: 10,
};

describe("qualification gate", () => {
  it("qualifies an operating, matching, reachable independent inside the radius", () => {
    const q = qualify(base);
    expect(q.computed).toBe("qualified");
    expect(q.checks.every((c) => c.outcome === "pass")).toBe(true);
  });

  it("excludes national chains and franchises by default, with the reason", () => {
    expect(matchChain("Roto-Rooter Plumbing & Water Cleanup", "contractor")).toBe(
      "roto rooter",
    );
    expect(matchChain("Great Clips", "salon_barber")).toBe("great clips");
    expect(matchChain("Domino's Pizza", "restaurant_bar")).toBe("dominos");
    // Chains are checked within the vertical only.
    expect(matchChain("Perkins Plumbing", "contractor")).toBeUndefined();
    expect(matchChain("Perkins", "restaurant_bar")).toBe("perkins");
    expect(matchChain("Smith Roofing", "contractor")).toBeUndefined();
    const q = qualify({ ...base, name: "SERVPRO of West Seneca" });
    expect(q.computed).toBe("excluded");
    expect(q.checks.find((c) => c.code === "chain")!.detail).toContain(
      "Override if this is wrong",
    );
  });

  it("excludes a permanently closed business; a temporarily closed one goes to review", () => {
    const closed = normalizePlace({
      id: "P",
      primaryType: "plumber",
      businessStatus: "CLOSED_PERMANENTLY",
    });
    expect(qualify({ ...base, place: closed }).computed).toBe("excluded");
    const temp = normalizePlace({
      id: "P",
      primaryType: "plumber",
      businessStatus: "CLOSED_TEMPORARILY",
    });
    expect(qualify({ ...base, place: temp }).computed).toBe("needs_review");
  });

  it("marks an uncertain vertical match for review instead of discarding it", () => {
    const place = normalizePlace({
      id: "P",
      primaryType: "store",
      primaryTypeDisplayName: { text: "Store" },
      businessStatus: "OPERATIONAL",
    });
    const q = qualify({ ...base, name: "Lakeview Supply", place });
    expect(q.computed).toBe("needs_review");
    expect(q.checks.find((c) => c.code === "vertical")!.outcome).toBe("uncertain");
  });

  it("matches the vertical from the name when Google's category is generic", () => {
    const place = normalizePlace({
      id: "P",
      primaryType: "point_of_interest",
      businessStatus: "OPERATIONAL",
    });
    expect(
      qualify({ ...base, name: "Seneca Paving & Sealcoating", place }).computed,
    ).toBe("qualified");
  });

  it("excludes a business with no way to contact it", () => {
    const q = qualify({
      ...base,
      phone: undefined,
      website: undefined,
      websiteStatus: "none",
    });
    expect(q.computed).toBe("excluded");
  });

  it("excludes outside the radius", () => {
    expect(
      qualify({ ...base, distanceMiles: 14.2 }).checks.find((c) => c.code === "radius")!
        .detail,
    ).toContain("outside the 10-mile radius");
  });

  it("imported businesses are unverified, not failed", () => {
    const q = qualify({
      ...base,
      source: "import",
      place: undefined,
      distanceMiles: undefined,
    });
    expect(q.computed).toBe("qualified");
    expect(q.checks.find((c) => c.code === "operating")!.outcome).toBe("unverified");
  });
});

function prospect(): Prospect {
  const score = scoreOpportunity({
    vertical: "contractor",
    websiteStatus: "not_checked",
    findings: [],
    rubric: undefined,
    reviews: undefined,
  });
  return {
    id: "id-1",
    dedupeKey: "phone:7165550101",
    placeId: undefined,
    name: "Smith Roofing",
    vertical: "contractor",
    market: { label: "West Seneca", zip: "14224", radiusMiles: 10 },
    address: "12 Main St, West Seneca",
    phone: "(716) 555-0101",
    email: undefined,
    website: undefined,
    corrections: {},
    places: undefined,
    importedRating: undefined,
    importedReviewCount: undefined,
    distanceMiles: undefined,
    websiteStatus: "not_checked",
    findings: [],
    score,
    qualification: qualify({ ...base, name: "SERVPRO of West Seneca" }),
    services: [],
    stage: "new",
    notes: [],
    audit: [],
    firstSeenAt: NOW.toISOString(),
    lastScannedAt: NOW.toISOString(),
    scanIds: ["s1"],
  };
}

describe("lead stages", () => {
  it("maps every stage onto the existing HL-BOS prospect stages", () => {
    for (const s of LEAD_STAGES)
      expect(["prospect", "assessed", "proposed", "client", "lost"]).toContain(
        STAGE_TO_HLBOS[s.key],
      );
    expect(STAGE_TO_HLBOS.proposal).toBe("proposed");
    expect(STAGE_TO_HLBOS.disqualified).toBe("lost");
  });

  it("allows forward moves, one step back, and closing from any open stage", () => {
    expect(canTransition("new", "reviewed")).toBe(true);
    expect(canTransition("reviewed", "contacted")).toBe(true);
    expect(canTransition("contacted", "demo_built")).toBe(true);
    expect(canTransition("contacted", "new")).toBe(false);
    expect(canTransition("interested", "lost")).toBe(true);
    expect(canTransition("new", "disqualified")).toBe(true);
    expect(canTransition("lost", "reviewed")).toBe(true);
    expect(canTransition("lost", "client")).toBe(false);
    expect(canTransition("client", "new")).toBe(false);
    expect(canTransition("client", "lost")).toBe(true);
    expect(canTransition("new", "new")).toBe(false);
  });

  it("records every transition in the audit trail and refuses illegal ones", () => {
    const p = transitionStage(prospect(), "reviewed", "Keith", "looked at it", NOW);
    expect(p.stage).toBe("reviewed");
    expect(p.audit.at(-1)).toMatchObject({
      by: "Keith",
      action: "stage",
      detail: "New → Reviewed: looked at it",
    });
    const contacted = transitionStage(p, "contacted", "Keith", "", NOW);
    expect(() => transitionStage(contacted, "new", "Keith", "", NOW)).toThrow(
      StageTransitionError,
    );
    expect(() => transitionStage(contacted, "contacted", "Keith", "", NOW)).toThrow(
      StageTransitionError,
    );
  });
});

describe("reviewer actions", () => {
  it("override needs a reason, wins over the automatic result, and can be cleared", () => {
    const p0 = prospect();
    expect(effectiveQualification(p0.qualification)).toBe("excluded");
    expect(() => overrideQualification(p0, "qualified", " ", "Keith", NOW)).toThrow(
      ReviewerInputError,
    );
    const p1 = overrideQualification(
      p0,
      "qualified",
      "Locally owned franchise; owner runs the site",
      "Keith",
      NOW,
    );
    expect(effectiveQualification(p1.qualification)).toBe("qualified");
    expect(p1.audit.at(-1)!.action).toBe("qualification_override");
    const p2 = clearQualificationOverride(p1, "Keith", NOW);
    expect(effectiveQualification(p2.qualification)).toBe("excluded");
    expect(p2.audit.at(-1)!.action).toBe("qualification_override_cleared");
  });

  it("corrections are validated, audited, and a website change asks for a rescan", () => {
    const r = correctField(
      prospect(),
      "website",
      "www.smithroofing.example",
      "Keith",
      NOW,
    );
    expect(r.prospect.corrections.website).toBe("https://www.smithroofing.example");
    expect(r.needsRescan).toBe(true);
    expect(r.prospect.audit.at(-1)!.detail).toContain(
      "website: (none) → https://www.smithroofing.example",
    );
    expect(
      correctField(prospect(), "website", "none", "Keith", NOW).prospect.corrections
        .website,
    ).toBe("none");
    expect(() => correctField(prospect(), "phone", "abc", "Keith", NOW)).toThrow(
      ReviewerInputError,
    );
    expect(() => correctField(prospect(), "email", "nope", "Keith", NOW)).toThrow(
      ReviewerInputError,
    );
    expect(
      correctField(prospect(), "phone", "716 555 0199", "Keith", NOW).prospect.phone,
    ).toBe("(716) 555-0199");
  });

  it("notes are kept and audited; empty notes are refused", () => {
    const p = addNote(prospect(), "Owner is Bob", "Keith", NOW);
    expect(p.notes).toEqual([
      { at: NOW.toISOString(), by: "Keith", text: "Owner is Bob" },
    ]);
    expect(() => addNote(p, "  ", "Keith", NOW)).toThrow(ReviewerInputError);
  });
});

describe("exports", () => {
  it("CSV has the lead-board columns, one row per lead", () => {
    const csv = prospectsToCsv([prospect()]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines[1]).toContain("Smith Roofing");
    expect(lines[1]).toContain("Excluded");
    expect(lines[1]).toContain("Not checked");
  });

  it("CSV cells are quoted and spreadsheet formulas are neutralised", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1 716")).toBe('"\'+1 716"');
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("the printable summary escapes business-supplied text and is marked internal", () => {
    const p = { ...prospect(), name: '<script>alert("x")</script>' };
    const html = leadSummaryHtml([p], NOW);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Internal review only");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
  });
});
