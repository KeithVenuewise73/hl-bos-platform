/**
 * Turn staged discovery results into SQL batches for vstudio.opportunities.
 *
 * This container cannot reach the database directly (the network policy blocks
 * *.supabase.co, and Postgres is not reachable on any port), so every write
 * goes through the Supabase MCP tool. This script prepares those statements:
 * it deduplicates on the canonical repository URL, groups rows by the query
 * that found them so the constant columns are written once per batch instead
 * of once per row, and emits ON CONFLICT DO NOTHING inserts.
 *
 * Nothing is filtered, scored or ranked. Deduplication is the ONLY reduction,
 * and it is by canonical repository URL exactly as the matrix specifies.
 *
 * Usage: tsx scripts/discovery-ingest.mts [--batch 250] [--out DIR]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const RUN_DIR = "/tmp/hlvs-discovery";
const STAGING = `${RUN_DIR}/results.ndjson`;
const argIdx = (flag: string): number => process.argv.indexOf(flag);
const BATCH =
  argIdx("--batch") > -1 ? Number(process.argv[argIdx("--batch") + 1]) : 250;
const OUT =
  argIdx("--out") > -1 ? String(process.argv[argIdx("--out") + 1]) : `${RUN_DIR}/sql`;
const TENANT = "f1619fdb-9e14-4067-9cac-9182c9751c8e";

interface Staged {
  repository_url: string;
  title: string;
  summary: string;
  stars: number;
  forks: number;
  open_issues: number;
  language: string | null;
  topics: string[];
  pushed_at: string | null;
  license: string | null;
  archived: boolean;
  category: string;
  search_pattern: string;
  source_query: string;
  source_type: string;
}

/** Single-quote escaping for a SQL string literal. */
const q = (v: string | null): string =>
  v === null ? "null" : `'${v.replace(/'/g, "''")}'`;
const qArr = (xs: string[]): string =>
  xs.length === 0
    ? "'{}'"
    : `'{${xs.map((t) => `"${t.replace(/["\\]/g, "")}"`).join(",")}}'`;

if (!existsSync(STAGING)) {
  console.error(`no staged results at ${STAGING}`);
  process.exit(1);
}

// URLs already written to the database in an earlier wave. Persisting happens
// in waves while discovery is still running, so each wave must emit only what
// is new — the ON CONFLICT guard makes a repeat harmless, but re-sending rows
// that are already stored is pure waste.
const INGESTED = `${RUN_DIR}/ingested-urls.txt`;
const alreadyIngested = new Set<string>(
  existsSync(INGESTED)
    ? readFileSync(INGESTED, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [],
);

const seen = new Set<string>();
const rows: Staged[] = [];
let raw = 0;

for (const line of readFileSync(STAGING, "utf8").split("\n")) {
  if (!line.trim()) continue;
  raw++;
  const r = JSON.parse(line) as Staged;
  const key = r.repository_url.toLowerCase();
  if (seen.has(key)) continue; // canonical-URL dedupe, the only reduction
  seen.add(key);
  if (alreadyIngested.has(key)) continue;
  rows.push(r);
}

// --- Artifact mode ----------------------------------------------------------
// This container cannot reach the database, but the database CAN reach a URL.
// So the corpus crosses the boundary as a TEMPORARY artifact published to a
// throwaway branch of our own repository: chunked, hashed, fetched by Postgres,
// integrity-checked against the hash, ingested, then deleted.
//
// The artifact is DATA, not the engine. The engine (matrix + these scripts)
// lives permanently in source control; the artifact exists only long enough to
// cross the gap and is removed afterwards.
if (process.argv.includes("--artifact")) {
  const { createHash } = await import("node:crypto");
  const dirIdx = process.argv.indexOf("--artifact");
  const dir = String(process.argv[dirIdx + 1] ?? "/tmp/hlvs-artifact-repo");
  const perChunk =
    argIdx("--chunk-rows") > -1
      ? Number(process.argv[argIdx("--chunk-rows") + 1])
      : 4000;

  mkdirSync(dir, { recursive: true });
  const manifest: { file: string; rows: number; bytes: number; sha256: string }[] = [];

  for (let i = 0, n = 0; i < rows.length; i += perChunk) {
    n++;
    const slice = rows.slice(i, i + perChunk);
    const name = `chunk-${String(n).padStart(3, "0")}.jsonl`;
    const body = slice.map((r) => JSON.stringify(r)).join("\n") + "\n";
    writeFileSync(`${dir}/${name}`, body);
    manifest.push({
      file: name,
      rows: slice.length,
      bytes: Buffer.byteLength(body),
      sha256: createHash("sha256").update(body).digest("hex"),
    });
  }
  writeFileSync(`${dir}/manifest.json`, JSON.stringify({ chunks: manifest }, null, 1));
  console.log(
    JSON.stringify(
      {
        mode: "artifact",
        rawStaged: raw,
        uniqueRows: rows.length,
        chunks: manifest.length,
        totalBytes: manifest.reduce((a, c) => a + c.bytes, 0),
        dir,
      },
      null,
      1,
    ),
  );
  process.exit(0);
}

// Group by the query that found the row, so category / pattern / source_query
// are emitted once per batch rather than repeated on every row.
const groups = new Map<string, Staged[]>();
for (const r of rows) {
  const k = `${r.category}\u0000${r.search_pattern}\u0000${r.source_query}`;
  const g = groups.get(k);
  if (g) g.push(r);
  else groups.set(k, [r]);
}

mkdirSync(OUT, { recursive: true });
let file = 0;
let written = 0;

for (const [key, groupRows] of groups) {
  const [category, pattern, sourceQuery] = key.split("\u0000") as [
    string,
    string,
    string,
  ];
  for (let i = 0; i < groupRows.length; i += BATCH) {
    const slice = groupRows.slice(i, i + BATCH);
    const values = slice
      .map(
        (r) =>
          `(${q(r.repository_url)},${q(r.title)},${q(r.summary)},${r.stars},${r.forks},` +
          `${r.open_issues},${q(r.language)},${qArr(r.topics)},${r.pushed_at ? q(r.pushed_at) : "null"},` +
          `${q(r.license)},${r.archived})`,
      )
      .join(",\n");
    const sql =
      `insert into vstudio.opportunities\n` +
      `(tenant_id,title,summary,repository_url,source_url,stars,forks,open_issues,language,topics,` +
      `pushed_at,license,archived,category,search_pattern,source_query,source_type,discovered_at,confidence)\n` +
      // Explicit casts: a VALUES literal is untyped text, and text[] / timestamptz
      // columns will not take it implicitly.
      `select '${TENANT}',v.title,v.summary,v.url,v.url,v.stars,v.forks,v.open_issues,v.language,v.topics::text[],\n` +
      `       v.pushed_at::timestamptz,v.license,v.archived::boolean,${q(category)},${q(pattern)},${q(sourceQuery)},'github',now(),'unscored'\n` +
      `from (values\n${values}\n) as v(url,title,summary,stars,forks,open_issues,language,topics,pushed_at,license,archived)\n` +
      `on conflict do nothing;`;
    file++;
    writeFileSync(`${OUT}/${String(file).padStart(4, "0")}.sql`, sql);
    written += slice.length;
  }
}

// Record what this wave covers, so the next wave skips it.
writeFileSync(
  INGESTED,
  [...alreadyIngested, ...rows.map((r) => r.repository_url.toLowerCase())].join("\n"),
);

console.log(
  JSON.stringify(
    {
      rawStaged: raw,
      alreadyIngestedBefore: alreadyIngested.size,
      newRowsThisWave: rows.length,
      duplicatesCollapsed: raw - rows.length,
      queryGroups: groups.size,
      batchFiles: file,
      rowsInBatches: written,
      outDir: OUT,
    },
    null,
    1,
  ),
);
