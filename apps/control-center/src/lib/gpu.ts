import "server-only";

import { totalmem } from "node:os";

import { probeGpu, type GpuFinding, type GpuProbe } from "@/lib/gpu-report";
import { cmd } from "@/lib/shell";

/**
 * The real probe: the console's own allow-listed command runner, and the
 * platform Node reports. Everything that decides anything lives in gpu-report,
 * where it is testable without a Windows machine.
 */
const REAL: GpuProbe = {
  platform: process.platform,
  async run(bin, args) {
    const result = await cmd(bin, args, { timeoutMs: 15_000 });
    return { ok: result.ok, stdout: result.stdout };
  },
};

export async function detectGpu(): Promise<GpuFinding> {
  return probeGpu(REAL);
}

/**
 * Total system memory, in MiB.
 *
 * Needed because "no graphics card" stopped meaning "cannot generate". The
 * processor route is decided on this number, and unlike the card it takes no
 * command to read — Node already knows.
 *
 * Total rather than free, matching how the card is measured: this answers what
 * the machine can hold, which is a property of the machine and not of whatever
 * happens to be open at the time.
 */
export function systemRamMB(): number {
  return Math.floor(totalmem() / (1024 * 1024));
}
