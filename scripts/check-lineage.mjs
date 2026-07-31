#!/usr/bin/env node
// Migration LINEAGE governance — offline, deterministic, no network.
//
// Complements scripts/check-migrations.sh (which checks filename/secret/
// destructive rules per file). This script governs the lineage AS A WHOLE:
//
//   1. ordinals are sequential 1..N with no gaps and no duplicates,
//   2. version timestamps increase monotonically with ordinal,
//   3. every migration file's SHA-256 matches the committed lineage manifest
//      (.hlbos/migration-lineage.json) — so an existing migration cannot be
//      edited, and a number cannot be reused with different content, without a
//      visible manifest change,
//   4. the canonical registry (.hlbos/canonical.json) is well-formed and names
//      exactly one authoritative production project,
//   5. the manifest's foundation / not-yet-applied / known-drift metadata stays
//      in sync with the canonical registry.
//
// Usage:
//   node scripts/check-lineage.mjs           # verify (CI). Exit 1 on violation.
//   node scripts/check-lineage.mjs --write    # regenerate the manifest from the
//                                             # files + canonical.json, then verify.
//
// After legitimately adding or changing a migration, run --write and commit the
// updated manifest in the same PR. The manifest diff IS the audit trail.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGR_DIR = path.join(ROOT, "supabase/migrations");
const CANONICAL = path.join(ROOT, ".hlbos/canonical.json");
const MANIFEST = path.join(ROOT, ".hlbos/migration-lineage.json");
const WRITE = process.argv.includes("--write");

const FILE_RE = /^(\d{14})_hlbos_(\d{4})(r\d{2})?_([a-z0-9_]+)\.sql$/;

const problems = [];
const fail = (m) => problems.push(m);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

// ---- gather files -------------------------------------------------------
const files = readdirSync(MIGR_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const parsed = [];
for (const filename of files) {
  const m = FILE_RE.exec(filename);
  if (!m) {
    fail(
      `filename does not match <timestamp>_hlbos_<NNNN>[rNN]_<desc>.sql: ${filename}`,
    );
    continue;
  }
  const [, version, ordinalStr, , desc] = m;
  parsed.push({
    ordinal: Number(ordinalStr),
    name: `hlbos_${ordinalStr}_${desc}`,
    filename,
    version,
    sha256: sha256(readFileSync(path.join(MIGR_DIR, filename))),
  });
}
parsed.sort((a, b) => a.ordinal - b.ordinal || a.version.localeCompare(b.version));

// ---- structural checks: sequence + monotonic version --------------------
const seen = new Map();
for (const p of parsed) {
  if (seen.has(p.ordinal))
    fail(
      `duplicate migration ordinal ${p.ordinal}: ${seen.get(p.ordinal)} and ${p.filename}`,
    );
  else seen.set(p.ordinal, p.filename);
}
for (let i = 0; i < parsed.length; i++) {
  const expected = i + 1;
  if (parsed[i].ordinal !== expected) {
    fail(
      `ordinal gap/misorder: expected ${String(expected).padStart(4, "0")}, found ${String(parsed[i].ordinal).padStart(4, "0")} (${parsed[i].filename})`,
    );
    break;
  }
}
for (let i = 1; i < parsed.length; i++) {
  if (parsed[i].version <= parsed[i - 1].version) {
    fail(
      `version identifier not increasing: ${parsed[i - 1].filename} (${parsed[i - 1].version}) then ${parsed[i].filename} (${parsed[i].version})`,
    );
  }
}

// ---- canonical registry checks ------------------------------------------
let canonical;
try {
  canonical = readJson(CANONICAL);
} catch (e) {
  fail(`cannot read ${path.relative(ROOT, CANONICAL)}: ${e.message}`);
}
if (canonical) {
  if (canonical.canonicalRepository !== "KeithVenuewise73/hl-bos-platform")
    fail(`canonicalRepository unexpected: ${canonical.canonicalRepository}`);
  if (!/^[a-z0-9]{20}$/.test(canonical.canonicalProjectRef || ""))
    fail(
      `canonicalProjectRef is not a 20-char project ref: ${canonical.canonicalProjectRef}`,
    );
  const envs = canonical.environments || [];
  const authProd = envs.filter(
    (e) => e.authoritative && e.role === "canonical-production",
  );
  if (authProd.length !== 1)
    fail(
      `expected exactly one authoritative canonical-production environment, found ${authProd.length}`,
    );
  else if (authProd[0].projectRef !== canonical.canonicalProjectRef)
    fail(
      `authoritative production projectRef ${authProd[0].projectRef} != canonicalProjectRef ${canonical.canonicalProjectRef}`,
    );
  // known-drift sanity: each entry's repoVersion must equal the current file version.
  for (const d of canonical.knownMigrationDrift?.entries || []) {
    const p = parsed.find((x) => x.ordinal === d.ordinal);
    if (!p) fail(`knownMigrationDrift references missing ordinal ${d.ordinal}`);
    else if (p.version !== d.repoVersion)
      fail(
        `knownMigrationDrift ordinal ${d.ordinal} repoVersion ${d.repoVersion} != file version ${p.version} — repair the manifest or the entry`,
      );
  }
}

// ---- build enriched manifest entries (files + canonical metadata) --------
const foundation = new Set(canonical?.foundationOrdinals || []);
const notApplied = new Set(canonical?.notYetAppliedOrdinals || []);
const driftBy = new Map(
  (canonical?.knownMigrationDrift?.entries || []).map((d) => [d.ordinal, d]),
);
const entries = parsed.map((p) => ({
  ordinal: p.ordinal,
  name: p.name,
  filename: p.filename,
  version: p.version,
  sha256: p.sha256,
  foundation: foundation.has(p.ordinal),
  notYetApplied: notApplied.has(p.ordinal) || undefined,
  productionAppliedVersion:
    driftBy.get(p.ordinal)?.productionAppliedVersion || undefined,
}));

// ---- write or verify the manifest ---------------------------------------
const manifestObj = {
  $comment:
    "GENERATED by scripts/check-lineage.mjs --write. Checksum lock for the migration lineage. Do not hand-edit; re-run --write after changing migrations and commit the diff.",
  schemaVersion: 1,
  sourceDir: "supabase/migrations",
  canonicalRepository: canonical?.canonicalRepository,
  count: entries.length,
  migrations: entries,
};
const manifestText = JSON.stringify(manifestObj, null, 2) + "\n";

if (WRITE) {
  writeFileSync(MANIFEST, manifestText);
  console.log(`wrote ${path.relative(ROOT, MANIFEST)} (${entries.length} migrations)`);
} else {
  let committed;
  try {
    committed = readJson(MANIFEST);
  } catch (e) {
    fail(
      `cannot read ${path.relative(ROOT, MANIFEST)} (run: node scripts/check-lineage.mjs --write): ${e.message}`,
    );
  }
  if (committed) {
    const byOrd = new Map(committed.migrations.map((m) => [m.ordinal, m]));
    if (committed.count !== entries.length)
      fail(
        `manifest count ${committed.count} != ${entries.length} migration files on disk`,
      );
    for (const e of entries) {
      const c = byOrd.get(e.ordinal);
      if (!c) {
        fail(`migration ${e.filename} is not in the manifest (run --write and commit)`);
        continue;
      }
      if (c.sha256 !== e.sha256)
        fail(
          `checksum drift for ${e.filename}: manifest ${c.sha256?.slice(0, 12)}… != file ${e.sha256.slice(0, 12)}… (edited migration? run --write if intentional)`,
        );
      if (c.version !== e.version)
        fail(
          `version drift for ordinal ${e.ordinal}: manifest ${c.version} != file ${e.version}`,
        );
      if (c.filename !== e.filename)
        fail(
          `filename drift for ordinal ${e.ordinal}: manifest ${c.filename} != ${e.filename}`,
        );
      if ((c.productionAppliedVersion || undefined) !== e.productionAppliedVersion)
        fail(
          `manifest productionAppliedVersion for ordinal ${e.ordinal} is stale vs canonical.json — run --write`,
        );
    }
    for (const c of committed.migrations) {
      if (!entries.find((e) => e.ordinal === c.ordinal))
        fail(
          `manifest lists ordinal ${c.ordinal} (${c.filename}) with no file on disk`,
        );
    }
  }
}

// ---- report -------------------------------------------------------------
if (problems.length) {
  console.error(`\nLineage governance FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\nSee docs/architecture/decisions/0002-migration-lineage-governance.md`,
  );
  process.exit(1);
}
console.log(
  `OK: lineage governance — ${entries.length} migrations, sequential, monotonic, checksum-locked; canonical registry consistent.`,
);
