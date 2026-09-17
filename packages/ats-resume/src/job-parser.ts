/**
 * JobPostingParser + RequirementExtractor.
 *
 * A posting is read as a document with intent: what it says under "Minimum
 * qualifications" is not the same promise as what it says under "Preferred",
 * and neither is the same as the paragraph about the company's mission. The
 * parser preserves that difference, because the whole analysis downstream is
 * weighted by it — and because a candidate deserves to know which unmet line
 * actually costs them the screen.
 */

import {
  cleanLine,
  extractYears,
  newId,
  ngrams,
  normalize,
  sentences,
  stem,
  tokenize,
  unique,
} from "./text.ts";
import {
  ACTION_VERBS,
  CERTIFICATION_VOCAB,
  COMPLIANCE_TERMS,
  CRITICAL_CUES,
  JOB_SECTION_CUES,
  LEADERSHIP_TERMS,
  PREFERRED_CUES,
  SOFTWARE_VOCAB,
  SOFT_SKILL_TERMS,
  findVocabulary,
} from "./vocabulary.ts";
import type {
  JobFacets,
  JobKeyword,
  JobRequirement,
  KeywordPriority,
  RequirementImportance,
  RequirementKind,
} from "./types.ts";

export interface JobPostingInput {
  readonly rawText: string;
  readonly company?: string;
  readonly title?: string;
  readonly location?: string;
  readonly url?: string;
}

export interface ParsedJobPosting {
  readonly company: string;
  readonly title: string;
  readonly location?: string;
  readonly facets: JobFacets;
  readonly requirements: readonly JobRequirement[];
  readonly keywords: readonly JobKeyword[];
}

const LABEL_RE = /^([A-Za-z /]{3,24})\s*[::-]\s*(.+)$/;
const SALARY_RE =
  /\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|,\d{3})?(?:\s*(?:-|–|to)\s*\$?\s?\d[\d,]*(?:\.\d+)?\s*(?:k)?)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|annually))?/i;
const EMPLOYMENT_RE =
  /\b(full[- ]time|part[- ]time|contract|temporary|temp[- ]to[- ]hire|internship|seasonal|permanent)\b/i;
const TRAVEL_RE = /\b(?:travel|traveling|travelling)[^.\n]{0,80}/i;
const PHYSICAL_RE =
  /\b(?:lift|lifting|stand for|walk|bend|climb|physical (?:requirement|demand))[^.\n]{0,80}/i;
const EDUCATION_RE =
  /\b(?:bachelor(?:'s)?|master(?:'s)?|mba|associate(?:'s)?|high school diploma|ged|degree in|phd|doctorate)[^.\n]{0,70}/i;

const BULLET_START_RE = /^[\u2022\u2023\u25cf\u25aa\u25e6\u00b7*+>-]/;

interface Segment {
  readonly section: string;
  readonly text: string;
}

/** Split the posting into (section, line) pairs, preserving order. */
function segment(rawText: string): Segment[] {
  const lines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const out: Segment[] = [];
  let section = "body";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const headingText = line.replace(/[:：]\s*$/, "");
    if (headingText.length <= 60) {
      const cue = JOB_SECTION_CUES.find((c) => c.match.test(headingText));
      if (cue !== undefined) {
        section = cue.section;
        // A cue line can carry content too ("Travel: up to 25%").
        const rest = line
          .slice(headingText.length)
          .replace(/^[:：]\s*/, "")
          .trim();
        if (rest.length > 0) out.push({ section, text: rest });
        continue;
      }
    }
    out.push({ section, text: line });
  }
  return out;
}

function classifyImportance(text: string, section: string): RequirementImportance {
  const hasPreferredCue = PREFERRED_CUES.some((re) => re.test(text));
  const hasCriticalCue = CRITICAL_CUES.some((re) => re.test(text));
  if (section === "informational") return "informational";
  if (section === "preferred")
    return hasCriticalCue && !hasPreferredCue ? "important" : "preferred";
  if (section === "required") return hasPreferredCue ? "preferred" : "critical";
  if (section === "responsibilities") return "important";
  if (section === "travel" || section === "physical") return "informational";
  if (hasCriticalCue) return "critical";
  if (hasPreferredCue) return "preferred";
  return "important";
}

function classifyKind(text: string, section: string): RequirementKind {
  const lower = text.toLowerCase();
  if (findVocabulary(text, CERTIFICATION_VOCAB).length > 0) return "certification";
  if (EDUCATION_RE.test(text)) return "education";
  if (findVocabulary(text, SOFTWARE_VOCAB).length > 0) return "software";
  if (/\btravel\b/.test(lower)) return "travel";
  if (PHYSICAL_RE.test(text)) return "physical";
  if (findVocabulary(text, COMPLIANCE_TERMS).length > 0) return "compliance";
  if (/\b(\d+\s*\+?\s*years?)\b/.test(lower)) return "experience";
  if (findVocabulary(text, LEADERSHIP_TERMS).length > 0) return "leadership";
  if (/\bp&l\b|\bbudget\b|\brevenue\b|\bheadcount\b|\bdirect reports\b/.test(lower))
    return "scope";
  if (section === "responsibilities") return "responsibility";
  if (findVocabulary(text, SOFT_SKILL_TERMS).length > 0) return "soft_skill";
  if (section === "required" || section === "preferred") return "qualification";
  return "hard_skill";
}

/** Metadata the posting states about itself. Never a requirement. */
const METADATA_LABEL_RE =
  /^(location|compensation|salary|pay|employment type|job type|department|reports to|req(uisition)? id|job id|posted|schedule|shift|category|industry|company|employer|title|position|job title|role)\s*[:-]/i;

/**
 * Wording that marks a line as an actual demand rather than a description.
 */
const DEMAND_CUE_RE =
  /\b(years?|experience|ability|able to|must|required?|minimum|degree|certification|certified|proficien\w*|knowledge|skills?|willing|demonstrated|proven|familiar|responsible for|manage|lead|own|drive|build|maintain|report|partner|develop|support|ensure)\b/i;

/**
 * Requirement-ish lines: bullets, or sentences that state a demand.
 *
 * The `body` section — everything above the first recognised heading — is
 * where a posting puts its title, its company name and its metadata. An early
 * version treated all of it as requirements, so the evidence matrix solemnly
 * reported that the candidate did not evidence "Employment type: Full-time".
 * Lines up there now have to look like an actual demand to qualify.
 */
function candidateRequirementTexts(seg: Segment): string[] {
  const line = seg.text;
  const cleaned = cleanLine(line);
  if (cleaned.length < 8) return [];
  if (METADATA_LABEL_RE.test(cleaned)) return [];
  if (BULLET_START_RE.test(line.trim())) return [cleaned];
  if (seg.section === "informational") return [cleaned];
  if (seg.section === "body" && !DEMAND_CUE_RE.test(cleaned)) return [];
  // Long prose paragraphs are split so one sentence is one requirement.
  return sentences(cleaned)
    .filter((s) => s.length >= 8)
    .filter((s) => seg.section !== "body" || DEMAND_CUE_RE.test(s));
}

function requirementTerms(text: string): string[] {
  const vocab = [
    ...findVocabulary(text, SOFTWARE_VOCAB),
    ...findVocabulary(text, CERTIFICATION_VOCAB),
    ...findVocabulary(text, LEADERSHIP_TERMS),
    ...findVocabulary(text, COMPLIANCE_TERMS),
  ];
  return unique([...tokenize(text).map(stem), ...vocab.map(normalize)]);
}

export function extractRequirements(rawText: string): JobRequirement[] {
  const out: JobRequirement[] = [];
  const seen = new Set<string>();
  for (const seg of segment(rawText)) {
    for (const text of candidateRequirementTexts(seg)) {
      const key = normalize(text);
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
      const importance = classifyImportance(text, seg.section);
      const years = extractYears(text);
      const requirement: {
        id: string;
        text: string;
        kind: RequirementKind;
        importance: RequirementImportance;
        sourceSection: string;
        terms: string[];
        yearsRequired?: number;
      } = {
        id: newId(),
        text,
        kind: classifyKind(text, seg.section),
        importance,
        sourceSection: seg.section,
        terms: requirementTerms(text),
      };
      if (years !== undefined) requirement.yearsRequired = years;
      out.push(requirement);
    }
  }
  return out;
}

/** The keywords an ATS is most likely to be weighting, ranked. */
export function extractKeywords(
  rawText: string,
  requirements: readonly JobRequirement[],
): JobKeyword[] {
  const counts = new Map<string, number>();
  for (const gram of ngrams(rawText, 3)) {
    if (/^\d/.test(gram)) continue;
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  const criticalText = normalize(
    requirements
      .filter((r) => r.importance === "critical" || r.importance === "important")
      .map((r) => r.text)
      .join(" . "),
  );
  const preferredText = normalize(
    requirements
      .filter((r) => r.importance === "preferred")
      .map((r) => r.text)
      .join(" . "),
  );

  const vocabHits = new Set(
    [
      ...findVocabulary(rawText, SOFTWARE_VOCAB),
      ...findVocabulary(rawText, CERTIFICATION_VOCAB),
      ...findVocabulary(rawText, COMPLIANCE_TERMS),
    ].map(normalize),
  );

  const keywords: JobKeyword[] = [];
  for (const [term, occurrences] of counts) {
    const words = term.split(" ");
    if (
      words.length === 1 &&
      (term.length < 3 || occurrences < 2) &&
      !vocabHits.has(term)
    ) {
      continue;
    }
    if (words.length > 1 && occurrences < 2 && !vocabHits.has(term)) continue;
    const inCritical = criticalText.includes(term);
    const inPreferred = preferredText.includes(term);
    let priority: KeywordPriority = "low";
    if (inCritical && (occurrences >= 2 || vocabHits.has(term) || words.length > 1)) {
      priority = "high";
    } else if (inCritical || inPreferred || vocabHits.has(term) || occurrences >= 3) {
      priority = "medium";
    }
    keywords.push({
      id: newId(),
      term,
      priority,
      occurrences,
      inRequirement: inCritical || inPreferred,
    });
  }

  const rank: Record<KeywordPriority, number> = { high: 3, medium: 2, low: 1 };
  return keywords
    .sort((a, b) => {
      const d = rank[b.priority] - rank[a.priority];
      if (d !== 0) return d;
      const o = b.occurrences - a.occurrences;
      if (o !== 0) return o;
      return a.term.localeCompare(b.term);
    })
    .filter((k, i) => k.priority !== "low" || i < 120)
    .slice(0, 150);
}

/**
 * The most informative match, not merely the first.
 *
 * Postings put a bare heading ("Travel") above the line that actually says
 * something ("Travel up to 25% between distribution centers"). Taking the
 * first match returned the heading and told the user nothing.
 */
function bestMatch(text: string, re: RegExp): string | undefined {
  const global = new RegExp(re.source, `${re.flags.replace(/g/g, "")}g`);
  let best: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    const candidate = match[0].trim();
    if (candidate.length === 0) continue;
    const better =
      best === undefined ||
      (/\d/.test(candidate) && !/\d/.test(best)) ||
      (/\d/.test(candidate) === /\d/.test(best) && candidate.length > best.length);
    if (better) best = candidate;
  }
  return best;
}

export function extractFacets(
  rawText: string,
  requirements: readonly JobRequirement[],
): JobFacets {
  const employment = bestMatch(rawText, EMPLOYMENT_RE);
  const compensation = bestMatch(rawText, SALARY_RE);
  const education = bestMatch(rawText, EDUCATION_RE);
  const travel = bestMatch(rawText, TRAVEL_RE);
  const physical = bestMatch(rawText, PHYSICAL_RE);
  const years = requirements
    .map((r) => r.yearsRequired)
    .filter((y): y is number => y !== undefined)
    .sort((a, b) => b - a)[0];

  const facets: {
    employmentType?: string;
    compensation?: string;
    yearsOfExperience?: number;
    educationRequirement?: string;
    certifications: string[];
    software: string[];
    hardSkills: string[];
    softSkills: string[];
    leadership: string[];
    responsibilities: string[];
    industryTerms: string[];
    actionVerbs: string[];
    managementScope: string[];
    budgetExpectations: string[];
    compliance: string[];
    travel?: string;
    physical?: string;
  } = {
    certifications: findVocabulary(rawText, CERTIFICATION_VOCAB),
    software: findVocabulary(rawText, SOFTWARE_VOCAB),
    hardSkills: unique(
      requirements.filter((r) => r.kind === "hard_skill").map((r) => r.text),
    ).slice(0, 25),
    softSkills: findVocabulary(rawText, SOFT_SKILL_TERMS),
    leadership: findVocabulary(rawText, LEADERSHIP_TERMS),
    responsibilities: requirements
      .filter(
        (r) => r.kind === "responsibility" || r.sourceSection === "responsibilities",
      )
      .map((r) => r.text)
      .slice(0, 30),
    industryTerms: unique(
      ngrams(rawText, 2).filter((g) => g.split(" ").length === 2),
    ).slice(0, 40),
    actionVerbs: findVocabulary(rawText, ACTION_VERBS),
    managementScope: requirements.filter((r) => r.kind === "scope").map((r) => r.text),
    budgetExpectations: requirements
      .filter((r) => /\bp&l\b|\bbudget\b|\brevenue\b/i.test(r.text))
      .map((r) => r.text),
    compliance: findVocabulary(rawText, COMPLIANCE_TERMS),
  };
  if (employment !== undefined) facets.employmentType = employment;
  if (compensation !== undefined) facets.compensation = compensation;
  if (education !== undefined) facets.educationRequirement = education;
  if (years !== undefined) facets.yearsOfExperience = years;
  if (travel !== undefined) facets.travel = travel;
  if (physical !== undefined) facets.physical = physical;
  return facets;
}

/** Best-effort company/title/location when the user did not supply them. */
function inferHeader(rawText: string): {
  company?: string;
  title?: string;
  location?: string;
} {
  const out: { company?: string; title?: string; location?: string } = {};
  const lines = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 12);
  for (const line of lines) {
    const m = LABEL_RE.exec(line);
    if (m === null) continue;
    const label = (m[1] ?? "").toLowerCase().trim();
    const value = (m[2] ?? "").trim();
    if (value.length === 0) continue;
    if (out.company === undefined && /^(company|employer|organization)$/.test(label)) {
      out.company = value;
    }
    if (out.title === undefined && /^(title|position|job title|role)$/.test(label)) {
      out.title = value;
    }
    if (out.location === undefined && /^(location|based in|worksite)$/.test(label)) {
      out.location = value;
    }
  }
  const first = lines[0];
  if (
    out.title === undefined &&
    first !== undefined &&
    first.length <= 80 &&
    !LABEL_RE.test(first)
  ) {
    out.title = first;
  }
  const second = lines[1];
  if (
    out.company === undefined &&
    second !== undefined &&
    second.length <= 60 &&
    !LABEL_RE.test(second)
  ) {
    const head = second.split(/\s*[|•·]\s*/)[0]?.trim();
    if (head !== undefined && head.length > 0) out.company = head;
  }
  return out;
}

export function parseJobPosting(input: JobPostingInput): ParsedJobPosting {
  const requirements = extractRequirements(input.rawText);
  const keywords = extractKeywords(input.rawText, requirements);
  const facets = extractFacets(input.rawText, requirements);
  const inferred = inferHeader(input.rawText);
  const location = input.location ?? inferred.location;
  const result: {
    company: string;
    title: string;
    location?: string;
    facets: JobFacets;
    requirements: readonly JobRequirement[];
    keywords: readonly JobKeyword[];
  } = {
    company: input.company ?? inferred.company ?? "Unspecified company",
    title: input.title ?? inferred.title ?? "Unspecified role",
    facets,
    requirements,
    keywords,
  };
  if (location !== undefined) result.location = location;
  return result;
}
