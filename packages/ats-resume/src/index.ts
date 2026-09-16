/**
 * @hl-bos/ats-resume — the ATS Resume Optimizer engine.
 *
 * The product principle, in one line: OPTIMIZE AGGRESSIVELY, FABRICATE NOTHING.
 *
 * Everything in this package is arranged around a single boundary. On one side
 * are FACTS — what the candidate's resume says, and what the candidate has
 * explicitly confirmed. On the other side is WORDING — what we generate. The
 * claim validator sits on that boundary, and the export builder refuses to
 * write anything that has not crossed it.
 *
 * The pipeline:
 *
 *   extractResumeText  -> parseResume    -> factsFromResume
 *   parseJobPosting    -> analyzeJob     -> generateTailoredResume
 *                                        -> buildExportDocument -> DOCX / PDF
 *
 * Nothing in here touches a database, a filesystem or an environment variable.
 * That is the app's job, which keeps this whole engine unit-testable.
 */

export * from "./types.ts";

export {
  newId,
  now,
  extractNumbers,
  extractYears,
  normalize,
  tokenize,
} from "./text.ts";

export { parseResume, isUsableResume } from "./resume-parser.ts";
export {
  extractResumeText,
  extractDocxText,
  extractPdfText,
  assessExtraction,
} from "./extract.ts";
export type { ExtractionResult, ExtractionQuality } from "./extract.ts";

export {
  factsFromResume,
  makeFact,
  evidenceFacts,
  categoriseSkill,
} from "./career-facts.ts";
export type { FactInput } from "./career-facts.ts";

export {
  parseJobPosting,
  extractRequirements,
  extractKeywords,
  extractFacets,
} from "./job-parser.ts";
export type { JobPostingInput, ParsedJobPosting } from "./job-parser.ts";

export {
  matchRequirements,
  buildEvidenceIndex,
  corpusContains,
  rewriteWithTerminology,
  shouldRewrite,
  describeSource,
  groupByStatus,
} from "./evidence.ts";
export type { EvidenceIndex, EvidenceResult } from "./evidence.ts";

export {
  analyzeKeywords,
  usableKeywords,
  keywordCoverage,
  projectedKeywordCoverage,
} from "./keywords.ts";

export { scoreResume, projectScore, SCORE_WEIGHTS, SCORE_DISCLAIMER } from "./score.ts";

export { validateAtsFormat, GENERATED_FORMAT_GUARANTEES } from "./ats-format.ts";

export {
  validateClaim,
  validateLine,
  isExportable,
  requiresConfirmation,
  unsupportedLines,
} from "./claims.ts";
export type { ClaimContext, ClaimVerdict } from "./claims.ts";

export { analyzeJob, analysisSummary } from "./analysis.ts";
export type { AnalyzeInput } from "./analysis.ts";

export { generateTailoredResume, chooseSectionOrder, allLines } from "./optimizer.ts";
export type { OptimizeInput } from "./optimizer.ts";

export { generateCoverLetter } from "./cover-letter.ts";
export type { CoverLetterInput } from "./cover-letter.ts";

export { generateInterviewPrep } from "./interview-prep.ts";
export type { InterviewPrepInput } from "./interview-prep.ts";

export {
  buildExportDocument,
  contactLine,
  educationLine,
  SECTION_HEADINGS,
} from "./export/document.ts";
export type {
  ExportDocument,
  ExportExperience,
  ExportResult,
  DroppedLine,
} from "./export/document.ts";
export { renderPlainText } from "./export/plain.ts";
export { renderDocx, DOCX_MEDIA_TYPE } from "./export/docx.ts";
export { renderPdf, PDF_MEDIA_TYPE, measure, wrap } from "./export/pdf.ts";
export { writeZip, readZip } from "./export/zip.ts";

export {
  selectProvider,
  applyRewriteProposals,
  createDeterministicProvider,
  createClaudeProvider,
} from "./provider/index.ts";
export type {
  AiProvider,
  BulletRewriteProposal,
  BulletRewriteRequest,
  RewriteContext,
  ProviderSelection,
  AppliedRewrite,
} from "./provider/index.ts";
export type { ClaudeProviderOptions } from "./provider/claude.ts";

export {
  TERMINOLOGY_GROUPS,
  SECTION_SYNONYMS,
  SOFTWARE_VOCAB,
  CERTIFICATION_VOCAB,
} from "./vocabulary.ts";
export type { TerminologyGroup } from "./vocabulary.ts";

export {
  buildDemoDataset,
  DEMO_RESUME_TEXT,
  DEMO_JOB_TEXT,
  DEMO_NOTICE,
} from "./demo.ts";
export type { DemoDataset } from "./demo.ts";

/**
 * The ten AI services named in the product brief, and what actually implements
 * each one today. This is exported so the app's Settings page can show it
 * rather than describing an architecture the code does not have.
 */
export const AI_SERVICES: readonly {
  readonly service: string;
  readonly module: string;
  readonly implementation: "deterministic" | "deterministic + optional Claude";
}[] = [
  {
    service: "ResumeParser",
    module: "resume-parser.ts",
    implementation: "deterministic",
  },
  {
    service: "JobPostingParser",
    module: "job-parser.ts",
    implementation: "deterministic",
  },
  {
    service: "RequirementExtractor",
    module: "job-parser.ts + provider/claude.ts",
    implementation: "deterministic + optional Claude",
  },
  {
    service: "EvidenceMatcher",
    module: "evidence.ts",
    implementation: "deterministic",
  },
  {
    service: "KeywordAnalyzer",
    module: "keywords.ts",
    implementation: "deterministic",
  },
  {
    service: "ResumeOptimizer",
    module: "optimizer.ts + provider/claude.ts",
    implementation: "deterministic + optional Claude",
  },
  {
    service: "CoverLetterGenerator",
    module: "cover-letter.ts",
    implementation: "deterministic",
  },
  {
    service: "InterviewPrepGenerator",
    module: "interview-prep.ts",
    implementation: "deterministic",
  },
  { service: "ClaimValidator", module: "claims.ts", implementation: "deterministic" },
  {
    service: "ATSFormatValidator",
    module: "ats-format.ts",
    implementation: "deterministic",
  },
];
