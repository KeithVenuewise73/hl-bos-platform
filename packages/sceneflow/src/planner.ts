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
 * the ceiling is replaced with the nearest beat at or below it, so a user who
 * chose "Warm" still gets six scenes with a shape, not four scenes and a gap.
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

  const chosen: StoryBeat[] = [];
  indices.forEach((sourceIndex, position) => {
    const source = found.beats[sourceIndex];
    /* c8 ignore next -- indices are fixed and in range for every preset */
    if (!source) return;
    const capped =
      ceiling !== undefined && intimacyRank(source.intimacy) > intimacyRank(ceiling)
        ? substitute(found, sourceIndex, ceiling)
        : source;
    chosen.push({ ...capped, number: position + 1 });
  });

  return {
    title: options.title ?? found.title,
    presetSlug: found.slug,
    cast,
    scenes: chosen,
  };
}

/** The nearest earlier beat at or below the ceiling, keeping the beat's title. */
function substitute(
  from: StoryPreset,
  index: number,
  ceiling: IntimacyLevel,
): StoryBeat {
  const original = from.beats[index];
  /* c8 ignore next -- callers only pass in-range indices */
  if (!original) throw new Error("beat_out_of_range");

  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = from.beats[i];
    if (candidate && intimacyRank(candidate.intimacy) <= intimacyRank(ceiling)) {
      return {
        ...original,
        interaction: candidate.interaction,
        intimacy: candidate.intimacy,
      };
    }
  }
  return { ...original, interaction: "stand-together", intimacy: "warm" };
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
