/**
 * Turn a second discovery pass into MATERIAL metric observations.
 *
 * Rising Opportunities needs two readings of the same repository taken the
 * same way. The first is the discovery capture already in the database; the
 * second is a re-run of the identical matrix. This script pairs them.
 *
 * WHY NOT WRITE EVERY OBSERVATION
 *
 * Most repositories do not move in a few days. Writing 62,214 rows to record
 * "unchanged" would be noise, and this container cannot push that volume to
 * the database anyway. So only materially-changed repositories get a row, and
 * the bar is recorded in vstudio.observation_runs alongside the observed
 * count — which is what makes the ABSENCE of a row mean "observed, below the
 * bar" rather than "unknown".
 *
 * Both files are the raw staging output of scripts/discovery-run.mts, so the
 * two readings are methodologically identical. Comparing a search-API reading
 * against a REST reading would measure the difference between two APIs as
 * readily as the difference between two days.
 *
 * Usage: tsx scripts/observe-deltas.mts [--min-stars 5] [--min-forks 2] [--min-issues 5]
 */
import { createReadStream, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const BASELINE = process.env["HLVS_BASELINE"] ?? "/tmp/hlvs-discovery/results.ndjson";
const CURRENT = process.env["HLVS_CURRENT"] ?? "/tmp/hlvs-observation/results.ndjson";
const OUT = process.env["HLVS_DELTA_OUT"] ?? "/tmp/hlvs-observation/deltas.json";

const argNum = (flag: string, fallback: number): number => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const MIN_STARS = argNum("--min-stars", 5);
const MIN_FORKS = argNum("--min-forks", 2);
const MIN_ISSUES = argNum("--min-issues", 5);

interface Reading {
  stars: number;
  forks: number;
  open_issues: number;
  pushed_at: string | null;
  archived: boolean;
}

/** First occurrence wins, matching the dedupe rule the corpus was built with. */
async function read(path: string): Promise<Map<string, Reading>> {
  const out = new Map<string, Reading>();
  if (!existsSync(path)) return out;
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Reading & { repository_url: string };
    const key = r.repository_url.toLowerCase();
    if (out.has(key)) continue;
    out.set(key, {
      stars: r.stars ?? 0,
      forks: r.forks ?? 0,
      open_issues: r.open_issues ?? 0,
      pushed_at: r.pushed_at,
      archived: Boolean(r.archived),
    });
  }
  return out;
}

const baseline = await read(BASELINE);
const current = await read(CURRENT);

const material: {
  url: string;
  stars: number;
  forks: number;
  open_issues: number;
  pushed_at: string | null;
  archived: boolean;
  d_stars: number;
  d_forks: number;
  d_issues: number;
}[] = [];

let paired = 0;
let unchanged = 0;
let newlySeen = 0;

for (const [url, now] of current) {
  const before = baseline.get(url);
  if (!before) {
    // Present in the second pass but not the first: a genuinely new find, not
    // a growth measurement. It has no baseline, so it cannot have a trend.
    newlySeen++;
    continue;
  }
  paired++;
  const dS = now.stars - before.stars;
  const dF = now.forks - before.forks;
  const dI = now.open_issues - before.open_issues;
  if (dS >= MIN_STARS || dF >= MIN_FORKS || dI >= MIN_ISSUES) {
    material.push({
      url,
      stars: now.stars,
      forks: now.forks,
      open_issues: now.open_issues,
      pushed_at: now.pushed_at,
      archived: now.archived,
      d_stars: dS,
      d_forks: dF,
      d_issues: dI,
    });
  } else {
    unchanged++;
  }
}

material.sort((a, b) => b.d_stars - a.d_stars);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      baselineRows: baseline.size,
      currentRows: current.size,
      paired,
      newlySeenWithoutBaseline: newlySeen,
      belowMateriality: unchanged,
      material: material.length,
      bar: `stars +${MIN_STARS} or forks +${MIN_FORKS} or open issues +${MIN_ISSUES}`,
      rows: material,
    },
    null,
    0,
  ),
);

console.log(
  JSON.stringify(
    {
      baselineRows: baseline.size,
      currentRows: current.size,
      paired,
      newlySeenWithoutBaseline: newlySeen,
      belowMateriality: unchanged,
      material: material.length,
      bar: `stars +${MIN_STARS} or forks +${MIN_FORKS} or open issues +${MIN_ISSUES}`,
      out: OUT,
      topMovers: material.slice(0, 5).map((m) => ({ url: m.url, d_stars: m.d_stars })),
    },
    null,
    1,
  ),
);
