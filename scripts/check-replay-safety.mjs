#!/usr/bin/env node
// Replay safety: would `supabase db push` re-run SQL that production already ran?
//
// Supabase identifies a migration by its timestamp VERSION, not its name or
// number. Production (snapshot: .hlbos/production-ledger.json, verified
// 2026-11-05) already ran several of main's migrations under DIFFERENT
// versions, so a plain push would run them again. This script classifies every
// file in supabase/migrations against the ledger:
//
//   applied            same version is in production's ledger
//   replay_hazard      same name already ran in production under another version
//                      (content equal or not) — push would run it AGAIN
//   new                not in production at all — genuinely pending
//
// It fails (exit 1) when:
//   - a replay hazard appears that is not in KNOWN_HAZARDS (a new one), or
//   - any recovered/archived/proposed SQL directory sits under supabase/migrations.
//
// `--repair` prints the ledger-only commands that make the known hazards safe
// (mark as applied); running them is a production change needing approval.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGR = path.join(ROOT, "supabase/migrations");
const ledger = JSON.parse(
  readFileSync(path.join(ROOT, ".hlbos/production-ledger.json"), "utf8"),
);

/** Hazards known on 2026-11-05 and documented in docs/products/growth-intelligence/phase7-release-candidate.md. */
export const KNOWN_HAZARDS = new Set([
  "hlbos_0029_venture_studio_foundation",
  "hlbos_0031_transformation_intake",
  "hlbos_0032_vstudio_discovery_metadata",
  "hlbos_0033_vstudio_intelligence_layer",
  "hlbos_0034_vstudio_level1_triage",
  "hlbos_0035_vstudio_portfolios",
  "hlbos_0036_vstudio_rising",
  "hlbos_0037_vstudio_pain_clusters",
  "hlbos_0038_vstudio_analysis_levels",
  "hlbos_0039_vstudio_provable_gate",
  "hlbos_0040_pain_signal_url_whitespace",
  "hlbos_0041_pain_discovery_foundation",
  "hlbos_0042_pain_evidence_backfill",
  "hlbos_0043_capability_intelligence",
  "hlbos_0046_social_publishing",
  "hlbos_0047_social_deny_mutation_search_path",
  "hlbos_0048_ats_resume_optimizer",
  "hlbos_0051_hype_video",
  "hlbos_0044_capability_extraction",
  "hlbos_0045_reframe_pain_portfolio",
]);

/** Production ran these under DIFFERENT names (split or renamed); main's file must never run again. */
export const RENAMED = {
  hlbos_0044_capability_extraction: [
    "hlbos_0044a_capability_vocabulary",
    "hlbos_0044b_capability_extraction_function",
  ],
  hlbos_0045_reframe_pain_portfolio: ["hlbos_0045_reframe_pain_portfolio_honestly"],
};

const norm = (t) =>
  t
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter(Boolean)
    .map((l) => l.replace(/\s+/g, " "))
    .join(" ");
const sha = (s) => createHash("sha256").update(s).digest("hex");

export function classify() {
  const byVersion = new Map(ledger.migrations.map((m) => [m.version, m]));
  const byName = new Map(ledger.migrations.map((m) => [m.name, m]));
  const out = [];
  for (const f of readdirSync(MIGR)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const version = f.slice(0, 14);
    const name = f.slice(15, -4);
    if (byVersion.has(version)) {
      out.push({ file: f, version, name, status: "applied" });
      continue;
    }
    const other =
      byName.get(name) ?? (RENAMED[name] ? byName.get(RENAMED[name][0]) : undefined);
    if (other) {
      const same =
        other.normalized_sha256 &&
        other.normalized_sha256 === sha(norm(readFileSync(path.join(MIGR, f), "utf8")));
      out.push({
        file: f,
        version,
        name,
        status: "replay_hazard",
        productionVersion: other.version,
        sameContent: !!same,
      });
    } else out.push({ file: f, version, name, status: "new" });
  }
  return out;
}

export function archivedUnderMigrations() {
  const bad = [];
  for (const e of readdirSync(MIGR)) {
    const p = path.join(MIGR, e);
    if (statSync(p).isDirectory()) bad.push(e);
  }
  for (const d of ["supabase/recovery", "supabase/recovered", "supabase/proposed"]) {
    if (existsSync(path.join(ROOT, d)) && path.resolve(ROOT, d).startsWith(MIGR))
      bad.push(d);
  }
  return bad;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const rows = classify();
  const counts = rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  const unknown = rows.filter(
    (r) => r.status === "replay_hazard" && !KNOWN_HAZARDS.has(r.name),
  );
  const nested = archivedUnderMigrations();
  console.log(`replay safety: ${JSON.stringify(counts)}`);
  if (process.argv.includes("--repair")) {
    console.log(
      "# Ledger-only repair for KNOWN hazards (production change; needs approval). Each marks main's version as applied:",
    );
    for (const r of rows.filter((x) => x.status === "replay_hazard"))
      console.log(
        `supabase migration repair --status applied ${r.version}   # ${r.name}: ran in production as ${r.productionVersion}${r.sameContent ? " (same SQL)" : " (DIFFERENT SQL — review first)"}`,
      );
  }
  if (unknown.length || nested.length) {
    for (const r of unknown)
      console.error(
        `NEW replay hazard: ${r.file} already ran in production as ${r.productionVersion}`,
      );
    for (const n of nested)
      console.error(
        `archived/proposed SQL must not live under supabase/migrations: ${n}`,
      );
    process.exit(1);
  }
  console.log("OK: no new replay hazards; no archived SQL under supabase/migrations.");
}
