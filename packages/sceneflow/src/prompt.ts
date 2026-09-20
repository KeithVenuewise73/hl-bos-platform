// Server-side prompt composition (section 31).
//
// "Never rely on client-generated raw prompts alone." This module is the ONLY
// place a prompt string is produced, and it is produced from structure:
// descriptors, a spatial map, an interaction graph, an environment. No caller
// passes a sentence through.
//
// That is a security property, not a style preference. Because nothing the user
// typed is concatenated in, there is no text channel for "ignore the previous
// instructions" to travel down, and the safety clause below cannot be displaced
// by anything a user writes.

import { renderGraph } from "./graph";
import { renderSpatialMap } from "./spatial";
import { labelFor } from "./cast";
import type { AspectRatio, CastMemberId, ContinuityContext, SceneLock } from "./types";

export interface PromptInput {
  readonly context: ContinuityContext;
  /** The identity block from castDescriptions(). */
  readonly characterDescriptions: string;
  /** The beat being rendered, drawn from the plan — never raw user text. */
  readonly sceneDescription: string;
  readonly lock: SceneLock;
  readonly aspectRatio: AspectRatio;
}

export interface ComposedPrompt {
  readonly text: string;
  /** Source and reference images the request should condition on (section 34). */
  readonly referencePaths: readonly string[];
  readonly aspectRatio: AspectRatio;
}

const SAFETY_CLAUSE = `REAL-PERSON SAFETY:

All subjects are clearly adults.
Keep intimate anatomy covered at all times.
Do not depict intercourse, simulated intercourse, oral sex, masturbation,
exposed genitals, exposed nipples, explicit sexual touching, or pornographic
poses. Every interaction must read as willing, affectionate and non-explicit.`;

const QUALITY_CLAUSE = `VISUAL QUALITY:

Photorealistic professional photography. Natural anatomy. Natural hands.
Correct perspective. Believable body overlap. Realistic skin and fabric.
Accurate scale. Cinematic depth of field. Professional composition.`;

function wardrobeBlock(context: ContinuityContext): string {
  const lines = context.cast.map((id) => {
    const item = context.wardrobeMap[id];
    return `- ${labelFor(id)}: ${item ?? "exactly as worn in the source image"}`;
  });
  return lines.join("\n");
}

function continuityClause(lock: SceneLock): string {
  const kept: string[] = ["the same people"];
  if (lock.wardrobe) kept.push("the same clothing");
  if (lock.room) kept.push("the same location and architectural elements");
  if (lock.lighting) kept.push("the same lighting");
  if (lock.timeOfDay) kept.push("the same time of day");
  if (lock.visualStyle) kept.push("the same photographic style");

  return `CONTINUITY:

The result must look as though it was photographed minutes after the previous
scene, with ${kept.join(", ")}, and believable character placement.`;
}

/** Compose the generation prompt. Deterministic: same input, same string. */
export function composePrompt(input: PromptInput): ComposedPrompt {
  const { context } = input;
  const labelOf = (id: CastMemberId) => labelFor(id);

  const sections: string[] = [
    `Use the supplied source image and character-reference images to create the
next photorealistic moment in the same clearly adult scene.`,
    `PRESERVE CAST:\n\n${input.characterDescriptions}`,
    `Maintain recognisable facial structure, hairstyle, complexion, approximate
apparent adult age, body build, and clothing unless changed intentionally.`,
    `CURRENT POSITIONS:\n\n${renderSpatialMap(context.currentSpatialMap, labelOf)}`,
    `CURRENT INTERACTIONS:\n\n${renderGraph(context.currentInteractionGraph, labelOf)}`,
    `ENVIRONMENT:\n\n${context.environment.type}; ${context.environment.lighting};
${context.environment.timeOfDay}${
      context.environment.features.length > 0
        ? `; ${context.environment.features.join(", ")}`
        : ""
    }`,
    `WARDROBE:\n\n${wardrobeBlock(context)}`,
    `PHOTO STYLE:\n\n${context.photoStyle}`,
    `NEXT MOMENT:\n\n${input.sceneDescription}`,
    `MOOD:\n\n${context.mood}`,
    `CAMERA:\n\n${context.camera.shot} shot, ${context.camera.orientation}, ${context.camera.height}`,
  ];

  if (context.focusCharacterIds.length > 0) {
    sections.push(
      `FOCUS:\n\nThe moment centres on ${context.focusCharacterIds
        .map(labelOf)
        .join(" and ")}. Everyone else remains present and naturally involved,
and must not be removed from the frame.`,
    );
  }

  if (context.previousSceneDescription !== "") {
    sections.push(`PREVIOUS SCENE:\n\n${context.previousSceneDescription}`);
  }

  sections.push(continuityClause(input.lock));
  sections.push(QUALITY_CLAUSE);
  // Last, and unconditional. Not assembled from anything a caller supplied.
  sections.push(SAFETY_CLAUSE);

  const referencePaths = context.cast.flatMap(
    (id) => context.characterReferences[id] ?? [],
  );

  return {
    text: sections.join("\n\n"),
    referencePaths,
    aspectRatio: input.aspectRatio,
  };
}

/**
 * A variation (mode 6): everything held, only expression, angle and framing move.
 * Composed from the same structure so a variation cannot drift into a new scene.
 */
export function composeVariationPrompt(input: PromptInput): ComposedPrompt {
  const base = composePrompt(input);
  return {
    ...base,
    text: `${base.text}

VARIATION:

Keep the characters, wardrobe, environment and interactions exactly as above.
Vary only facial expression, camera angle, framing and subtle posing. This is
the same moment photographed a second time, not a new moment.`,
  };
}
