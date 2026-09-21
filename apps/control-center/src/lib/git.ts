import "server-only";
import { describeFreshness, type Freshness } from "./freshness";
import { cmd } from "./shell";

export interface RepoStatus {
  branch: string;
  lastCommit: {
    sha: string;
    short: string;
    subject: string;
    author: string;
    when: string;
  } | null;
  /** Uncommitted file count. */
  dirtyFiles: number;
  /** Commits on this branch not yet on main. */
  aheadOfMain: number;
  /**
   * Commits on origin/main that this copy does not have. -1 when it could not
   * be worked out. This was hardcoded to 0 until it cost a round trip: a
   * number that is always zero reads as a check that passed.
   */
  behindRemote: number;
  /** Whether this copy can collect updates at all. A zip copy cannot. */
  hasGit: boolean;
  /** "Are you running the latest?", answered in one sentence. */
  freshness: Freshness;
  remoteUrl: string;
  /** Owner/repo parsed from the remote, for GitHub links. */
  slug: string | null;
}

const val = (r: { ok: boolean; stdout: string }) => (r.ok ? r.stdout.trim() : "");

export async function repoStatus(): Promise<RepoStatus> {
  const [branch, log, dirty, ahead, remote, behind, gitVersion] = await Promise.all([
    cmd("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    cmd("git", ["log", "-1", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%cr"]),
    cmd("git", ["status", "--porcelain"]),
    cmd("git", ["rev-list", "--count", "main..HEAD"]),
    cmd("git", ["remote", "get-url", "origin"]),
    // Against origin/main as this copy last saw it. Deliberately no fetch:
    // this runs on a page render, and the launcher already fetches at startup.
    cmd("git", ["rev-list", "--count", "HEAD..origin/main"]),
    cmd("git", ["--version"]),
  ]);

  let lastCommit: RepoStatus["lastCommit"] = null;
  const parts = val(log).split("");
  if (parts.length === 5) {
    lastCommit = {
      sha: parts[0]!,
      short: parts[1]!,
      subject: parts[2]!,
      author: parts[3]!,
      when: parts[4]!,
    };
  }

  const remoteUrl = val(remote);
  const m = /github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/.exec(remoteUrl);

  // -1, not 0, when it cannot be worked out. Zero means "nothing is waiting",
  // which is a different statement from "nobody could tell".
  const behindRemote = behind.ok ? Number.parseInt(val(behind) || "0", 10) : -1;
  const hasGit = gitVersion.ok;

  return {
    branch: val(branch) || "unknown",
    lastCommit,
    dirtyFiles: val(dirty) === "" ? 0 : val(dirty).split("\n").length,
    aheadOfMain: Number.parseInt(val(ahead) || "0", 10),
    behindRemote,
    hasGit,
    freshness: describeFreshness({
      hasGit,
      behind: Number.isNaN(behindRemote) ? -1 : behindRemote,
      short: lastCommit?.short ?? "",
      when: lastCommit?.when ?? "",
    }),
    remoteUrl,
    slug: m ? m[1]! : null,
  };
}
