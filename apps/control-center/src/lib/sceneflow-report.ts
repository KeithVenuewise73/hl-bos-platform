/**
 * Can this machine run SceneFlow, and what is still in the way?
 *
 * Pure: no shell, no `server-only`, no I/O. `gpu.ts` runs the commands, and
 * everything that decides anything happens here so it is provable without an
 * NVIDIA card — the same split, for the same reason, as `gpu-report.ts`.
 *
 * The hardware probe is REUSED, not rebuilt. What differs for SceneFlow is the
 * model table (image models, not video) and the fact that a fitting card is
 * only one of the things standing between here and a first image. A page that
 * said "Yes" because a card exists would be claiming readiness it does not
 * have.
 */

import {
  cpuModelFits,
  imageModelFits,
  planGeneration,
  type GenerationPlan,
  type ImageModelFit,
} from "@hl-bos/sceneflow";

import type { GpuFinding, GpuVerdict } from "./gpu-report";

/** Something standing between this machine and its first generated scene. */
export interface Blocker {
  readonly id: string;
  /** Plain English, CEO-facing. Never jargon, never a command to run. */
  readonly what: string;
  /** Whose call or whose work it is. */
  readonly owner: "ai-engineer" | "ceo";
  /** True when nothing can proceed until this is resolved. */
  readonly hard: boolean;
}

export interface SceneFlowReadiness {
  readonly verdict: GpuVerdict;
  readonly headline: string;
  readonly detail: string;
  readonly models: readonly ImageModelFit[];
  /** The processor models, and whether this machine's memory fits them. */
  readonly cpuModels: readonly ImageModelFit[];
  /** Best model this card can hold, or null when none fits. */
  readonly best: ImageModelFit | null;
  /** What this machine would actually do: card, processor, or nothing. */
  readonly plan: GenerationPlan | null;
  readonly blockers: readonly Blocker[];
  /**
   * Literally false today, and typed as the literal so it cannot drift to a
   * hopeful boolean. The worker that loads a model is written now, and it has
   * a processor route — but it has never once loaded a checkpoint, and the
   * libraries it needs are not installed on any machine yet. Until a real
   * picture comes out of it, this stays false and says so.
   */
  readonly canGenerateToday: false;
  /** What was actually run, carried through from the probe. */
  readonly evidence: readonly string[];
}

const GB = (mb: number): string => `${(mb / 1024).toFixed(mb >= 10_000 ? 0 : 1)}GB`;

/**
 * The blockers that exist no matter what the hardware says.
 *
 * Ordered by what has to happen first. The licence entry states the private-use
 * position plainly, because it is the one thing here that was decided rather
 * than discovered, and a decision nobody wrote down gets re-litigated.
 */
function standingBlockers(): Blocker[] {
  return [
    {
      id: "libraries",
      what: "The image libraries are not installed on this machine yet. They are a one-time download of a few gigabytes, they run entirely here, and nothing is metered. This is a button I still have to build \u2014 you will not be asked to type anything.",
      owner: "ai-engineer",
      hard: true,
    },
    {
      id: "never-run",
      what: "No picture has ever come out of this. The worker is written and every way it can fail is tested, but it has never loaded a real model: the machine it was built on has no graphics card and cannot reach the places models are downloaded from. The first real run will either work or say exactly what is missing.",
      owner: "ai-engineer",
      hard: true,
    },
    {
      id: "moderation",
      what: "The output check is built and it runs on our own machine, no paid service needed \u2014 but its classifier is not installed yet, so nothing can be shown. That is deliberate: an image nothing has looked at is not displayed, and one that fails is deleted rather than kept.",
      owner: "ai-engineer",
      hard: true,
    },
    {
      id: "licence-scope",
      what: "This is built as a private tool, not a product for sale. That is what makes the free model licences usable: they cover private and personal use, and they stop covering it the moment there are paying users or an app store listing. Selling this later means buying a commercial licence first.",
      owner: "ceo",
      hard: false,
    },
  ];
}

/**
 * Interpret the hardware probe for SceneFlow.
 *
 * Takes the finding `gpu-report` already produced rather than re-running the
 * commands, so the console asks the machine once and answers two questions
 * from it.
 */
export function readinessFrom(
  gpu: GpuFinding,
  ramMB: number | null = null,
): SceneFlowReadiness {
  const vram = gpu.nvidia?.vramMB ?? null;
  const models = imageModelFits(vram);
  const cpuModels = cpuModelFits(ramMB);
  // The engine picks, from both numbers. Nobody reads anything off this screen
  // and relays it.
  const plan = planGeneration(vram, ramMB);
  const best = plan && !plan.onProcessor ? plan.model : null;
  const blockers = standingBlockers();
  const base = {
    models,
    cpuModels,
    best,
    plan,
    blockers,
    canGenerateToday: false as const,
    evidence: gpu.evidence,
  };

  if (gpu.nvidia && best) {
    return {
      ...base,
      verdict: "yes",
      headline: `Yes — an ${gpu.nvidia.name} with ${GB(gpu.nvidia.vramMB)} of video memory.`,
      detail:
        `This machine can hold ${best.model}, and that is what SceneFlow would load here ` +
        "— it decides that itself, from the card it just found. Nothing would be metered, " +
        "and no photograph would leave this machine. It cannot generate anything today: " +
        "the libraries are not installed and no picture has ever come out of this.",
    };
  }

  // No usable card, but the processor can do it. This is the operator's own
  // machine: AMD graphics built into the processor. He was asked to choose
  // between renting a machine with a card by the hour — which means his
  // photographs travel to somebody else's computer — and running here, slowly.
  // He chose here, so this says what that actually buys and what it costs.
  if (plan?.onProcessor) {
    return {
      ...base,
      verdict: "yes",
      headline: `Yes, on the processor — ${GB(ramMB ?? 0)} of memory, no graphics card needed.`,
      detail:
        `${gpu.detail} SceneFlow would load ${plan.model.model} and run it on the processor. ` +
        "That is minutes per picture rather than seconds, and faces will drift between " +
        "scenes — neither processor model holds one person across several panels the way " +
        "a graphics card can. What it buys is that nothing leaves this machine, which is " +
        "the whole reason this is self-hosted. It cannot generate anything today: the " +
        "libraries are not installed and no picture has ever come out of this.",
    };
  }

  if (gpu.nvidia) {
    const smallest = models[0];
    return {
      ...base,
      verdict: "no",
      headline: `An ${gpu.nvidia.name} with ${GB(gpu.nvidia.vramMB)} of video memory.`,
      detail:
        `The card works, but ${GB(gpu.nvidia.vramMB)} is below what the smallest of these ` +
        `models needs (about ${GB(smallest?.needsMB ?? 8_000)}), and there is not enough ` +
        "system memory to use the processor instead. A larger card, more memory, or " +
        "renting a machine by the hour are the options.",
    };
  }

  // Neither. The GPU report already distinguished "no card" from "card with a
  // broken driver"; that distinction is worth keeping, so its headline is
  // carried through rather than flattened into "no".
  return {
    ...base,
    verdict: gpu.verdict === "yes" ? "unknown" : gpu.verdict,
    headline: gpu.headline,
    detail:
      `${gpu.detail} There is no graphics card here, and ` +
      (ramMB === null
        ? "the amount of system memory could not be read, so the processor route could not be assessed."
        : `${GB(ramMB)} of system memory is below what the smallest processor model needs.`) +
      " Renting a machine with a card by the hour stays open — we would still be running " +
      "the model ourselves, for private use. Handing the work to a hosted image service " +
      "is a different thing: their content terms would apply, and they require recorded " +
      "consent from everyone in a photograph.",
  };
}

/** Blockers that must clear before anything can generate. */
export function hardBlockers(readiness: SceneFlowReadiness): readonly Blocker[] {
  return readiness.blockers.filter((b) => b.hard);
}
