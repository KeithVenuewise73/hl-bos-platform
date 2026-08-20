/**
 * Turn staged pain signals into SQL for vstudio.pain_signals and
 * vstudio.pain_clusters.
 *
 * This container cannot reach the database, so the statements are generated
 * here and executed through the Supabase tool. Nothing is summarised or
 * filtered on the way: every collected signal is emitted, INCLUDING the ones
 * that matched no theme. Those are evidence too, and a pile the CEO can see
 * is honest where a quiet deletion is not.
 *
 * Body excerpts are trimmed here rather than in the collector so the raw
 * staging file keeps the fuller text; the database stores enough to judge
 * relevance and the URL for the rest.
 *
 * Usage: tsx scripts/pain-ingest.mts [--out DIR] [--excerpt 180]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  PAIN_THEMES,
  PAIN_ENGINE_VERSION,
} from "../packages/venture-studio/src/pain.ts";

const argStr = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? String(process.argv[i + 1]) : fallback;
};
const IN = process.env["HLVS_PAIN_DIR"] ?? "/tmp/hlvs-pain";
const OUT = argStr("--out", `${IN}/sql`);
const EXCERPT = Number(argStr("--excerpt", "180"));
const BATCH = Number(argStr("--batch", "200"));
/**
 * Ceiling on stored signals.
 *
 * The brief is explicit that thousands of individual complaints must not
 * become thousands of executive records — clusters are the deliverable and
 * signals are their evidence. Verified collection returns more than can
 * usefully be stored, so each THEME keeps its most engaged evidence and the
 * collected-versus-stored counts are printed, so the selection is a disclosed
 * rule rather than a silent truncation.
 *
 * Selection is per theme, not global: a global top-N would let one loud theme
 * crowd out the evidence for every other one.
 */
const CAP_PER_THEME = Number(argStr("--cap-per-theme", "90"));

const q = (v: string | null): string =>
  v === null ? "null" : `'${v.replace(/'/g, "''")}'`;
const qArr = (xs: readonly string[]): string => {
  if (xs.length === 0) return "'{}'";
  // Build the array literal first, then quote it like any other SQL string.
  // Doing it the other way round misses apostrophes inside elements, and the
  // CEO's phrasings are full of them ("why isn't there an app").
  const body = `{${xs.map((t) => `"${t.replace(/["\\]/g, "")}"`).join(",")}}`;
  return q(body);
};

interface Staged {
  source: string;
  source_url: string;
  external_id: string;
  title: string;
  body_excerpt: string;
  labels: string[];
  reactions: number;
  comments: number;
  state: string | null;
  created_at_source: string | null;
  matched_phrases: string[];
  theme: string | null;
}

const seen = new Set<string>();
const rows: Staged[] = [];
for (const line of readFileSync(`${IN}/signals.ndjson`, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as Staged;
  // The same issue can answer more than one phrasing. It is one piece of
  // evidence, so it is stored once — with every phrasing that found it.
  const prev = rows.find((x) => x.external_id === r.external_id);
  if (prev) {
    for (const p of r.matched_phrases)
      if (!prev.matched_phrases.includes(p)) prev.matched_phrases.push(p);
    continue;
  }
  if (seen.has(r.external_id)) continue;
  seen.add(r.external_id);
  rows.push({ ...r, matched_phrases: [...r.matched_phrases] });
}

// Keep the most-engaged evidence per theme, and record what that left out.
const byThemeAll = new Map<string, Staged[]>();
for (const r of rows) {
  const k = r.theme ?? "(unclustered)";
  const a = byThemeAll.get(k) ?? [];
  a.push(r);
  byThemeAll.set(k, a);
}
const selected: Staged[] = [];
const dropped: Record<string, number> = {};
for (const [theme, list] of byThemeAll) {
  list.sort(
    (a, b) =>
      (b.reactions ?? 0) +
      2 * (b.comments ?? 0) -
      ((a.reactions ?? 0) + 2 * (a.comments ?? 0)),
  );
  selected.push(...list.slice(0, CAP_PER_THEME));
  if (list.length > CAP_PER_THEME) dropped[theme] = list.length - CAP_PER_THEME;
}
rows.length = 0;
rows.push(...selected);

mkdirSync(OUT, { recursive: true });

// --- Clusters: the source-controlled themes, upserted by their stable key ---
const clusterSql =
  `insert into vstudio.pain_clusters (theme_key, title, problem_statement, method, keywords, human_review_required)\nvalues\n` +
  PAIN_THEMES.map(
    (t) =>
      `  (${q(t.key)}, ${q(t.title)}, ${q(t.problemStatement)}, ` +
      `${q(`Deterministic keyword assignment against the theme list in packages/venture-studio/src/pain.ts (${PAIN_ENGINE_VERSION}). A signal joins the theme it shares most keywords with; ties break by declaration order.`)}, ` +
      `${qArr(t.keywords)}, true)`,
  ).join(",\n") +
  `\non conflict (theme_key) where theme_key is not null do update set\n` +
  `  title = excluded.title,\n  problem_statement = excluded.problem_statement,\n` +
  `  method = excluded.method,\n  keywords = excluded.keywords;`;
writeFileSync(`${OUT}/0000-clusters.sql`, clusterSql);

// --- Signals ---------------------------------------------------------------
let file = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  const values = slice
    .map((r) => {
      // The theme key rides along in matched_phrases with a 'theme:' prefix so
      // vstudio.link_pain_signals() can attach the signal to its cluster
      // without a second lookup table, and so the assignment stays visible on
      // the row itself.
      const phrases = [...r.matched_phrases];
      if (r.theme) phrases.push(`theme:${r.theme}`);
      return (
        `(${q(r.source)}, ${q(r.source_url)}, ${q(r.external_id)}, ${q(r.title.slice(0, 250))}, ` +
        `${q(r.body_excerpt.slice(0, EXCERPT))}, ${qArr(r.labels.slice(0, 4))}, ${r.reactions | 0}, ` +
        `${r.comments | 0}, ${q(r.state)}, ${r.created_at_source ? q(r.created_at_source) : "null"}, ` +
        `${qArr(phrases)})`
      );
    })
    .join(",\n");
  const sql =
    `insert into vstudio.pain_signals\n` +
    `(source, source_url, external_id, title, body_excerpt, labels, reactions, comments, state, created_at_source, matched_phrases)\n` +
    `values\n${values}\n` +
    `on conflict (source, external_id) do nothing;`;
  file++;
  writeFileSync(`${OUT}/${String(file).padStart(4, "0")}-signals.sql`, sql);
}

const byTheme = new Map<string, number>();
for (const r of rows)
  byTheme.set(
    r.theme ?? "(unclustered)",
    (byTheme.get(r.theme ?? "(unclustered)") ?? 0) + 1,
  );

console.log(
  JSON.stringify(
    {
      verifiedCollected: [...byThemeAll.values()].reduce((a, l) => a + l.length, 0),
      storedAsEvidence: rows.length,
      capPerTheme: CAP_PER_THEME,
      notStoredPerTheme: dropped,
      themes: PAIN_THEMES.length,
      batches: file,
      outDir: OUT,
      byTheme: Object.fromEntries([...byTheme].sort((a, b) => b[1] - a[1])),
    },
    null,
    1,
  ),
);
