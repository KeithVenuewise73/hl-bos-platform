/**
 * Choosing a provider.
 *
 * One rule: a real service if one is configured, and an honest refusal
 * otherwise. There is deliberately no third branch — no "fall back to fixtures
 * so the demo works", which is how a product ends up showing invented
 * detections to someone who believes they are real.
 */

import { HttpVisionProvider } from "./http.ts";
import { UnavailableVisionProvider } from "./unavailable.ts";
import type { VisionProvider } from "./types.ts";

export * from "./types.ts";
export { HttpVisionProvider, VisionServiceError } from "./http.ts";
export { UnavailableVisionProvider } from "./unavailable.ts";
export {
  ReplayVisionProvider,
  REPLAY_DETECTION_SOURCE,
  isFixtureSource,
  type ReplayFixture,
} from "./replay.ts";

export interface ProviderSelection {
  readonly serviceUrl: string | undefined;
}

export function selectProvider(selection: ProviderSelection): VisionProvider {
  const url = selection.serviceUrl?.trim();
  if (url === undefined || url.length === 0) return new UnavailableVisionProvider();
  return new HttpVisionProvider({ baseUrl: url });
}
