import { describe, expect, it } from "vitest";
import { extractKeywords, extractRequirements, parseJobPosting } from "./job-parser.ts";
import { DEMO_JOB_TEXT } from "./demo.ts";

describe("extractRequirements", () => {
  const requirements = extractRequirements(DEMO_JOB_TEXT);

  it("classifies a stated minimum as critical and an optional as preferred", () => {
    const degree = requirements.find((r) => r.text.startsWith("Bachelor"));
    expect(degree?.importance).toBe("critical");
    const mba = requirements.find((r) => r.text.includes("MBA"));
    expect(mba?.importance).toBe("preferred");
  });

  it("classifies responsibilities as important, not critical", () => {
    const own = requirements.find((r) => r.text.startsWith("Own fleet management"));
    expect(own?.importance).toBe("important");
  });

  it("treats company blurb, benefits and EEO text as informational", () => {
    const eeo = requirements.find((r) => r.text.includes("equal opportunity"));
    expect(eeo?.importance).toBe("informational");
  });

  it("does not turn posting metadata into requirements", () => {
    // Regression: the first run produced requirements the candidate could not
    // possibly evidence, including "Employment type: Full-time".
    const texts = requirements.map((r) => r.text);
    expect(texts).not.toContain("Employment type: Full-time");
    expect(texts).not.toContain("Location: Phoenix, AZ");
    expect(texts).not.toContain("Sunrise Distribution Partners");
  });

  it("does not turn a stated pay range into a requirement", () => {
    // Regression, found by the career-platform end-to-end run: "Salary range:
    // $82,000 - $95,000 per year." was scored as an unmet requirement and shown
    // to the candidate as a gap. Pay is a facet of the posting, not a skill.
    const posting = parseJobPosting({
      rawText:
        "Operations Manager\nAcme\nSalary range: $82,000 - $95,000 per year.\nPay rate: $28/hour\n\nRequirements\n- 5+ years of warehouse leadership",
    });
    const texts = posting.requirements.map((r) => r.text);
    expect(texts.some((t) => /salary|pay rate/i.test(t))).toBe(false);
    expect(posting.facets.compensation).toContain("82,000");
    expect(texts).toContain("5+ years of warehouse leadership");

    // The same label in the middle of a paragraph.
    const inline = parseJobPosting({
      rawText:
        "Operations Manager\nAcme\n\nAcme is hiring a full-time Operations Manager to lead our site. Salary range: $82,000 - $95,000 per year.\n\nRequirements\n- 5+ years of warehouse leadership",
    });
    expect(inline.requirements.some((r) => /salary/i.test(r.text))).toBe(false);
  });

  it("reads years of experience off the requirement that states it", () => {
    const years = requirements.find((r) => r.yearsRequired !== undefined);
    expect(years?.yearsRequired).toBe(10);
  });

  it("identifies the kind of each requirement", () => {
    const cert = requirements.find((r) => r.text.includes("Lean Six Sigma"));
    expect(cert?.kind).toBe("certification");
    const travel = requirements.find((r) =>
      r.text.toLowerCase().includes("travel up to"),
    );
    expect(travel?.kind).toBe("travel");
  });
});

describe("extractKeywords", () => {
  const requirements = extractRequirements(DEMO_JOB_TEXT);
  const keywords = extractKeywords(DEMO_JOB_TEXT, requirements);

  it("ranks terms from critical requirements above background noise", () => {
    const fleet = keywords.find((k) => k.term === "fleet management");
    expect(fleet?.priority).toBe("high");
  });

  it("never returns a bare number as a keyword", () => {
    expect(keywords.every((k) => !/^\d/.test(k.term))).toBe(true);
  });
});

describe("parseJobPosting", () => {
  it("prefers what the user typed over what it inferred", () => {
    const parsed = parseJobPosting({
      rawText: DEMO_JOB_TEXT,
      company: "Sunrise Distribution Partners",
      title: "Director of Fleet and Transportation Operations",
    });
    expect(parsed.company).toBe("Sunrise Distribution Partners");
    expect(parsed.facets.compensation).toContain("135,000");
    expect(parsed.facets.employmentType?.toLowerCase()).toBe("full-time");
    expect(parsed.facets.travel).toContain("25%");
  });

  it("infers a company and title when the user supplies none", () => {
    const parsed = parseJobPosting({ rawText: DEMO_JOB_TEXT });
    expect(parsed.title).toBe("Director of Fleet and Transportation Operations");
    expect(parsed.company).toBe("Sunrise Distribution Partners");
  });

  it("says so rather than guessing when a posting is unreadable", () => {
    const parsed = parseJobPosting({ rawText: "" });
    expect(parsed.company).toBe("Unspecified company");
    expect(parsed.requirements).toHaveLength(0);
  });
});
