import "server-only";
import { readEnvFile } from "./secrets";

/**
 * Read-only GitHub client.
 *
 * The token is optional ON PURPOSE. Without it the dashboard still works for
 * everything local (status, build, test) and reports GitHub as "not connected"
 * rather than blank, wrong, or invented.
 *
 * WHY THIS READS process.env DIRECTLY, when the platform's ESLint rule forbids
 * it everywhere except @hl-bos/config:
 *
 * That rule exists so PLATFORM runtime config is validated and classified.
 * This is not platform runtime -- it is an operator tool that runs only on the
 * CEO's own machine, and the token is genuinely OPTIONAL. @hl-bos/config's
 * loadEnv() reports every missing variable as an error, which is exactly right
 * for the platform and exactly wrong here: a missing token is a normal state,
 * not a misconfiguration.
 *
 * The narrow disable is deliberate and scoped to this one function. If the
 * Control Center ever grows required configuration, it belongs in
 * @hl-bos/config like everything else.
 */

export interface CheckRun {
  name: string;
  /** queued | in_progress | completed */
  status: string;
  /** success | failure | cancelled | neutral | null while running */
  conclusion: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  branch: string;
  draft: boolean;
  mergeable: boolean | null;
  checks: CheckRun[];
  /**
   * False when the CI results could not be READ (typically a 403 because the
   * token lacks the "Actions" read permission), as opposed to a PR that simply
   * has no CI yet. The console must not treat "cannot see" as "nothing there".
   */
  checksReadable: boolean;
}

export type GitHubState =
  | { connected: false; reason: string }
  | { connected: true; pulls: PullRequest[]; defaultBranch: string };

const API = "https://api.github.com";

async function token(): Promise<string | null> {
  // Read from .env.local, which the console itself writes when the CEO pastes a
  // token into the Connect page. He never opens a text editor.
  const file = await readEnvFile();
  if (file["HLBOS_GITHUB_TOKEN"]) return file["HLBOS_GITHUB_TOKEN"];
  // eslint-disable-next-line no-restricted-properties -- see the note above
  const env = process.env;
  return env["HLBOS_GITHUB_TOKEN"] ?? env["GITHUB_TOKEN"] ?? null;
}

async function gh<T>(path: string, tk: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${tk}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return (await res.json()) as T;
}

/**
 * Read the CI result for a commit via the ACTIONS API.
 *
 * Why not the Checks API (`/commits/{sha}/check-runs`)? Because the console
 * authenticates with a fine-grained personal access token, and a fine-grained
 * PAT CANNOT be granted access to the Checks API. There is no "Checks"
 * fine-grained permission -- that API is GitHub-App-only -- so check-runs always
 * returns 403 "Resource not accessible by personal access token" for this token.
 * (Verified against the live API and GitHub's fine-grained permission reference.)
 *
 * GitHub Actions -- our CI -- publishes results as workflow runs, readable with
 * the "Actions" repository permission (Read), which a fine-grained token CAN
 * grant. We take the newest run per workflow for the commit, then its jobs, so
 * each job (Validate, Secret scan, Database tests, Migration checks) still
 * surfaces as its own gate, exactly as before.
 *
 * The Commit Statuses API is NOT a substitute: Actions does not write commit
 * statuses, so `/commits/{sha}/status` comes back empty (state=pending, 0 rows).
 */
async function ciChecksForSha(
  slug: string,
  sha: string,
  tk: string,
): Promise<{ checks: CheckRun[]; readable: boolean }> {
  try {
    const runs = await gh<{
      workflow_runs: Array<{
        id: number;
        name: string | null;
        status: string;
        conclusion: string | null;
        workflow_id: number;
        created_at: string;
      }>;
    }>(`/repos/${slug}/actions/runs?head_sha=${sha}&per_page=50`, tk);

    // Re-runs supersede: keep only the newest run per workflow.
    const latest = new Map<number, (typeof runs.workflow_runs)[number]>();
    for (const r of runs.workflow_runs) {
      const prev = latest.get(r.workflow_id);
      if (!prev || r.created_at > prev.created_at) latest.set(r.workflow_id, r);
    }

    const checks: CheckRun[] = [];
    for (const run of latest.values()) {
      try {
        const j = await gh<{
          jobs: Array<{ name: string; status: string; conclusion: string | null }>;
        }>(`/repos/${slug}/actions/runs/${run.id}/jobs?per_page=100`, tk);
        for (const job of j.jobs) {
          checks.push({
            name: job.name,
            status: job.status,
            conclusion: job.conclusion,
          });
        }
      } catch {
        // If one run's jobs cannot be read, fall back to the run-level result so
        // the gate still reflects reality rather than silently disappearing.
        checks.push({
          name: run.name ?? "CI",
          status: run.status,
          conclusion: run.conclusion,
        });
      }
    }
    return { checks, readable: true };
  } catch {
    // A 403 here means the token lacks the "Actions" (Read) permission -- the
    // correct, grantable fine-grained permission for reading CI results.
    return { checks: [], readable: false };
  }
}

export async function githubState(slug: string | null): Promise<GitHubState> {
  const tk = await token();
  if (!tk) {
    return {
      connected: false,
      reason:
        "No GitHub access token yet. Everything on this machine still works; pull requests and build results need a token.",
    };
  }
  if (!slug) {
    return {
      connected: false,
      reason: "This folder is not linked to a GitHub repository.",
    };
  }

  try {
    const repo = await gh<{ default_branch: string }>(`/repos/${slug}`, tk);
    const raw = await gh<
      Array<{
        number: number;
        title: string;
        html_url: string;
        draft: boolean;
        mergeable: boolean | null;
        head: { sha: string; ref: string };
      }>
    >(`/repos/${slug}/pulls?state=open&per_page=10`, tk);

    const pulls: PullRequest[] = await Promise.all(
      raw.map(async (p) => {
        const { checks, readable } = await ciChecksForSha(slug, p.head.sha, tk);
        return {
          number: p.number,
          title: p.title,
          url: p.html_url,
          branch: p.head.ref,
          draft: p.draft,
          mergeable: p.mergeable,
          checks,
          checksReadable: readable,
        };
      }),
    );

    return { connected: true, pulls, defaultBranch: repo.default_branch };
  } catch (e) {
    return { connected: false, reason: (e as Error).message };
  }
}

/** Merge a pull request. THIS IS THE CEO'S APPROVAL, expressed as an action. */
export async function mergePullRequest(
  slug: string,
  number: number,
  title: string,
): Promise<{ ok: true; sha: string } | { ok: false; reason: string }> {
  const tk = await token();
  if (!tk) return { ok: false, reason: "GitHub is not connected." };

  const res = await fetch(`${API}/repos/${slug}/pulls/${number}/merge`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${tk}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ commit_title: title, merge_method: "merge" }),
  });

  if (res.ok) {
    const b = (await res.json()) as { sha: string };
    return { ok: true, sha: b.sha };
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  // 405 is GitHub's "not mergeable" -- protected branch, failing checks, conflict.
  return {
    ok: false,
    reason: body.message ?? `GitHub refused the merge (${res.status}).`,
  };
}

/** Re-check a PR right before merging, so approval acts on current facts. */
export async function pullRequestIsMergeable(
  slug: string,
  number: number,
): Promise<{ ready: boolean; reason: string }> {
  const tk = await token();
  if (!tk) return { ready: false, reason: "GitHub is not connected." };
  try {
    const pr = await gh<{
      mergeable: boolean | null;
      draft: boolean;
      head: { sha: string };
    }>(`/repos/${slug}/pulls/${number}`, tk);
    if (pr.draft)
      return { ready: false, reason: "This work is still marked as a draft." };
    const { checks, readable } = await ciChecksForSha(slug, pr.head.sha, tk);
    if (!readable)
      return {
        ready: false,
        reason:
          "The token can't read CI results. Grant it the 'Actions' read permission, then re-save it.",
      };
    if (checks.length === 0)
      return { ready: false, reason: "No CI has run for this commit yet." };
    const failing = checks.filter(
      (c) =>
        c.status === "completed" &&
        c.conclusion !== "success" &&
        c.conclusion !== "neutral" &&
        c.conclusion !== "skipped",
    );
    const running = checks.filter((c) => c.status !== "completed");
    if (failing.length > 0)
      return { ready: false, reason: `${failing.length} check(s) are still failing.` };
    if (running.length > 0)
      return { ready: false, reason: "The checks have not finished yet." };
    if (pr.mergeable === false)
      return {
        ready: false,
        reason: "GitHub reports a conflict that must be resolved first.",
      };
    return { ready: true, reason: "Every check passed." };
  } catch (e) {
    return { ready: false, reason: (e as Error).message };
  }
}
