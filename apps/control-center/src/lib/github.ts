import "server-only";

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
}

export type GitHubState =
  | { connected: false; reason: string }
  | { connected: true; pulls: PullRequest[]; defaultBranch: string };

const API = "https://api.github.com";

function token(): string | null {
  // eslint-disable-next-line no-restricted-properties -- see the note below
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

export async function githubState(slug: string | null): Promise<GitHubState> {
  const tk = token();
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
        let checks: CheckRun[] = [];
        try {
          const cr = await gh<{
            check_runs: Array<{
              name: string;
              status: string;
              conclusion: string | null;
            }>;
          }>(`/repos/${slug}/commits/${p.head.sha}/check-runs`, tk);
          checks = cr.check_runs.map((c) => ({
            name: c.name,
            status: c.status,
            conclusion: c.conclusion,
          }));
        } catch {
          // A PR with no checks yet is normal, not an error.
        }
        return {
          number: p.number,
          title: p.title,
          url: p.html_url,
          branch: p.head.ref,
          draft: p.draft,
          mergeable: p.mergeable,
          checks,
        };
      }),
    );

    return { connected: true, pulls, defaultBranch: repo.default_branch };
  } catch (e) {
    return { connected: false, reason: (e as Error).message };
  }
}
