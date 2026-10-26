import "server-only";

import {
  createClaudeVisionProvider,
  ProviderUnavailableError,
  type ImageAnalysisProvider,
} from "@hl-bos/jersey-sort";

import {
  anthropicApiKey,
  config,
  defaultProvider,
  type ProviderChoice,
} from "./config.ts";
import { createLocalOcrProvider } from "./ocr.ts";

let ocr: ImageAnalysisProvider | undefined;
let claude: { key: string; provider: ImageAnalysisProvider } | undefined;

export interface ProviderStatus {
  readonly choice: ProviderChoice;
  readonly label: string;
  readonly ready: boolean;
  readonly detail: string;
  readonly claudeKeyPresent: boolean;
}

export function providerStatus(choice: ProviderChoice | null): ProviderStatus {
  const c = choice ?? defaultProvider();
  const claudeKeyPresent = anthropicApiKey() !== undefined;
  switch (c) {
    case "claude":
      return {
        choice: c,
        label: `Claude vision (${config().anthropicModel ?? "claude-opus-5-5"})`,
        ready: claudeKeyPresent,
        detail: claudeKeyPresent
          ? "Reads jersey numbers and tells them apart from scoreboards, yard markers and signs. Each photo's preview is sent to Anthropic for analysis."
          : "No Claude key is saved, so Claude cannot run. Paste it in DateSort's Sports panel; until then photos are marked failed, or choose another provider.",
        claudeKeyPresent,
      };
    case "local-ocr":
      return {
        choice: c,
        label: "Local OCR (Tesseract, on this computer)",
        ready: true,
        detail:
          "Free and private: nothing leaves this computer. It reads digits but cannot see athletes or tell a jersey from a sign, so every number it finds is sent to review, and it misses many numbers on real action photos.",
        claudeKeyPresent,
      };
    case "none":
      return {
        choice: c,
        label: "No automatic analysis",
        ready: true,
        detail:
          "Photos are not analysed. Every photo goes to the review queue for numbers to be added by hand.",
        claudeKeyPresent,
      };
  }
}

/** The provider to run, or null for "none". Throws when the choice cannot run. */
export function resolveProvider(
  choice: ProviderChoice | null,
): ImageAnalysisProvider | null {
  const c = choice ?? defaultProvider();
  if (c === "none") return null;
  if (c === "local-ocr") return (ocr ??= createLocalOcrProvider());
  const key = anthropicApiKey();
  if (key === undefined) {
    throw new ProviderUnavailableError(
      "Claude vision is selected but no Claude key is saved. Paste it in DateSort's Sports panel (or set ANTHROPIC_API_KEY).",
    );
  }
  const model = config().anthropicModel;
  // Made again if the key changes (a new key saved in DateSort).
  if (claude?.key !== key) {
    claude = {
      key,
      provider: createClaudeVisionProvider({
        apiKey: key,
        ...(model !== undefined ? { model } : {}),
      }),
    };
  }
  return claude.provider;
}
