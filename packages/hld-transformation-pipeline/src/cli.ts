/**
 * Reproducible pipeline run: takes Client #1 (Venuewise) through all eleven
 * stages and prints the Transformation Pipeline plan. Deterministic — no args,
 * no environment, no I/O beyond stdout.
 */

import { runPipeline } from "./pipeline.ts";
import { renderPipeline } from "./report.ts";
import { VENUEWISE_CLIENT } from "./client-venuewise.ts";

process.stdout.write(renderPipeline(runPipeline(VENUEWISE_CLIENT)) + "\n");
