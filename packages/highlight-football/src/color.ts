/**
 * Colour science for uniform identification (brief sections 4 and 5).
 *
 * WHY NOT RGB. A blue jersey at 2pm and the same jersey under Friday-night
 * lights differ enormously in RGB — mostly in brightness — while remaining
 * obviously the same blue to a human. Euclidean RGB distance treats that
 * brightness change as a colour change and will happily decide the night game
 * is navy. So every comparison here happens in CIELAB, where lightness is one
 * axis and can be down-weighted independently of the hue and chroma that
 * actually identify a team.
 *
 * THE ACHROMATIC PROBLEM, stated because it drives the design: white, silver,
 * gray and black are the SAME hue. They differ only in lightness. So the one
 * axis we down-weight for the blue jersey is the only axis that separates a
 * white jersey from a black one. The distance function therefore switches
 * behaviour on chroma rather than applying one weighting everywhere — see
 * uniformDistance(). Getting this wrong turns every night game into "black
 * team vs black team".
 *
 * Everything in this file is pure and deterministic. No pixels are read here;
 * the vision worker samples pixels and hands us colours.
 */

import type { JerseyColorName, Rgb } from "./types";
import { JERSEY_COLORS } from "./types";

// ---------------------------------------------------------------------------
// Colour spaces
// ---------------------------------------------------------------------------

export interface Hsv {
  /** Degrees, 0..360. Meaningless when s is ~0; callers must check. */
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;

  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** sRGB companding. The gamma curve is not decorative: skipping it biases
 *  every dark uniform toward black in LAB. */
const srgbToLinear = (c: number): number => {
  const cn = clamp(c, 0, 255) / 255;
  return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
};

/** D65 reference white, matching the sRGB standard the cameras encode to. */
const XN = 95.047;
const YN = 100.0;
const ZN = 108.883;

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r) * 100;
  const g = srgbToLinear(rgb.g) * 100;
  const b = srgbToLinear(rgb.b) * 100;

  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

  const fx = f(x / XN);
  const fy = f(y / YN);
  const fz = f(z / ZN);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** LAB chroma: how colourful, regardless of how light. Drives the switch in
 *  uniformDistance(). */
export function chroma(lab: Lab): number {
  return Math.hypot(lab.a, lab.b);
}

/** Plain CIE76 ΔE. Used for reporting and tests; not for uniform matching,
 *  which needs the lighting tolerance below. */
export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

// ---------------------------------------------------------------------------
// Lighting-tolerant uniform distance
// ---------------------------------------------------------------------------

export interface UniformDistanceOptions {
  /**
   * Below this LAB chroma a colour is treated as achromatic (white/gray/black
   * family) and lightness becomes the decisive axis instead of the ignored
   * one. 18 sits above the residual chroma a white jersey picks up from stadium
   * lights and turf bounce, and below the chroma of even a muted navy.
   */
  readonly achromaticChroma?: number;
  /** How much lightness counts for a clearly coloured uniform. Small on
   *  purpose: this is the axis stadium lighting moves most. */
  readonly chromaticLightnessWeight?: number;
  /** How much lightness counts once both colours are achromatic. */
  readonly achromaticLightnessWeight?: number;
}

const DEFAULTS: Required<UniformDistanceOptions> = {
  achromaticChroma: 18,
  chromaticLightnessWeight: 0.25,
  achromaticLightnessWeight: 1.0,
};

/**
 * Distance between two uniform colours that survives the lighting the brief
 * lists: stadium lights, shadow, night games, washed-out cameras, exposure
 * differences, mud and partial visibility.
 *
 * Returns a ΔE-like magnitude — smaller is more similar — not a 0..1 score,
 * because callers combine it with other distances before normalising.
 */
export function uniformDistance(
  a: Lab,
  b: Lab,
  opts: UniformDistanceOptions = {},
): number {
  const o = { ...DEFAULTS, ...opts };
  const ca = chroma(a);
  const cb = chroma(b);
  const bothAchromatic = ca < o.achromaticChroma && cb < o.achromaticChroma;

  // One colourful, one not: they are different uniforms regardless of how the
  // light fell. The chroma gap itself is the evidence.
  if (!bothAchromatic && (ca < o.achromaticChroma || cb < o.achromaticChroma)) {
    const chromaGap = Math.abs(ca - cb);
    const hueGap = Math.hypot(a.a - b.a, a.b - b.b);
    return Math.max(chromaGap, hueGap);
  }

  const lw = bothAchromatic ? o.achromaticLightnessWeight : o.chromaticLightnessWeight;
  const dl = (a.l - b.l) * lw;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.hypot(dl, da, db);
}

export function uniformDistanceRgb(
  a: Rgb,
  b: Rgb,
  opts: UniformDistanceOptions = {},
): number {
  return uniformDistance(rgbToLab(a), rgbToLab(b), opts);
}

// ---------------------------------------------------------------------------
// The football colour vocabulary
// ---------------------------------------------------------------------------

/**
 * Reference sRGB for each name a user can pick. These are athletic-apparel
 * colours, not web colours: "gold" here is a metallic athletic gold, not
 * #FFD700, because no team wears #FFD700 and matching against it pushes every
 * real gold jersey toward orange.
 */
export const COLOR_REFERENCE: Readonly<Record<JerseyColorName, Rgb>> = {
  white: { r: 244, g: 244, b: 242 },
  black: { r: 24, g: 24, b: 26 },
  navy: { r: 20, g: 34, b: 74 },
  blue: { r: 30, g: 74, b: 158 },
  royal_blue: { r: 24, g: 62, b: 188 },
  columbia_blue: { r: 126, g: 177, b: 216 },
  teal: { r: 0, g: 118, b: 124 },
  green: { r: 26, g: 122, b: 60 },
  forest_green: { r: 20, g: 72, b: 42 },
  kelly_green: { r: 28, g: 158, b: 74 },
  yellow: { r: 236, g: 216, b: 68 },
  gold: { r: 196, g: 158, b: 54 },
  orange: { r: 224, g: 108, b: 32 },
  red: { r: 190, g: 36, b: 40 },
  maroon: { r: 112, g: 28, b: 42 },
  crimson: { r: 154, g: 26, b: 48 },
  purple: { r: 86, g: 42, b: 132 },
  pink: { r: 226, g: 128, b: 162 },
  silver: { r: 178, g: 180, b: 184 },
  gray: { r: 122, g: 124, b: 128 },
  brown: { r: 96, g: 62, b: 40 },
};

const REFERENCE_LAB: ReadonlyArray<readonly [JerseyColorName, Lab]> = JERSEY_COLORS.map(
  (name) => [name, rgbToLab(COLOR_REFERENCE[name])] as const,
);

export interface ColorClassification {
  readonly name: JerseyColorName;
  readonly confidence: number;
  /** Full distribution, best first. The admin debug view (section 45) shows
   *  this rather than only the winner, because the runner-up is the thing that
   *  explains a misidentification. */
  readonly distribution: ReadonlyArray<{ name: JerseyColorName; confidence: number }>;
}

/**
 * Name an observed uniform colour.
 *
 * Confidence is a softmax over negative lighting-tolerant distance, so it
 * genuinely reflects how separated the winner is from the runner-up: a sampled
 * colour sitting between navy and royal blue reports two middling numbers
 * rather than a confident lie.
 */
export function classifyJerseyColor(
  rgb: Rgb,
  opts: UniformDistanceOptions = {},
): ColorClassification {
  const lab = rgbToLab(rgb);
  const scored = REFERENCE_LAB.map(([name, ref]) => ({
    name,
    distance: uniformDistance(lab, ref, opts),
  }));

  // Temperature in ΔE units. 12 makes a ~12 ΔE gap roughly a 1:e preference —
  // tight enough that navy vs royal separates, loose enough that a muddy
  // jersey does not report 0.99 for the wrong name.
  const T = 12;
  const best = Math.min(...scored.map((s) => s.distance));
  const weights = scored.map((s) => ({
    name: s.name,
    w: Math.exp(-(s.distance - best) / T),
  }));
  const total = weights.reduce((acc, x) => acc + x.w, 0);

  const distribution = weights
    .map((x) => ({ name: x.name, confidence: x.w / total }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = distribution[0];
  /* c8 ignore next -- JERSEY_COLORS is non-empty, so this cannot be reached. */
  if (top === undefined) throw new Error("colour vocabulary is empty");
  return { name: top.name, confidence: top.confidence, distribution };
}

// ---------------------------------------------------------------------------
// Dominant colour extraction
// ---------------------------------------------------------------------------

/**
 * Deterministic PRNG. k-means needs randomness for seeding, and a real random
 * seed would make team colour detection non-reproducible — the same game could
 * classify differently on a re-run, which makes a wrong answer impossible to
 * debug and a regression impossible to write a test for.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ColorCluster {
  readonly center: Rgb;
  readonly lab: Lab;
  /** Share of the sampled pixels in this cluster, 0..1. */
  readonly weight: number;
}

/**
 * k-means in LAB over sampled uniform pixels, used to find the two teams'
 * dominant colours from footage (brief section 4).
 *
 * LAB rather than RGB so that clusters form around perceptual colour rather
 * than around exposure — otherwise the sunlit half of one team's jerseys and
 * the shaded half become two "teams".
 */
export function dominantColors(
  samples: readonly Rgb[],
  k: number,
  seed = 1,
): ColorCluster[] {
  if (samples.length === 0 || k <= 0) return [];
  const labs = samples.map(rgbToLab);
  const kk = Math.min(k, labs.length);
  const rand = mulberry32(seed);

  // k-means++ seeding: spread the initial centres out, so a colour worn by a
  // minority of the pixels (a kicker, a referee) does not get swallowed.
  const centers: Lab[] = [];
  const first = labs[Math.floor(rand() * labs.length)];
  /* c8 ignore next */
  if (first === undefined) return [];
  centers.push(first);
  while (centers.length < kk) {
    const d2 = labs.map((p) => {
      const nearest = Math.min(...centers.map((c) => deltaE76(p, c)));
      return nearest * nearest;
    });
    const total = d2.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let pick = rand() * total;
    let idx = 0;
    for (let i = 0; i < d2.length; i++) {
      pick -= d2[i] ?? 0;
      if (pick <= 0) {
        idx = i;
        break;
      }
    }
    const chosen = labs[idx];
    /* c8 ignore next */
    if (chosen === undefined) break;
    centers.push(chosen);
  }

  const assign = new Array<number>(labs.length).fill(0);
  for (let iter = 0; iter < 32; iter++) {
    let moved = false;
    for (let i = 0; i < labs.length; i++) {
      const p = labs[i];
      /* c8 ignore next */
      if (p === undefined) continue;
      let bestIdx = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const cc = centers[c];
        /* c8 ignore next */
        if (cc === undefined) continue;
        const d = deltaE76(p, cc);
        if (d < bestD) {
          bestD = d;
          bestIdx = c;
        }
      }
      if (assign[i] !== bestIdx) {
        assign[i] = bestIdx;
        moved = true;
      }
    }
    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
    for (let i = 0; i < labs.length; i++) {
      const p = labs[i];
      const s = sums[assign[i] ?? 0];
      /* c8 ignore next */
      if (p === undefined || s === undefined) continue;
      s.l += p.l;
      s.a += p.a;
      s.b += p.b;
      s.n += 1;
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c];
      if (s === undefined || s.n === 0) continue;
      centers[c] = { l: s.l / s.n, a: s.a / s.n, b: s.b / s.n };
    }
    if (!moved && iter > 0) break;
  }

  const counts = centers.map(() => 0);
  for (const a of assign) counts[a] = (counts[a] ?? 0) + 1;

  return centers
    .map((lab, i) => ({
      center: labToRgb(lab),
      lab,
      weight: (counts[i] ?? 0) / labs.length,
    }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** LAB back to sRGB, so a cluster centre can be shown to a human as a swatch. */
export function labToRgb(lab: Lab): Rgb {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const inv = (t: number): number =>
    t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787;

  const x = (XN * inv(fx)) / 100;
  const y = (YN * inv(fy)) / 100;
  const z = (ZN * inv(fz)) / 100;

  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  const comp = (c: number): number => {
    const v =
      c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.round(clamp(v * 255, 0, 255));
  };
  return { r: comp(rl), g: comp(gl), b: comp(bl) };
}

// ---------------------------------------------------------------------------
// Team assignment
// ---------------------------------------------------------------------------

export interface TeamAssignment {
  readonly teamId: string | null;
  readonly confidence: number;
  readonly distances: Readonly<Record<string, number>>;
}

/**
 * Decide which of two teams a sampled jersey colour belongs to.
 *
 * Returns `teamId: null` — not a coin flip — when the two teams are not
 * separated enough at this sample for the answer to mean anything. A referee's
 * stripes, a coach on the sideline and a half-occluded shoulder all land here,
 * and saying "unknown" is the honest output.
 */
export function assignTeam(
  observed: Rgb,
  teams: ReadonlyArray<{ id: string; jersey: Rgb }>,
  opts: UniformDistanceOptions & { minMargin?: number } = {},
): TeamAssignment {
  if (teams.length === 0) return { teamId: null, confidence: 0, distances: {} };
  const lab = rgbToLab(observed);
  const scored = teams.map((t) => ({
    id: t.id,
    d: uniformDistance(lab, rgbToLab(t.jersey), opts),
  }));
  scored.sort((a, b) => a.d - b.d);

  const distances: Record<string, number> = {};
  for (const s of scored) distances[s.id] = s.d;

  const best = scored[0];
  /* c8 ignore next */
  if (best === undefined) return { teamId: null, confidence: 0, distances };
  const runnerUp = scored[1];
  if (runnerUp === undefined) {
    // Only one team supplied: nothing to discriminate against, so confidence
    // can only come from absolute closeness.
    const conf = clamp(1 - best.d / 60, 0, 1);
    return { teamId: best.d < 45 ? best.id : null, confidence: conf, distances };
  }

  const margin = runnerUp.d - best.d;
  const minMargin = opts.minMargin ?? 6;
  // Softmax over the two candidates gives a calibrated-feeling number; the
  // margin gate is what prevents a confident answer on an ambiguous sample.
  const T = 12;
  const wBest = Math.exp(-best.d / T);
  const wNext = Math.exp(-runnerUp.d / T);
  const confidence = wBest / (wBest + wNext);

  if (margin < minMargin || best.d > 55) {
    return { teamId: null, confidence, distances };
  }
  return { teamId: best.id, confidence, distances };
}
