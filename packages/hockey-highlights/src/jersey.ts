/**
 * Jersey colours, and what they mean to a matcher.
 *
 * The user picks a word. The vision service reports a hue. This file is the
 * only place the two are reconciled, so "is navy the same as blue?" has exactly
 * one answer in the product rather than one per screen.
 *
 * Hue ranges are in OpenCV's convention (0..179, not 0..359) because that is
 * the space the Python service measures in, and converting at the boundary once
 * is safer than converting in both directions repeatedly.
 */

import type { JerseyColor } from "./types.ts";

export interface JerseyColorSpec extends JerseyColor {
  /** Inclusive hue window(s), OpenCV scale 0..179. Red wraps, so it has two. */
  readonly hueRanges: readonly (readonly [number, number])[];
  /** Minimum saturation for the hue to mean anything, 0..255. */
  readonly minSaturation: number;
  readonly minValue: number;
  readonly maxValue: number;
  /**
   * True for colours defined by lightness rather than hue. White and black have
   * no meaningful hue, so a matcher that only compares hue will cheerfully
   * decide a white jersey is orange.
   */
  readonly achromatic: boolean;
}

export const JERSEY_COLORS: readonly JerseyColorSpec[] = [
  {
    id: "white",
    label: "White",
    swatch: "#f8fafc",
    hueRanges: [[0, 179]],
    minSaturation: 0,
    minValue: 170,
    maxValue: 255,
    achromatic: true,
  },
  {
    id: "black",
    label: "Black",
    swatch: "#111827",
    hueRanges: [[0, 179]],
    minSaturation: 0,
    minValue: 0,
    maxValue: 60,
    achromatic: true,
  },
  {
    id: "red",
    label: "Red",
    swatch: "#dc2626",
    // Red straddles the 0/179 seam, which is exactly the case a single
    // min/max comparison gets wrong.
    hueRanges: [
      [0, 8],
      [170, 179],
    ],
    minSaturation: 90,
    minValue: 60,
    maxValue: 255,
    achromatic: false,
  },
  {
    id: "maroon",
    label: "Maroon",
    swatch: "#7f1d1d",
    hueRanges: [
      [0, 10],
      [168, 179],
    ],
    minSaturation: 80,
    minValue: 30,
    maxValue: 130,
    achromatic: false,
  },
  {
    id: "orange",
    label: "Orange",
    swatch: "#ea580c",
    hueRanges: [[9, 20]],
    minSaturation: 110,
    minValue: 80,
    maxValue: 255,
    achromatic: false,
  },
  {
    id: "gold",
    label: "Gold / Yellow",
    swatch: "#eab308",
    hueRanges: [[21, 34]],
    minSaturation: 90,
    minValue: 90,
    maxValue: 255,
    achromatic: false,
  },
  {
    id: "green",
    label: "Green",
    swatch: "#16a34a",
    hueRanges: [[35, 85]],
    minSaturation: 70,
    minValue: 50,
    maxValue: 255,
    achromatic: false,
  },
  {
    id: "teal",
    label: "Teal",
    swatch: "#0d9488",
    hueRanges: [[86, 97]],
    minSaturation: 70,
    minValue: 50,
    maxValue: 255,
    achromatic: false,
  },
  {
    id: "blue",
    label: "Blue",
    swatch: "#2563eb",
    hueRanges: [[98, 125]],
    minSaturation: 90,
    minValue: 70,
    maxValue: 255,
    achromatic: false,
  },
  {
    id: "navy",
    label: "Navy",
    swatch: "#1e3a8a",
    // Same hue family as blue, separated by how dark it is. Two teams in the
    // same rink really are told apart this way.
    hueRanges: [[98, 128]],
    minSaturation: 70,
    minValue: 20,
    maxValue: 110,
    achromatic: false,
  },
  {
    id: "purple",
    label: "Purple",
    swatch: "#7c3aed",
    hueRanges: [[126, 155]],
    minSaturation: 70,
    minValue: 50,
    maxValue: 255,
    achromatic: false,
  },
  {
    id: "grey",
    label: "Grey / Silver",
    swatch: "#9ca3af",
    hueRanges: [[0, 179]],
    minSaturation: 0,
    minValue: 90,
    maxValue: 180,
    achromatic: true,
  },
];

export function findJerseyColor(id: string): JerseyColorSpec | undefined {
  return JERSEY_COLORS.find((c) => c.id === id);
}

export function jerseyColorLabel(id: string): string {
  return findJerseyColor(id)?.label ?? id;
}

/**
 * Colours a matcher should not treat as decisive on their own.
 *
 * Navy and black look identical in a dim rink, and white and grey differ only
 * by how the camera metered the ice. When the athlete wears one of these, the
 * jersey number has to carry more of the identification — which `identity.ts`
 * handles by reweighting rather than by pretending the colour was conclusive.
 */
const CONFUSABLE: Readonly<Record<string, readonly string[]>> = {
  navy: ["black", "blue", "purple"],
  black: ["navy", "maroon"],
  blue: ["navy", "teal", "purple"],
  white: ["grey", "gold"],
  grey: ["white", "black"],
  maroon: ["red", "black"],
  red: ["maroon", "orange"],
  orange: ["red", "gold"],
  gold: ["orange", "white"],
  green: ["teal"],
  teal: ["green", "blue"],
  purple: ["navy", "blue"],
};

export function confusableWith(id: string): readonly string[] {
  return CONFUSABLE[id] ?? [];
}

/**
 * How much weight the colour signal deserves for this jersey.
 *
 * A colour with many look-alikes is weaker evidence than one with none, and
 * saying so here is what stops the product reporting "confirmed" because it saw
 * a dark blur in a dark rink.
 */
export function colorReliability(id: string): number {
  const spec = findJerseyColor(id);
  if (spec === undefined) return 0.4;
  const neighbours = confusableWith(id).length;
  const base = spec.achromatic ? 0.6 : 0.9;
  return Math.max(0.35, base - neighbours * 0.08);
}

/**
 * Normalise a jersey number the way a person would read it.
 *
 * "07" and "7" are different jerseys to a supplier and the same jersey to
 * everyone in the rink, so both forms have to compare equal. Non-digits are
 * dropped: OCR that returns "7." or " 7" has read the number correctly.
 */
export function normaliseJerseyNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const stripped = digits.replace(/^0+/, "");
  return stripped.length === 0 ? "0" : stripped;
}

export function jerseyNumbersMatch(a: string, b: string): boolean {
  const left = normaliseJerseyNumber(a);
  const right = normaliseJerseyNumber(b);
  return left.length > 0 && left === right;
}

/**
 * Digit pairs that OCR confuses on a moving, creased jersey.
 *
 * Used to tell "read a different number" from "probably misread this number".
 * The second is much weaker evidence against a match than the first, and
 * treating them the same throws away real identifications.
 */
const OCR_CONFUSIONS: readonly (readonly [string, string])[] = [
  ["0", "8"],
  ["1", "7"],
  ["3", "8"],
  ["5", "6"],
  ["5", "8"],
  ["6", "8"],
  ["2", "7"],
  ["9", "4"],
];

export function isLikelyOcrConfusion(read: string, expected: string): boolean {
  const a = normaliseJerseyNumber(read);
  const b = normaliseJerseyNumber(expected);
  if (a.length === 0 || a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) return false;
    if (left === right) continue;
    differences += 1;
    if (differences > 1) return false;
    const confusable = OCR_CONFUSIONS.some(
      ([x, y]) => (x === left && y === right) || (y === left && x === right),
    );
    if (!confusable) return false;
  }
  return differences === 1;
}
