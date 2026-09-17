/**
 * ATSFormatValidator.
 *
 * Applicant tracking systems do not read a document the way a person does.
 * They read a text stream. Anything that carries meaning only visually —
 * a two-column layout, a text box, a skills bar, an icon next to a phone
 * number — either disappears or arrives scrambled.
 *
 * These checks run against the TEXT WE EXTRACTED, which is the closest thing
 * we have to what an ATS will see. A finding therefore means "this is what we
 * observed in the extracted text", never "your file definitely contains a
 * table" — the messages say which.
 */

import { newId } from "./text.ts";
import { SECTION_SYNONYMS } from "./vocabulary.ts";
import type { AtsFormatFinding, ParsedResume } from "./types.ts";

const BULLET_GLYPHS = /[•‣●▪◦·⁃∙]/g;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function finding(
  severity: AtsFormatFinding["severity"],
  message: string,
  fix: string,
): AtsFormatFinding {
  return { id: newId(), severity, message, fix };
}

/**
 * @param rawText  The text as extracted from the uploaded file (or pasted).
 * @param parsed   The structured reading of it.
 */
export function validateAtsFormat(
  rawText: string,
  parsed: ParsedResume,
): AtsFormatFinding[] {
  const findings: AtsFormatFinding[] = [];
  const lines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  // --- Column / table detection -------------------------------------------
  // Two or more runs of 3+ spaces on many lines is what a two-column layout
  // or a table looks like once it has been flattened into text.
  const columnar = nonEmpty.filter((l) => (l.match(/ {3,}/g) ?? []).length >= 1).length;
  if (nonEmpty.length > 0 && columnar / nonEmpty.length > 0.25) {
    findings.push(
      finding(
        "risk",
        "The extracted text shows wide gaps on many lines, which is what a multi-column layout or a table looks like to a parser. Content in the second column is frequently read out of order or dropped.",
        "Use a single-column layout with no tables.",
      ),
    );
  }
  const tabbed = nonEmpty.filter((l) => l.includes("\t")).length;
  if (tabbed > 3) {
    findings.push(
      finding(
        "warning",
        `${tabbed} lines contain tab characters, which usually means a table or a tab-aligned layout.`,
        "Replace tab alignment with plain paragraphs and standard bullets.",
      ),
    );
  }

  // --- Headings ------------------------------------------------------------
  const headings = nonEmpty
    .map((l) => l.trim().replace(/[:\-–—]+$/, ""))
    .filter(
      (l) => l.length > 0 && l.length <= 40 && l === l.toUpperCase() && /[A-Z]/.test(l),
    );
  const unknownHeadings = headings.filter(
    (h) =>
      !SECTION_SYNONYMS.has(
        h
          .toLowerCase()
          .replace(/[^a-z ]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      ),
  );
  if (unknownHeadings.length > 0) {
    findings.push(
      finding(
        "warning",
        `Non-standard section headings found: ${unknownHeadings.slice(0, 4).join(", ")}. Parsers map headings to fields by name; an invented heading usually means the section below it is filed as "other".`,
        "Use standard headings: Summary, Skills, Experience, Education, Certifications.",
      ),
    );
  }

  // --- Required structure --------------------------------------------------
  if (parsed.experience.length === 0) {
    findings.push(
      finding(
        "risk",
        "No work experience section could be read out of this resume.",
        'Add an "Experience" heading with one entry per role: title, employer, dates, then bullets.',
      ),
    );
  }
  if (parsed.contact.email === undefined && parsed.contact.phone === undefined) {
    findings.push(
      finding(
        "risk",
        "No email address or phone number was found in the extracted text. If they live in a header, a text box or an image, most parsers will not see them.",
        "Put contact details in the body of the document, on their own line under your name.",
      ),
    );
  }
  if (parsed.skills.length === 0) {
    findings.push(
      finding(
        "warning",
        "No skills section was found. Keyword matching leans heavily on it.",
        'Add a "Skills" or "Core Competencies" section listing skills you can evidence.',
      ),
    );
  }
  if (parsed.fullName.length === 0) {
    findings.push(
      finding(
        "warning",
        "Your name could not be identified at the top of the document.",
        "Put your name alone on the first line, in normal body text.",
      ),
    );
  }

  // --- Characters and decoration -------------------------------------------
  const glyphs = new Set(rawText.match(BULLET_GLYPHS) ?? []);
  if (glyphs.size > 1) {
    findings.push(
      finding(
        "warning",
        `${glyphs.size} different bullet characters are in use. Mixed glyphs sometimes come through as stray symbols.`,
        "Use one standard bullet character throughout.",
      ),
    );
  }
  if (EMOJI.test(rawText)) {
    findings.push(
      finding(
        "warning",
        "Emoji or symbol characters were found. They carry no meaning to a parser and occasionally break text extraction.",
        "Remove decorative symbols.",
      ),
    );
  }

  // --- Dates ---------------------------------------------------------------
  const dated = parsed.experience.filter(
    (e) => e.startDate !== undefined || e.endDate !== undefined || e.current,
  ).length;
  if (parsed.experience.length > 0 && dated < parsed.experience.length) {
    findings.push(
      finding(
        "warning",
        `${parsed.experience.length - dated} of ${parsed.experience.length} roles have no readable dates.`,
        'Use a consistent format: "Mar 2019 – Present".',
      ),
    );
  }

  // --- Length --------------------------------------------------------------
  const longBullets = parsed.experience
    .flatMap((e) => e.bullets)
    .filter((b) => b.length > 320).length;
  if (longBullets > 0) {
    findings.push(
      finding(
        "warning",
        `${longBullets} bullet${longBullets === 1 ? " is" : "s are"} longer than about three lines. Long bullets bury the result a recruiter is scanning for.`,
        "Split into single-idea bullets: action, scope, result.",
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      finding(
        "ok",
        "No ATS formatting risks were detected in the extracted text: single column, standard headings, readable contact details and dates.",
        "No change needed.",
      ),
    );
  }
  return findings;
}

/**
 * The format guarantees the generator itself provides.
 *
 * These are properties of the document we build in `export/`, so they are
 * assertions about our own output rather than observations about a file
 * someone uploaded.
 */
export const GENERATED_FORMAT_GUARANTEES: readonly string[] = [
  "Single-column layout",
  "Standard section headings (Summary, Core Competencies, Experience, Education, Certifications)",
  "No text boxes, tables, columns, icons, graphics, photos or rating bars",
  "One standard bullet character throughout",
  "Consistent date format (Mon YYYY – Mon YYYY)",
  "A single body font at a readable size, with real spacing rather than blank-line padding",
];
