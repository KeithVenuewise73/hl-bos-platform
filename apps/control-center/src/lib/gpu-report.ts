/**
 * Reading the machine's answer about whether it can generate video locally.
 *
 * Pure: no shell, no `server-only`, no I/O. `gpu.ts` runs the commands and
 * hands the output here. Split that way because every interesting case --
 * a card too small, a driver missing, nothing readable at all -- is one this
 * machine cannot reproduce, so it has to be provable from a string instead.
 *
 * The operating contract says the console answers questions like "do I have an
 * NVIDIA card?" itself. Nobody opens Device Manager.
 *
 * The question this actually answers is slightly better than the one asked.
 * "Is a card in the box" is not the useful question -- a card with no working
 * driver cannot run a model either. `nvidia-smi` ships with the NVIDIA driver,
 * so if it answers, the whole chain works. When it does not answer we look at
 * the display adapters anyway, so we can tell the difference between "there is
 * no NVIDIA card here" and "there is one and its driver is missing". Those two
 * have completely different answers and it would be dishonest to merge them.
 */

/** A model tier and the video memory it realistically needs. */
export interface ModelFit {
  readonly model: string;
  readonly needsMB: number;
  readonly fits: boolean;
  readonly note: string;
}

export type GpuVerdict = "yes" | "no" | "unknown";

export interface GpuFinding {
  readonly verdict: GpuVerdict;
  /** One line, plain English, safe to put in front of the CEO. */
  readonly headline: string;
  readonly detail: string;
  /** Every display adapter we could see, by name. */
  readonly adapters: readonly string[];
  readonly nvidia: { readonly name: string; readonly vramMB: number } | null;
  readonly canRun: readonly ModelFit[];
  /** What was actually run, so this is never a black box. */
  readonly evidence: readonly string[];
}

/**
 * Open video models by the video memory they need, smallest first.
 *
 * These are the community-reported working configurations, not the vendors'
 * ideal ones: quantised weights with the text encoder pushed to system memory,
 * which is how anyone without a datacentre actually runs them.
 */
const MODEL_TIERS: ReadonlyArray<Omit<ModelFit, "fits">> = [
  {
    model: "Wan 2.2 (1.3B, compressed)",
    needsMB: 6_000,
    note: "The small one. Short clips, lower detail, but it genuinely runs on a modest card.",
  },
  {
    model: "Wan 2.2 (5B, compressed)",
    needsMB: 12_000,
    note: "The sensible middle. Good motion at 720p.",
  },
  {
    model: "Wan 2.2 (14B, compressed)",
    needsMB: 16_000,
    note: "Best quality reachable on a desktop card, with the text encoder held in system memory.",
  },
  {
    model: "LTX-2 (compressed)",
    needsMB: 24_000,
    note: "Higher resolution and native audio. Wants a large card.",
  },
];

export function fitsFor(vramMB: number | null): ModelFit[] {
  return MODEL_TIERS.map((tier) => ({
    ...tier,
    fits: vramMB !== null && vramMB >= tier.needsMB,
  }));
}

/** "NVIDIA GeForce RTX 4090, 24564" -> { name, vramMB } */
export function parseNvidiaSmi(
  output: string,
): { name: string; vramMB: number } | null {
  const line = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const parts = line.split(",").map((p) => p.trim());
  const name = parts[0];
  const vram = Number(parts[1]);
  if (!name || !Number.isFinite(vram) || vram <= 0) return null;
  return { name, vramMB: Math.round(vram) };
}

/** Display adapter names, one per line, blanks and duplicates removed. */
export function parseAdapters(output: string): string[] {
  const seen = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const name = raw.trim();
    if (name.length > 0) seen.add(name);
  }
  return [...seen];
}

const NVIDIA_PATTERN = /nvidia|geforce|quadro|\brtx\b|\bgtx\b|tesla/i;

/** Does any adapter name look like an NVIDIA card? */
export function looksLikeNvidia(adapters: readonly string[]): boolean {
  return adapters.some((a) => NVIDIA_PATTERN.test(a));
}

const GB = (mb: number): string => `${(mb / 1024).toFixed(mb >= 10_000 ? 0 : 1)}GB`;

/** Turn the raw findings into something worth reading. Pure, so it is testable. */
export function describe(
  nvidia: { name: string; vramMB: number } | null,
  adapters: readonly string[],
  smiRan: boolean,
): { verdict: GpuVerdict; headline: string; detail: string } {
  if (nvidia) {
    const usable = fitsFor(nvidia.vramMB).filter((f) => f.fits);
    if (usable.length === 0) {
      return {
        verdict: "no",
        headline: `Yes — an ${nvidia.name} with ${GB(nvidia.vramMB)} of video memory.`,
        detail:
          `The card is here and working, but ${GB(nvidia.vramMB)} is below what even the ` +
          `smallest of these models needs (about ${GB(MODEL_TIERS[0]?.needsMB ?? 6_000)}). ` +
          "Generating video locally on this machine is not realistic.",
      };
    }
    const best = usable[usable.length - 1];
    return {
      verdict: "yes",
      headline: `Yes — an ${nvidia.name} with ${GB(nvidia.vramMB)} of video memory.`,
      detail:
        `This machine can run a video model locally. The best of them it can handle is ` +
        `${best?.model ?? "the small one"}. Nothing would be metered and no image would ` +
        "leave this machine.",
    };
  }

  if (looksLikeNvidia(adapters)) {
    return {
      verdict: "unknown",
      headline: "There is an NVIDIA card here, but its driver tools did not answer.",
      detail:
        `Windows reports ${adapters.join(", ")}, so the hardware is present. The NVIDIA ` +
        "driver that video models need either is not installed or is not working. That is " +
        "fixable, and worth fixing before we write anything off.",
    };
  }

  if (adapters.length > 0) {
    return {
      verdict: "no",
      headline: "No NVIDIA card — the graphics here are built into the processor.",
      detail:
        `The only display hardware found is ${adapters.join(", ")}. These models need an ` +
        "NVIDIA card, so running one locally is not an option on this machine. Renting a " +
        "machine with a card by the hour, or using a hosted service, are the alternatives.",
    };
  }

  return {
    verdict: "unknown",
    headline: smiRan
      ? "No NVIDIA card found."
      : "Could not tell what graphics hardware this machine has.",
    detail: smiRan
      ? "The NVIDIA driver tools are not present, which almost always means there is no " +
        "NVIDIA card. Nothing else could be read to confirm it."
      : "Neither the NVIDIA driver tools nor the Windows display-adapter list could be " +
        "read. This is reported as unknown rather than guessed at.",
  };
}

/**
 * The two commands this needs, and the platform it is running on.
 *
 * Injected rather than imported so the whole decision -- including the Windows
 * branch, which cannot run on the machine this was written on -- is provable
 * without a Windows machine. `gpu.ts` supplies the real one.
 */
export interface GpuProbe {
  readonly platform: string;
  run(bin: string, args: readonly string[]): Promise<{ ok: boolean; stdout: string }>;
}

/** Ask the machine what it has. Read-only; every argument here is a constant. */
export async function probeGpu(probe: GpuProbe): Promise<GpuFinding> {
  const evidence: string[] = [];

  const smi = await probe.run("nvidia-smi", [
    "--query-gpu=name,memory.total",
    "--format=csv,noheader,nounits",
  ]);
  evidence.push(
    `nvidia-smi --query-gpu=name,memory.total: ${smi.ok ? "answered" : "not available"}`,
  );
  const nvidia = smi.ok ? parseNvidiaSmi(smi.stdout) : null;

  let adapters: string[] = [];
  if (nvidia) {
    adapters = [nvidia.name];
  } else if (probe.platform === "win32") {
    const wmi = await probe.run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
    ]);
    evidence.push(
      `Windows display adapter list: ${wmi.ok ? "read" : "could not be read"}`,
    );
    if (wmi.ok) adapters = parseAdapters(wmi.stdout);
  } else {
    evidence.push(
      `display adapter list: not attempted (this machine reports itself as ${probe.platform}, not Windows)`,
    );
  }

  const { verdict, headline, detail } = describe(nvidia, adapters, smi.ok);
  return {
    verdict,
    headline,
    detail,
    adapters,
    nvidia,
    canRun: fitsFor(nvidia?.vramMB ?? null),
    evidence,
  };
}
