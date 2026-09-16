/**
 * DOCX generation.
 *
 * Deliberately the most boring Word document it is possible to produce:
 * one column, one font, standard headings, literal bullet characters, no
 * tables, no text boxes, no images, no headers or footers. Everything an ATS
 * mis-reads is something this file does not contain.
 *
 * The document is built from an `ExportDocument`, which has already had every
 * unvalidated claim removed by `buildExportDocument()`.
 */

import { writeZip, type ZipEntry } from "./zip.ts";
import {
  contactLine,
  educationLine,
  SECTION_HEADINGS,
  type ExportDocument,
} from "./document.ts";

/** XML-escape. Word is unforgiving about a bare ampersand. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface RunOptions {
  readonly bold?: boolean;
  readonly size?: number;
  readonly caps?: boolean;
  readonly spaceBefore?: number;
  readonly spaceAfter?: number;
  readonly indent?: number;
  readonly align?: "left" | "center";
}

function paragraph(text: string, options: RunOptions = {}): string {
  const size = (options.size ?? 10.5) * 2; // half-points
  const props: string[] = [];
  if (options.align === "center") props.push('<w:jc w:val="center"/>');
  if (options.indent !== undefined) {
    props.push(`<w:ind w:left="${options.indent}" w:hanging="${options.indent}"/>`);
  }
  props.push(
    `<w:spacing w:before="${options.spaceBefore ?? 0}" w:after="${options.spaceAfter ?? 60}" w:line="240" w:lineRule="auto"/>`,
  );
  const runProps = [
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>',
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
    options.bold === true ? "<w:b/>" : "",
    options.caps === true ? "<w:caps/>" : "",
  ].join("");
  return (
    `<w:p><w:pPr>${props.join("")}<w:rPr>${runProps}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${runProps}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
  );
}

/** A heading is bold, capitalised and followed by a full-width rule. */
function heading(text: string): string {
  return (
    `<w:p><w:pPr><w:spacing w:before="220" w:after="60"/>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="333333"/></w:pBdr>` +
    `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="21"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="21"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
  );
}

function bullet(text: string): string {
  // A literal bullet character with a hanging indent, rather than a numbering
  // definition: numbering.xml is one more thing an ATS can fail to resolve,
  // and the visual result is identical.
  return paragraph(`• ${text}`, { indent: 220, spaceAfter: 40 });
}

function body(doc: ExportDocument): string {
  const parts: string[] = [];
  parts.push(
    paragraph(doc.fullName, { bold: true, size: 17, align: "center", spaceAfter: 20 }),
  );
  if (doc.headline.length > 0) {
    parts.push(paragraph(doc.headline, { size: 11, align: "center", spaceAfter: 20 }));
  }
  const contact = contactLine(doc.contact);
  if (contact.length > 0) {
    parts.push(paragraph(contact, { size: 9.5, align: "center", spaceAfter: 60 }));
  }

  for (const section of doc.sectionOrder) {
    if (section === "header") continue;
    if (section === "summary" && doc.summary.length > 0) {
      parts.push(heading(SECTION_HEADINGS.summary));
      for (const lineText of doc.summary) parts.push(paragraph(lineText));
    }
    if (section === "skills" && doc.competencies.length > 0) {
      parts.push(heading(SECTION_HEADINGS.skills));
      parts.push(paragraph(doc.competencies.join(" | ")));
    }
    if (section === "experience" && doc.experience.length > 0) {
      parts.push(heading(SECTION_HEADINGS.experience));
      for (const entry of doc.experience) {
        parts.push(
          paragraph(`${entry.title} | ${entry.employer}`, {
            bold: true,
            spaceBefore: 120,
            spaceAfter: 0,
          }),
        );
        const meta = [entry.location, entry.dates]
          .filter((p): p is string => p !== undefined && p.length > 0)
          .join(" | ");
        if (meta.length > 0) parts.push(paragraph(meta, { size: 9.5, spaceAfter: 40 }));
        for (const b of entry.bullets) parts.push(bullet(b));
      }
    }
    if (section === "education" && doc.education.length > 0) {
      parts.push(heading(SECTION_HEADINGS.education));
      for (const entry of doc.education) parts.push(paragraph(educationLine(entry)));
    }
    if (section === "certifications" && doc.certifications.length > 0) {
      parts.push(heading(SECTION_HEADINGS.certifications));
      for (const cert of doc.certifications) parts.push(bullet(cert));
    }
    if (section === "additional" && doc.additional.length > 0) {
      parts.push(heading(SECTION_HEADINGS.additional));
      for (const extra of doc.additional) parts.push(paragraph(extra));
    }
  }
  return parts.join("");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

function coreProps(doc: ExportDocument): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${esc(`${doc.fullName} — Resume`)}</dc:title>
<dc:creator>${esc(doc.fullName)}</dc:creator>
</cp:coreProperties>`;
}

export function renderDocx(doc: ExportDocument): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body(doc)}<w:sectPr>
<w:pgSz w:w="12240" w:h="15840"/>
<w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="0" w:footer="0" w:gutter="0"/>
<w:cols w:space="708" w:num="1"/>
</w:sectPr></w:body></w:document>`;

  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES, "utf8") },
    { path: "_rels/.rels", data: Buffer.from(ROOT_RELS, "utf8") },
    { path: "docProps/core.xml", data: Buffer.from(coreProps(doc), "utf8") },
    { path: "word/_rels/document.xml.rels", data: Buffer.from(DOCUMENT_RELS, "utf8") },
    { path: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
    { path: "word/styles.xml", data: Buffer.from(STYLES, "utf8") },
  ];
  return writeZip(entries);
}

export const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
