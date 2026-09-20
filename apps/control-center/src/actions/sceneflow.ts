"use server";

import { join } from "node:path";

import {
  direct,
  type DirectorInput,
  type DirectorResult,
} from "@/lib/sceneflow-direct";
import { generateLocally, type WorkerOutcome } from "@/lib/sceneflow-worker";

/**
 * Thin wrappers. Every decision lives in `sceneflow-direct`, which is pure and
 * tested; these exist so the prompt is composed on the server rather than in
 * the browser — one place, from structure, per brief section 31.
 */
export async function directScene(input: DirectorInput): Promise<DirectorResult> {
  return Promise.resolve(direct(input));
}

/**
 * Make the picture.
 *
 * Re-runs `direct()` from the same structured input rather than accepting a
 * prompt from the browser. A client that could post its own prompt string
 * would be a way around the safety boundary, which is the one thing this
 * product cannot allow — so the prompt is built here, again, from the choices.
 */
export async function generateScene(input: DirectorInput): Promise<{
  readonly refusal: DirectorResult | null;
  readonly outcome: WorkerOutcome | null;
}> {
  const scene = direct(input);
  if (scene.kind !== "directed") {
    return { refusal: scene, outcome: null };
  }
  const jobId = `scene-${Date.now()}`;
  const outcome = await generateLocally({
    jobId,
    prompt: scene.prompt,
    outputPath: join(process.cwd(), ".sceneflow", `${jobId}.png`),
    safetyChecked: true,
  });
  return { refusal: null, outcome };
}
