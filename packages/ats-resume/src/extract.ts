/**
 * Text extraction from uploaded resumes.
 *
 * This is the least certain code in the package, and the UI is built around
 * that fact: whatever comes out of here is shown to the user in an editable
 * box BEFORE anything is parsed or analysed, because a resume file is an
 * arbitrary document produced by software we do not control.
 *
 *   DOCX — reliable. It is a zip of XML; we read the XML.
 *   PDF  — best effort, and honestly labelled as such. A PDF built from Word
 *          or from this app extracts cleanly. A PDF exported from a design
 *          tool with a subset font and a custom encoding may not, and no
 *          library fixes that in general. When extraction looks poor,
 *          `assessExtraction()` says so instead of letting a mangled resume
 *          flow silently into the analysis.
 */

import { inflateSync } from "node:zlib";
import { readZip } from "./export/zip.ts";

export type ExtractionQuality = "good" | "partial" | "poor";

export interface ExtractionResult {
  readonly text: string;
  readonly quality: ExtractionQuality;
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&amp;/g, "&");
}

export function extractDocxText(buffer: Buffer): ExtractionResult {
  let entries: Map<string, Buffer>;
  try {
    entries = readZip(buffer);
  } catch (error) {
    return {
      text: "",
      quality: "poor",
      notes: [
        `This file could not be opened as a .docx (a .docx is a zip archive). ${error instanceof Error ? error.message : "Unknown error."}`,
      ],
    };
  }

  const documentXml = entries.get("word/document.xml");
  if (documentXml === undefined) {
    return {
      text: "",
      quality: "poor",
      notes: [
        "The archive opened, but it contains no word/document.xml, so it is not a Word document.",
      ],
    };
  }

  const xml = documentXml.toString("utf8");
  const text = xml
    // Structure first, so paragraphs and breaks survive tag stripping.
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:p\b[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  const decoded = decodeXmlEntities(text).trim();
  const notes =
    entries.has("word/embeddings/") || /<w:tbl>/.test(xml)
      ? [
          "This document contains a table. Tables often read out of order in an ATS — check the text below.",
        ]
      : [];
  return {
    text: decoded,
    quality: decoded.length > 200 ? "good" : "partial",
    notes,
  };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function decodePdfString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      const octal = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? "";
      out += String.fromCharCode(Number.parseInt(octal, 8));
      i += octal.length;
      continue;
    }
    const escapes: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };
    out += escapes[next] ?? next;
    i += 1;
  }
  return out;
}

function decodeHexString(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

/** Pull every content stream out of the file, inflating the Flate ones. */
function contentStreams(buffer: Buffer): string[] {
  const latin = buffer.toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(latin)) !== null) {
    const start = match.index + match[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;
    const dictStart = latin.lastIndexOf("<<", match.index);
    const dict = dictStart < 0 ? "" : latin.slice(dictStart, match.index);
    const raw = buffer.subarray(start, end);
    if (/\/FlateDecode/.test(dict)) {
      try {
        out.push(inflateSync(raw).toString("latin1"));
      } catch {
        // A stream we cannot inflate is skipped; `assessExtraction` will
        // notice if that leaves us with too little text.
      }
    } else if (!/\/Image|\/DCTDecode|\/JPXDecode/.test(dict)) {
      out.push(raw.toString("latin1"));
    }
    re.lastIndex = end;
  }
  return out;
}

/** Text-showing operators, with line breaks inferred from positioning ops. */
function textFromStream(stream: string): string {
  const lines: string[] = [];
  let current = "";
  const tokenRe =
    /(\((?:[^()\\]|\\.)*\))\s*Tj|(<[0-9a-fA-F\s]*>)\s*Tj|\[((?:[^\][\\]|\\.)*)\]\s*TJ|(T\*|Td|TD|Tm|BT|ET)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(stream)) !== null) {
    const [, literal, hex, array, positioning] = match;
    if (literal !== undefined) {
      current += decodePdfString(literal.slice(1, -1));
    } else if (hex !== undefined) {
      current += decodeHexString(hex.slice(1, -1));
    } else if (array !== undefined) {
      const partRe = /\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>|(-?\d+(?:\.\d+)?)/g;
      let part: RegExpExecArray | null;
      while ((part = partRe.exec(array)) !== null) {
        const token = part[0];
        if (token.startsWith("(")) current += decodePdfString(token.slice(1, -1));
        else if (token.startsWith("<")) current += decodeHexString(token.slice(1, -1));
        else if (Number.parseFloat(token) < -180) current += " ";
      }
    } else if (positioning !== undefined && positioning !== "BT") {
      if (current.trim().length > 0) {
        lines.push(current.trim());
        current = "";
      }
    }
  }
  if (current.trim().length > 0) lines.push(current.trim());
  return lines.join("\n");
}

export function extractPdfText(buffer: Buffer): ExtractionResult {
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return {
      text: "",
      quality: "poor",
      notes: ["This file does not start with %PDF-."],
    };
  }
  const streams = contentStreams(buffer);
  const text = streams
    .map(textFromStream)
    .filter((t) => t.trim().length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const notes = [
    "PDF text extraction is best effort. Read the text below before continuing — if it is scrambled or empty, paste the resume text instead.",
  ];
  if (streams.length === 0) {
    notes.push(
      "No readable content streams were found. This is usually a scanned or image-only PDF.",
    );
  }
  return { text, quality: assessExtraction(text), notes };
}

/**
 * Judge an extraction without pretending to certainty.
 *
 * The signals are crude on purpose: too little text, or an implausible ratio
 * of letters to punctuation, both mean "a human should look at this".
 */
export function assessExtraction(text: string): ExtractionQuality {
  const trimmed = text.trim();
  if (trimmed.length < 120) return "poor";
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const ratio = letters / trimmed.length;
  if (ratio < 0.45) return "poor";
  if (ratio < 0.6 || trimmed.length < 400) return "partial";
  return "good";
}

export function extractResumeText(buffer: Buffer, filename: string): ExtractionResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return extractDocxText(buffer);
  if (lower.endsWith(".pdf")) return extractPdfText(buffer);
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    const text = buffer.toString("utf8").trim();
    return { text, quality: assessExtraction(text), notes: [] };
  }
  if (lower.endsWith(".doc")) {
    return {
      text: "",
      quality: "poor",
      notes: [
        "Legacy .doc (Word 97-2003) is not supported. Open it in Word and save as .docx, or paste the text.",
      ],
    };
  }
  return {
    text: "",
    quality: "poor",
    notes: [
      `Unsupported file type: ${filename}. Upload a .docx or .pdf, or paste the text.`,
    ],
  };
}
