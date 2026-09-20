// The story planner (sections 21 and 29).
//
// A storyboard is not six independent images with the same prompt. It is a
// sequence with a shape: contact, mutual contact, expansion, closeness, a focal
// moment, a settling. This module produces that shape as data BEFORE any image
// is generated, so the user can see what is about to be made, and so a failed
// panel can be retried against the same plan rather than a re-rolled story.

import type { CastMemberId, IntimacyLevel, StoryBeat, StoryPlan } from "./types";
import { intimacyRank } from "./vocabulary";

export interface StoryPreset {
  readonly slug: string;
  readonly title: string;
  /** Six beats. Shorter plans are derived from these, never invented separately. */
  readonly beats: readonly StoryBeat[];
  /** Whether this preset is written for a group rather than a pair. */
  readonly group: boolean;
}

function beat(
  number: number,
  title: string,
  interaction: string,
  intimacy: IntimacyLevel,
): StoryBeat {
  return { number, title, interaction, intimacy };
}

export const PRESETS: readonly StoryPreset[] = [
  {
    slug: "luxury-suite",
    title: "Luxury Suite",
    group: false,
    beats: [
      beat(1, "Arrival", "stand-together", "warm"),
      beat(2, "Close Conversation", "talk", "warm"),
      beat(3, "Cuddle", "cuddle", "romantic"),
      beat(4, "Whisper", "whisper", "romantic"),
      beat(5, "Kiss", "kiss", "passionate"),
      beat(6, "Goodnight", "goodnight", "private-romance"),
    ],
  },
  {
    slug: "date-night",
    title: "Date Night",
    group: false,
    beats: [
      beat(1, "Getting Ready", "pose-together", "warm"),
      beat(2, "Dinner", "talk", "warm"),
      beat(3, "Walk", "walk-together", "warm"),
      beat(4, "Conversation", "whisper", "romantic"),
      beat(5, "Kiss", "kiss", "passionate"),
      beat(6, "Home Together", "relax-together", "romantic"),
    ],
  },
  {
    slug: "tuscany",
    title: "Tuscany",
    group: false,
    beats: [
      beat(1, "Vineyard", "walk-together", "warm"),
      beat(2, "Terrace", "stand-together", "warm"),
      beat(3, "Dinner", "talk", "warm"),
      beat(4, "Sunset", "embrace", "romantic"),
      beat(5, "Fireside", "cuddle", "romantic"),
      beat(6, "Goodnight", "goodnight", "private-romance"),
    ],
  },
  {
    slug: "island-escape",
    title: "Island Escape",
    group: false,
    beats: [
      beat(1, "Beach", "walk-together", "warm"),
      beat(2, "Sunset", "hold-hands", "warm"),
      beat(3, "Terrace", "stand-together", "warm"),
      beat(4, "Dinner", "talk", "warm"),
      beat(5, "Balcony", "embrace", "romantic"),
      beat(6, "Evening Cuddle", "cuddle", "romantic"),
    ],
  },
  {
    slug: "cozy-night",
    title: "Cozy Night",
    group: false,
    beats: [
      beat(1, "Couch", "sit-together", "warm"),
      beat(2, "Conversation", "talk", "warm"),
      beat(3, "Laugh", "laugh", "warm"),
      beat(4, "Cuddle", "cuddle", "romantic"),
      beat(5, "Kiss", "kiss", "passionate"),
      beat(6, "Sleep", "goodnight", "private-romance"),
    ],
  },
  {
    slug: "group-night",
    title: "Group Night",
    group: true,
    beats: [
      beat(1, "Gather", "stand-together", "warm"),
      beat(2, "Conversation", "talk", "warm"),
      beat(3, "Closer Interaction", "touch-shoulder", "warm"),
      beat(4, "Group Affection", "move-closer", "warm"),
      beat(5, "Focus Pair Moment", "kiss", "passionate"),
      beat(6, "Group Finale", "relax-together", "romantic"),
    ],
  },
  {
    // Section 19's six-scene group progression, as its own preset.
    slug: "group-progression",
    title: "Group Progression",
    group: true,
    beats: [
      beat(1, "Initial Contact", "touch-arm", "warm"),
      beat(2, "Mutual Touch", "touch-shoulder", "warm"),
      beat(3, "Expanding Interaction", "move-closer", "warm"),
      beat(4, "Group Closeness", "sit-together", "warm"),
      beat(5, "Focal Moment", "embrace", "romantic"),
      beat(6, "Final Group Moment", "relax-together", "romantic"),
    ],
  },
];

const BY_SLUG = new Map(PRESETS.map((p) => [p.slug, p]));

export function preset(slug: string): StoryPreset | null {
  return BY_SLUG.get(slug) ?? null;
}

export type SceneCount = 1 | 3 | 6;

/**
 * Derive a shorter plan from the six-beat shape.
 *
 * Beats 1, 4 and 6 — an opening, a turn and a close. Taking the first three
 * would give three openings and no story, which is the mistake that makes a
 * "3-scene story" feel like three near-identical images.
 */
const SHORT_PLAN_INDICES: Readonly<Record<SceneCount, readonly number[]>> = {
  1: [4],
  3: [0, 3, 5],
  6: [0, 1, 2, 3, 4, 5],
};

export interface PlanOptions {
  readonly title?: string;
  readonly ceiling?: IntimacyLevel;
}

/**
 * Build the plan for a story.
 *
 * The intimacy ceiling is applied by SUBSTITUTION, not truncation: a beat above
 * the ceiling is replaced with the strongest beat at or below it, so a user who
 * chose "Warm" still gets six scenes with a shape rather than four and a gap,
 * and a capped story stays as close to its intended level as it is allowed to.
 *
 * Then a second pass removes consecutive repeats. Both passes were put here by
 * running the page and reading the result:
 *
 *   - Capping "Luxury Suite" at Passionate gave scene 5 "Kiss" and scene 6
 *     "Goodnight" BOTH staged as a conventional kiss.
 *   - Fixing that by looking only backwards then let a capped beat collide with
 *     the beat AFTER it: "Date Night" at Romantic repeated relax-together
 *     across scenes 5 and 6.
 *
 * Two consecutive panels doing the identical thing is not a story, in either
 * direction, so the de-duplication pass considers both neighbours.
 */
export function planStory(
  presetSlug: string,
  cast: readonly CastMemberId[],
  scenes: SceneCount,
  options: PlanOptions = {},
): StoryPlan {
  const found = preset(presetSlug);
  if (!found) throw new Error(`unknown_preset:${presetSlug}`);

  const indices = SHORT_PLAN_INDICES[scenes];
  const ceiling = options.ceiling;

  // Pass 1 — cap anything above the ceiling.
  const chosen: StoryBeat[] = [];
  indices.forEach((sourceIndex, position) => {
    const source = found.beats[sourceIndex];
    /* c8 ignore next -- indices are fixed and in range for every preset */
    if (!source) return;
    const needsCap =
      ceiling !== undefined && intimacyRank(source.intimacy) > intimacyRank(ceiling);
    const replacement = needsCap ? pickSubstitute(found, ceiling, new Set()) : null;
    chosen.push({
      ...source,
      ...(replacement ?? {}),
      ...(needsCap && replacement === null
        ? { interaction: "stand-together", intimacy: "warm" }
        : {}),
      number: position + 1,
    });
  });

  // Pass 2 — no panel repeats the one before it.
  const cap = ceiling ?? "private-romance";
  for (let i = 1; i < chosen.length; i += 1) {
    const current = chosen[i];
    const previous = chosen[i - 1];
    if (!current || !previous || current.interaction !== previous.interaction) continue;
    const exclude = new Set<string>([previous.interaction]);
    const after = chosen[i + 1]?.interaction;
    if (after !== undefined) exclude.add(after);
    const alternative = pickSubstitute(found, cap, exclude);
    if (alternative) chosen[i] = { ...current, ...alternative };
  }

  return {
    title: options.title ?? found.title,
    presetSlug: found.slug,
    cast,
    scenes: chosen,
  };
}

/**
 * The strongest beat in the preset at or below the ceiling, skipping `exclude`.
 *
 * Ties go to the EARLIEST such beat, which is the calmer reading of two equal
 * options — a "Goodnight" capped out of a kiss becomes a cuddle rather than a
 * whisper. Returns null when the preset has nothing permitted to offer.
 */
function pickSubstitute(
  from: StoryPreset,
  ceiling: IntimacyLevel,
  exclude: ReadonlySet<string>,
): { interaction: string; intimacy: IntimacyLevel } | null {
  let best: StoryBeat | null = null;
  for (const candidate of from.beats) {
    if (exclude.has(candidate.interaction)) continue;
    if (intimacyRank(candidate.intimacy) > intimacyRank(ceiling)) continue;
    if (
      best === null ||
      intimacyRank(candidate.intimacy) > intimacyRank(best.intimacy)
    ) {
      best = candidate;
    }
  }
  return best === null
    ? null
    : { interaction: best.interaction, intimacy: best.intimacy };
}

/** A plan with no preset, for a single ad-hoc continuation. */
export function planSingle(
  cast: readonly CastMemberId[],
  interaction: string,
  intimacy: IntimacyLevel,
  title = "Next Moment",
): StoryPlan {
  return {
    title,
    presetSlug: null,
    cast,
    scenes: [beat(1, title, interaction, intimacy)],
  };
}
