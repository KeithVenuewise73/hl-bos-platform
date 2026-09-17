/**
 * PDF generation.
 *
 * ATS-first, which for a PDF means one thing above all others: the text must
 * be TEXT. This writer emits uncompressed content streams using the base-14
 * Helvetica fonts, so every extractor — ours included — reads back exactly the
 * words that were written. No images, no vector decoration, no embedded fonts,
 * one column, one text flow.
 *
 * Line breaking uses the real Adobe base-14 metrics, which is why the output
 * does not overflow the margin the way a naive character-count wrap does.
 */

import {
  contactLine,
  educationLine,
  SECTION_HEADINGS,
  type ExportDocument,
} from "./document.ts";

// --- Page geometry (US Letter, 0.75in margins) -----------------------------
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type FontName = "Helvetica" | "Helvetica-Bold";

/**
 * Adobe base-14 character widths, in 1/1000 em, for codes 32..126.
 * These are the published metrics for the standard fonts; they are what makes
 * measurement exact rather than approximate.
 */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667,
  667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722,
  667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500,
  556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
  556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722,
  722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722,
  667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556,
  611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333,
  611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Map the characters a resume actually contains to WinAnsi-safe equivalents. */
function toWinAnsi(text: string): string {
  return (
    text
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/•/g, "·")
      .replace(/…/g, "...")
      .replace(/\u00a0/g, " ")
      // Anything still outside Latin-1 would need an encoding map to survive a
      // round trip, so it is dropped rather than written as a wrong glyph.
      .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "")
  );
}

export function measure(text: string, font: FontName, size: number): number {
  const widths = font === "Helvetica-Bold" ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let total = 0;
  for (const char of toWinAnsi(text)) {
    const code = char.charCodeAt(0);
    const width = code >= 32 && code <= 126 ? (widths[code - 32] ?? 500) : 500;
    total += width;
  }
  return (total * size) / 1000;
}

export function wrap(
  text: string,
  font: FontName,
  size: number,
  maxWidth: number,
): string[] {
  const words = toWinAnsi(text)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (measure(candidate, font, size) <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines.length === 0 ? [""] : lines;
}

function escapeString(text: string): string {
  return toWinAnsi(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

interface Op {
  readonly text: string;
  readonly font: FontName;
  readonly size: number;
  readonly x: number;
  /** Vertical space consumed by this line, including leading. */
  readonly height: number;
  readonly rule?: boolean;
}

function layout(doc: ExportDocument): Op[] {
  const ops: Op[] = [];
  const push = (
    text: string,
    font: FontName,
    size: number,
    x = MARGIN,
    extra = 0,
  ): void => {
    for (const lineText of wrap(text, font, size, CONTENT_WIDTH - (x - MARGIN))) {
      ops.push({ text: lineText, font, size, x, height: size * 1.32 });
    }
    if (extra > 0) ops.push({ text: "", font, size: 0, x, height: extra });
  };

  push(doc.fullName, "Helvetica-Bold", 17, MARGIN, 2);
  if (doc.headline.length > 0) push(doc.headline, "Helvetica", 10.5);
  const contact = contactLine(doc.contact);
  if (contact.length > 0) push(contact, "Helvetica", 9, MARGIN, 6);

  const sectionHeading = (text: string): void => {
    ops.push({ text: "", font: "Helvetica", size: 0, x: MARGIN, height: 8 });
    ops.push({
      text,
      font: "Helvetica-Bold",
      size: 10.5,
      x: MARGIN,
      height: 10.5 * 1.5,
      rule: true,
    });
  };

  for (const section of doc.sectionOrder) {
    if (section === "header") continue;
    if (section === "summary" && doc.summary.length > 0) {
      sectionHeading(SECTION_HEADINGS.summary);
      for (const lineText of doc.summary) push(lineText, "Helvetica", 10);
    }
    if (section === "skills" && doc.competencies.length > 0) {
      sectionHeading(SECTION_HEADINGS.skills);
      push(doc.competencies.join("  |  "), "Helvetica", 10);
    }
    if (section === "experience" && doc.experience.length > 0) {
      sectionHeading(SECTION_HEADINGS.experience);
      for (const entry of doc.experience) {
        ops.push({ text: "", font: "Helvetica", size: 0, x: MARGIN, height: 4 });
        push(`${entry.title} | ${entry.employer}`, "Helvetica-Bold", 10.5);
        const meta = [entry.location, entry.dates]
          .filter((p): p is string => p !== undefined && p.length > 0)
          .join("  |  ");
        if (meta.length > 0) push(meta, "Helvetica", 9);
        for (const b of entry.bullets) {
          const wrapped = wrap(`· ${b}`, "Helvetica", 10, CONTENT_WIDTH - 12);
          wrapped.forEach((lineText, i) => {
            ops.push({
              text: i === 0 ? lineText : `  ${lineText}`,
              font: "Helvetica",
              size: 10,
              x: MARGIN + 10,
              height: 10 * 1.32,
            });
          });
        }
      }
    }
    if (section === "education" && doc.education.length > 0) {
      sectionHeading(SECTION_HEADINGS.education);
      for (const entry of doc.education) push(educationLine(entry), "Helvetica", 10);
    }
    if (section === "certifications" && doc.certifications.length > 0) {
      sectionHeading(SECTION_HEADINGS.certifications);
      for (const cert of doc.certifications)
        push(`· ${cert}`, "Helvetica", 10, MARGIN + 10);
    }
    if (section === "additional" && doc.additional.length > 0) {
      sectionHeading(SECTION_HEADINGS.additional);
      for (const extra of doc.additional) push(extra, "Helvetica", 10);
    }
  }
  return ops;
}

function paginate(ops: readonly Op[]): Op[][] {
  const pages: Op[][] = [];
  let page: Op[] = [];
  let y = 0;
  const usable = PAGE_HEIGHT - MARGIN * 2;
  for (const op of ops) {
    if (y + op.height > usable && page.length > 0) {
      pages.push(page);
      page = [];
      y = 0;
    }
    page.push(op);
    y += op.height;
  }
  if (page.length > 0) pages.push(page);
  return pages.length === 0 ? [[]] : pages;
}

function contentStream(ops: readonly Op[]): string {
  const parts: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  for (const op of ops) {
    y -= op.height;
    if (op.text.length > 0) {
      const font = op.font === "Helvetica-Bold" ? "/F2" : "/F1";
      parts.push(
        `BT ${font} ${op.size} Tf 1 0 0 1 ${op.x.toFixed(2)} ${(y + op.height * 0.25).toFixed(2)} Tm (${escapeString(op.text)}) Tj ET`,
      );
    }
    if (op.rule === true) {
      const ruleY = (y + op.height * 0.25 - 3).toFixed(2);
      parts.push(
        `0.5 w 0.2 G ${MARGIN} ${ruleY} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${ruleY} l S`,
      );
    }
  }
  return parts.join("\n");
}

/**
 * Assemble the PDF file.
 *
 * Objects are written in order with a real cross-reference table, because a
 * PDF with a broken xref opens in some readers and fails in others — including
 * the parser on the other end of an application form.
 */
export function renderPdf(doc: ExportDocument): Buffer {
  const pages = paginate(layout(doc));
  const objects: string[] = [];

  const pageObjectIds = pages.map((_, i) => 4 + i * 2);
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] =
    "<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> " +
    "/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >> >>";

  pages.forEach((pageOps, i) => {
    const pageId = 4 + i * 2;
    const streamId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources 3 0 R /Contents ${streamId} 0 R >>`;
    const stream = contentStream(pageOps);
    objects[streamId] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let position = chunks[0]?.length ?? 0;

  for (let id = 1; id < objects.length; id += 1) {
    const objectBody = objects[id];
    if (objectBody === undefined) continue;
    offsets[id] = position;
    const buf = Buffer.from(`${id} 0 obj\n${objectBody}\nendobj\n`, "latin1");
    chunks.push(buf);
    position += buf.length;
  }

  const xrefStart = position;
  const count = objects.length;
  const xrefLines = ["xref", `0 ${count}`, "0000000000 65535 f "];
  for (let id = 1; id < count; id += 1) {
    const offset = offsets[id];
    xrefLines.push(
      offset === undefined
        ? "0000000000 65535 f "
        : `${offset.toString().padStart(10, "0")} 00000 n `,
    );
  }
  chunks.push(
    Buffer.from(
      `${xrefLines.join("\n")}\ntrailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
      "latin1",
    ),
  );

  return Buffer.concat(chunks);
}

export const PDF_MEDIA_TYPE = "application/pdf";
