/**
 * The provider you get when no vision service is configured.
 *
 * This exists so that "nothing is set up" has a truthful implementation rather
 * than being represented by `null` and handled ad hoc at every call site. It
 * refuses every operation and explains why in language a non-engineer can act
 * on.
 *
 * The alternative — returning empty tracks — is precisely the failure the
 * HighlightAI evidence audit warned about: an interface that presents itself as
 * an engine when there is no engine behind it. A user whose reel came back
 * empty would conclude the analysis ran and their child did nothing.
 */

import type {
  ProviderAvailability,
  TrackingResult,
  VideoProbe,
  VisionProvider,
} from "./types.ts";
import { ProviderUnavailableError } from "./types.ts";

const AVAILABILITY: ProviderAvailability = {
  available: false,
  detail:
    "No video analysis service is connected, so this game cannot be analysed yet. Everything else in the app works: you can create the project, describe the player and upload the video, and it will be ready to analyse the moment a service is connected.",
  remedy:
    "Set HOCKEY_VISION_URL to a running services/hockey-vision instance. Its README has the one command that starts it.",
};

export class UnavailableVisionProvider implements VisionProvider {
  readonly id = "unavailable";
  readonly label = "No analysis service connected";

  availability(): Promise<ProviderAvailability> {
    return Promise.resolve(AVAILABILITY);
  }

  probe(): Promise<VideoProbe> {
    return this.#refuse();
  }

  makeProxy(): Promise<string> {
    return this.#refuse();
  }

  track(): Promise<TrackingResult> {
    return this.#refuse();
  }

  cutClip(): Promise<string> {
    return this.#refuse();
  }

  renderReel(): Promise<string> {
    return this.#refuse();
  }

  #refuse<T>(): Promise<T> {
    return Promise.reject(new ProviderUnavailableError(this.id, AVAILABILITY));
  }
}
