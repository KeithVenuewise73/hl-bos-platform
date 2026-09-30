/**
 * One button that answers "what is actually going on on your machine?"
 *
 * This exists because four rounds in a row were spent asking him to read
 * something off a screen and tell me what it said. That is the shape the
 * operating contract forbids: if I need to know what his machine thinks, the
 * software should say it, not him.
 *
 * NOTHING SECRET GOES IN HERE. The access code is reported as set or not set,
 * never as its value -- this text is meant to be pasted into a chat window,
 * and a code pasted into a chat window is a code that has been published.
 *
 * Pure: the caller gathers, this formats.
 */

export interface ReportFacts {
  readonly whenGenerated: string;
  readonly version: {
    readonly short: string;
    readonly when: string;
    readonly branch: string;
    /** Commits waiting on GitHub. -1 when unknown. */
    readonly behind: number;
    readonly hasGit: boolean;
    readonly dirtyFiles: number;
  };
  readonly machine: {
    readonly platform: string;
    readonly release: string;
    readonly node: string;
    /** True when the launcher's own copy of the build tool is present. */
    readonly bundledPnpm: boolean;
  };
  readonly sceneflow: {
    readonly running: boolean;
    readonly homeUrls: readonly string[];
    readonly awayUrls: readonly string[];
    /** Whether a code is set. NEVER the code itself. */
    readonly codeSet: boolean;
  };
  readonly gpu: { readonly verdict: string; readonly headline: string };
  /** The last thing Start SceneFlow actually said, verbatim. "" if never pressed. */
  readonly lastLaunch: string;
}

export function formatReport(f: ReportFacts): string {
  const behind = !f.version.hasGit
    ? "unknown (this copy cannot collect updates)"
    : f.version.behind < 0
      ? "unknown (the check did not answer)"
      : String(f.version.behind);

  return [
    "HL-BOS console report",
    `generated: ${f.whenGenerated}`,
    "",
    "VERSION",
    `  running:      ${f.version.short || "unknown"}${f.version.when ? ` (${f.version.when})` : ""}`,
    `  branch:       ${f.version.branch}`,
    `  behind main:  ${behind}`,
    `  git present:  ${yesNo(f.version.hasGit)}`,
    `  local edits:  ${f.version.dirtyFiles}`,
    "",
    "MACHINE",
    `  os:           ${f.machine.platform} ${f.machine.release}`,
    `  node:         ${f.machine.node}`,
    `  build tool:   ${f.machine.bundledPnpm ? "bundled copy present" : "MISSING from .hlbos/toolchain"}`,
    "",
    "SCENEFLOW",
    `  running:      ${yesNo(f.sceneflow.running)}`,
    `  on wi-fi:     ${list(f.sceneflow.homeUrls)}`,
    `  from away:    ${list(f.sceneflow.awayUrls)}`,
    // Deliberately not the code. See the header.
    `  access code:  ${f.sceneflow.codeSet ? "set" : "not set"}`,
    "",
    "GRAPHICS",
    `  verdict:      ${f.gpu.verdict}`,
    `  detail:       ${f.gpu.headline}`,
    "",
    "LAST 'START SCENEFLOW'",
    f.lastLaunch === ""
      ? "  (not pressed since this console started)"
      : indent(f.lastLaunch),
    "",
  ].join("\n");
}

function yesNo(v: boolean): string {
  return v ? "yes" : "no";
}

function list(urls: readonly string[]): string {
  return urls.length === 0 ? "none found" : urls.join(", ");
}

function indent(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}
