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
 *      nobody drew. The characters move. The output is not predictable, and
 *      depending on the route it costs money, hardware, or neither.
 *
 * This module reports which of those is available and, when one is not, exactly
 * what would make it available and what it would cost. It does NOT expose a
 * generative provider as if it were ready. A control that cannot do its job is
 * worse than no control.
 */

export type ProviderKind = "camera" | "generated-motion";

/**
 * `ready` means it works today. `not-built` means exactly that: whatever else
 * is true of it, no code in this platform can call it yet. A credential sitting
 * in the environment does not promote anything.
 */
export type ProviderStatus = "ready" | "not-built";

export interface VideoProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly status: ProviderStatus;
  /** Plain English: what this produces. */
  readonly whatItDoes: string;
  /** Plain English: what it costs to run. Never vague about money. */
  readonly cost: string;
  /** Plain English: what it would take to switch it on. Empty when ready. */
  readonly toEnable: string;
  /** Environment variable that carries the credential. Empty if none is needed. */
  readonly credentialEnvVar: string;
}

/**
 * Routes to generated motion. None is wired to a network call or a local
 * runtime yet — these entries exist to give a truthful answer to "why doesn't
 * it actually animate, and what would it take?", not to imply a working button.
 *
 * Ordered cheapest-first, because that is the order they should be considered
 * in and the free ones are easy to miss behind the famous paid ones.
 */
const GENERATIVE: ReadonlyArray<Omit<VideoProvider, "status">> = [
  {
    id: "self-hosted-open-model",
    name: "An open model on our own machine",
    kind: "generated-motion",
    whatItDoes:
      "Runs a freely licensed video model (Wan and LTX are the usual choices) on hardware we own. The only route where the model is genuinely ours, nothing is metered, and a customer's image never leaves our systems.",
    cost: "Free to run. Needs an NVIDIA graphics card — the smaller models fit in 8-12GB of video memory, the better ones want 16GB or more.",
    toEnable:
      "The work is real but unglamorous: put the model runtime on a machine with a suitable graphics card, download the weights, and wire a job queue to it. No account, no credential and no per-clip charge are involved — only the hardware and the build.",
    credentialEnvVar: "",
  },
  {
    id: "google-veo",
    name: "Google Veo",
    kind: "generated-motion",
    whatItDoes:
      "Animates the contents of a still image into a few seconds of generated footage.",
    cost: "Google's own web tools give every personal Google account a small monthly allowance at no cost and no card. Calling it from software instead is billed per second of video.",
    toEnable:
      "No code here calls Google's video API yet. Writing that connection, plus a key in HLBOS_GOOGLE_AI_API_KEY, is the outstanding work.",
    credentialEnvVar: "HLBOS_GOOGLE_AI_API_KEY",
  },
  {
    id: "runway",
    name: "Runway Gen-4",
    kind: "generated-motion",
    whatItDoes: "Image-to-video with camera and motion direction from a text prompt.",
    cost: "Paid. Billed per second of video generated.",
    toEnable:
      "No code here calls Runway yet. Writing that connection, plus a key in HLBOS_RUNWAY_API_KEY and a funded account, is the outstanding work.",
    credentialEnvVar: "HLBOS_RUNWAY_API_KEY",
  },
  {
    id: "replicate",
    name: "Replicate (hosted open models)",
    kind: "generated-motion",
    whatItDoes: "Runs open image-to-video models on demand, billed per second.",
    cost: "Paid. Billed per second of compute used.",
    toEnable:
      "No code here calls Replicate yet. Writing that connection, plus a token in HLBOS_REPLICATE_API_TOKEN and a funded account, is the outstanding work.",
    credentialEnvVar: "HLBOS_REPLICATE_API_TOKEN",
  },
];

export const CAMERA_PROVIDER: VideoProvider = {
  id: "storyboard-camera",
  name: "Storyboard camera",
  kind: "camera",
  status: "ready",
  whatItDoes:
    "Finds the panels in the image, plans a shot list with pans and zooms, and records it to a video file in the browser.",
  cost: "Free. No account, no key, no per-clip charge, and the image never leaves this machine.",
  toEnable: "",
  credentialEnvVar: "",
};

/**
 * The current, truthful provider list.
 *
 * `env` is whatever the caller has: `process.env` on a server, a hand-built
 * object in a test. A provider is only ever "ready" if a code path exists to
 * use it. Today none does for generated motion, so they report `not-built` even
 * with a credential set, and say so rather than blaming a missing key.
 */
export function listProviders(
  env: Readonly<Record<string, string | undefined>> = {},
): VideoProvider[] {
  const generative = GENERATIVE.map((provider): VideoProvider => {
    const hasKey =
      provider.credentialEnvVar !== "" &&
      typeof env[provider.credentialEnvVar] === "string" &&
      env[provider.credentialEnvVar] !== "";
    return {
      ...provider,
      status: "not-built",
      // A credential sitting in the environment changes the explanation, never
      // the status. The key was never what was missing.
      toEnable: hasKey
        ? `A credential is present in ${provider.credentialEnvVar}, but no code here calls it yet. Writing that connection is the remaining work — the key alone does not switch it on.`
        : provider.toEnable,
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
