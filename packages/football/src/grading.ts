/**
 * Grading.
 *
 * A program picks ONE scale and every grade on that team uses it. Mixing them
 * makes a season summary uncomputable, so the database refuses a numeric grade
 * on a symbol-scale team and this module never converts between them silently.
 *
 * `symbolToNumeric` exists for reporting only, and its mapping is stated
 * openly rather than hidden inside an average: a coach who sees "78" on a
 * report must be able to find out that it came from ++ / + / 0.
 */

import type { GradeSymbol } from "./types";

/** The brief's ladder (section 15), display form included. */
export const GRADE_SYMBOLS: readonly {
  value: GradeSymbol;
  mark: string;
  label: string;
  /** For reporting rollups only. Never written back as a grade. */
  points: number;
}[] = [
  { value: "exceptional", mark: "++", label: "Exceptional", points: 100 },
  { value: "positive", mark: "+", label: "Positive", points: 80 },
  { value: "neutral", mark: "0", label: "Neutral", points: 60 },
  { value: "negative", mark: "−", label: "Negative", points: 40 },
  { value: "major_error", mark: "−−", label: "Major Error", points: 0 },
];

const BY_VALUE = new Map(GRADE_SYMBOLS.map((g) => [g.value, g]));

export function gradeMark(symbol: GradeSymbol): string {
  return BY_VALUE.get(symbol)?.mark ?? "?";
}

export function gradeLabel(symbol: GradeSymbol): string {
  return BY_VALUE.get(symbol)?.label ?? "Unknown";
}

export function symbolToNumeric(symbol: GradeSymbol): number {
  return BY_VALUE.get(symbol)?.points ?? 0;
}

/** Positive / neutral / negative, the split a player film page reports. */
export function gradeTone(symbol: GradeSymbol): "positive" | "neutral" | "negative" {
  if (symbol === "exceptional" || symbol === "positive") return "positive";
  if (symbol === "neutral") return "neutral";
  return "negative";
}

export interface GradeInput {
  readonly symbol?: GradeSymbol | undefined;
  readonly numericValue?: number | undefined;
}

export interface GradeSummary {
  readonly graded: number;
  readonly positive: number;
  readonly neutral: number;
  readonly negative: number;
  /**
   * Mean of the grades present, 0-100. Null when nothing is graded --
   * deliberately NOT 0, which would render as "this player grades zero"
   * on a page where nobody has graded them at all.
   */
  readonly average: number | null;
}

/**
 * Roll up a player's grades. Ungraded reps are not counted as anything: a
 * player with 31 snaps and 4 grades has 4 grades, and the summary says 4.
 */
export function summarizeGrades(grades: readonly GradeInput[]): GradeSummary {
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let total = 0;
  let counted = 0;

  for (const grade of grades) {
    if (grade.symbol !== undefined && grade.symbol !== null) {
      const tone = gradeTone(grade.symbol);
      if (tone === "positive") positive += 1;
      else if (tone === "neutral") neutral += 1;
      else negative += 1;
      total += symbolToNumeric(grade.symbol);
      counted += 1;
    } else if (grade.numericValue !== undefined && grade.numericValue !== null) {
      if (grade.numericValue >= 70) positive += 1;
      else if (grade.numericValue >= 50) neutral += 1;
      else negative += 1;
      total += grade.numericValue;
      counted += 1;
    }
  }

  return {
    graded: counted,
    positive,
    neutral,
    negative,
    average: counted === 0 ? null : Math.round((total / counted) * 10) / 10,
  };
}
