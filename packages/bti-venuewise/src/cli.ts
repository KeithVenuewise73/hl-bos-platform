/**
 * Reproducible report command: prints the Venuewise Business Transformation
 * Report to stdout. Run with `pnpm --filter @hl-bos/bti-venuewise report`.
 * Deterministic — no arguments, no environment, no I/O beyond stdout.
 */

import { renderReport } from "./report.ts";
import { runStartupCycle } from "./reasoning.ts";
import { VENUEWISE_ENGAGEMENT } from "./venuewise.ts";

process.stdout.write(renderReport(runStartupCycle(VENUEWISE_ENGAGEMENT)) + "\n");
