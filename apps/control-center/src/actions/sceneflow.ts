"use server";

import {
  direct,
  type DirectorInput,
  type DirectorResult,
} from "@/lib/sceneflow-direct";

/**
 * A thin wrapper. Every decision lives in `sceneflow-direct`, which is pure and
 * tested; this exists only so the prompt is composed on the server rather than
 * in the browser — one place, from structure, per brief section 31.
 */
export async function directScene(input: DirectorInput): Promise<DirectorResult> {
  return Promise.resolve(direct(input));
}
