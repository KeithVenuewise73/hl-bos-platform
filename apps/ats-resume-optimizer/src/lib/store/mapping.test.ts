/**
 * Round-trip tests.
 *
 * The question each one answers is the same: if this record goes into the
 * database and comes back, is it still the same record? For most apps that is
 * a tidiness concern. Here it is the product: `source`, `validation`,
 * `numbers` and the evidence links are what separate "verified against your
 * own resume" from "we think so", and losing one in the storage layer would
 * be invisible until somebody's resume carried a claim nothing backs.
 */
import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "@hl-bos/ats-resume";
import type { GeneratedLine, GeneratedResume, JobAnalysis } from "@hl-bos/ats-resume";

import {
  analysisToRow,
  applicationToRow,
  claimEvidenceToRow,
  coverLetterToRow,
  factToRow,
  generatedToRow,
  interviewPrepToRow,
  jobToRow,
  keywordToRow,
  lineToRow,
  matchToRow,
  profileToRow,
  requirementToRow,
  resumeToRow,
  resumeVersionToRow,
  rowToAnalysis,
  rowToApplication,
  rowToCoverLetter,
  rowToFact,
  rowToGenerated,
  rowToInterviewPrep,
  rowToJob,
  rowToKeyword,
  rowToLine,
  rowToMatch,
  rowToProfile,
  rowToRequirement,
  rowToResume,
} from "./mapping.ts";

const OWNER = "55555555-5555-4555-8555-555555555555";
const demo = buildDemoDataset(OWNER);

/** PostgREST returns absent optional columns as null, so simulate that. */
function throughDatabase(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(row, (_k, v: unknown) => (v === undefined ? null : v)),
  ) as Record<string, unknown>;
}

/**
 * The read path for a posting, analysis or generated resume, reassembled from
 * the child tables exactly as the store does it.
 *
 * Round-tripping only the parent row would prove nothing about the tables the
 * anti-fabrication constraints guard — and would pass while every requirement,
 * matrix row and generated sentence quietly vanished.
 */
function jobThroughDatabase(): ReturnType<typeof rowToJob> {
  return rowToJob(
    throughDatabase(jobToRow(demo.job, OWNER)),
    demo.job.requirements.map((r) =>
      rowToRequirement(throughDatabase(requirementToRow(r, demo.job.id, OWNER))),
    ),
    demo.job.keywords.map((k) =>
      rowToKeyword(throughDatabase(keywordToRow(k, demo.job.id, OWNER))),
    ),
  );
}

function analysisThroughDatabase(analysis: JobAnalysis): JobAnalysis {
  const requirementById = new Map(demo.job.requirements.map((r) => [r.id, r]));
  const matches = analysis.matches.map((match) => {
    const back = rowToMatch(throughDatabase(matchToRow(match, analysis.id, OWNER)));
    const requirement = requirementById.get(back.requirementId);
    // The matrix row stores an id; the text and importance shown beside it
    // belong to the requirement and are joined back rather than duplicated.
    return requirement === undefined
      ? back
      : { ...back, requirement: requirement.text, importance: requirement.importance };
  });
  return rowToAnalysis(throughDatabase(analysisToRow(analysis, OWNER)), matches);
}

function generatedThroughDatabase(resume: GeneratedResume): GeneratedResume {
  const factText = new Map(demo.facts.map((f) => [f.id, f.text]));
  const flat: GeneratedLine[] = [
    resume.headline,
    ...resume.summary,
    ...resume.experience.flatMap((e) => e.bullets),
  ];
  const lines = flat.map((line, position) => {
    const row = throughDatabase(lineToRow(line, resume.id, position, OWNER));
    // Evidence is a join table, so it is rebuilt from the links rather than
    // read off the line it is supposed to be independent of.
    const ids = line.evidenceFactIds.map((factId) =>
      String(throughDatabase(claimEvidenceToRow(line.id, factId, OWNER))["fact_id"]),
    );
    const read = rowToLine(
      row,
      ids.map((id) => factText.get(id) ?? ""),
    );
    return { ...read, evidenceFactIds: ids };
  });
  return rowToGenerated(throughDatabase(generatedToRow(resume, OWNER)), lines);
}

/** The matrix as the database can actually hold it: coverage is numeric(4,3). */
function atStoredPrecision(analysis: JobAnalysis): JobAnalysis {
  return {
    ...analysis,
    matches: analysis.matches.map((m) => ({
      ...m,
      coverage: Number(m.coverage.toFixed(3)),
    })),
  };
}

describe("candidate profile", () => {
  it("survives the round trip", () => {
    const back = rowToProfile(
      throughDatabase(profileToRow(demo.profile, OWNER)),
      OWNER,
    );
    expect(back).toEqual(demo.profile);
  });
});

describe("career facts — the evidence corpus", () => {
  it("keeps every fact identical, including its source and its figures", () => {
    for (const fact of demo.facts) {
      const back = rowToFact(throughDatabase(factToRow(fact, OWNER)));
      expect(back).toEqual(fact);
    }
  });

  it("never reads an unknown source as resume-backed", () => {
    // Fail closed: a corrupt or future value must not be promoted into
    // evidence that the claim validator will trust.
    const row = throughDatabase(factToRow(demo.facts[0]!, OWNER));
    row["source"] = "something_new";
    expect(rowToFact(row).source).toBe("generated_wording");
  });

  it("keeps the extracted numbers, which the claim validator depends on", () => {
    const quantified = demo.facts.find((f) => f.numbers.length > 0);
    expect(quantified).toBeDefined();
    const back = rowToFact(throughDatabase(factToRow(quantified!, OWNER)));
    expect(back.numbers).toEqual(quantified!.numbers);
  });
});

describe("master resume", () => {
  it("survives the round trip with its parsed reading", () => {
    const row = throughDatabase(resumeToRow(demo.resume, OWNER));
    const version = throughDatabase(resumeVersionToRow(demo.resume, OWNER));
    const back = rowToResume(row, version["parsed"]);
    expect(back).toEqual(demo.resume);
  });

  it("does not invent a parse when the version row is missing", () => {
    const back = rowToResume(throughDatabase(resumeToRow(demo.resume, OWNER)), null);
    expect(back.parsed.experience).toEqual([]);
    expect(back.rawText).toBe(demo.resume.rawText);
  });
});

describe("job posting", () => {
  it("survives the round trip with requirements and keywords", () => {
    const back = jobThroughDatabase();
    expect(back).toEqual(demo.job);
    expect(back.requirements.length).toBeGreaterThan(0);
    expect(back.keywords.length).toBeGreaterThan(0);
  });
});

describe("analysis", () => {
  it("survives the round trip with the whole evidence matrix", () => {
    const back = analysisThroughDatabase(demo.analysis);
    expect(back).toEqual(atStoredPrecision(demo.analysis));
    expect(back.matches.length).toBeGreaterThan(0);
  });

  it("rounds coverage to the stored precision and nothing else", () => {
    // ats.requirement_matches.coverage is numeric(4,3): 0.3333... comes back as
    // 0.333. That is the one lossy field in the matrix, and it is a display
    // ratio, not a verdict — the status, the evidence and the fact ids, which
    // are what decide whether a claim may be made, come back untouched.
    const back = analysisThroughDatabase(demo.analysis);
    for (const [i, match] of back.matches.entries()) {
      const original = demo.analysis.matches[i]!;
      expect(match.coverage).toBeCloseTo(original.coverage, 3);
      expect(match.status).toBe(original.status);
      expect(match.evidence).toBe(original.evidence);
      expect(match.evidenceFactIds).toEqual(original.evidenceFactIds);
    }
  });

  it("keeps every match status, not just the flattering ones", () => {
    const back = analysisThroughDatabase(demo.analysis);
    const statuses = (s: string) => back.matches.filter((m) => m.status === s).length;
    expect(statuses("not_evidenced")).toBe(
      demo.analysis.matches.filter((m) => m.status === "not_evidenced").length,
    );
    expect(back.scoreBefore.overall).toBe(demo.analysis.scoreBefore.overall);
  });
});

describe("generated resume", () => {
  it("survives the round trip with every line's validation verdict", () => {
    const back = generatedThroughDatabase(demo.generated);
    expect(back).toEqual(demo.generated);
  });

  it("keeps the evidence attached to each line", () => {
    const back = generatedThroughDatabase(demo.generated);
    expect(back.experience.flatMap((e) => e.bullets).length).toBeGreaterThan(0);
    for (const entry of back.experience) {
      for (const bullet of entry.bullets) {
        expect(bullet.evidenceFactIds.length).toBeGreaterThan(0);
        expect(bullet.validation).toBeDefined();
      }
    }
  });

  it("fails closed when a line cannot be read back", () => {
    // If stored data is unreadable the line must be treated as unsupported, so
    // the export path drops it rather than writing an unverifiable sentence.
    const row = throughDatabase(generatedToRow(demo.generated, OWNER));
    row["education"] = {};
    const back = rowToGenerated(row);
    expect(back.headline.validation).toBe("unsupported");
    expect(back.summary).toEqual([]);
  });
});

describe("applications, cover letters and interview prep", () => {
  it("round-trips an application including its optional fields", () => {
    const application = demo.applications[0]!;
    const back = rowToApplication(
      throughDatabase(applicationToRow(application, OWNER)),
    );
    expect(back).toEqual(application);
  });

  it("leaves unset optional fields absent rather than empty strings", () => {
    const application = demo.applications[0]!;
    const back = rowToApplication(
      throughDatabase(applicationToRow(application, OWNER)),
    );
    expect("recruiterName" in back).toBe(false);
    expect("dateApplied" in back).toBe(false);
  });

  it("round-trips a cover letter with its paragraph verdicts", () => {
    const letter = {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
      profileId: demo.profile.id,
      analysisId: demo.analysis.id,
      company: "Sunrise",
      jobTitle: "Director",
      greeting: "Dear Hiring Manager,",
      paragraphs: [
        {
          id: "p1",
          section: "summary" as const,
          text: "I am applying.",
          evidenceFactIds: ["f1"],
          evidenceText: ["source"],
          addressesRequirementIds: [],
          rationale: "why",
          validation: "user_confirmed" as const,
          validationNotes: [],
        },
      ],
      closing: "Sincerely",
      engine: "rules-engine",
    };
    const back = rowToCoverLetter(throughDatabase(coverLetterToRow(letter, OWNER)));
    expect(back).toEqual(letter);
    expect(back.paragraphs[0]?.validation).toBe("user_confirmed");
  });

  it("round-trips interview prep including the gap questions", () => {
    const prep = {
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
      profileId: demo.profile.id,
      analysisId: demo.analysis.id,
      questions: [],
      explainThese: [
        {
          id: "q1",
          kind: "gap" as const,
          question: "Where does that sit in your background?",
          why: "Nothing evidences it.",
          starPrompts: ["Do not claim it."],
          evidenceFactIds: [],
          requirementIds: [],
        },
      ],
      engine: "rules-engine",
    };
    const back = rowToInterviewPrep(throughDatabase(interviewPrepToRow(prep, OWNER)));
    expect(back).toEqual(prep);
  });
});
