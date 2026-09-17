/**
 * ResumeParser — raw resume text into the canonical section structure.
 *
 * The parser is conservative by design. When it cannot confidently place a
 * line it keeps it in `unparsed` rather than guessing a section, because a
 * guessed placement silently loses a candidate's real experience, and losing
 * experience is the one failure mode this product cannot have.
 *
 * Nothing here interprets, improves or rewrites. It reads.
 */

import { cleanLine, newId, normalize, titleCase, unique } from "./text.ts";
import { SECTION_SYNONYMS } from "./vocabulary.ts";
import type {
  ContactInfo,
  EducationEntry,
  ExperienceEntry,
  ParsedResume,
} from "./types.ts";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[\w\-/%]+/i;
const URL_RE =
  /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|net|org|io|dev|me)(?:\/[\w\-/%.]*)?/i;
const CITY_STATE_RE = /^[A-Za-z .'-]+,\s*(?:[A-Z]{2}|[A-Za-z ]{4,})$/;

const MONTH = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_TOKEN = `(?:(?:${MONTH})[a-z]*\\.?\\s*)?(?:\\d{1,2}[/-])?(?:19|20)\\d{2}`;
const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|through|until)\\s*(${DATE_TOKEN}|present|current|now|today)`,
  "i",
);

const DEGREE_RE =
  /\b(ph\.?d|doctorate|m\.?b\.?a|m\.?s|m\.?a|master(?:'s)?|b\.?s|b\.?a|bachelor(?:'s)?|associate(?:'s)?|a\.?a|a\.?s|diploma|certificate|high school)\b/i;

/** A line that is nothing but a section heading. */
function sectionOf(line: string): string | null {
  const key = normalize(line.replace(/[:\-–—]+\s*$/, ""));
  if (key.length === 0 || key.length > 40) return null;
  const direct = SECTION_SYNONYMS.get(key);
  if (direct !== undefined) return direct;
  // Headings are frequently written in caps with decoration around them.
  const stripped = key
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return SECTION_SYNONYMS.get(stripped) ?? null;
}

function looksLikeBullet(rawLine: string): boolean {
  return /^\s*[•‣●▪◦·*+>-]\s+/.test(rawLine);
}

function extractContact(lines: readonly string[]): {
  contact: ContactInfo;
  contactLineIndexes: Set<number>;
} {
  const contact: {
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    website?: string;
  } = {};
  const contactLineIndexes = new Set<number>();
  const window = Math.min(lines.length, 12);
  for (let i = 0; i < window; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    let matched = false;
    const email = EMAIL_RE.exec(line);
    if (email !== null && contact.email === undefined) {
      contact.email = email[0];
      matched = true;
    }
    const linkedin = LINKEDIN_RE.exec(line);
    if (linkedin !== null && contact.linkedin === undefined) {
      contact.linkedin = linkedin[0];
      matched = true;
    }
    const phone = PHONE_RE.exec(line);
    if (
      phone !== null &&
      contact.phone === undefined &&
      !/\d{4}\s*[-–]\s*\d{4}/.test(line)
    ) {
      contact.phone = phone[0].trim();
      matched = true;
    }
    for (const part of line.split(/\s*[|•·]\s*/)) {
      const candidate = part.trim();
      if (contact.location === undefined && CITY_STATE_RE.test(candidate)) {
        contact.location = candidate;
        matched = true;
      }
      if (
        contact.website === undefined &&
        contact.linkedin !== candidate &&
        URL_RE.test(candidate) &&
        !/linkedin/i.test(candidate) &&
        !EMAIL_RE.test(candidate)
      ) {
        const url = URL_RE.exec(candidate);
        if (url !== null) {
          contact.website = url[0];
          matched = true;
        }
      }
    }
    if (matched) contactLineIndexes.add(i);
  }
  return { contact, contactLineIndexes };
}

interface RawSectionBlocks {
  readonly preamble: string[];
  readonly blocks: Map<string, string[]>;
  readonly order: string[];
}

function splitIntoSections(lines: readonly string[]): RawSectionBlocks {
  const preamble: string[] = [];
  const blocks = new Map<string, string[]>();
  const order: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const heading = sectionOf(line);
    if (heading !== null) {
      current = heading;
      if (!blocks.has(heading)) {
        blocks.set(heading, []);
        order.push(heading);
      }
      continue;
    }
    if (current === null) {
      preamble.push(line);
      continue;
    }
    blocks.get(current)?.push(line);
  }
  return { preamble, blocks, order };
}

function parseDateRange(line: string): {
  startDate?: string;
  endDate?: string;
  current: boolean;
  remainder: string;
} | null {
  const m = DATE_RANGE_RE.exec(line);
  if (m === null) return null;
  const start = m[1];
  const end = m[2];
  const remainder = line
    .replace(m[0], " ")
    .replace(/\s*[|•·,–—-]\s*$/, "")
    .trim();
  const isCurrent = end !== undefined && /present|current|now|today/i.test(end);
  const out: {
    startDate?: string;
    endDate?: string;
    current: boolean;
    remainder: string;
  } = { current: isCurrent, remainder };
  if (start !== undefined) out.startDate = titleCase(start.trim());
  if (end !== undefined && !isCurrent) out.endDate = titleCase(end.trim());
  return out;
}

function splitHeaderParts(text: string): string[] {
  return text
    .split(/\s*(?:\||•|·|–|—|\bat\b|,\s(?=[A-Z][a-z]+\s(?:Inc|LLC|Corp)))\s*/)
    .map((p) => p.replace(/^[\s,|•·–—-]+|[\s,|•·–—-]+$/g, "").trim())
    .filter((p) => p.length > 0);
}

function parseExperience(lines: readonly string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let pendingHeaderLine: string | null = null;

  const push = (
    parts: readonly string[],
    range: { startDate?: string; endDate?: string; current: boolean },
  ): void => {
    const title = parts[0] ?? "";
    const employer = parts[1] ?? "";
    const rest = parts.slice(2);
    const location = rest.find((p) => CITY_STATE_RE.test(p));
    const entry: {
      id: string;
      title: string;
      employer: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      current: boolean;
      bullets: string[];
    } = {
      id: newId(),
      title: title.trim(),
      employer: employer.trim(),
      current: range.current,
      bullets: [],
    };
    if (location !== undefined) entry.location = location;
    if (range.startDate !== undefined) entry.startDate = range.startDate;
    if (range.endDate !== undefined) entry.endDate = range.endDate;
    entries.push(entry);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    if (looksLikeBullet(rawLine)) {
      const last = entries[entries.length - 1];
      if (last !== undefined) {
        (last.bullets as string[]).push(cleanLine(line));
      }
      pendingHeaderLine = null;
      continue;
    }

    const range = parseDateRange(line);
    if (range !== null) {
      // The date line may carry the whole header, or only complete a header
      // that started on the line before it.
      const carried = pendingHeaderLine === null ? "" : `${pendingHeaderLine} | `;
      const parts = splitHeaderParts(`${carried}${range.remainder}`);
      push(parts, range);
      pendingHeaderLine = null;
      continue;
    }

    const last = entries[entries.length - 1];
    // A short, punctuation-free line is a header waiting for its dates;
    // anything else belongs to the entry we are already inside.
    if (line.length <= 90 && !/[.;]$/.test(line)) {
      if (pendingHeaderLine !== null && last !== undefined) {
        (last.bullets as string[]).push(cleanLine(pendingHeaderLine));
      }
      pendingHeaderLine = line;
      continue;
    }
    if (last !== undefined) (last.bullets as string[]).push(cleanLine(line));
  }

  if (pendingHeaderLine !== null) {
    const last = entries[entries.length - 1];
    if (last !== undefined)
      (last.bullets as string[]).push(cleanLine(pendingHeaderLine));
  }
  return entries;
}

function parseEducation(lines: readonly string[]): EducationEntry[] {
  const out: EducationEntry[] = [];
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (line.length === 0) continue;
    const yearMatch = /(19|20)\d{2}/.exec(line);
    const parts = splitHeaderParts(line.replace(/\((19|20)\d{2}\)/, " "));
    const first = parts[0] ?? line;
    const second = parts[1];
    const isDegreeFirst = DEGREE_RE.test(first);
    const credential = (isDegreeFirst ? first : (second ?? first)).trim();
    const institution = (isDegreeFirst ? (second ?? "") : first).trim();
    const location = parts.find((p) => CITY_STATE_RE.test(p));
    const entry: {
      id: string;
      credential: string;
      institution: string;
      location?: string;
      year?: string;
    } = { id: newId(), credential, institution };
    if (location !== undefined) entry.location = location;
    if (yearMatch !== null) entry.year = yearMatch[0];
    out.push(entry);
  }
  return out;
}

function parseSkills(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (line.length === 0) continue;
    for (const part of line.split(/\s*[,;|•·]\s*/)) {
      const skill = part.trim().replace(/\.$/, "");
      if (skill.length > 1 && skill.length <= 60) out.push(skill);
    }
  }
  return unique(out);
}

function listLines(lines: readonly string[]): string[] {
  return lines.map((l) => cleanLine(l)).filter((l) => l.length > 0);
}

/**
 * Parse raw resume text.
 *
 * @param rawText Text as extracted from DOCX/PDF, or pasted by the user.
 */
export function parseResume(rawText: string): ParsedResume {
  const allLines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const nonEmpty = allLines.filter((l) => l.trim().length > 0);
  const { contact, contactLineIndexes } = extractContact(nonEmpty);

  // Name and headline come from the top of the document, before any heading.
  let fullName = "";
  let headline = "";
  for (let i = 0; i < Math.min(nonEmpty.length, 8); i += 1) {
    const line = nonEmpty[i];
    if (line === undefined) continue;
    if (sectionOf(line) !== null) break;
    if (contactLineIndexes.has(i)) continue;
    const cleaned = cleanLine(line);
    if (cleaned.length === 0) continue;
    if (fullName === "") {
      const words = cleaned.split(/\s+/);
      if (words.length <= 5 && /^[A-Za-z][A-Za-z.'\- ]+$/.test(cleaned)) {
        fullName = cleaned;
        continue;
      }
    }
    if (fullName !== "" && headline === "" && cleaned.length <= 120) {
      headline = cleaned;
      break;
    }
  }

  const { preamble, blocks } = splitIntoSections(nonEmpty);
  const summaryBlock = blocks.get("summary") ?? [];
  const skillsBlock = blocks.get("skills") ?? [];
  const experienceBlock = blocks.get("experience") ?? [];
  const educationBlock = blocks.get("education") ?? [];
  const certBlock = blocks.get("certifications") ?? [];
  const projectBlock = blocks.get("projects") ?? [];
  const additionalBlock = blocks.get("additional") ?? [];

  // Anything above the first heading that is not the name, headline or
  // contact line is kept — usually an unlabelled summary paragraph.
  const preambleExtras = preamble
    .map((l) => cleanLine(l))
    .filter(
      (l) =>
        l.length > 0 &&
        l !== fullName &&
        l !== headline &&
        !EMAIL_RE.test(l) &&
        !PHONE_RE.test(l) &&
        !LINKEDIN_RE.test(l),
    );

  const summary = listLines(summaryBlock);
  const unparsed = summary.length > 0 ? preambleExtras : [];
  const effectiveSummary = summary.length > 0 ? summary : preambleExtras;

  return {
    fullName,
    contact,
    headline,
    summary: effectiveSummary,
    skills: parseSkills(skillsBlock),
    experience: parseExperience(experienceBlock),
    education: parseEducation(educationBlock),
    certifications: listLines(certBlock).flatMap((l) =>
      l.includes(",") && l.length < 120 ? l.split(/\s*,\s*/) : [l],
    ),
    projects: listLines(projectBlock),
    additional: listLines(additionalBlock),
    unparsed,
  };
}

/** True when the parse found enough to analyse against a job posting. */
export function isUsableResume(parsed: ParsedResume): boolean {
  const bullets = parsed.experience.reduce((n, e) => n + e.bullets.length, 0);
  return parsed.experience.length > 0 && bullets >= 2;
}
