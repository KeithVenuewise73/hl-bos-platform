import "server-only";

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
