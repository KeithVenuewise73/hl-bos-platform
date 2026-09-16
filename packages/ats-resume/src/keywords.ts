/**
 * KeywordAnalyzer.
 *
 * Three buckets, and the third one is the product's conscience:
 *
 *   present          — the resume already says it.
 *   supportedMissing — the candidate's evidence supports it; the resume just
 *                      uses different words. Safe to add.
 *   unsupported      — nothing in the profile supports it. It is reported as
 *                      "not currently evidenced" and is NEVER written into a
 *                      resume, however much an ATS might reward it.
 *
 * The temptation this code exists to resist is obvious: stuffing the third
 * bucket into the document would raise every score in the app. It would also
 * be a lie told in the candidate's name, on a document they sign.
 */

import { buildEvidenceIndex, corpusContains, type EvidenceIndex } from "./evidence.ts";
import { TERMINOLOGY_GROUPS } from "./vocabulary.ts";
import { normalize, stem, tokenize } from "./text.ts";
import type { CareerFact, JobKeyword, KeywordAnalysis } from "./types.ts";

/** True when one fact contains every content word of the term. */
function someFactCoversAllWords(index: EvidenceIndex, term: string): boolean {
  const needed = tokenize(term).map(stem);
  if (needed.length === 0) return false;
  return index.entries.some((entry) => needed.every((w) => entry.stems.has(w)));
}

/** True when a terminology group links the term to real evidence. */
function terminologySupports(index: EvidenceIndex, term: string): boolean {
  const normalized = normalize(term);
  for (const group of TERMINOLOGY_GROUPS) {
    const isJobSide =
      group.job.some((p) => normalize(p) === normalized) ||
      normalize(group.preferred) === normalized;
    if (!isJobSide) continue;
    if (group.evidence.some((phrase) => corpusContains(index, phrase))) return true;
  }
  return false;
}

export function analyzeKeywords(
  keywords: readonly JobKeyword[],
  facts: readonly CareerFact[],
): KeywordAnalysis {
  const index = buildEvidenceIndex(facts);
  const present: JobKeyword[] = [];
  const supportedMissing: JobKeyword[] = [];
  const unsupported: JobKeyword[] = [];

  for (const keyword of keywords) {
    if (corpusContains(index, keyword.term)) {
      present.push(keyword);
      continue;
    }
    if (
      someFactCoversAllWords(index, keyword.term) ||
      terminologySupports(index, keyword.term)
    ) {
      supportedMissing.push(keyword);
      continue;
    }
    unsupported.push(keyword);
  }

  return { present, supportedMissing, unsupported };
}

/**
 * The keywords the optimizer is allowed to introduce.
 *
 * Everything else — including every high-priority keyword the posting repeats
 * ten times — stays out of the document.
 */
export function usableKeywords(analysis: KeywordAnalysis): string[] {
  return [...analysis.present, ...analysis.supportedMissing]
    .filter((k) => k.priority !== "low")
    .map((k) => k.term);
}

/** Share of the posting's weighted keywords the resume already covers, 0..1. */
export function keywordCoverage(analysis: KeywordAnalysis): number {
  const weight = (priority: JobKeyword["priority"]): number =>
    priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  const all = [
    ...analysis.present,
    ...analysis.supportedMissing,
    ...analysis.unsupported,
  ];
  const total = all.reduce((sum, k) => sum + weight(k.priority), 0);
  if (total === 0) return 0;
  const covered = analysis.present.reduce((sum, k) => sum + weight(k.priority), 0);
  return covered / total;
}

/**
 * Coverage the candidate could honestly reach — present keywords plus the
 * supported ones, if every supported rewrite is accepted. This is the ceiling
 * the projected score is allowed to assume, and not a token more.
 */
export function projectedKeywordCoverage(analysis: KeywordAnalysis): number {
  const weight = (priority: JobKeyword["priority"]): number =>
    priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  const all = [
    ...analysis.present,
    ...analysis.supportedMissing,
    ...analysis.unsupported,
  ];
  const total = all.reduce((sum, k) => sum + weight(k.priority), 0);
  if (total === 0) return 0;
  const covered = [...analysis.present, ...analysis.supportedMissing].reduce(
    (sum, k) => sum + weight(k.priority),
    0,
  );
  return covered / total;
}
