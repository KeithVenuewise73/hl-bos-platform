import "server-only";

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cmd, REPO_ROOT } from "@/lib/shell";

/**
 * Calls the local image worker (services/sceneflow-local).
 *
 * NOTHING THE USER TYPED REACHES THE COMMAND LINE. The prompt and every other
 * field are written to a temporary JSON file and the worker is given its path.
 * That is deliberate: it keeps the shell surface to a fixed argument array
 * whatever the scene contains.
 *
 * The worker prints one line of JSON. If it cannot generate, it says so in that
 * JSON and this returns the reason verbatim — there is no fallback to a
 * placeholder here or anywhere below it.
 */

export interface WorkerOutcome {
  readonly ok: boolean;
  readonly imagePath: string;
  /** "real" or "mock", straight from the worker. Never inferred. */
  readonly adapterKind: string;
  readonly model: string;
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface WorkerJob {
  readonly jobId: string;
  readonly prompt: string;
  readonly outputPath: string;
  /** The photograph the scene continues from. Empty for a fresh generation. */
  readonly sourceImage?: string;
  readonly width?: number;
  readonly height?: number;
  /** Set only by a caller that has run the safety boundary. */
  readonly safetyChecked: boolean;
}

const SERVICE_DIR = join(REPO_ROOT, "services", "sceneflow-local");

/** Windows ships `python` or `py`; most other machines have `python3`. */
const CANDIDATES = ["python3", "python", "py"] as const;

function failure(code: string, message: string): WorkerOutcome {
  return {
    ok: false,
    imagePath: "",
    adapterKind: "",
    model: "",
    errorCode: code,
    errorMessage: message,
  };
}

export async function generateLocally(job: WorkerJob): Promise<WorkerOutcome> {
  if (!job.safetyChecked) {
    // The worker refuses this too. Checked twice on purpose: this is the last
    // place a future caller could skip the boundary without noticing.
    return failure(
      "unsafe_job",
      "This scene has not passed SceneFlow's safety checks, so it was not sent.",
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "sceneflow-"));
  const jobPath = join(dir, "job.json");
  await writeFile(
    jobPath,
    JSON.stringify({
      job_id: job.jobId,
      prompt: job.prompt,
      output_path: job.outputPath,
      source_image: job.sourceImage ?? "",
      width: job.width ?? 832,
      height: job.height ?? 1040,
      safety_checked: true,
    }),
    "utf-8",
  );

  let lastError = "No Python interpreter could be found on this machine.";
  for (const bin of CANDIDATES) {
    const result = await cmd(
      bin,
      ["-m", "sceneflow_local.worker", "generate", jobPath],
      { cwd: SERVICE_DIR, timeoutMs: 900_000 },
    );
    const parsed = parseOutcome(result.stdout);
    if (parsed) return parsed;
    // No JSON on stdout means this interpreter did not run the worker at all
    // (missing, or the package is not importable). Try the next name.
    lastError = result.output || lastError;
  }
  return failure("worker_unavailable", lastError);
}

/**
 * A string, or nothing.
 *
 * Not String(): a nested object would stringify to "[object Object]" and that
 * would be shown to the operator as the reason their picture failed.
 */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseOutcome(stdout: string): WorkerOutcome | null {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.startsWith("{"));
  if (!line) return null;
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    return {
      ok: raw["ok"] === true,
      imagePath: text(raw["image_path"]),
      adapterKind: text(raw["adapter_kind"]),
      model: text(raw["model"]),
      errorCode: text(raw["error_code"]),
      errorMessage: text(raw["error_message"]),
    };
  } catch {
    return null;
  }
}
