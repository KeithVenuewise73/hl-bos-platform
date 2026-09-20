import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Repo root: this app lives at <root>/apps/sceneflow. */
export const REPO_ROOT = process.cwd().replace(/[\\/]apps[\\/]sceneflow[\\/]?$/, "");

export interface CmdResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Combined output, which is what humans and a translator want. */
  output: string;
}

/**
 * The allow-list — and the reason this app exists separately from the console.
 *
 * The Development Control Center may run git, pnpm, node and PowerShell. That
 * is why it can only ever listen on localhost: anything that can reach it can
 * run those. SceneFlow is meant to be opened from a phone on the home network,
 * so it must not carry that surface. It has exactly one thing to run — the
 * local image worker — and so exactly three names are allowed, all of them the
 * same interpreter under the names different operating systems give it.
 *
 * Adding a name here undoes the separation. If SceneFlow ever needs git or a
 * package manager, that is a job for the console, not for this app.
 */
const ALLOWED = new Set(["python", "python3", "py"]);

/**
 * Run the local worker.
 *
 * execFile, never exec: arguments are passed as an array and never through a
 * shell. The argument array is a constant in this codebase — everything the
 * operator typed travels inside a JSON file whose path is the only variable
 * part. See lib/worker.ts.
 */
export async function cmd(
  bin: string,
  args: readonly string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CmdResult> {
  if (!ALLOWED.has(bin)) {
    const refusal = `refusing to run "${bin}": not in the allow-list`;
    return { ok: false, stdout: "", stderr: refusal, output: refusal };
  }
  try {
    const { stdout, stderr } = await run(bin, args as string[], {
      cwd: opts.cwd ?? REPO_ROOT,
      timeout: opts.timeoutMs ?? 300_000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout, stderr, output: (stdout + stderr).trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? err.message ?? "unknown error";
    return { ok: false, stdout, stderr, output: (stdout + stderr).trim() };
  }
}
