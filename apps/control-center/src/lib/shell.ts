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
 * The allow-list. Every argument reaching any of these is a constant in this
 * codebase -- none is built from anything a user typed.
 *
 * `nvidia-smi` and `powershell` are here so the console can answer "can this
 * machine run a video model?" itself, instead of telling the operator to open a
 * terminal, which the operating contract forbids. Both are used for read-only
 * queries with fixed argument arrays; see lib/gpu.ts.
 */
const ALLOWED = new Set(["git", "pnpm", "npm", "node", "nvidia-smi", "powershell"]);

/**
 * Run an allow-listed command in the repo.
 *
 * execFile, never exec: arguments are passed as an array and never through a
 * shell, so a branch name containing `; rm -rf /` is an argument, not a
 * command. This process has the operator's full permissions, so the shape of
 * this function is the security boundary of the whole app.
 */
export async function cmd(
  bin: string,
  args: readonly string[],
  opts: {
    cwd?: string;
    timeoutMs?: number;
    /**
     * Extra environment for the child, merged over this process's own.
     *
     * Secrets travel this way rather than as arguments: argv is visible to any
     * other process on the machine through the process list, and would end up
     * in the command output this console displays. The environment of a child
     * is not.
     */
    env?: Record<string, string>;
  } = {},
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
      // Not reading configuration, which is what the rule guards: this
      // forwards THIS process's environment to the child so it keeps PATH,
      // HOME and the rest. Without the spread, setting `env` at all would hand
      // the child an empty environment and `node` would not even resolve. The
      // values being ADDED come from the console's own .env.local via
      // secrets.ts, which is the classified path.
      // eslint-disable-next-line no-restricted-properties
      ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
    });
    return { ok: true, stdout, stderr, output: (stdout + stderr).trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? err.message ?? "unknown error";
    return { ok: false, stdout, stderr, output: (stdout + stderr).trim() };
  }
}
