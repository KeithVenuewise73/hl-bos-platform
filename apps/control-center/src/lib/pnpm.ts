/**
 * How to run pnpm, which is not as simple as typing "pnpm".
 *
 * The launcher deliberately does NOT put pnpm on the PATH. It installs it
 * inside the repository, at .hlbos/toolchain, and runs it as
 * `node ...\pnpm.cjs` -- because the usual way (corepack) needs administrator
 * rights to write its shims and fails quietly when it does not have them.
 *
 * Every button in this console that builds or starts something then called
 * `pnpm` by name, which on the operator's machine is not there. It worked on
 * the machine it was written on, where pnpm IS on the PATH, and could not work
 * on his. "I pressed Start SceneFlow and nothing happened" is what that looks
 * like from the outside.
 *
 * There is a second reason on Windows even when pnpm IS on the PATH: it is
 * installed there as `pnpm.cmd`, and Node refuses to spawn a .cmd without a
 * shell (it has done since the argument-injection fix in 2024). So the name
 * `pnpm` fails on Windows twice over, and `node <path to pnpm.cjs>` -- node
 * being a real executable -- works in both places.
 *
 * Pure: the caller says whether the bundled copy is there.
 */

export interface PnpmInvocation {
  readonly bin: string;
  readonly args: readonly string[];
  /** True when the copy inside the repository is being used. */
  readonly bundled: boolean;
}

/** Where the launcher puts it, relative to the repository root. */
export const BUNDLED_PNPM = [
  ".hlbos",
  "toolchain",
  "node_modules",
  "pnpm",
  "bin",
  "pnpm.cjs",
] as const;

export function pnpmInvocation(
  args: readonly string[],
  bundled: { readonly path: string; readonly exists: boolean },
): PnpmInvocation {
  if (bundled.exists) {
    // `node` is a real executable on every platform, so this spawns cleanly
    // with no shell and no PATH lookup.
    return { bin: "node", args: [bundled.path, ...args], bundled: true };
  }
  // No bundled copy: this is a developer machine where pnpm is a real
  // executable on the PATH. Deliberately not a silent failure -- if it is not
  // there either, the caller reports the spawn error as it would any other.
  return { bin: "pnpm", args, bundled: false };
}
