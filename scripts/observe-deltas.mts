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
import {
  createReadStream,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
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

// --- SQL ---------------------------------------------------------------------
// One observation_runs row recording SCOPE and MATERIALITY, then one
// metric_observations row per materially-changed repository. The run row is
// what makes a missing observation meaningful: "observed in this run, below
// the stated bar" rather than "unknown".
const q = (v: string | null): string =>
  v === null ? "null" : `'${v.replace(/'/g, "''")}'`;

// Which queries the second pass actually covered, read from the runner's own
// progress file. A partial pass must say so — presenting it as full coverage
// would misstate what the rising scores are based on.
let coveredQueries = 0;
let totalQueries = 0;
try {
  const prog = JSON.parse(
    readFileSync(`${CURRENT.replace(/\/results\.ndjson$/, "")}/progress.json`, "utf8"),
  ) as { totals?: { queriesComplete?: number; queriesTotal?: number } };
  coveredQueries = prog.totals?.queriesComplete ?? 0;
  totalQueries = prog.totals?.queriesTotal ?? 0;
} catch {
  // Leave at zero; the scope text below says "unknown" rather than guessing.
}

const scope =
  coveredQueries > 0
    ? `Second observation pass re-running the discovery matrix: ${coveredQueries} of ${totalQueries} queries completed, ` +
      `covering ${current.size} repositories, of which ${paired} had a baseline reading to compare against. ` +
      `Repositories outside those queries were NOT re-observed in this run and keep an unknown rising score.`
    : `Second observation pass covering ${current.size} repositories, of which ${paired} had a baseline reading. ` +
      `Query coverage could not be read from the run's progress file.`;

const materiality =
  `A repository is recorded only if it gained at least ${MIN_STARS} stars, ${MIN_FORKS} forks or ${MIN_ISSUES} open issues ` +
  `since its baseline. ${unchanged} paired repositories were observed and fell below that bar; their absence from ` +
  `metric_observations means "observed, unchanged enough", not "unknown".`;

const SQL_DIR = `${OUT.replace(/\/[^/]+$/, "")}/sql`;
mkdirSync(SQL_DIR, { recursive: true });

writeFileSync(
  `${SQL_DIR}/0000-run.sql`,
  `insert into vstudio.observation_runs
` +
    `  (source, scope, materiality, method, observed_count, recorded_count, finished_at)
` +
    `values ('github', ${q(scope)}, ${q(materiality)},
` +
    `  ${q("Re-ran the source-controlled discovery matrix through the same GitHub search endpoint used for the original capture, so both readings are methodologically identical. Comparing a search reading against a REST reading would measure the difference between two APIs as readily as the difference between two days.")},
` +
    `  ${paired}, ${material.length}, now())
` +
    `returning id;`,
);

const BATCH = 250;
let sqlFile = 0;
for (let i = 0; i < material.length; i += BATCH) {
  const slice = material.slice(i, i + BATCH);
  const values = slice
    .map(
      (m) =>
        `(${q(m.url)}, ${m.stars}, ${m.forks}, ${m.open_issues}, ` +
        `${m.pushed_at ? q(m.pushed_at) : "null"}, ${m.archived})`,
    )
    .join(",\n");
  sqlFile++;
  writeFileSync(
    `${SQL_DIR}/${String(sqlFile).padStart(4, "0")}-observations.sql`,
    `insert into vstudio.metric_observations
` +
      `  (opportunity_id, observed_at, source, is_baseline, stars, forks, open_issues, pushed_at, archived, run_id, raw)
` +
      `select o.id, now(), 'github', false, v.stars, v.forks, v.issues, v.pushed_at::timestamptz, v.archived,
` +
      `       (select id from vstudio.observation_runs order by started_at desc limit 1),
` +
      `       jsonb_build_object('origin', 'second-observation-pass')
` +
      `from (values\n${values}\n) as v(url, stars, forks, issues, pushed_at, archived)
` +
      `join vstudio.opportunities o on lower(o.repository_url) = v.url
` +
      `on conflict (opportunity_id, observed_at) do nothing;`,
  );
}

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
      sqlDir: SQL_DIR,
      sqlFiles: sqlFile + 1,
      coveredQueries,
      totalQueries,
      topMovers: material.slice(0, 5).map((m) => ({ url: m.url, d_stars: m.d_stars })),
    },
    null,
    1,
  ),
);
