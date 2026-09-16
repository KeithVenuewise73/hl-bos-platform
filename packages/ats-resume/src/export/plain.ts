/**
 * Plain-text rendering of an export document.
 *
 * It exists for two reasons beyond "copy into a web form": it is the exact
 * text an ATS sees once formatting is stripped, and it is what the round-trip
 * tests assert against, so a regression in DOCX or PDF output shows up as a
 * text difference rather than as a corrupted file nobody opened.
 */

import {
  contactLine,
  educationLine,
  SECTION_HEADINGS,
  type ExportDocument,
} from "./document.ts";

export function renderPlainText(doc: ExportDocument): string {
  const out: string[] = [];
  out.push(doc.fullName);
  if (doc.headline.length > 0) out.push(doc.headline);
  const contact = contactLine(doc.contact);
  if (contact.length > 0) out.push(contact);

  for (const section of doc.sectionOrder) {
    if (section === "header") continue;
    const heading = SECTION_HEADINGS[section];
    if (section === "summary" && doc.summary.length > 0) {
      out.push("", heading, ...doc.summary);
    }
    if (section === "skills" && doc.competencies.length > 0) {
      out.push("", heading, doc.competencies.join(" | "));
    }
    if (section === "experience" && doc.experience.length > 0) {
      out.push("", heading);
      for (const entry of doc.experience) {
        out.push(
          [entry.title, entry.employer, entry.location, entry.dates]
            .filter((p): p is string => p !== undefined && p.length > 0)
            .join(" | "),
        );
        for (const bullet of entry.bullets) out.push(`• ${bullet}`);
      }
    }
    if (section === "education" && doc.education.length > 0) {
      out.push("", heading, ...doc.education.map(educationLine));
    }
    if (section === "certifications" && doc.certifications.length > 0) {
      out.push("", heading, ...doc.certifications);
    }
    if (section === "additional" && doc.additional.length > 0) {
      out.push("", heading, ...doc.additional);
    }
  }
  return `${out.join("\n")}\n`;
}
