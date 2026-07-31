#!/usr/bin/env node
// ONLINE migration drift detector — runs only in the gated db-migrate workflow,
// where `supabase migration list` output is available (the repo is linked to the
// canonical project). It confirms production's applied migration set matches what
// .hlbos/canonical.json declares, so an out-of-band apply, a wrong target, or an
// unexpected lineage change fails the run.
//
// It does NOT fail merely because a repo migration is pending (local-only, not
// yet applied) — that is normal before an apply. It DOES fail when:
//   • an expected-applied migration's version is missing from the remote, or
//   • the remote has an applied version the repo does not know about (foreign /
//     out-of-band), or
//   • a not-yet-applied migration turns up already applied on the remote.
//
// Input: `supabase migration list` output on stdin, or --file <path> (for tests).
//   supabase migration list | node scripts/check-lineage-drift.mjs
//   node scripts/check-lineage-drift.mjs --file scripts/__fixtures__/migration-list-sample.txt

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonical = JSON.parse(
  readFileSync(path.join(ROOT, ".hlbos/canonical.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(path.join(ROOT, ".hlbos/migration-lineage.json"), "utf8"),
);

const fileArg = process.argv.indexOf("--file");
const input =
  fileArg !== -1
    ? readFileSync(process.argv[fileArg + 1], "utf8")
    : readFileSync(0, "utf8");

// Parse `supabase migration list`: rows are "<local> │ <remote> │ <time>".
// Split each line on the box separator (│) or ASCII pipe, take the first two
// columns, and pull any 14-digit version token from each.
const V = /\b(\d{14})\b/;
const remote = new Set();
const local = new Set();
for (const line of input.split("\n")) {
  if (!/[│|]/.test(line)) continue;
  const cols = line.split(/[│|]/);
  const l = cols[0] && V.exec(cols[0]);
  const r = cols[1] && V.exec(cols[1]);
  if (l) local.add(l[1]);
  if (r) remote.add(r[1]);
}
if (remote.size === 0) {
  console.error(
    "drift-check: could not parse any remote versions from `supabase migration list` output.",
  );
  process.exit(1);
}

// Declared expected state from the canonical registry + manifest.
const knownVersions = new Set();
const expectedApplied = new Set();
const mustNotBeApplied = new Set();
for (const m of manifest.migrations) {
  knownVersions.add(m.version);
  if (m.productionAppliedVersion) knownVersions.add(m.productionAppliedVersion);
  const appliedVersion = m.productionAppliedVersion || m.version;
  if (m.notYetApplied) mustNotBeApplied.add(appliedVersion);
  else expectedApplied.add(appliedVersion);
}

const problems = [];
for (const v of expectedApplied)
  if (!remote.has(v))
    problems.push(
      `expected-applied version ${v} is NOT present on the remote (drift or not applied)`,
    );
for (const v of remote)
  if (!knownVersions.has(v))
    problems.push(
      `remote has an UNKNOWN applied version ${v} — foreign or out-of-band migration`,
    );
for (const v of mustNotBeApplied)
  if (remote.has(v))
    problems.push(
      `version ${v} is marked not-yet-applied but IS applied on the remote`,
    );

if (problems.length) {
  console.error(
    `\nMigration drift-check FAILED (${problems.length}) against ${canonical.canonicalProjectRef}:`,
  );
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `OK: production applied set matches the canonical declaration (${expectedApplied.size} applied, ${remote.size} remote rows).`,
);
