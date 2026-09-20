"use server";

import { join } from "node:path";

import { direct, type DirectorInput, type DirectorResult } from "@/lib/direct";
import { generateLocally, type WorkerOutcome } from "@/lib/worker";
import { storePhoto, type StoredPhoto } from "@/lib/photos";
import { planStoryScenes, type StoryInput, type StoryResult } from "@/lib/story";
import { allowed } from "@/lib/gate";

/**
 * Thin wrappers. Every decision lives in `lib/direct`, which is pure and
 * tested; these exist so the prompt is composed on the server rather than in
 * the browser — one place, from structure, per brief section 31.
 *
 * Every one of them checks the access code first. The layout hiding the UI is
 * not a control: a server action has its own URL and can be invoked without a
 * layout ever being rendered.
 */

const LOCKED = {
  kind: "refused",
  stage: "structure",
  message: "SceneFlow is locked. Reload the page and enter the access code.",
  alternative: null,
  reasonCodes: [],
} as const;

export async function directScene(input: DirectorInput): Promise<DirectorResult> {
  if (!(await allowed())) {
    return LOCKED;
  }
  return direct(input);
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
  if (!(await allowed())) {
    return { refusal: LOCKED, outcome: null };
  }
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
  if (!(await allowed())) return { ok: false, message: LOCKED.message };
  return storePhoto(new Uint8Array(data));
}

/** Plan a whole story. Same boundary, same server-side composition. */
export async function planStory(input: StoryInput): Promise<StoryResult> {
  if (!(await allowed())) {
    return LOCKED;
  }
  return planStoryScenes(input);
}
