import "server-only";
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
  /** Commits on origin not yet here. */
  behindRemote: number;
  remoteUrl: string;
  /** Owner/repo parsed from the remote, for GitHub links. */
  slug: string | null;
}

const val = (r: { ok: boolean; stdout: string }) => (r.ok ? r.stdout.trim() : "");

export async function repoStatus(): Promise<RepoStatus> {
  const [branch, log, dirty, ahead, remote] = await Promise.all([
    cmd("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    cmd("git", ["log", "-1", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%cr"]),
    cmd("git", ["status", "--porcelain"]),
    cmd("git", ["rev-list", "--count", "main..HEAD"]),
    cmd("git", ["remote", "get-url", "origin"]),
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

  return {
    branch: val(branch) || "unknown",
    lastCommit,
    dirtyFiles: val(dirty) === "" ? 0 : val(dirty).split("\n").length,
    aheadOfMain: Number.parseInt(val(ahead) || "0", 10),
    behindRemote: 0,
    remoteUrl,
    slug: m ? m[1]! : null,
  };
}
