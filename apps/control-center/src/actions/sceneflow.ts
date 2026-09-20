"use server";

import { join } from "node:path";

import {
  direct,
  type DirectorInput,
  type DirectorResult,
} from "@/lib/sceneflow-direct";
import { generateLocally, type WorkerOutcome } from "@/lib/sceneflow-worker";
import { storePhoto, type StoredPhoto } from "@/lib/sceneflow-photos";
import {
  planStoryScenes,
  type StoryInput,
  type StoryResult,
} from "@/lib/sceneflow-story";

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
export async function generateScene(
  input: DirectorInput,
  sourceImage = "",
): Promise<{
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
    sourceImage,
    safetyChecked: true,
  });
  return { refusal: null, outcome };
}

export type UploadResult =
  | { readonly ok: true; readonly photo: StoredPhoto }
  | { readonly ok: false; readonly message: string };

/**
 * Accept a photograph.
 *
 * Takes raw bytes rather than a path: the browser hands over the file it read,
 * and nothing in this flow trusts a filename or a path from the client. The
 * format is then read from the bytes themselves, not from what the file claims
 * to be.
 */
export async function uploadPhoto(data: ArrayBuffer): Promise<UploadResult> {
  return storePhoto(new Uint8Array(data));
}

/** Plan a whole story. Same boundary, same server-side composition. */
export async function planStory(input: StoryInput): Promise<StoryResult> {
  return Promise.resolve(planStoryScenes(input));
}
