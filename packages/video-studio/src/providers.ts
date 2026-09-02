/**
 * What this platform can actually turn an image into, right now.
 *
 * There are two honest answers to "make a video from this picture", and they
 * are not the same product:
 *
 *   1. CAMERA. Move a virtual camera over the artwork that exists. Every pixel
 *      on screen was drawn by whoever drew the image. Deterministic, free,
 *      offline, and it ships today.
 *
 *   2. GENERATED MOTION. Hand the image to a video model and get back frames
 *      nobody drew. The characters move. It costs money per second, it needs an
 *      account and a key, and the output is not predictable.
 *
 * This module reports which of those is available and, when one is not, exactly
 * what would make it available. It does NOT expose a generative provider as if
 * it were ready. A control that cannot do its job is worse than no control.
 */

export type ProviderKind = "camera" | "generated-motion";
export type ProviderStatus = "ready" | "needs-account";

export interface VideoProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly status: ProviderStatus;
  /** Plain English: what this produces. */
  readonly whatItDoes: string;
  /** Plain English: what it would take to switch it on. Empty when ready. */
  readonly toEnable: string;
  /** Environment variable that carries the credential, when it needs one. */
  readonly credentialEnvVar: string;
}

/**
 * Generative video services this package is prepared to speak to. Nothing here
 * is wired to a network call yet — the entry exists to give a truthful answer
 * to "why doesn't it actually animate?" rather than to imply a working button.
 */
const GENERATIVE: ReadonlyArray<Omit<VideoProvider, "status" | "toEnable">> = [
  {
    id: "google-veo",
    name: "Google Veo",
    kind: "generated-motion",
    whatItDoes:
      "Animates the contents of a still image into a few seconds of generated footage.",
    credentialEnvVar: "HLBOS_GOOGLE_AI_API_KEY",
  },
  {
    id: "runway",
    name: "Runway Gen-4",
    kind: "generated-motion",
    whatItDoes: "Image-to-video with camera and motion direction from a text prompt.",
    credentialEnvVar: "HLBOS_RUNWAY_API_KEY",
  },
  {
    id: "replicate",
    name: "Replicate (hosted open models)",
    kind: "generated-motion",
    whatItDoes: "Runs open image-to-video models on demand, billed per second.",
    credentialEnvVar: "HLBOS_REPLICATE_API_TOKEN",
  },
];

export const CAMERA_PROVIDER: VideoProvider = {
  id: "storyboard-camera",
  name: "Storyboard camera",
  kind: "camera",
  status: "ready",
  whatItDoes:
    "Finds the panels in the image, plans a shot list with pans and zooms, and records it to a video file in the browser. No account, no key, no cost.",
  toEnable: "",
  credentialEnvVar: "",
};

/**
 * The current, truthful provider list.
 *
 * `env` is whatever the caller has: `process.env` on a server, a hand-built
 * object in a test. A provider is only ever "ready" if its credential is
 * actually present AND a code path exists to use it. Today no generative path
 * exists, so they report `needs-account` even with a key set, and say why.
 */
export function listProviders(
  env: Readonly<Record<string, string | undefined>> = {},
): VideoProvider[] {
  const generative = GENERATIVE.map((provider): VideoProvider => {
    const hasKey =
      typeof env[provider.credentialEnvVar] === "string" &&
      env[provider.credentialEnvVar] !== "";
    return {
      ...provider,
      status: "needs-account",
      toEnable: hasKey
        ? `A key is present in ${provider.credentialEnvVar}, but this platform has no code that calls ${provider.name} yet. Building that connection is the remaining work — the key alone does not switch it on.`
        : `Needs a paid ${provider.name} account and its key in ${provider.credentialEnvVar}, plus the connection code to call it. Both are outstanding.`,
    };
  });
  return [CAMERA_PROVIDER, ...generative];
}

/** True when at least one provider can actually produce a video right now. */
export function hasWorkingProvider(
  env: Readonly<Record<string, string | undefined>> = {},
): boolean {
  return listProviders(env).some((p) => p.status === "ready");
}
