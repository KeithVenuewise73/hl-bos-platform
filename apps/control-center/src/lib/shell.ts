import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Repo root.
 *
 * The cheap answer — strip `apps/control-center` off the cwd — is right when
 * the console is started the way the launcher starts it, and wrong in the
 * relocated standalone bundle, whose cwd is its own nested copy of that path.
 * Getting it wrong there is not a small thing: this value is the working
 * directory for every git command the console runs, and the base for every file
 * it reads. So the strip is only a fallback, and the real answer is found by
 * walking up until the workspace markers appear.
 */
function findRepoRoot(): string {
  const stripped = process.cwd().replace(/[\\/]apps[\\/]control-center[\\/]?$/, "");
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      existsSync(path.join(dir, "supabase", "migrations"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return stripped;
}

export const REPO_ROOT = findRepoRoot();

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
