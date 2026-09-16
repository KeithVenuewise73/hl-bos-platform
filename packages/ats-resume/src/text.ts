/**
 * Text primitives shared by every analyser in this package.
 *
 * Deliberately boring and deterministic: the same input always produces the
 * same tokens, the same numbers and the same stems. Everything downstream —
 * evidence matching, keyword coverage, claim validation — inherits that
 * property, which is what makes an analysis reproducible and auditable
 * rather than a fresh opinion each time it runs.
 */

import { randomUUID } from "node:crypto";
import type { UUID, Timestamp } from "./types.ts";

export function newId(): UUID {
  return randomUUID();
}

export function now(): Timestamp {
  return new Date().toISOString();
}

/** Words carrying no matching signal. Kept short on purpose: an over-eager
 * stoplist silently deletes real requirements ("lead", "manage", "own"). */
const STOPWORDS = new Set([
  "a",
  "about",
  "above",
  "across",
  "after",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "back",
  "be",
  "been",
  "being",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "done",
  "during",
  "each",
  "either",
  "else",
  "etc",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "him",
  "his",
  "how",
  "however",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "may",
  "me",
  "might",
  "more",
  "most",
  "must",
  "my",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "out",
  "over",
  "own",
  "per",
  "please",
  "role",
  "s",
  "same",
  "shall",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "upon",
  "us",
  "use",
  "using",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "within",
  "would",
  "you",
  "your",
  "yours",
]);

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word);
}

/** Lowercase, strip accents and collapse punctuation to single spaces. */
export function normalize(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      // Apostrophes are dropped rather than kept, so "bachelor's" and
      // "bachelors" collide. Without this a posting asking for a bachelor's
      // degree does not match a resume that lists one.
      .replace(/'/g, "")
      .replace(/[^a-z0-9%$./+#&-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * A crude but predictable stemmer. It exists so "manages", "managing" and
 * "management" collide, without pulling in a morphology dependency whose
 * behaviour we would then have to test anyway.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  for (const suffix of ["ization", "izations", "ements", "ement", "ments", "ment"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      return w.slice(0, w.length - suffix.length);
    }
  }
  if (w.endsWith("ies") && w.length > 5) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ses") && w.length > 5) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

/** Content words of a string, stopwords removed, order preserved. */
export function tokenize(text: string): string[] {
  return (
    normalize(text)
      .split(" ")
      // Trim sentence punctuation from the edges while keeping it inside a
      // token: "field." must become "field", but "b.s." and "monday.com" have
      // to survive intact. A trailing full stop used to make the last word of
      // every requirement unmatchable against the same word anywhere else.
      .map((t) => t.replace(/^[.-]+/, "").replace(/[.-]+$/, ""))
      .filter((t) => t.length > 1 && !isStopword(t))
  );
}

/** Stemmed token set — the unit every similarity calculation works in. */
export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text).map(stem));
}

/** Contiguous word sequences of length 1..n, stopword-trimmed at the edges. */
export function ngrams(text: string, maxN = 3): string[] {
  const words = normalize(text).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let n = 1; n <= maxN; n += 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const slice = words.slice(i, i + n);
      const first = slice[0];
      const last = slice[slice.length - 1];
      if (first === undefined || last === undefined) continue;
      if (isStopword(first) || isStopword(last)) continue;
      if (slice.some((w) => w.length < 2)) continue;
      out.push(slice.join(" "));
    }
  }
  return out;
}

/**
 * Jaccard-style overlap weighted toward the shorter side.
 *
 * Coverage answers "how much of A does B account for", which is the question
 * the evidence matrix asks: does this resume line cover this requirement?
 */
export function coverage(need: Set<string>, have: Set<string>): number {
  if (need.size === 0) return 0;
  let hit = 0;
  for (const t of need) if (have.has(t)) hit += 1;
  return hit / need.size;
}

/**
 * Every quantity a sentence asserts, normalised so "98.5%", "$2.4M" and
 * "85" compare reliably.
 *
 * The claim validator uses this to enforce the hardest rule in the product:
 * a generated sentence may not contain a number that its evidence does not.
 */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  const re =
    /(\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|k|m|mm|b|bn|million|billion)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    if (raw === undefined) continue;
    const norm = normalizeNumber(raw);
    if (norm !== null && !out.includes(norm)) out.push(norm);
  }
  return out;
}

/** "$2.4 M" -> "2.4m"; "98.5 %" -> "98.5%"; "1,250" -> "1250". */
export function normalizeNumber(raw: string): string | null {
  const cleaned = raw.toLowerCase().replace(/[$,\s]/g, "");
  const m = /^(\d+(?:\.\d+)?)(%|percent|k|m|mm|b|bn|million|billion)?$/.exec(cleaned);
  if (m === null) return null;
  const value = m[1];
  if (value === undefined) return null;
  const unit = m[2];
  if (unit === undefined) return value;
  if (unit === "percent") return `${value}%`;
  if (unit === "million") return `${value}m`;
  if (unit === "billion") return `${value}b`;
  if (unit === "mm") return `${value}m`;
  if (unit === "bn") return `${value}b`;
  return `${value}${unit}`;
}

/** Years demanded by a phrase like "7+ years of progressive experience". */
export function extractYears(text: string): number | undefined {
  const m = /(\d{1,2})\s*\+?\s*(?:or more\s*)?year/i.exec(text);
  if (m === null) return undefined;
  const raw = m[1];
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Split prose into sentences without swallowing "98.5%." or "Inc." */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Collapse whitespace and strip a leading bullet glyph. */
export function cleanLine(line: string): string {
  return line
    .replace(/^[\s•‣●▪◦·*\-–—+>]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Deterministic sort helper: highest score first, ties broken by label. */
export function byScoreThenLabel<T>(
  score: (item: T) => number,
  label: (item: T) => string,
) {
  return (a: T, b: T): number => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return label(a).localeCompare(label(b));
  };
}
