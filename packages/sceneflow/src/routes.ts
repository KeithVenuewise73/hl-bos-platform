/**
 * How SceneFlow could actually generate an image, and what each route demands.
 *
 * This exists because the decision is not "pick a vendor". Every route below
 * carries a CONSENT BAR — what its terms require before a real, identifiable
 * person may be put into a romantic scene — and that bar, not price and not
 * quality, is what decides which routes this product may use.
 *
 * Modelled on packages/video-studio/src/providers.ts, for the same reason: a
 * truthful answer to "why doesn't it generate anything yet, and what would it
 * take" beats a button that cannot do its job.
 *
 * ---------------------------------------------------------------------------
 * SOURCING, AND ITS LIMITS
 * ---------------------------------------------------------------------------
 *
 * Researched 2026-09-20 from each provider's published policy. TWO PRIMARY
 * PAGES COULD NOT BE READ DIRECTLY from the build environment (bfl.ai and
 * openai.com are blocked by its egress proxy), so those two entries are
 * second-hand — accurate to the best available summary, and NOT a substitute
 * for reading the contract before money or a launch depends on it.
 *
 * Policies change. Every entry carries `checkedOn`. Treat an entry older than
 * a few months as a question, not an answer.
 *
 * WHAT THIS PASS DID NOT DO: it did not gather per-image prices. The consent
 * bar decides which routes are available at all, so pricing the ones that are
 * ruled out would have been wasted work. The cost lines say so rather than
 * carrying a number nobody checked — an invented price is worse than an
 * admitted gap, because it gets put in a spreadsheet.
 */

/** Whether code in this repository can call the route today. */
export type RouteStatus = "ready" | "not-built";

/**
 * What a route requires before a real, identifiable person may be generated
 * into a romantic scene.
 *
 *  - "self-attestation": a tick-box from the uploader is enough.
 *  - "documented-consent": the provider requires consent that is recorded and
 *    verifiable — a tick-box does not meet it.
 *  - "prohibited": not permitted on this route at any consent level.
 *  - "ours-to-set": no third party sets a bar, because there is no third party.
 *    The obligation does not disappear; it becomes entirely ours.
 */
export type ConsentBar =
  "self-attestation" | "documented-consent" | "prohibited" | "ours-to-set";

export interface ImageRoute {
  readonly id: string;
  readonly name: string;
  readonly status: RouteStatus;
  /** Plain English: what this produces. */
  readonly whatItDoes: string;
  /** Plain English: what it costs. Never vague about money. */
  readonly cost: string;
  /** Plain English: the licence position. */
  readonly licence: string;
  /** What the terms say about real, identifiable people. */
  readonly realPeople: string;
  readonly consentBar: ConsentBar;
  /** Plain English: what would switch it on. */
  readonly toEnable: string;
  /** Environment variable carrying the credential. Empty when none is needed. */
  readonly credentialEnvVar: string;
  /** ISO date this entry was last checked against the provider's own policy. */
  readonly checkedOn: string;
  /** True when the policy text was read second-hand rather than at the source. */
  readonly secondHand: boolean;
}

const CHECKED = "2026-09-20";

/**
 * Ordered by consent bar rather than by price, because that is the order the
 * decision is actually made in. Nothing here is `ready`: no route is wired to
 * a network call or a local runtime, and a credential sitting in the
 * environment does not promote anything.
 */
export const IMAGE_ROUTES: readonly ImageRoute[] = [
  {
    id: "self-hosted-open-model",
    name: "An open model on hardware we own",
    status: "not-built",
    whatItDoes:
      "Runs an openly licensed image model on a machine we control. The only route where no photograph of a customer leaves our systems, nothing is metered, and no third party's content policy applies to what we generate.",
    cost: "Free to run once the hardware exists. Needs an NVIDIA card: the smaller models fit in 8-12GB of video memory, the identity-preserving editing models want 16-24GB. A licence may still be payable — see the licence line.",
    licence:
      "Depends entirely on the model. FLUX.1 [dev] is NON-COMMERCIAL: its licence explicitly excludes 'revenue-generating activity' AND 'direct interactions with end users' from non-commercial purpose, so an app with users falls outside it even if that app is free. Black Forest Labs sells Self-Hosted Commercial License Terms for that case. SDXL and other permissively licensed models do not carry that restriction.",
    realPeople:
      "No provider policy applies, because there is no provider. That is not the same as no obligation: on this route we are the only safeguard that exists, and every consequence of getting it wrong is ours alone.",
    consentBar: "ours-to-set",
    toEnable:
      "Decide whether SceneFlow is a product with users or a private tool (the licence turns on that answer), confirm a suitable GPU exists, pick a model, and build the local runtime adapter.",
    credentialEnvVar: "",
    checkedOn: CHECKED,
    secondHand: false,
  },
  {
    id: "bfl-flux-kontext",
    name: "FLUX Kontext, hosted by Black Forest Labs",
    status: "not-built",
    whatItDoes:
      "Image-to-image editing that preserves a person's identity across edits. Technically the closest fit to what SceneFlow needs: continuing a scene rather than generating a new one.",
    cost: "Metered per image, billed by Black Forest Labs. Per-image rates were NOT gathered in this pass — price it before committing.",
    licence: "Commercial API use is permitted under their developer terms.",
    realPeople:
      "Requires 'the informed, documented consent of identifiable persons' both for submitting them as input and for the intended use of the output, and separately forbids realistically depicting a real person in a 'sexual, intimate, degrading, defamatory, fraudulent, misleading, or otherwise abusive manner' without 'verified, documented, and informed consent'. The word 'intimate' is theirs. SceneFlow's Private Romance level sits inside it.",
    consentBar: "documented-consent",
    toEnable:
      "A consent mechanism that records and verifies agreement from every adult in a photograph. A tick-box does not meet this bar. Then an account and an API key.",
    credentialEnvVar: "SCENEFLOW_BFL_API_KEY",
    checkedOn: CHECKED,
    secondHand: true,
  },
  {
    id: "openai-images",
    name: "OpenAI image generation",
    status: "not-built",
    whatItDoes:
      "General image generation and editing from a prompt and a source image.",
    cost: "Metered per image. Per-image rates were NOT gathered in this pass — price it before committing.",
    licence: "Commercial API use is permitted under their terms.",
    realPeople:
      "Prohibits reproducing the likeness of any person without express consent and the necessary rights, and operates likeness opt-outs for public figures. Romantic depiction of a private individual therefore turns on consent we would have to be able to show.",
    consentBar: "documented-consent",
    toEnable: "The same consent mechanism, then an account and an API key.",
    credentialEnvVar: "SCENEFLOW_OPENAI_API_KEY",
    checkedOn: CHECKED,
    secondHand: true,
  },
  {
    id: "google-vertex-imagen",
    name: "Google Imagen on Vertex AI",
    status: "not-built",
    whatItDoes:
      "Image generation and subject customization; a person may be supplied as a customization subject, with a person-generation setting that can be limited to adults.",
    cost: "Metered per image, billed through Google Cloud. Per-image rates were NOT gathered in this pass — price it before committing.",
    licence: "Commercial use is permitted under Google Cloud terms.",
    realPeople:
      "Governed by Google's generative-AI prohibited use policy, which bars sexually explicit material and non-consensual intimate imagery. Uploaded and generated content is filtered by their own safety systems, which we do not control and cannot appeal per image.",
    consentBar: "documented-consent",
    toEnable:
      "The same consent mechanism, then a Google Cloud project with Vertex AI enabled.",
    credentialEnvVar: "SCENEFLOW_GOOGLE_APPLICATION_CREDENTIALS",
    checkedOn: CHECKED,
    secondHand: false,
  },
  {
    id: "hosted-open-model-marketplace",
    name: "An open model via a hosting marketplace (fal, Replicate)",
    status: "not-built",
    whatItDoes:
      "Runs the same open models as the self-hosted route, on somebody else's GPUs, without owning hardware.",
    cost: "Metered per second of compute or per image. Cheaper than owning a card until volume is high.",
    licence:
      "The host's terms AND the underlying model's licence both apply. A non-commercial model does not become commercial by being rented.",
    realPeople:
      "These hosts name non-consensual intimate imagery explicitly and prohibit depicting a real person's likeness in a sexual manner without their consent. Photographs also leave our systems, which the self-hosted route avoids.",
    consentBar: "documented-consent",
    toEnable: "The same consent mechanism, then an account and an API key.",
    credentialEnvVar: "SCENEFLOW_HOSTED_MODEL_API_KEY",
    checkedOn: CHECKED,
    secondHand: false,
  },
];

/**
 * The routes open to us under a given consent design.
 *
 * Self-attestation — a tick-box, which is what the brief currently specifies —
 * leaves exactly one route: our own hardware. That is the whole finding, and it
 * is a function rather than a paragraph so it cannot be misremembered.
 */
export function routesUnder(bar: ConsentBar): readonly ImageRoute[] {
  if (bar === "documented-consent") {
    return IMAGE_ROUTES.filter((r) => r.consentBar !== "prohibited");
  }
  if (bar === "self-attestation") {
    return IMAGE_ROUTES.filter((r) => r.consentBar === "ours-to-set");
  }
  return [];
}

/** Image models by the video memory they realistically need, smallest first. */
export interface ImageModelFit {
  readonly model: string;
  readonly needsMB: number;
  readonly fits: boolean;
  readonly note: string;
}

const MODEL_TIERS: readonly Omit<ImageModelFit, "fits">[] = [
  {
    model: "SDXL (compressed)",
    needsMB: 8_000,
    note: "Generates a new image well. Weak at keeping the same face across scenes, which is the whole product.",
  },
  {
    model: "SDXL + identity adapter",
    needsMB: 12_000,
    note: "Adds face conditioning. Workable identity preservation; not state of the art.",
  },
  {
    model: "FLUX.1 [dev]",
    needsMB: 16_000,
    note: "Strong image quality. NON-COMMERCIAL licence — see the licence line on the self-hosted route.",
  },
  {
    model: "FLUX.1 Kontext [dev]",
    needsMB: 24_000,
    note: "Image-to-image editing that holds identity across scenes. The best technical fit for this product, and NON-COMMERCIAL under the same licence as FLUX.1 [dev].",
  },
];

export function imageModelFits(vramMB: number | null): ImageModelFit[] {
  return MODEL_TIERS.map((tier) => ({
    ...tier,
    fits: vramMB !== null && vramMB >= tier.needsMB,
  }));
}

/** Entries whose policy text was read second-hand and needs confirming. */
export function needsPrimarySourceCheck(): readonly ImageRoute[] {
  return IMAGE_ROUTES.filter((r) => r.secondHand);
}
