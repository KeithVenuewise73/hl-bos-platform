/**
 * Suggest a sport for one shooting date: pick sample photos, make small
 * previews of them (originals only read), ask Claude, tally the answers.
 */

import { join } from "node:path";

import type { ScannedPhoto } from "../report";
import type { AskClaude } from "./claude";
import { previewOf } from "./preview";
import { pickSamples, type SportGuess, tallyGuess } from "./sports";

export async function suggestSport(request: {
  /** The folder that was scanned. */
  readonly root: string;
  readonly photos: readonly ScannedPhoto[];
  readonly day: string;
  readonly ask: AskClaude;
  readonly signal?: AbortSignal;
}): Promise<SportGuess> {
  const samples = pickSamples(request.photos, request.day);
  if (samples.length === 0) {
    return {
      day: request.day,
      sport: null,
      agreeing: 0,
      looked: 0,
      tally: [],
      notes: "No JPG photos on this date to look at.",
    };
  }
  const previews = await Promise.all(
    samples.map((p) => previewOf(join(request.root, p.path))),
  );
  request.signal?.throwIfAborted();
  const answer = await request.ask(previews, request.signal);
  return tallyGuess(request.day, answer.verdicts, answer.notes);
}

/** Identifies the exact sample set, so a saved guess is reused only for the same photos. */
export function sampleKey(photos: readonly ScannedPhoto[], day: string): string {
  return pickSamples(photos, day)
    .map((p) => `${p.path}|${p.size}`)
    .join("\n");
}
