import { describe, expect, it } from "vitest";

import {
  DEMO_JOB_TEXT,
  DEMO_RESUME_TEXT,
  analyzeJob,
  factsFromResume,
  generateCoverLetter,
  generateTailoredResume,
  newId,
  parseJobPosting,
  parseResume,
  type CandidateProfile,
  type JobPosting,
  type MasterResume,
} from "../index.ts";
import {
  PLANS,
  addFollowUp,
  addInterview,
  approveBaseResume,
  assessAnswer,
  assessFit,
  attachDrafts,
  blockingLines,
  buildPracticeSession,
  changeStage,
  checkAllowance,
  confirmInterpretation,
  confirmSubmission,
  decide,
  draftBaseResume,
  editBaseResumeLine,
  experienceQuestions,
  findDuplicate,
  newOpportunity,
  outreachDraft,
  parseSalary,
  postDraft,
  profileRecommendations,
  proposeInterpretations,
  recordAttempt,
  runDiscovery,
  summarize,
  usageEvent,
  validateIntake,
  validateResumeUpload,
  validateSubmissionDate,
  verifySubmission,
  type EmployerBoard,
  type SearchProfile,
} from "./index.ts";

const PROFILE_ID = newId();

const GOOD_FORM = {
  employmentSituation: "employed_full_time",
  searchActivity: "selectively_exploring",
  confidential: "yes",
  availability: "Two weeks' notice",
  targetTitles: "Transportation Manager, Logistics Manager",
  relatedTitles: "Fleet Manager",
  keywords: "DOT, routing",
  industries: "Logistics",
  goals: ["advancement"],
  locations: "Columbus, OH",
  locationsFirm: "firm",
  maxCommuteMiles: "30",
  arrangements: ["on_site", "hybrid"],
  arrangementsFirm: "firm",
  employmentTypes: ["full_time"],
  employmentTypesFirm: "firm",
  shiftLimits: ["no_overnight"],
  salaryMin: "85000",
  salaryTarget: "100000",
  salaryCurrency: "USD",
  salaryPeriod: "year",
  salaryFirm: "firm",
};

function profile(overrides: Record<string, string | string[]> = {}): SearchProfile {
  const result = validateIntake(PROFILE_ID, { ...GOOD_FORM, ...overrides });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.profile;
}

function demo() {
  const parsed = parseResume(DEMO_RESUME_TEXT);
  const facts = factsFromResume(PROFILE_ID, parsed);
  const resume: MasterResume = {
    id: newId(),
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    profileId: PROFILE_ID,
    label: "upload",
    format: "paste",
    rawText: DEMO_RESUME_TEXT,
    parsed,
    isDefault: true,
  };
  return { parsed, facts, resume };
}

// ---------------------------------------------------------------------------

describe("intake", () => {
  it("accepts a complete form and keeps firm requirements separate from preferences", () => {
    const p = profile();
    expect(p.locations).toEqual({ value: ["Columbus, OH"], firm: true });
    expect(p.maxCommuteMiles).toEqual({ value: 30, firm: false });
    expect(p.shiftLimits.firm).toBe(false);
    expect(p.salary).toEqual({
      minimum: 85000,
      target: 100000,
      currency: "USD",
      period: "year",
      firm: true,
    });
    expect(p.confidential).toBe(true);
  });

  it("returns every error at once and refuses values outside the allowed lists", () => {
    const r = validateIntake(PROFILE_ID, {
      employmentSituation: "rich",
      searchActivity: "",
      targetTitles: "",
      arrangements: ["on_site"],
      employmentTypes: ["gig"],
      salaryMin: "90000",
      salaryTarget: "50000",
      maxCommuteMiles: "far",
      availability: "2026-02-30",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      [
        "availability",
        "employmentSituation",
        "employmentTypes",
        "locations",
        "maxCommuteMiles",
        "salaryTarget",
        "searchActivity",
        "targetTitles",
      ].sort(),
    );
  });

  it("keeps the record id stable when preferences are edited", () => {
    const first = profile();
    const r = validateIntake(
      PROFILE_ID,
      { ...GOOD_FORM, targetTitles: "Operations Manager" },
      first,
    );
    expect(r.ok && r.profile.id).toBe(first.id);
  });
});

describe("fit: firm requirements versus preferences", () => {
  const job = (
    overrides: Partial<{
      location: string;
      salaryText: string;
      description: string;
      title: string;
    }> = {},
  ) => ({
    title: "Transportation Manager",
    location: "Columbus, OH",
    description: "Full-time, on-site role. Manage DOT compliance and routing.",
    ...overrides,
  });

  it("blocks a role that fails a firm requirement", () => {
    const fit = assessFit(job({ location: "Denver, CO" }), profile());
    expect(fit.label).toBe("blocked");
    expect(fit.gaps.join(" ")).toMatch(/firm requirement/);
  });

  it("only lowers the preference score when a preference fails", () => {
    const fit = assessFit(
      job({ location: "Denver, CO" }),
      profile({ locationsFirm: "" }),
    );
    expect(fit.label).not.toBe("blocked");
    expect(fit.preferenceScore).toBeLessThan(100);
  });

  it("treats a disclosed salary below a firm minimum as blocking, and an undisclosed salary as unknown", () => {
    expect(
      assessFit(job({ salaryText: "$60,000 - $70,000 per year" }), profile()).label,
    ).toBe("blocked");
    const unknown = assessFit(job(), profile());
    expect(unknown.checks.find((c) => c.criterion === "Salary")?.result).toBe(
      "unknown",
    );
    expect(unknown.uncertain.join(" ")).toMatch(/Salary not listed/);
  });

  it("parses hourly and annual ranges", () => {
    expect(parseSalary("$22.50 - $26.00 per hour")).toEqual({
      low: 22.5,
      high: 26,
      period: "hour",
    });
    expect(parseSalary("$90k–$110k")).toEqual({
      low: 90000,
      high: 110000,
      period: "year",
    });
    expect(parseSalary("Competitive")).toBeNull();
  });

  it("never lets employment situation or search activity change the result", () => {
    const situations = [
      "employed_full_time",
      "unemployed",
      "career_break",
      "student",
      "prefer_not_to_say",
    ];
    const results = situations.map((s) => {
      const fit = assessFit(
        job(),
        profile({ employmentSituation: s, searchActivity: "actively_applying" }),
      );
      return { ...fit, assessedAt: "" };
    });
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("does not pretend to measure commute distance", () => {
    const fit = assessFit(job(), profile());
    expect(fit.checks.find((c) => c.criterion === "Commute")?.result).toBe("unknown");
  });
});

describe("experience bank and base resume", () => {
  it("asks targeted questions about what the resume leaves out", () => {
    const { parsed, facts } = demo();
    const qs = experienceQuestions(parsed, facts);
    expect(qs.some((q) => q.topic === "examples")).toBe(true);
    for (const q of qs) expect(q.prompt.length).toBeGreaterThan(10);
  });

  it("holds inferences apart from evidence until confirmed", () => {
    const facts = factsFromResume(
      PROFILE_ID,
      parseResume(
        "Pat Doe\nEXPERIENCE\nShift Lead | Acme Freight | 2019 - Present\n- Trained 12 associates on RF scanner use and forklift safety",
      ),
    );
    const proposals = proposeInterpretations(PROFILE_ID, facts, []);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.every((p) => p.status === "pending")).toBe(true);
    // Not a fact yet.
    expect(facts.some((f) => f.text === proposals[0]?.proposedText)).toBe(false);
    const { interpretation, fact } = confirmInterpretation(proposals[0]!);
    expect(interpretation.status).toBe("confirmed");
    expect(fact.source).toBe("user_confirmed");
    expect(interpretation.confirmedFactId).toBe(fact.id);
  });

  it("drafts only from facts, blocks approval on an invented figure, and never edits an approved version", () => {
    const { facts, resume } = demo();
    const draft = draftBaseResume({
      profileId: PROFILE_ID,
      resume,
      facts,
      versionNumber: 1,
    });
    expect(draft.status).toBe("draft");
    expect(blockingLines(draft)).toHaveLength(0);
    for (const b of draft.roles.flatMap((r) => r.bullets))
      expect(b.factIds.length).toBe(1);

    const roleIndex = draft.roles.findIndex((r) => r.bullets.length > 0);
    const tampered = editBaseResumeLine(
      draft,
      roleIndex,
      0,
      "Managed a $900M P&L across 40 countries",
      facts,
    );
    expect(blockingLines(tampered)).toHaveLength(1);
    expect(() => approveBaseResume(tampered, "", parseResume)).toThrow(/not supported/);

    const { base, master } = approveBaseResume(draft, "pat@example.com", parseResume);
    expect(base.status).toBe("approved");
    expect(master.parsed.experience.length).toBe(draft.roles.length);
    expect(() => editBaseResumeLine(base, 0, 0, "x", facts)).toThrow(
      /never edited in place/,
    );
  });

  it("keeps omitted facts in the bank", () => {
    const { facts, resume } = demo();
    const omit = facts.find((f) => f.category === "accomplishment")!;
    const draft = draftBaseResume({
      profileId: PROFILE_ID,
      resume,
      facts,
      versionNumber: 2,
      excludeFactIds: [omit.id],
    });
    expect(draft.omittedFactIds).toContain(omit.id);
    expect(
      draft.roles.flatMap((r) => r.bullets).some((b) => b.factIds.includes(omit.id)),
    ).toBe(false);
  });
});

describe("discovery", () => {
  const board = (source: EmployerBoard["source"], token: string): EmployerBoard => ({
    id: newId(),
    createdAt: "",
    updatedAt: "",
    profileId: PROFILE_ID,
    employer: "Acme Freight",
    source,
    boardToken: token,
  });
  const greenhousePayload = {
    jobs: [
      {
        id: 1,
        title: "Transportation Manager",
        location: { name: "Columbus, OH" },
        absolute_url: "https://x/1",
        content: "<p>Full-time on-site. DOT compliance.</p>",
        first_published: "2026-10-20T00:00:00Z",
      },
      {
        id: 2,
        title: "Software Engineer",
        location: { name: "Remote" },
        absolute_url: "https://x/2",
        content: "Code",
        first_published: "2026-10-20T00:00:00Z",
      },
    ],
  };

  it("ingests relevant postings, keeps a snapshot, and records retrieval and posting dates", async () => {
    const r = await runDiscovery({
      profileId: PROFILE_ID,
      boards: [board("greenhouse", "acme")],
      criteria: profile(),
      existing: [],
      fetchJson: () => Promise.resolve(greenhousePayload),
    });
    expect(r.added).toHaveLength(1);
    const o = r.added[0]!;
    expect(o.descriptionSnapshot).toContain("DOT compliance");
    expect(o.postedAt).toBe("2026-10-20T00:00:00.000Z");
    expect(o.retrievedAt).toBeTruthy();
    expect(o.fit).toBeDefined();
    expect(o.stage).toBe("new_match");
  });

  it("reports a failed source and does not expire anything on failure", async () => {
    const b = board("greenhouse", "acme");
    const first = await runDiscovery({
      profileId: PROFILE_ID,
      boards: [b],
      criteria: profile(),
      existing: [],
      fetchJson: () => Promise.resolve(greenhousePayload),
    });
    const failed = await runDiscovery({
      profileId: PROFILE_ID,
      boards: [b],
      criteria: profile(),
      existing: first.added,
      fetchJson: () => Promise.reject(new Error("Board unavailable (HTTP 503)")),
    });
    expect(failed.boards[0]).toMatchObject({
      ok: false,
      error: "Board unavailable (HTTP 503)",
    });
    expect(failed.expired).toBe(0);
    expect(failed.updated).toHaveLength(0);
  });

  it("refuses a malformed board token without making a request", async () => {
    let called = false;
    const r = await runDiscovery({
      profileId: PROFILE_ID,
      boards: [board("lever", "../../etc")],
      criteria: profile(),
      existing: [],
      fetchJson: () => {
        called = true;
        return Promise.resolve([]);
      },
    });
    expect(called).toBe(false);
    expect(r.boards[0]?.ok).toBe(false);
  });

  it("marks a posting expired only after a successful read without it", async () => {
    const b = board("greenhouse", "acme");
    const first = await runDiscovery({
      profileId: PROFILE_ID,
      boards: [b],
      criteria: profile(),
      existing: [],
      fetchJson: () => Promise.resolve(greenhousePayload),
    });
    const second = await runDiscovery({
      profileId: PROFILE_ID,
      boards: [b],
      criteria: profile(),
      existing: first.added,
      fetchJson: () => Promise.resolve({ jobs: [] }),
    });
    expect(second.expired).toBe(1);
    expect(second.updated[0]?.expiredAt).toBeTruthy();
  });

  it("does not re-add a duplicate, records the extra sighting, and flags a previously applied role", async () => {
    const existing = newOpportunity({
      profileId: PROFILE_ID,
      source: "manual",
      employer: "Acme Freight Inc.",
      title: "Transportation Manager",
      description: "",
    });
    const applied = { ...existing, submissionId: newId() };
    const r = await runDiscovery({
      profileId: PROFILE_ID,
      boards: [board("greenhouse", "acme")],
      criteria: profile(),
      existing: [applied],
      fetchJson: () => Promise.resolve(greenhousePayload),
    });
    expect(r.added).toHaveLength(0);
    expect(r.duplicates).toBe(1);
    expect(r.previouslyApplied).toBe(1);
    expect(r.updated[0]?.alsoSeen).toHaveLength(1);
  });

  it("keeps two genuinely different jobs with the same title apart", () => {
    const a = newOpportunity({
      profileId: PROFILE_ID,
      source: "manual",
      employer: "Acme",
      title: "Operations Manager",
      description:
        "Lead the cross-dock night operation for the Columbus regional hub with forty associates and daily trailer flow",
    });
    const out = findDuplicate(
      {
        employer: "Acme",
        title: "Operations Manager",
        description:
          "Own corporate finance operations reporting, month end close and budgeting for the shared services centre",
        source: "manual",
      },
      [a],
    );
    expect(out.kind).toBe("new");
  });
});

// ---------------------------------------------------------------------------

function packageFor() {
  const { facts, resume } = demo();
  const parsedJob = parseJobPosting({ rawText: DEMO_JOB_TEXT });
  const job: JobPosting = {
    id: newId(),
    createdAt: "",
    updatedAt: "",
    profileId: PROFILE_ID,
    company: parsedJob.company,
    title: parsedJob.title,
    rawText: DEMO_JOB_TEXT,
    facets: parsedJob.facets,
    requirements: parsedJob.requirements,
    keywords: parsedJob.keywords,
  };
  const analysis = analyzeJob({ profileId: PROFILE_ID, resume, facts, job });
  const cand: CandidateProfile = {
    id: PROFILE_ID,
    createdAt: "",
    updatedAt: "",
    userId: newId(),
    fullName: "Pat Doe",
    headline: "",
    summary: "",
    contact: {},
  };
  const generated = generateTailoredResume({
    profile: cand,
    resume,
    facts,
    job,
    analysis,
    versionNumber: 1,
  });
  const letter = generateCoverLetter({ profile: cand, job, analysis, facts });
  let opp = newOpportunity({
    profileId: PROFILE_ID,
    source: "manual",
    employer: job.company,
    title: job.title,
    description: DEMO_JOB_TEXT,
  });
  opp = decide(opp, "pursue");
  opp = attachDrafts(opp, { resumeId: generated.id, coverLetterId: letter.id });
  return { facts, job, analysis, generated, letter, opp, cand };
}

describe("pipeline and the frozen submission archive", () => {
  it("generation means Documents Ready, never Applied", () => {
    const { opp } = packageFor();
    expect(opp.stage).toBe("documents_ready");
    expect(opp.history.map((h) => h.stage)).toEqual([
      "new_match",
      "pursuing",
      "documents_ready",
    ]);
  });

  it("refuses to set Applied by a stage change and refuses illegal transitions", () => {
    const { opp } = packageFor();
    expect(() => changeStage(opp, "applied")).toThrow(/confirm/);
    expect(() => changeStage(opp, "offer")).toThrow(/Cannot move/);
    expect(() => changeStage(opp, "hired")).toThrow(/not a stage/);
  });

  it("collects optional pass reasons without turning them into exclusions", () => {
    const o = newOpportunity({
      profileId: PROFILE_ID,
      source: "manual",
      employer: "A",
      title: "B",
      description: "",
    });
    const passed = decide(o, "pass", ["Commute too long", ""]);
    expect(passed.stage).toBe("passed");
    expect(passed.passReasons).toEqual(["Commute too long"]);
  });

  it("validates the submission date server-side", () => {
    expect(validateSubmissionDate("2026-10-30", "2026-10-31")).toBeNull();
    expect(validateSubmissionDate("2026-11-05", "2026-10-31")).toMatch(/future/);
    expect(validateSubmissionDate("2026-02-30", "2026-10-31")).toMatch(
      /real calendar date/,
    );
    expect(validateSubmissionDate("yesterday", "2026-10-31")).toMatch(
      /real calendar date/,
    );
  });

  it("freezes the exact package, hashes it, and refuses a second submission", () => {
    const { opp, generated, letter } = packageFor();
    const { opportunity, submission } = confirmSubmission({
      opportunity: opp,
      resume: generated,
      coverLetter: letter,
      submittedOn: "2026-10-30",
      submittedVia: "Company careers site",
      today: "2026-10-31",
    });
    expect(opportunity.stage).toBe("applied");
    expect(opportunity.submittedVia).toBe("Company careers site");
    expect(opportunity.foundVia).toBe("Manual import");
    expect(verifySubmission(submission)).toBe(true);
    expect(Object.isFrozen(submission.resume)).toBe(true);
    expect(() => {
      (submission.resume as { company: string }).company = "Tampered";
    }).toThrow();

    // Regenerating and editing later changes drafts, never the submission.
    const before = submission.resumeText;
    (generated as { company: string }).company = "Edited later";
    const again = attachDrafts(opportunity, { resumeId: newId() });
    expect(again.stage).toBe("applied");
    expect(submission.resumeText).toBe(before);
    expect(submission.resume.company).not.toBe("Edited later");

    expect(() =>
      confirmSubmission({
        opportunity,
        resume: generated,
        submittedOn: "2026-10-30",
        submittedVia: "x",
        today: "2026-10-31",
      }),
    ).toThrow(/already submitted/);
  });

  it("detects a tampered archive", () => {
    const { opp, generated } = packageFor();
    const { submission } = confirmSubmission({
      opportunity: opp,
      resume: generated,
      submittedOn: "2026-10-30",
      submittedVia: "Indeed",
      today: "2026-10-31",
    });
    const copy = { ...structuredClone(submission), resumeText: "something else" };
    expect(verifySubmission(copy)).toBe(false);
  });

  it("refuses a resume that was not prepared for this opportunity", () => {
    const { opp, generated } = packageFor();
    expect(() =>
      confirmSubmission({
        opportunity: opp,
        resume: { ...generated, id: newId() },
        submittedOn: "2026-10-30",
        submittedVia: "x",
        today: "2026-10-31",
      }),
    ).toThrow(/not prepared/);
  });

  it("summarises follow-ups due, upcoming interviews and outcomes by source from records", () => {
    const { opp, generated } = packageFor();
    let { opportunity } = confirmSubmission({
      opportunity: opp,
      resume: generated,
      submittedOn: "2026-10-30",
      submittedVia: "x",
      today: "2026-10-31",
    });
    opportunity = addInterview(opportunity, {
      label: "Phone screen",
      date: "2026-11-04",
    });
    opportunity = addFollowUp(opportunity, "2026-10-31", "Email recruiter");
    expect(() =>
      addInterview(opportunity, { label: "x", date: "2026-13-01" }),
    ).toThrow();
    const s = summarize([opportunity], "2026-10-31");
    expect(s.applied).toBe(1);
    expect(s.interviewsUpcoming).toHaveLength(1);
    expect(s.followUpsDue).toHaveLength(1);
    expect(s.outcomesBySource[0]).toMatchObject({
      source: "Manual import",
      found: 1,
      applied: 1,
      interviews: 1,
    });
    expect(summarize([]).total).toBe(0);
  });
});

describe("interview practice uses the submitted version", () => {
  it("builds questions from the frozen resume and gives structured feedback", () => {
    const { opp, generated, letter, facts, job, analysis } = packageFor();
    const { submission } = confirmSubmission({
      opportunity: opp,
      resume: generated,
      coverLetter: letter,
      submittedOn: "2026-10-30",
      submittedVia: "x",
      today: "2026-10-31",
    });
    const session = buildPracticeSession({
      submission,
      job,
      analysis,
      facts,
      round: "Phone screen",
    });
    expect(session.submissionId).toBe(submission.id);
    expect(session.questions[0]?.kind).toBe("introduction");
    expect(session.briefing.join(" ")).toContain("2026-10-30");
    const sent = new Set(
      [
        generated.headline,
        ...generated.summary,
        ...generated.experience.flatMap((e) => e.bullets),
      ].map((l) => l.text),
    );
    for (const q of session.questions)
      for (const l of q.useThese) expect(sent.has(l)).toBe(true);

    const weak = assessAnswer(session.questions[1]!, "I am good at it.", facts);
    const strong = assessAnswer(
      session.questions[1]!,
      "At my last company the warehouse was missing ship dates. I was responsible for fixing outbound flow before peak. I reorganised the dock schedule and I trained the leads on a new pick sequence, and I worked with carriers on appointment times. As a result we improved on-time shipping and cut overtime, and the team kept it going after I moved roles. It took about two months and the process became the standard for the other building.",
      facts,
    );
    expect(strong.score).toBeGreaterThan(weak.score);
    const invented = assessAnswer(
      session.questions[1]!,
      "I cut costs by 9137%.",
      facts,
    );
    expect(invented.unverifiedFigures).toContain("9137%");
    const next = recordAttempt(
      session,
      session.questions[1]!.id,
      "I led the team.",
      facts,
    );
    expect(next.attempts).toHaveLength(1);
    expect(() => recordAttempt(session, "nope", "x", facts)).toThrow();
  });
});

describe("LinkedIn and outreach", () => {
  it("builds recommendations only from verified facts and keeps posts in the subscriber's words", () => {
    const { facts, resume } = demo();
    const draft = draftBaseResume({
      profileId: PROFILE_ID,
      resume,
      facts,
      versionNumber: 1,
    });
    const { base } = approveBaseResume(draft, "", parseResume);
    const recs = profileRecommendations({
      profileId: PROFILE_ID,
      base,
      facts,
      search: profile(),
    });
    expect(recs.length).toBeGreaterThan(0);
    // Confidential search: no "open to" headline.
    expect(recs.some((r) => /Open to/.test(r.text))).toBe(false);
    const open = profileRecommendations({
      profileId: PROFILE_ID,
      base,
      facts,
      search: profile({ confidential: "no" }),
    });
    expect(open.some((r) => /Open to/.test(r.text))).toBe(true);
    for (const r of recs.filter((x) => x.kind !== "headline"))
      expect(r.validation).not.toBe("unsupported");

    const post = postDraft(PROFILE_ID, {
      topic: "Peak season",
      story: "We moved 40 trailers a day through one dock.",
      lesson: "Plan the yard first.",
    });
    expect(post.text).toContain("We moved 40 trailers a day through one dock.");
    expect(post.status).toBe("draft");
  });

  it("keeps the current employer out of confidential outreach", () => {
    const o = newOpportunity({
      profileId: PROFILE_ID,
      source: "manual",
      employer: "Target Co",
      title: "Ops Manager",
      description: "",
    });
    expect(
      outreachDraft({
        opportunity: o,
        strengths: [],
        fullName: "Pat",
        confidential: true,
      }),
    ).toMatch(/Confidential search/);
  });
});

describe("plans, usage limits and uploads", () => {
  it("enforces the monthly limit on the server-side allowance check", () => {
    const usage = Array.from(
      { length: PLANS.pilot.monthlyLimits.package_generation! },
      () => usageEvent(PROFILE_ID, "package_generation", "rules-engine"),
    );
    expect(
      checkAllowance(PLANS.pilot, usage.slice(1), "package_generation").allowed,
    ).toBe(true);
    expect(checkAllowance(PLANS.pilot, usage, "package_generation").allowed).toBe(
      false,
    );
    expect(Object.values(PLANS).every((p) => p.checkoutEnabled === false)).toBe(true);
  });

  it("validates uploads by content, not just by name", () => {
    expect(
      validateResumeUpload("r.pdf", new TextEncoder().encode("%PDF-1.4 ...")),
    ).toBeNull();
    expect(
      validateResumeUpload("r.pdf", new TextEncoder().encode("MZ executable")),
    ).toMatch(/not a PDF/);
    expect(validateResumeUpload("r.exe", new TextEncoder().encode("PK"))).toMatch(
      /PDF or a Word/,
    );
    expect(
      validateResumeUpload("r.docx", new Uint8Array(6 * 1024 * 1024).fill(0x50)),
    ).toMatch(/5 MB/);
  });
});
