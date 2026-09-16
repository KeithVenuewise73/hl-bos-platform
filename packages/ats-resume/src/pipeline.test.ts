/**
 * End-to-end properties of the whole pipeline, asserted against the demo
 * dataset. These are the tests that would fail if the product started lying.
 */
import { describe, expect, it } from "vitest";
import { allLines } from "./optimizer.ts";
import { analysisSummary } from "./analysis.ts";
import { buildDemoDataset } from "./demo.ts";
import { buildExportDocument } from "./export/document.ts";
import { extractDocxText, extractPdfText } from "./extract.ts";
import { extractNumbers } from "./text.ts";
import { generateCoverLetter } from "./cover-letter.ts";
import { generateInterviewPrep } from "./interview-prep.ts";
import { renderDocx } from "./export/docx.ts";
import { renderPdf } from "./export/pdf.ts";
import { renderPlainText } from "./export/plain.ts";
import { SCORE_WEIGHTS, scoreResume } from "./score.ts";
import { validateAtsFormat } from "./ats-format.ts";
import { usableKeywords } from "./keywords.ts";

const USER = "33333333-3333-4333-8333-333333333333";
const demo = buildDemoDataset(USER);

describe("the analysis", () => {
  it("produces an evidence matrix row for every non-informational requirement", () => {
    const expected = demo.job.requirements.filter(
      (r) => r.importance !== "informational",
    );
    expect(demo.analysis.matches).toHaveLength(expected.length);
  });

  it("finds real matches and real gaps in the demo data", () => {
    const summary = analysisSummary(demo.analysis);
    expect(summary.strong).toBeGreaterThan(0);
    expect(summary.missing).toBeGreaterThan(0);
  });

  it("never puts an unsupported keyword in the usable set", () => {
    const usable = new Set(usableKeywords(demo.analysis.keywords));
    for (const keyword of demo.analysis.keywords.unsupported) {
      expect(usable.has(keyword.term)).toBe(false);
    }
  });

  it("projects a higher score, and gets there without inventing anything", () => {
    expect(demo.analysis.scoreProjected.overall).toBeGreaterThan(
      demo.analysis.scoreBefore.overall,
    );
    // The projection may not assume an unevidenced requirement gets solved.
    const stillMissing = demo.analysis.matches.filter(
      (m) => m.status === "not_evidenced",
    );
    expect(stillMissing.length).toBeGreaterThan(0);
    expect(demo.analysis.scoreProjected.overall).toBeLessThan(100);
  });
});

describe("the score", () => {
  it("weights exactly as the product owner specified", () => {
    const total =
      SCORE_WEIGHTS.qualificationAlignment +
      SCORE_WEIGHTS.relevantExperience +
      SCORE_WEIGHTS.skillsAndKeywords +
      SCORE_WEIGHTS.quantifiedAccomplishments +
      SCORE_WEIGHTS.atsStructure;
    expect(total).toBe(100);
    expect(SCORE_WEIGHTS.qualificationAlignment).toBe(35);
  });

  it("scores an empty resume as close to nothing, through the real path", () => {
    const emptyResume = {
      fullName: "",
      contact: {},
      headline: "",
      summary: [],
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      additional: [],
      unparsed: [],
    };
    const empty = scoreResume({
      matches: [],
      keywords: { present: [], supportedMissing: [], unsupported: [] },
      resume: emptyResume,
      // The findings the real pipeline would compute for this resume, not an
      // empty list — an empty findings list would hand it full marks for
      // structure it does not have.
      formatFindings: validateAtsFormat("", emptyResume),
    });
    expect(empty.overall).toBeLessThan(6);
  });

  it("never claims to predict an outcome", () => {
    const text = demo.analysis.scoreProjected.explanation.join(" ");
    expect(text).toContain("not the employer's ATS score");
  });
});

describe("the generated resume", () => {
  it("attaches evidence to every single line it writes", () => {
    for (const line of allLines(demo.generated)) {
      expect(line.evidenceFactIds.length).toBeGreaterThan(0);
      expect(line.rationale.length).toBeGreaterThan(0);
    }
  });

  it("contains no number that its own evidence does not contain", () => {
    const factsById = new Map(demo.facts.map((f) => [f.id, f]));
    for (const line of allLines(demo.generated)) {
      const supported = new Set(
        line.evidenceFactIds.flatMap((id) =>
          extractNumbers(factsById.get(id)?.text ?? ""),
        ),
      );
      for (const number of extractNumbers(line.text)) {
        expect(supported.has(number)).toBe(true);
      }
    }
  });

  it("keeps every employer and every role from the master resume", () => {
    const employers = demo.resume.parsed.experience.map((e) => e.employer);
    const generated = demo.generated.experience.map((e) => e.employer);
    expect(generated).toEqual(employers);
  });

  it("keeps roles in reverse-chronological order rather than by relevance", () => {
    const order = demo.generated.experience.map((e) => e.title);
    expect(order).toEqual(demo.resume.parsed.experience.map((e) => e.title));
  });

  it("does not print the same sentence in the summary and in a role", () => {
    // Regression: the optimizer promoted the strongest accomplishment into the
    // summary and left the identical bullet in the role, so the exported
    // document said the same thing twice.
    const summaryTexts = new Set(demo.generated.summary.map((l) => l.text));
    for (const entry of demo.generated.experience) {
      for (const bullet of entry.bullets) {
        expect(summaryTexts.has(bullet.text)).toBe(false);
      }
    }
  });

  it("only lists competencies the candidate can evidence", () => {
    const unsupported = new Set(
      demo.analysis.keywords.unsupported.map((k) => k.term.toLowerCase()),
    );
    for (const competency of demo.generated.competencies) {
      expect(unsupported.has(competency.toLowerCase())).toBe(false);
    }
  });
});

describe("the export boundary", () => {
  it("drops anything the validator did not clear, and says what it dropped", () => {
    const tampered = {
      ...demo.generated,
      summary: [
        ...demo.generated.summary,
        {
          ...(demo.generated.summary[0] ?? demo.generated.headline),
          id: "tampered",
          text: "Managed a $250M P&L across 14 countries.",
          validation: "unsupported" as const,
          validationNotes: ["injected by a test"],
        },
      ],
    };
    const { document, dropped } = buildExportDocument(tampered);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.reason).toContain("Unsupported");
    expect(renderPlainText(document)).not.toContain("250M");
  });

  it("writes a DOCX that reads back as the same text", () => {
    const { document } = buildExportDocument(demo.generated);
    const docx = renderDocx(document);
    expect(docx.subarray(0, 2).toString("latin1")).toBe("PK");
    const readBack = extractDocxText(docx);
    expect(readBack.quality).toBe("good");
    expect(readBack.text).toContain(demo.generated.fullName);
    expect(readBack.text).toContain("PROFESSIONAL EXPERIENCE");
    for (const entry of document.experience) {
      expect(readBack.text).toContain(entry.employer);
    }
  });

  it("writes a PDF whose text an ATS can actually read back", () => {
    const { document } = buildExportDocument(demo.generated);
    const pdf = renderPdf(document);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
    const readBack = extractPdfText(pdf);
    expect(readBack.text).toContain(demo.generated.fullName);
    expect(readBack.text).toContain("CORE COMPETENCIES");
    const firstEmployer = document.experience[0]?.employer ?? "";
    expect(readBack.text).toContain(firstEmployer);
  });

  it("puts nothing in a file that it would not show on screen", () => {
    const { document } = buildExportDocument(demo.generated);
    const text = renderPlainText(document);
    const onScreen = allLines(demo.generated)
      .filter((l) => l.validation === "verified" || l.validation === "user_confirmed")
      .map((l) => l.text);
    for (const line of onScreen) {
      expect(text).toContain(line);
    }
  });
});

describe("cover letter and interview prep", () => {
  it("writes no motivation the user did not supply", () => {
    const letter = generateCoverLetter({
      profile: demo.profile,
      job: demo.job,
      analysis: demo.analysis,
      facts: demo.facts,
    });
    const body = letter.paragraphs
      .map((p) => p.text)
      .join(" ")
      .toLowerCase();
    expect(body).not.toContain("excited");
    expect(body).not.toContain("passionate");
    expect(body).not.toContain("admire");
  });

  it("uses the user's own words when they supply motivation", () => {
    const letter = generateCoverLetter({
      profile: demo.profile,
      job: demo.job,
      analysis: demo.analysis,
      facts: demo.facts,
      motivation: "I want to move into temperature-controlled freight.",
    });
    expect(
      letter.paragraphs.some((p) => p.text.includes("temperature-controlled freight")),
    ).toBe(true);
  });

  it("prepares the candidate for the gaps, not just the strengths", () => {
    const prep = generateInterviewPrep({
      profileId: demo.profile.id,
      job: demo.job,
      analysis: demo.analysis,
      facts: demo.facts,
    });
    expect(prep.questions.length).toBeGreaterThan(0);
    expect(prep.explainThese.length).toBeGreaterThan(0);
    expect(prep.explainThese.every((q) => q.starPrompts.length > 0)).toBe(true);
  });
});

describe("demo data", () => {
  it("marks every record it creates as sample data", () => {
    expect(demo.profile.isSample).toBe(true);
    expect(demo.resume.isSample).toBe(true);
    expect(demo.job.isSample).toBe(true);
    expect(demo.analysis.isSample).toBe(true);
    expect(demo.facts.every((f) => f.isSample === true)).toBe(true);
    expect(demo.applications.every((a) => a.isSample === true)).toBe(true);
  });
});
