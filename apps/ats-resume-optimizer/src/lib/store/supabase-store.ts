import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Workspace } from "./workspace.ts";
import { planWorkspaceWrites } from "./write-plan.ts";
import {
  rowToAnalysis,
  rowToKeyword,
  rowToLine,
  rowToMatch,
  rowToRequirement,
  rowToApplication,
  rowToCoverLetter,
  rowToFact,
  rowToGenerated,
  rowToInterviewPrep,
  rowToJob,
  rowToProfile,
  rowToResume,
  type Row,
} from "./mapping.ts";
/**
 * The PostgreSQL-backed store.
 *
 * Every query runs under the signed-in user's session, so row-level security —
 * not this code — is what stops one person reading another's career database.
 * There is no service-role key anywhere in this app; if a query returns rows
 * this user should not see, the bug is in the schema's policies and belongs
 * there, not in a filter written here.
 *
 * Writes are diff-driven: `saveWorkspaceToSupabase` receives the snapshot that
 * was loaded and the object after mutation, and issues only the inserts,
 * updates and deletes that actually changed. Rewriting every row on every save
 * would work and would be wrong — it would churn a thousand rows to edit one
 * sentence, and destroy the `updated_at` audit trail while doing it.
 */

async function selectAll(client: SupabaseClient, table: string): Promise<Row[]> {
  const { data, error } = await client.schema("ats").from(table).select("*");
  if (error !== null) {
    throw new Error(`Could not read ats.${table}: ${error.message}`);
  }
  return (data ?? []) as Row[];
}

export async function loadWorkspaceFromSupabase(
  client: SupabaseClient,
  userId: string,
): Promise<Workspace> {
  const [
    profiles,
    facts,
    resumes,
    versions,
    jobs,
    requirements,
    keywords,
    analyses,
    matches,
    generated,
    lines,
    evidence,
    applications,
    coverLetters,
    interviewPreps,
  ] = await Promise.all([
    selectAll(client, "candidate_profiles"),
    selectAll(client, "career_facts"),
    selectAll(client, "resumes"),
    selectAll(client, "resume_versions"),
    selectAll(client, "job_postings"),
    selectAll(client, "job_requirements"),
    selectAll(client, "job_keywords"),
    selectAll(client, "job_analyses"),
    selectAll(client, "requirement_matches"),
    selectAll(client, "generated_resumes"),
    selectAll(client, "generated_resume_bullets"),
    selectAll(client, "claim_evidence"),
    selectAll(client, "applications"),
    selectAll(client, "cover_letters"),
    selectAll(client, "interview_preps"),
  ]);

  const parsedByResume = new Map<string, unknown>();
  for (const version of versions) {
    parsedByResume.set(String(version["resume_id"]), version["parsed"]);
  }

  const group = <T>(
    rows: Row[],
    key: string,
    map: (row: Row) => T,
  ): Map<string, T[]> => {
    const out = new Map<string, T[]>();
    for (const row of rows) {
      const id = String(row[key]);
      out.set(id, [...(out.get(id) ?? []), map(row)]);
    }
    return out;
  };

  const requirementsByJob = group(requirements, "job_posting_id", rowToRequirement);
  const keywordsByJob = group(keywords, "job_posting_id", rowToKeyword);

  // The matrix rows carry ids; the requirement text and importance they are
  // displayed with belong to the requirement, so they are joined back here
  // rather than stored twice and allowed to disagree.
  const requirementById = new Map(
    requirements.map((row) => [String(row["id"]), rowToRequirement(row)]),
  );
  const matchesByAnalysis = group(matches, "analysis_id", (row) => {
    const match = rowToMatch(row);
    const requirement = requirementById.get(match.requirementId);
    return requirement === undefined
      ? match
      : { ...match, requirement: requirement.text, importance: requirement.importance };
  });

  // Each generated line's evidence is a join table, so a line can never be
  // reassembled while quietly losing what backs it.
  const factTextById = new Map(
    facts.map((row) => [String(row["id"]), text(row["fact_text"])]),
  );
  const evidenceByBullet = new Map<string, { ids: string[]; texts: string[] }>();
  for (const row of evidence) {
    const bulletId = String(row["bullet_id"]);
    const factId = String(row["fact_id"]);
    const current = evidenceByBullet.get(bulletId) ?? { ids: [], texts: [] };
    current.ids.push(factId);
    current.texts.push(factTextById.get(factId) ?? "");
    evidenceByBullet.set(bulletId, current);
  }

  const orderedLines = [...lines].sort(
    (a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0),
  );
  const linesByResume = group(orderedLines, "generated_resume_id", (row) => {
    const attached = evidenceByBullet.get(String(row["id"]));
    const line = rowToLine(row, attached?.texts ?? []);
    return { ...line, evidenceFactIds: attached?.ids ?? [] };
  });

  return {
    version: 1,
    userId,
    profiles: profiles.map((row) => rowToProfile(row, userId)),
    facts: facts.map(rowToFact),
    resumes: resumes.map((row) =>
      rowToResume(row, parsedByResume.get(String(row["id"])) ?? null),
    ),
    jobs: jobs.map((row) =>
      rowToJob(
        row,
        requirementsByJob.get(String(row["id"])) ?? [],
        keywordsByJob.get(String(row["id"])) ?? [],
      ),
    ),
    analyses: analyses.map((row) =>
      rowToAnalysis(row, matchesByAnalysis.get(String(row["id"])) ?? []),
    ),
    generated: generated.map((row) =>
      rowToGenerated(row, linesByResume.get(String(row["id"])) ?? []),
    ),
    applications: applications.map(rowToApplication),
    coverLetters: coverLetters.map(rowToCoverLetter),
    interviewPreps: interviewPreps.map(rowToInterviewPrep),
  };
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Anything else — an object, an array, a symbol — is not a scalar column, and
  // "[object Object]" in a resume field would be worse than an empty one.
  return "";
}

export async function saveWorkspaceToSupabase(
  client: SupabaseClient,
  before: Workspace,
  after: Workspace,
  ownerId: string,
): Promise<void> {
  const plans = planWorkspaceWrites(before, after, ownerId);

  // Deletes run child-first (reverse dependency order) so a parent is never
  // removed while something still points at it, then writes run parent-first.
  for (const plan of [...plans].reverse()) {
    if (plan.deletedIds.length > 0) {
      const { error } = await client
        .schema("ats")
        .from(plan.table)
        .delete()
        .in("id", [...plan.deletedIds]);
      if (error !== null) {
        throw new Error(`Could not delete from ats.${plan.table}: ${error.message}`);
      }
    }
    // A table whose rows the app does not identify by id — claim_evidence —
    // is cleared by the column that owns them, so the links for a rewritten
    // sentence are replaced rather than accumulated.
    if (plan.clear !== undefined && plan.clear.values.length > 0) {
      const { error } = await client
        .schema("ats")
        .from(plan.table)
        .delete()
        .in(plan.clear.column, [...plan.clear.values]);
      if (error !== null) {
        throw new Error(`Could not clear ats.${plan.table}: ${error.message}`);
      }
    }
  }

  for (const plan of plans) {
    if (plan.upserts.length === 0) continue;
    const { error } = await client
      .schema("ats")
      .from(plan.table)
      .upsert(plan.upserts, { onConflict: plan.conflictTarget ?? "id" });
    if (error !== null) {
      throw new Error(`Could not write ats.${plan.table}: ${error.message}`);
    }
  }
}
