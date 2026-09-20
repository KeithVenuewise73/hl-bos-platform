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

import { imageModelFits, type ImageModelFit } from "@hl-bos/sceneflow";

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
  /** Best model this card can hold, or null when none fits. */
  readonly best: ImageModelFit | null;
  readonly blockers: readonly Blocker[];
  /**
   * Literally false today, and typed as the literal so it cannot drift to a
   * hopeful boolean. No local runtime is wired; a fitting card does not
   * generate anything on its own.
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
      id: "runtime",
      what: "Nothing here can call an image model yet. The engine, the database and the safety boundary are built and tested; the piece that loads a model and returns a picture is not written.",
      owner: "ai-engineer",
      hard: true,
    },
    {
      id: "moderation",
      what: "SceneFlow refuses to run without something checking its output, by design. On our own machine that can be a local checker rather than a paid service, but it has to exist.",
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
export function readinessFrom(gpu: GpuFinding): SceneFlowReadiness {
  const vram = gpu.nvidia?.vramMB ?? null;
  const models = imageModelFits(vram);
  const usable = models.filter((m) => m.fits);
  const best = usable.length > 0 ? (usable[usable.length - 1] ?? null) : null;
  const blockers = standingBlockers();

  if (gpu.nvidia && best) {
    return {
      verdict: "yes",
      headline: `Yes — an ${gpu.nvidia.name} with ${GB(gpu.nvidia.vramMB)} of video memory.`,
      detail:
        `This machine can hold ${best.model}. Nothing would be metered, and no photograph ` +
        "would leave it. It still cannot generate anything today — see what is left, below.",
      models,
      best,
      blockers,
      canGenerateToday: false,
      evidence: gpu.evidence,
    };
  }

  if (gpu.nvidia) {
    const smallest = models[0];
    return {
      verdict: "no",
      headline: `An ${gpu.nvidia.name} with ${GB(gpu.nvidia.vramMB)} of video memory.`,
      detail:
        `The card works, but ${GB(gpu.nvidia.vramMB)} is below what the smallest of these ` +
        `models needs (about ${GB(smallest?.needsMB ?? 8_000)}). Running one here is not ` +
        "realistic. A larger card, or renting a machine with one by the hour, are the options.",
      models,
      best: null,
      blockers,
      canGenerateToday: false,
      evidence: gpu.evidence,
    };
  }

  // No usable NVIDIA reading. The GPU report already distinguished "no card"
  // from "card with a broken driver"; that distinction is worth keeping, so its
  // headline is carried through rather than flattened into "no".
  return {
    verdict: gpu.verdict === "yes" ? "unknown" : gpu.verdict,
    headline: gpu.headline,
    detail:
      `${gpu.detail} SceneFlow needs an NVIDIA card to run a model on this machine. ` +
      "Renting a machine with a card by the hour stays open — we would still be running " +
      "the model ourselves, for private use. Handing the work to a hosted image service " +
      "is a different thing: their content terms would apply, and they require recorded " +
      "consent from everyone in a photograph.",
    models,
    best: null,
    blockers,
    canGenerateToday: false,
    evidence: gpu.evidence,
  };
}

/** Blockers that must clear before anything can generate. */
export function hardBlockers(readiness: SceneFlowReadiness): readonly Blocker[] {
  return readiness.blockers.filter((b) => b.hard);
}
