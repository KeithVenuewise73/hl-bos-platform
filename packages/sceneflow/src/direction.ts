// normalizeCustomDirection (section 32).
//
// The user types "Have Person B kiss Person D while the others move closer."
// That sentence NEVER reaches a provider. It is read into structure here, and
// the structure is what gets composed into a prompt. Three consequences:
//
//   1. An act with no vocabulary member cannot be expressed at all.
//   2. Prompt injection has nowhere to land — the sentence is not concatenated.
//   3. What the user asked for can be shown back to them as choices they can
//      edit, instead of a paragraph they have to re-type.

import { evaluateText, normalizeText, type PolicyVerdict } from "./policy";
import { intimacyRank, interactionSpec, matchInteractionPhrase } from "./vocabulary";
import type {
  CastMemberId,
  IntimacyLevel,
  InteractionType,
  SceneInteraction,
} from "./types";

/** What the rest of the cast does while the named actors interact. */
export type BystanderDirection = "unchanged" | "move-closer" | "observing" | "laugh";

export type NormalizedDirection =
  | {
      readonly kind: "blocked";
      readonly verdict: PolicyVerdict;
    }
  | {
      readonly kind: "unrecognized";
      /** Which parts were understood, so the UI can prefill rather than discard. */
      readonly actors: readonly CastMemberId[];
      readonly message: string;
    }
  | {
      readonly kind: "ok";
      readonly actors: readonly CastMemberId[];
      readonly interaction: InteractionType;
      readonly intimacy: IntimacyLevel;
      readonly otherCharacters: BystanderDirection;
      readonly mood: string | null;
      readonly edge: SceneInteraction;
    };

const MOODS: readonly string[] = [
  "romantic",
  "warm",
  "playful",
  "flirtatious",
  "cozy",
  "passionate",
  "tender",
  "celebratory",
  "relaxed",
];

const BYSTANDER_PHRASES: readonly (readonly [string, BystanderDirection])[] = [
  ["others move closer", "move-closer"],
  ["everyone else moves closer", "move-closer"],
  ["the rest move closer", "move-closer"],
  ["others laugh", "laugh"],
  ["everyone laughs", "laugh"],
  ["group laughs", "laugh"],
  ["others watch", "observing"],
  ["others look on", "observing"],
  ["everyone else watches", "observing"],
];

/**
 * Resolve a cast reference. Accepts "Person B", "person b", a bare "B", and the
 * `person_b` id itself — all four appear in real typing.
 *
 * A bare single letter is only accepted when it stands alone as a word, so "a
 * warm evening" does not nominate Person A.
 */
function resolveActors(
  normalized: string,
  cast: readonly CastMemberId[],
): readonly CastMemberId[] {
  const found: CastMemberId[] = [];
  for (const id of cast) {
    const letter = id.slice("person_".length);
    const patterns = [
      new RegExp(`\\bperson ${letter}\\b`),
      new RegExp(`\\bperson_${letter}\\b`),
      new RegExp(`\\b${letter}\\b`),
    ];
    // The bare-letter pattern is tried last and only for B..H: a lone "a" is an
    // article far more often than it is Person A.
    const usable = letter === "a" ? patterns.slice(0, 2) : patterns;
    if (usable.some((p) => p.test(normalized))) found.push(id);
  }
  return found;
}

/** Position of a cast reference in the text, so "B kisses D" keeps its order. */
function orderActors(
  actors: readonly CastMemberId[],
  normalized: string,
): readonly CastMemberId[] {
  const at = (id: CastMemberId): number => {
    const letter = id.slice("person_".length);
    const candidates = [
      normalized.indexOf(`person ${letter}`),
      normalized.indexOf(`person_${letter}`),
      normalized.search(new RegExp(`\\b${letter}\\b`)),
    ].filter((i) => i >= 0);
    return candidates.length > 0 ? Math.min(...candidates) : Number.MAX_SAFE_INTEGER;
  };
  return [...actors].sort((x, y) => at(x) - at(y));
}

/**
 * Read a typed direction into structure.
 *
 * Order matters and is not negotiable: the policy gate runs FIRST, before any
 * interpretation. An unsafe sentence is never partially honoured, and its
 * recognised fragments are never handed back as "your safe selections".
 */
export function normalizeCustomDirection(
  text: string,
  cast: readonly CastMemberId[],
  options: { readonly ceiling?: IntimacyLevel } = {},
): NormalizedDirection {
  const verdict = evaluateText(text);
  if (!verdict.allowed) return { kind: "blocked", verdict };

  const normalized = normalizeText(text).plain;
  const actors = orderActors(resolveActors(normalized, cast), normalized);
  const interaction = matchInteractionPhrase(normalized);

  if (interaction === null) {
    return {
      kind: "unrecognized",
      actors,
      message:
        "SceneFlow did not recognise an action in that. Pick one from the list — hold hands, embrace, cuddle, whisper, kiss, slow dance, move closer, and the rest.",
    };
  }

  const spec = interactionSpec(interaction);

  // An interaction needing two people, typed without naming two, is a
  // half-understood direction. Say so rather than guessing who the second
  // person is — guessing here puts a stranger in an intimate scene.
  if (actors.length < spec.minActors) {
    return {
      kind: "unrecognized",
      actors,
      message: `"${spec.label}" needs ${spec.minActors} people. Tap who it applies to.`,
    };
  }

  const trimmed =
    spec.maxActors !== null && actors.length > spec.maxActors
      ? actors.slice(0, spec.maxActors)
      : actors;

  let others: BystanderDirection = "unchanged";
  for (const [phrase, value] of BYSTANDER_PHRASES) {
    if (normalized.includes(phrase)) {
      others = value;
      break;
    }
  }

  const mood = MOODS.find((m) => new RegExp(`\\b${m}\\b`).test(normalized)) ?? null;

  const ceiling = options.ceiling;
  if (ceiling !== undefined) {
    if (intimacyRank(spec.intimacy) > intimacyRank(ceiling)) {
      return {
        kind: "unrecognized",
        actors: trimmed,
        message: `"${spec.label}" is above the intimacy level you chose. Raise the level, or pick something gentler.`,
      };
    }
  }

  return {
    kind: "ok",
    actors: trimmed,
    interaction,
    intimacy: spec.intimacy,
    otherCharacters: others,
    mood,
    edge: { actors: trimmed, type: interaction },
  };
}
