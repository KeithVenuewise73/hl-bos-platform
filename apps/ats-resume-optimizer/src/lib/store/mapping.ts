/**
 * Domain objects <-> `ats` rows.
 *
 * Two rules shape every mapping here.
 *
 * PROVENANCE SURVIVES THE ROUND TRIP. `source`, `validation`, `numbers`,
 * `derivedFrom` and the evidence links are the product's whole claim to being
 * trustworthy. A mapping that dropped one of them would turn "verified against
 * your own resume" into "we think so", silently, at the storage layer. The
 * round-trip tests exist for exactly that.
 *
 * THE DATABASE IS NOT A DUMPING GROUND. Things that are genuinely relational —
 * profiles, facts, resumes, postings, applications — get columns, because they
 * are queried and constrained. Computed artifacts that are only ever read whole
 * (an analysis's matrix, a generated resume's sections) are stored as JSONB in
 * the row that owns them: they are immutable records of what the engine said at
 * a point in time, and shredding them into tables would buy nothing and cost a
 * join per screen.
 *
 * Pure: no client, no I/O, no environment. Every function here is a total
 * function of its input.
 */

import type {
  Application,
  CandidateProfile,
  CareerFact,
  CoverLetter,
  GeneratedResume,
  InterviewPrep,
  JobAnalysis,
  JobPosting,
  MasterResume,
} from "@hl-bos/ats-resume";

/** A row as PostgREST returns it: snake_case, nulls rather than undefined. */
export type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * SQL has NULL; the domain model has absent keys (`exactOptionalPropertyTypes`).
 * `null` and `""` both mean "not set" on the way in, and an absent key on the
 * way out — so a record does not change shape merely by being saved and reloaded.
 */
function optional(value: unknown): string | undefined {
  const out = text(value);
  return out.length === 0 ? undefined : out;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Anything else — an object, an array, a symbol — is not a scalar column, and
  // "[object Object]" in a resume field would be worse than an empty one.
  return "";
}

function bool(value: unknown): boolean {
  return value === true;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function json<T>(value: unknown, fallback: T): T {
  return value === null || value === undefined ? fallback : (value as T);
}

/** Only include a key when it has a value, so optional fields stay optional. */
function withOptional<T extends object>(
  base: T,
  extras: Record<string, string | undefined>,
): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** `isSample` is only ever present when true — it drives a UI badge. */
function sampleFlag(value: unknown): { isSample?: true } {
  return value === true ? { isSample: true } : {};
}

// ---------------------------------------------------------------------------
// Candidate profile
// ---------------------------------------------------------------------------

export function profileToRow(profile: CandidateProfile, ownerId: string): Row {
  return {
    id: profile.id,
    owner_id: ownerId,
    full_name: profile.fullName,
    headline: profile.headline,
    summary: profile.summary,
    contact: profile.contact,
    is_sample: profile.isSample === true,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

export function rowToProfile(row: Row, userId: string): CandidateProfile {
  return {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    userId,
    fullName: text(row["full_name"]),
    headline: text(row["headline"]),
    summary: text(row["summary"]),
    contact: json(row["contact"], {}),
    ...sampleFlag(row["is_sample"]),
  };
}

// ---------------------------------------------------------------------------
// Career facts — the evidence corpus
// ---------------------------------------------------------------------------

export function factToRow(fact: CareerFact, ownerId: string): Row {
  return {
    id: fact.id,
    owner_id: ownerId,
    profile_id: fact.profileId,
    category: fact.category,
    fact_text: fact.text,
    source: fact.source,
    context: fact.context ?? null,
    numbers: fact.numbers,
    derived_from: fact.derivedFrom ?? [],
    is_sample: fact.isSample === true,
    created_at: fact.createdAt,
    updated_at: fact.updatedAt,
  };
}

export function rowToFact(row: Row): CareerFact {
  const derived = stringArray(row["derived_from"]);
  const base: CareerFact = {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    category: text(row["category"]) as CareerFact["category"],
    text: text(row["fact_text"]),
    // The source is what makes a fact evidence rather than an assertion. If a
    // row somehow carries an unknown value, it is read as generated wording —
    // the least privileged of the three — never as resume-backed.
    source: readSource(row["source"]),
    numbers: stringArray(row["numbers"]),
    ...(derived.length > 0 ? { derivedFrom: derived } : {}),
    ...sampleFlag(row["is_sample"]),
  };
  return withOptional(base, { context: optional(row["context"]) });
}

function readSource(value: unknown): CareerFact["source"] {
  const raw = text(value);
  return raw === "resume" || raw === "user_confirmed" ? raw : "generated_wording";
}

// ---------------------------------------------------------------------------
// Master resume
// ---------------------------------------------------------------------------

export function resumeToRow(resume: MasterResume, ownerId: string): Row {
  return {
    id: resume.id,
    owner_id: ownerId,
    profile_id: resume.profileId,
    label: resume.label,
    format: resume.format,
    raw_text: resume.rawText,
    is_default: resume.isDefault,
    is_sample: resume.isSample === true,
    created_at: resume.createdAt,
    updated_at: resume.updatedAt,
  };
}

/** The structured reading lives in `ats.resume_versions`, keyed by resume id. */
export function resumeVersionToRow(resume: MasterResume, ownerId: string): Row {
  return {
    owner_id: ownerId,
    resume_id: resume.id,
    version_no: 1,
    parsed: resume.parsed,
    created_at: resume.createdAt,
  };
}

export function rowToResume(row: Row, parsed: unknown): MasterResume {
  return {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    label: text(row["label"]),
    format: text(row["format"]) as MasterResume["format"],
    rawText: text(row["raw_text"]),
    parsed: json(parsed, emptyParsed()),
    isDefault: bool(row["is_default"]),
    ...sampleFlag(row["is_sample"]),
  };
}

function emptyParsed(): MasterResume["parsed"] {
  return {
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
}

// ---------------------------------------------------------------------------
// Job posting
// ---------------------------------------------------------------------------

export function jobToRow(job: JobPosting, ownerId: string): Row {
  return {
    id: job.id,
    owner_id: ownerId,
    profile_id: job.profileId,
    company: job.company,
    title: job.title,
    location: job.location ?? null,
    url: job.url ?? null,
    raw_text: job.rawText,
    // Requirements and keywords are rows in ats.job_requirements and
    // ats.job_keywords, not JSON here — the evidence matrix references them by
    // id, and a foreign key is a better guarantee than a hope.
    facets: job.facets,
    is_sample: job.isSample === true,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

export function rowToJob(
  row: Row,
  requirements: readonly JobRequirement[] = [],
  keywords: readonly JobKeyword[] = [],
): JobPosting {
  const base: JobPosting = {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    company: text(row["company"]),
    title: text(row["title"]),
    rawText: text(row["raw_text"]),
    facets: json(row["facets"], emptyFacets()),
    requirements: [...requirements],
    keywords: [...keywords],
    ...sampleFlag(row["is_sample"]),
  };
  return withOptional(base, {
    location: optional(row["location"]),
    url: optional(row["url"]),
  });
}

function emptyFacets(): JobPosting["facets"] {
  return {
    certifications: [],
    software: [],
    hardSkills: [],
    softSkills: [],
    leadership: [],
    responsibilities: [],
    industryTerms: [],
    actionVerbs: [],
    managementScope: [],
    budgetExpectations: [],
    compliance: [],
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function analysisToRow(analysis: JobAnalysis, ownerId: string): Row {
  return {
    id: analysis.id,
    owner_id: ownerId,
    profile_id: analysis.profileId,
    resume_id: analysis.resumeId,
    job_posting_id: analysis.jobPostingId,
    score_before: analysis.scoreBefore,
    score_projected: analysis.scoreProjected,
    keyword_analysis: analysis.keywords,
    terminology: analysis.terminology,
    format_findings: analysis.formatFindings,
    // The matrix itself is rows in ats.requirement_matches, where the
    // not_evidenced_has_no_evidence constraint can see it.
    recommendations: analysis.recommendations,
    engine: analysis.engine,
    is_sample: analysis.isSample === true,
    created_at: analysis.createdAt,
    updated_at: analysis.updatedAt,
  };
}

export function rowToAnalysis(
  row: Row,
  matches: readonly RequirementMatch[] = [],
): JobAnalysis {
  return {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    resumeId: text(row["resume_id"]),
    jobPostingId: text(row["job_posting_id"]),
    matches: [...matches],
    keywords: json(row["keyword_analysis"], {
      present: [],
      supportedMissing: [],
      unsupported: [],
    }),
    terminology: json(row["terminology"], []),
    scoreBefore: json(row["score_before"], emptyScore()),
    scoreProjected: json(row["score_projected"], emptyScore()),
    formatFindings: json(row["format_findings"], []),
    recommendations: json<readonly string[]>(row["recommendations"], []),
    engine: text(row["engine"]),
    ...sampleFlag(row["is_sample"]),
  };
}

function emptyScore(): JobAnalysis["scoreBefore"] {
  const zero = {
    qualificationAlignment: 0,
    relevantExperience: 0,
    skillsAndKeywords: 0,
    quantifiedAccomplishments: 0,
    atsStructure: 0,
  };
  return { overall: 0, breakdown: zero, weights: zero, explanation: [] };
}

// ---------------------------------------------------------------------------
// Generated resume
// ---------------------------------------------------------------------------

export function generatedToRow(resume: GeneratedResume, ownerId: string): Row {
  return {
    id: resume.id,
    owner_id: ownerId,
    profile_id: resume.profileId,
    analysis_id: resume.analysisId,
    resume_id: resume.resumeId,
    job_posting_id: resume.jobPostingId,
    version_no: resume.versionNumber,
    company: resume.company,
    job_title: resume.jobTitle,
    full_name: resume.fullName,
    contact: resume.contact,
    competencies: resume.competencies,
    // Every generated LINE — headline, summary and each bullet — is a row in
    // ats.generated_resume_bullets, where unsupported_claims_are_never_exported
    // can enforce the product's central promise. Only the education list and
    // the experience entry metadata stay here; bullets are not JSON.
    education: {
      education: resume.education,
      experience: resume.experience.map(experienceShell),
    },
    certifications: resume.certifications,
    additional: resume.additional,
    section_order: resume.sectionOrder,
    engine: resume.engine,
    is_sample: resume.isSample === true,
    created_at: resume.createdAt,
    updated_at: resume.updatedAt,
  };
}

export function rowToGenerated(
  row: Row,
  lines: readonly GeneratedLine[] = [],
): GeneratedResume {
  const bundle = json<{
    education?: GeneratedResume["education"];
    experience?: readonly ExperienceShell[];
  }>(row["education"], {});

  const bySection = (section: string): GeneratedLine[] =>
    lines.filter((l) => l.section === section && l.groupId === undefined);
  const byGroup = new Map<string, GeneratedLine[]>();
  for (const line of lines) {
    if (line.groupId === undefined) continue;
    byGroup.set(line.groupId, [...(byGroup.get(line.groupId) ?? []), line]);
  }

  return {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    analysisId: text(row["analysis_id"]),
    resumeId: text(row["resume_id"]),
    jobPostingId: text(row["job_posting_id"]),
    versionNumber: Number(row["version_no"] ?? 1),
    company: text(row["company"]),
    jobTitle: text(row["job_title"]),
    fullName: text(row["full_name"]),
    contact: json(row["contact"], {}),
    headline: bySection("header")[0] ?? missingLine(),
    summary: bySection("summary"),
    competencies: stringArray(row["competencies"]),
    experience: rebuildExperience(bundle.experience ?? [], byGroup),
    education: bundle.education ?? [],
    certifications: stringArray(row["certifications"]),
    additional: stringArray(row["additional"]),
    sectionOrder: stringArray(row["section_order"]) as GeneratedResume["sectionOrder"],
    engine: text(row["engine"]),
    ...sampleFlag(row["is_sample"]),
  };
}

/**
 * A line that could not be read back.
 *
 * It is `unsupported` on purpose: a generated line whose evidence did not
 * survive storage must fail closed, so the export path drops it rather than
 * writing an unverifiable sentence into somebody's resume.
 */
function missingLine(): GeneratedResume["headline"] {
  return {
    id: "missing",
    section: "header",
    text: "",
    evidenceFactIds: [],
    evidenceText: [],
    addressesRequirementIds: [],
    rationale: "This line could not be read back from storage.",
    validation: "unsupported",
    validationNotes: [
      "Stored data for this line was missing or unreadable, so it is treated as unsupported and excluded from exports.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Applications, cover letters, interview prep
// ---------------------------------------------------------------------------

export function applicationToRow(application: Application, ownerId: string): Row {
  return {
    id: application.id,
    owner_id: ownerId,
    profile_id: application.profileId,
    company: application.company,
    role: application.role,
    job_url: application.jobUrl ?? null,
    job_posting_id: application.jobPostingId ?? null,
    analysis_id: application.analysisId ?? null,
    generated_resume_id: application.generatedResumeId ?? null,
    cover_letter_id: application.coverLetterId ?? null,
    date_analyzed: application.dateAnalyzed ?? null,
    date_applied: application.dateApplied ?? null,
    status: application.status,
    recruiter_name: application.recruiterName ?? null,
    recruiter_contact: application.recruiterContact ?? null,
    interview_dates: application.interviewDates,
    notes: application.notes,
    is_sample: application.isSample === true,
    created_at: application.createdAt,
    updated_at: application.updatedAt,
  };
}

export function rowToApplication(row: Row): Application {
  const base: Application = {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    company: text(row["company"]),
    role: text(row["role"]),
    status: text(row["status"]) as Application["status"],
    interviewDates: stringArray(row["interview_dates"]),
    notes: text(row["notes"]),
    ...sampleFlag(row["is_sample"]),
  };
  return withOptional(base, {
    jobUrl: optional(row["job_url"]),
    jobPostingId: optional(row["job_posting_id"]),
    analysisId: optional(row["analysis_id"]),
    generatedResumeId: optional(row["generated_resume_id"]),
    coverLetterId: optional(row["cover_letter_id"]),
    dateAnalyzed: optional(row["date_analyzed"]),
    dateApplied: optional(row["date_applied"]),
    recruiterName: optional(row["recruiter_name"]),
    recruiterContact: optional(row["recruiter_contact"]),
  });
}

export function coverLetterToRow(letter: CoverLetter, ownerId: string): Row {
  return {
    id: letter.id,
    owner_id: ownerId,
    profile_id: letter.profileId,
    analysis_id: letter.analysisId,
    company: letter.company,
    job_title: letter.jobTitle,
    greeting: letter.greeting,
    paragraphs: letter.paragraphs,
    closing: letter.closing,
    engine: letter.engine,
    is_sample: letter.isSample === true,
    created_at: letter.createdAt,
    updated_at: letter.updatedAt,
  };
}

export function rowToCoverLetter(row: Row): CoverLetter {
  return {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    analysisId: text(row["analysis_id"]),
    company: text(row["company"]),
    jobTitle: text(row["job_title"]),
    greeting: text(row["greeting"]),
    paragraphs: json(row["paragraphs"], []),
    closing: text(row["closing"]),
    engine: text(row["engine"]),
    ...sampleFlag(row["is_sample"]),
  };
}

export function interviewPrepToRow(prep: InterviewPrep, ownerId: string): Row {
  return {
    id: prep.id,
    owner_id: ownerId,
    profile_id: prep.profileId,
    analysis_id: prep.analysisId,
    questions: prep.questions,
    explain_these: prep.explainThese,
    engine: prep.engine,
    is_sample: prep.isSample === true,
    created_at: prep.createdAt,
    updated_at: prep.updatedAt,
  };
}

export function rowToInterviewPrep(row: Row): InterviewPrep {
  return {
    id: text(row["id"]),
    createdAt: text(row["created_at"]),
    updatedAt: text(row["updated_at"]),
    profileId: text(row["profile_id"]),
    analysisId: text(row["analysis_id"]),
    questions: json(row["questions"], []),
    explainThese: json(row["explain_these"], []),
    engine: text(row["engine"]),
    ...sampleFlag(row["is_sample"]),
  };
}

// ---------------------------------------------------------------------------
// The normalised children
// ---------------------------------------------------------------------------
//
// These exist for one reason. The migration's CHECK constraints —
// `unsupported_claims_are_never_exported`, `not_evidenced_has_no_evidence`,
// `generated_wording_must_cite_sources` — guard rows in these tables. Storing
// requirements, matches and generated lines as JSONB on their parents would
// have left those tables permanently empty, which would make the database half
// of the anti-fabrication guarantee decorative: a constraint that never sees a
// row is not a control, it is a comment with punctuation.
//
// So the child tables are the source of truth for exactly the things the
// database is asked to police, and the read path reassembles them.

import { isExportable } from "@hl-bos/ats-resume";
import type {
  GeneratedExperience,
  GeneratedLine,
  JobKeyword,
  JobRequirement,
  RequirementMatch,
  SectionKind,
} from "@hl-bos/ats-resume";

export function requirementToRow(
  requirement: JobRequirement,
  jobPostingId: string,
  ownerId: string,
): Row {
  return {
    id: requirement.id,
    owner_id: ownerId,
    job_posting_id: jobPostingId,
    requirement_text: requirement.text,
    kind: requirement.kind,
    importance: requirement.importance,
    source_section: requirement.sourceSection,
    terms: requirement.terms,
    years_required: requirement.yearsRequired ?? null,
  };
}

export function rowToRequirement(row: Row): JobRequirement {
  const years = row["years_required"];
  return {
    id: text(row["id"]),
    text: text(row["requirement_text"]),
    kind: text(row["kind"]) as JobRequirement["kind"],
    importance: text(row["importance"]) as JobRequirement["importance"],
    sourceSection: text(row["source_section"]),
    terms: stringArray(row["terms"]),
    ...(years === null || years === undefined ? {} : { yearsRequired: Number(years) }),
  };
}

export function keywordToRow(
  keyword: JobKeyword,
  jobPostingId: string,
  ownerId: string,
): Row {
  return {
    id: keyword.id,
    owner_id: ownerId,
    job_posting_id: jobPostingId,
    term: keyword.term,
    priority: keyword.priority,
    occurrences: keyword.occurrences,
    in_requirement: keyword.inRequirement,
  };
}

export function rowToKeyword(row: Row): JobKeyword {
  return {
    id: text(row["id"]),
    term: text(row["term"]),
    priority: text(row["priority"]) as JobKeyword["priority"],
    occurrences: Number(row["occurrences"] ?? 1),
    inRequirement: bool(row["in_requirement"]),
  };
}

export function matchToRow(
  match: RequirementMatch,
  analysisId: string,
  ownerId: string,
): Row {
  return {
    id: match.id,
    owner_id: ownerId,
    analysis_id: analysisId,
    requirement_id: match.requirementId,
    evidence_text: match.evidence,
    evidence_source: match.evidenceSource,
    evidence_fact_ids: match.evidenceFactIds,
    status: match.status,
    recommended_action: match.recommendedAction,
    suggested_placement: match.suggestedPlacement,
    coverage: Number(match.coverage.toFixed(3)),
  };
}

export function rowToMatch(row: Row): RequirementMatch {
  return {
    id: text(row["id"]),
    requirementId: text(row["requirement_id"]),
    requirement: "",
    importance: "important",
    evidence: text(row["evidence_text"]),
    evidenceSource: text(row["evidence_source"]),
    evidenceFactIds: stringArray(row["evidence_fact_ids"]),
    status: text(row["status"]) as RequirementMatch["status"],
    recommendedAction: text(row["recommended_action"]),
    suggestedPlacement: stringArray(row["suggested_placement"]) as SectionKind[],
    coverage: Number(row["coverage"] ?? 0),
  };
}

/**
 * A generated line, with `included_in_export` set to the truth.
 *
 * This is the field the database constraint watches. It is derived from the
 * line's own verdict rather than passed in, so a caller cannot mark an
 * unsupported claim as exported — and if some future bug tries, PostgreSQL
 * rejects the write rather than storing a lie.
 */
export function lineToRow(
  line: GeneratedLine,
  generatedResumeId: string,
  position: number,
  ownerId: string,
): Row {
  return {
    id: line.id,
    owner_id: ownerId,
    generated_resume_id: generatedResumeId,
    section: line.section,
    group_key: line.groupId ?? null,
    position,
    bullet_text: line.text,
    original_text: line.originalText ?? null,
    rationale: line.rationale,
    validation: line.validation,
    validation_notes: line.validationNotes,
    requirement_ids: line.addressesRequirementIds,
    included_in_export: isExportable(line),
  };
}

export function rowToLine(
  row: Row,
  evidenceText: readonly string[] = [],
): GeneratedLine {
  const base: GeneratedLine = {
    id: text(row["id"]),
    section: text(row["section"]) as SectionKind,
    text: text(row["bullet_text"]),
    evidenceFactIds: [],
    evidenceText: [...evidenceText],
    addressesRequirementIds: stringArray(row["requirement_ids"]),
    rationale: text(row["rationale"]),
    validation: readValidation(row["validation"]),
    validationNotes: stringArray(row["validation_notes"]),
  };
  return withOptional(base, {
    groupId: optional(row["group_key"]),
    originalText: optional(row["original_text"]),
  });
}

/**
 * An unreadable verdict is read as `unsupported`.
 *
 * Fail closed: the cost of wrongly treating a good line as unsupported is that
 * the user re-confirms one sentence. The cost of the reverse is an
 * unverifiable claim in a document sent to an employer.
 */
function readValidation(value: unknown): GeneratedLine["validation"] {
  const raw = text(value);
  return raw === "verified" || raw === "user_confirmed" || raw === "needs_confirmation"
    ? raw
    : "unsupported";
}

export function claimEvidenceToRow(
  bulletId: string,
  factId: string,
  ownerId: string,
): Row {
  return { owner_id: ownerId, bullet_id: bulletId, fact_id: factId };
}

/** Experience entry metadata; its bullets live in generated_resume_bullets. */
export interface ExperienceShell {
  readonly entryId: string;
  readonly title: string;
  readonly employer: string;
  readonly location?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly current: boolean;
  readonly relevanceNote: string;
  readonly relevance: number;
}

export function experienceShell(entry: GeneratedExperience): ExperienceShell {
  return {
    entryId: entry.entryId,
    title: entry.title,
    employer: entry.employer,
    ...(entry.location === undefined ? {} : { location: entry.location }),
    ...(entry.startDate === undefined ? {} : { startDate: entry.startDate }),
    ...(entry.endDate === undefined ? {} : { endDate: entry.endDate }),
    current: entry.current,
    relevanceNote: entry.relevanceNote,
    relevance: entry.relevance,
  };
}

export function rebuildExperience(
  shells: readonly ExperienceShell[],
  bulletsByGroup: ReadonlyMap<string, GeneratedLine[]>,
): GeneratedExperience[] {
  return shells.map((shell) => ({
    entryId: shell.entryId,
    title: shell.title,
    employer: shell.employer,
    ...(shell.location === undefined ? {} : { location: shell.location }),
    ...(shell.startDate === undefined ? {} : { startDate: shell.startDate }),
    ...(shell.endDate === undefined ? {} : { endDate: shell.endDate }),
    current: shell.current,
    bullets: bulletsByGroup.get(shell.entryId) ?? [],
    relevanceNote: shell.relevanceNote,
    relevance: shell.relevance,
  }));
}
