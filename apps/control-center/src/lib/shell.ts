import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Repo root: this app lives at <root>/apps/control-center. */
export const REPO_ROOT = process
  .cwd()
  .replace(/[\\/]apps[\\/]control-center[\\/]?$/, "");

export interface CmdResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Combined output, which is what humans and the translator want. */
  output: string;
}

/**
 * Run an allow-listed command in the repo.
 *
 * execFile, never exec: arguments are passed as an array and never through a
 * shell, so a branch name containing `; rm -rf /` is an argument, not a
 * command. This process has the operator's full permissions, so the shape of
 * this function is the security boundary of the whole app.
 */
const ALLOWED = new Set(["git", "pnpm", "npm", "node"]);

export async function cmd(
  bin: string,
  args: readonly string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CmdResult> {
  if (!ALLOWED.has(bin)) {
    return {
      ok: false,
      stdout: "",
      stderr: `refusing to run "${bin}": not in the allow-list`,
      output: `refusing to run "${bin}": not in the allow-list`,
    };
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
