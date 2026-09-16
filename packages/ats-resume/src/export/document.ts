/**
 * The export boundary.
 *
 * `buildExportDocument()` is the ONLY path from a generated resume to a file.
 * It drops every line the claim validator did not clear, and it reports what
 * it dropped so the UI can say so out loud rather than silently shipping a
 * shorter document.
 *
 * This is where the product's central promise is actually enforced. Not in a
 * UI badge, not in a prompt: here, in the function that writes the file.
 */

import { isExportable } from "../claims.ts";
import type {
  ContactInfo,
  EducationEntry,
  GeneratedLine,
  GeneratedResume,
  SectionKind,
} from "../types.ts";

export interface ExportExperience {
  readonly title: string;
  readonly employer: string;
  readonly location?: string;
  readonly dates: string;
  readonly bullets: readonly string[];
}

export interface ExportDocument {
  readonly fullName: string;
  readonly contact: ContactInfo;
  readonly headline: string;
  readonly summary: readonly string[];
  readonly competencies: readonly string[];
  readonly experience: readonly ExportExperience[];
  readonly education: readonly EducationEntry[];
  readonly certifications: readonly string[];
  readonly additional: readonly string[];
  readonly sectionOrder: readonly SectionKind[];
}

export interface DroppedLine {
  readonly text: string;
  readonly section: SectionKind;
  readonly validation: GeneratedLine["validation"];
  readonly reason: string;
}

export interface ExportResult {
  readonly document: ExportDocument;
  readonly dropped: readonly DroppedLine[];
}

function dates(entry: {
  startDate?: string;
  endDate?: string;
  current: boolean;
}): string {
  const start = entry.startDate ?? "";
  const end = entry.current ? "Present" : (entry.endDate ?? "");
  if (start === "" && end === "") return "";
  if (start === "") return end;
  if (end === "") return start;
  return `${start} – ${end}`;
}

function drop(line: GeneratedLine): DroppedLine {
  return {
    text: line.text,
    section: line.section,
    validation: line.validation,
    reason:
      line.validation === "unsupported"
        ? "Unsupported: no evidence backs this sentence, so it is never written to a file."
        : "Needs your confirmation before it can be exported.",
  };
}

export function buildExportDocument(resume: GeneratedResume): ExportResult {
  const dropped: DroppedLine[] = [];

  const headline = isExportable(resume.headline) ? resume.headline.text : "";
  if (!isExportable(resume.headline)) dropped.push(drop(resume.headline));

  const summary: string[] = [];
  for (const line of resume.summary) {
    if (isExportable(line)) summary.push(line.text);
    else dropped.push(drop(line));
  }

  const experience: ExportExperience[] = [];
  for (const entry of resume.experience) {
    const bullets: string[] = [];
    for (const line of entry.bullets) {
      if (isExportable(line)) bullets.push(line.text);
      else dropped.push(drop(line));
    }
    experience.push({
      title: entry.title,
      employer: entry.employer,
      ...(entry.location === undefined ? {} : { location: entry.location }),
      dates: dates(entry),
      bullets,
    });
  }

  return {
    document: {
      fullName: resume.fullName,
      contact: resume.contact,
      headline,
      summary,
      competencies: resume.competencies,
      experience,
      education: resume.education,
      certifications: resume.certifications,
      additional: resume.additional,
      sectionOrder: resume.sectionOrder,
    },
    dropped,
  };
}

/** Contact line as it appears under the name: plain text, separated by " | ". */
export function contactLine(contact: ContactInfo): string {
  return [
    contact.location,
    contact.phone,
    contact.email,
    contact.linkedin,
    contact.website,
  ]
    .filter((p): p is string => p !== undefined && p.trim().length > 0)
    .join(" | ");
}

export function educationLine(entry: EducationEntry): string {
  return [entry.credential, entry.institution, entry.location, entry.year]
    .filter((p): p is string => p !== undefined && p.trim().length > 0)
    .join(" | ");
}

/** Heading text for each section, in the wording ATS parsers expect. */
export const SECTION_HEADINGS: Record<SectionKind, string> = {
  header: "",
  summary: "PROFESSIONAL SUMMARY",
  skills: "CORE COMPETENCIES",
  experience: "PROFESSIONAL EXPERIENCE",
  education: "EDUCATION",
  certifications: "CERTIFICATIONS",
  projects: "PROJECTS",
  additional: "ADDITIONAL INFORMATION",
};
