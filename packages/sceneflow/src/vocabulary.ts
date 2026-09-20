// The interaction vocabulary — the closed set of things a cast can be asked to do.
//
// This file is the product's boundary expressed as data. Anything not listed
// here has no structured representation, so it cannot reach prompt composition
// even if it survives every text filter. That ordering matters: the filter is a
// second line, not the first.

import type { CastMemberId, IntimacyLevel, InteractionType } from "./types";

export interface InteractionSpec {
  readonly type: InteractionType;
  /** What the user sees in the picker. */
  readonly label: string;
  /** How the prompt composer describes it. Non-explicit by construction. */
  readonly phrasing: string;
  readonly intimacy: IntimacyLevel;
  /** Fewest actors this edge is meaningful with. */
  readonly minActors: 1 | 2;
  /** Most actors, or null for "any number". */
  readonly maxActors: number | null;
  /**
   * What Reciprocal Affection does with this edge (section 17).
   *  - "mutual": the act is already two-sided; no extra edge is added.
   *  - an InteractionType: the returned, non-explicit counterpart.
   *  - null: nothing is returned.
   */
  readonly reciprocal: InteractionType | "mutual" | null;
}

const SPECS: readonly InteractionSpec[] = [
  {
    type: "talk",
    label: "Talk",
    phrasing: "talking together",
    intimacy: "warm",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "conversation",
    label: "Conversation",
    phrasing: "in conversation",
    intimacy: "warm",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "stand-together",
    label: "Stand Together",
    phrasing: "standing close together",
    intimacy: "warm",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "sit-together",
    label: "Sit Together",
    phrasing: "seated close together",
    intimacy: "warm",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "pose-together",
    label: "Pose Together",
    phrasing: "posing together for the camera",
    intimacy: "warm",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "walk-together",
    label: "Walk Together",
    phrasing: "walking together",
    intimacy: "warm",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "look-out-window",
    label: "Look Out Window",
    phrasing: "looking out of the window",
    intimacy: "warm",
    minActors: 1,
    maxActors: null,
    reciprocal: null,
  },
  {
    type: "laugh",
    label: "Laugh",
    phrasing: "laughing",
    intimacy: "warm",
    minActors: 1,
    maxActors: null,
    reciprocal: "laugh",
  },
  {
    type: "observing",
    label: "Observing",
    phrasing: "watching the others, naturally part of the scene",
    intimacy: "warm",
    minActors: 1,
    maxActors: 1,
    reciprocal: null,
  },
  {
    type: "move-closer",
    label: "Move Closer",
    phrasing: "moving closer",
    intimacy: "warm",
    minActors: 1,
    maxActors: null,
    reciprocal: "move-closer",
  },
  {
    type: "eye-contact",
    label: "Close Eye Contact",
    phrasing: "holding close eye contact",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "hold-hands",
    label: "Hold Hands",
    phrasing: "holding hands",
    intimacy: "warm",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "touch-arm",
    label: "Touch Arm",
    phrasing: "a hand resting gently on the other's arm",
    intimacy: "warm",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-waist",
  },
  {
    type: "touch-shoulder",
    label: "Touch Shoulder",
    phrasing: "a hand resting on the other's shoulder",
    intimacy: "warm",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-upper-back",
  },
  {
    type: "touch-upper-back",
    label: "Touch Upper Back",
    phrasing: "a hand resting on the other's upper back",
    intimacy: "warm",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-arm",
  },
  {
    type: "touch-waist",
    label: "Touch Waist",
    phrasing: "an arm around the other's waist",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-upper-back",
  },
  {
    type: "touch-clothed-knee",
    label: "Touch Clothed Knee",
    phrasing: "a hand resting on the other's clothed knee",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-arm",
  },
  {
    type: "touch-clothed-thigh",
    label: "Touch Clothed Thigh",
    phrasing: "a hand resting on the other's clothed upper leg",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-arm",
  },
  {
    type: "face-touch",
    label: "Touch Face",
    phrasing: "a hand gently touching the other's face",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-upper-back",
  },
  {
    type: "whisper",
    label: "Whisper",
    phrasing: "leaning in to whisper",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "laugh",
  },
  {
    type: "slow-dance",
    label: "Slow Dance",
    phrasing: "slow dancing together",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "embrace",
    label: "Embrace",
    phrasing: "holding each other in a close embrace",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "cuddle",
    label: "Cuddle",
    phrasing: "cuddled close together, fully clothed",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "relax-together",
    label: "Relax Together",
    phrasing: "relaxing together",
    intimacy: "romantic",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "recline-together",
    label: "Recline Together",
    phrasing: "reclining together, fully clothed and covered",
    intimacy: "private-romance",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "cheek-kiss",
    label: "Cheek Kiss",
    phrasing: "a kiss on the cheek",
    intimacy: "warm",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-arm",
  },
  {
    type: "forehead-kiss",
    label: "Forehead Kiss",
    phrasing: "a kiss on the forehead",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-waist",
  },
  {
    type: "kiss",
    label: "Kiss",
    phrasing: "a conventional kiss",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "neck-kiss",
    label: "Kiss the Neck",
    phrasing: "a kiss on the side of the neck",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "hand-in-hair",
  },
  {
    type: "forehead-to-forehead",
    label: "Foreheads Together",
    phrasing: "foreheads resting together, eyes closed",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "embrace-from-behind",
    label: "Embrace From Behind",
    phrasing: "holding the other from behind, arms around them",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "hold-hands",
  },
  {
    type: "head-on-chest",
    label: "Head on Chest",
    phrasing: "head resting on the other's chest",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "hand-in-hair",
  },
  {
    type: "hand-in-hair",
    label: "Hand in Hair",
    phrasing: "a hand in the other's hair",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "face-touch",
  },
  {
    // Over clothing, and the phrasing says so. Section 19 of the brief allows
    // a hand on the upper chest where it stays over what is worn.
    type: "hand-on-chest",
    label: "Hand on Chest",
    phrasing: "a hand resting flat on the other's chest, over their clothing",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-waist",
  },
  {
    type: "share-blanket",
    label: "Share a Blanket",
    phrasing: "sharing a blanket, pressed close",
    intimacy: "romantic",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
  {
    type: "lift",
    label: "Lifted",
    phrasing: "one lifted into the other's arms, laughing",
    intimacy: "romantic",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "pull-close",
    label: "Pull Close",
    phrasing: "pulled close by the front of their shirt",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "face-touch",
  },
  {
    // OUTERWEAR ONLY, and this is the boundary in a single word. Loosening a
    // tie or slipping off a jacket is charged and exposes nothing. Anything
    // that opens what is worn OVER intimate anatomy — a shirt, a waistband, a
    // zip — is undressing-to-expose and has no member in this set, which is
    // why it cannot be composed into a prompt at all.
    type: "loosen-tie",
    label: "Loosen a Tie",
    phrasing: "loosening the other's tie",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "face-touch",
  },
  {
    type: "remove-jacket",
    label: "Take a Jacket Off",
    phrasing: "slipping the other's jacket from their shoulders, fully dressed beneath",
    intimacy: "passionate",
    minActors: 2,
    maxActors: 2,
    reciprocal: "touch-waist",
  },
  {
    type: "wake-together",
    label: "Wake Together",
    phrasing: "waking together in the morning light, clothed and covered",
    intimacy: "private-romance",
    minActors: 2,
    maxActors: 2,
    reciprocal: "mutual",
  },
  {
    type: "goodnight",
    label: "Goodnight",
    phrasing: "a relaxed goodnight moment, fully clothed",
    intimacy: "private-romance",
    minActors: 2,
    maxActors: null,
    reciprocal: "mutual",
  },
];

const BY_TYPE = new Map<InteractionType, InteractionSpec>(
  SPECS.map((s) => [s.type, s]),
);

export const INTERACTIONS: readonly InteractionSpec[] = SPECS;

export function isInteractionType(value: string): value is InteractionType {
  return BY_TYPE.has(value as InteractionType);
}

/** Throws on an unknown type — callers should have validated first. */
export function interactionSpec(type: InteractionType): InteractionSpec {
  const spec = BY_TYPE.get(type);
  if (!spec) throw new Error(`unknown_interaction_type:${type}`);
  return spec;
}

export function interactionsAtOrBelow(
  level: IntimacyLevel,
): readonly InteractionSpec[] {
  const ceiling = intimacyRank(level);
  return SPECS.filter((s) => intimacyRank(s.intimacy) <= ceiling);
}

const RANK: Readonly<Record<IntimacyLevel, number>> = {
  warm: 0,
  romantic: 1,
  passionate: 2,
  "private-romance": 3,
};

export function intimacyRank(level: IntimacyLevel): number {
  return RANK[level];
}

/**
 * Free-text phrases that map onto a vocabulary member. Used only to INTERPRET a
 * user's own words into a structured edge — never to widen the vocabulary. A
 * phrase with no entry here is "not recognised", which is a different outcome
 * from "blocked" and is reported differently (section 32).
 */
const SYNONYMS: readonly (readonly [string, InteractionType])[] = [
  ["hold hands", "hold-hands"],
  ["holding hands", "hold-hands"],
  ["hand in hand", "hold-hands"],
  ["arm around", "touch-waist"],
  ["hand on the waist", "touch-waist"],
  ["hand on her waist", "touch-waist"],
  ["hand on his waist", "touch-waist"],
  ["hand on their waist", "touch-waist"],
  ["touch the waist", "touch-waist"],
  ["hand on the shoulder", "touch-shoulder"],
  ["hand on her shoulder", "touch-shoulder"],
  ["hand on his shoulder", "touch-shoulder"],
  ["hand on their shoulder", "touch-shoulder"],
  ["touch the shoulder", "touch-shoulder"],
  ["touch the arm", "touch-arm"],
  ["hand on the arm", "touch-arm"],
  ["hand on her arm", "touch-arm"],
  ["hand on his arm", "touch-arm"],
  ["upper back", "touch-upper-back"],
  ["hand on the knee", "touch-clothed-knee"],
  ["hand on her knee", "touch-clothed-knee"],
  ["hand on his knee", "touch-clothed-knee"],
  ["on the knee", "touch-clothed-knee"],
  ["hand on the thigh", "touch-clothed-thigh"],
  ["hand on her thigh", "touch-clothed-thigh"],
  ["hand on his thigh", "touch-clothed-thigh"],
  ["on the leg", "touch-clothed-thigh"],
  ["touch the face", "face-touch"],
  ["touches the face", "face-touch"],
  ["hand on the face", "face-touch"],
  ["cup the face", "face-touch"],
  ["forehead kiss", "forehead-kiss"],
  ["kiss on the forehead", "forehead-kiss"],
  ["kisses the forehead", "forehead-kiss"],
  ["cheek kiss", "cheek-kiss"],
  ["kiss on the cheek", "cheek-kiss"],
  ["kisses the cheek", "cheek-kiss"],
  ["kiss on the neck", "neck-kiss"],
  ["kisses the neck", "neck-kiss"],
  ["neck kiss", "neck-kiss"],
  ["foreheads together", "forehead-to-forehead"],
  ["forehead against", "forehead-to-forehead"],
  ["from behind", "embrace-from-behind"],
  ["head on the chest", "head-on-chest"],
  ["rests her head", "head-on-chest"],
  ["rests his head", "head-on-chest"],
  ["hand in the hair", "hand-in-hair"],
  ["hand in her hair", "hand-in-hair"],
  ["hand in his hair", "hand-in-hair"],
  ["hand on the chest", "hand-on-chest"],
  ["hand on his chest", "hand-on-chest"],
  ["hand on her chest", "hand-on-chest"],
  ["share a blanket", "share-blanket"],
  ["sharing a blanket", "share-blanket"],
  ["under a blanket", "share-blanket"],
  ["lifts her", "lift"],
  ["lifts him", "lift"],
  ["picks her up", "lift"],
  ["picks him up", "lift"],
  ["pulls him closer by", "pull-close"],
  ["pulls her closer by", "pull-close"],
  ["by the shirt", "pull-close"],
  ["loosen the tie", "loosen-tie"],
  ["loosens his tie", "loosen-tie"],
  ["loosens the tie", "loosen-tie"],
  ["takes off his jacket", "remove-jacket"],
  ["takes off her jacket", "remove-jacket"],
  ["slips the jacket", "remove-jacket"],
  ["wake together", "wake-together"],
  ["waking together", "wake-together"],
  ["wake up together", "wake-together"],
  ["kiss", "kiss"],
  ["kisses", "kiss"],
  ["kissing", "kiss"],
  ["hug", "embrace"],
  ["hugs", "embrace"],
  ["hugging", "embrace"],
  ["embrace", "embrace"],
  ["embraces", "embrace"],
  ["embracing", "embrace"],
  ["cuddle", "cuddle"],
  ["cuddles", "cuddle"],
  ["cuddling", "cuddle"],
  ["snuggle", "cuddle"],
  ["snuggling", "cuddle"],
  ["whisper", "whisper"],
  ["whispers", "whisper"],
  ["whispering", "whisper"],
  ["slow dance", "slow-dance"],
  ["slow dancing", "slow-dance"],
  ["dance", "slow-dance"],
  ["dancing", "slow-dance"],
  ["laugh", "laugh"],
  ["laughs", "laugh"],
  ["laughing", "laugh"],
  ["move closer", "move-closer"],
  ["moves closer", "move-closer"],
  ["moving closer", "move-closer"],
  ["lean in", "move-closer"],
  ["leans in", "move-closer"],
  ["come closer", "move-closer"],
  ["closer together", "move-closer"],
  ["sit together", "sit-together"],
  ["sitting together", "sit-together"],
  ["sit closely", "sit-together"],
  ["stand together", "stand-together"],
  ["standing together", "stand-together"],
  ["pose together", "pose-together"],
  ["posing together", "pose-together"],
  ["walk together", "walk-together"],
  ["walking together", "walk-together"],
  ["look out the window", "look-out-window"],
  ["looking out the window", "look-out-window"],
  ["toward the windows", "look-out-window"],
  ["relax together", "relax-together"],
  ["relaxing together", "relax-together"],
  ["recline together", "recline-together"],
  ["reclining together", "recline-together"],
  ["lie together", "recline-together"],
  ["lying together", "recline-together"],
  ["goodnight", "goodnight"],
  ["good night", "goodnight"],
  ["end the evening", "goodnight"],
  ["eye contact", "eye-contact"],
  ["look into each other", "eye-contact"],
  ["talk", "talk"],
  ["talks", "talk"],
  ["talking", "talk"],
  ["conversation", "conversation"],
  ["chat", "talk"],
  ["chatting", "talk"],
];

/**
 * The interaction a direction is ABOUT: the earliest phrase in the sentence,
 * with the longer phrase winning a tie at the same position.
 *
 * Both halves of that rule were put there by a failing test.
 *
 * Earliest, because "Have Person B kiss Person D while the others move closer"
 * is a kiss with a bystander note — ranking by phrase length alone made it a
 * "move closer", losing the actual instruction.
 *
 * Longest on a tie, because "kiss on the forehead" starts at the same index as
 * "kiss" and is the more specific reading of the same words.
 */
export function matchInteractionPhrase(normalizedText: string): InteractionType | null {
  let bestType: InteractionType | null = null;
  let bestIndex = Number.MAX_SAFE_INTEGER;
  let bestLength = 0;

  for (const [phrase, type] of SYNONYMS) {
    const index = normalizedText.indexOf(phrase);
    if (index < 0) continue;
    if (index < bestIndex || (index === bestIndex && phrase.length > bestLength)) {
      bestType = type;
      bestIndex = index;
      bestLength = phrase.length;
    }
  }

  return bestType;
}

/**
 * Reciprocal Affection (section 17). Given an edge, the counterpart edge the
 * other adult may return — or null when the act is already mutual or has no
 * natural reply. The counterpart is always drawn from the same closed set, so
 * reciprocation can never escalate past the boundary.
 */
export function reciprocalEdge(
  type: InteractionType,
  actors: readonly CastMemberId[],
): { readonly actors: readonly CastMemberId[]; readonly type: InteractionType } | null {
  const spec = interactionSpec(type);
  if (spec.reciprocal === null || spec.reciprocal === "mutual") return null;
  if (actors.length !== 2) return null;
  const [a, b] = actors;
  if (!a || !b) return null;
  return { actors: [b, a], type: spec.reciprocal };
}
