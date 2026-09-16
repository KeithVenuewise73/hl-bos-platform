/**
 * Turning a mutated workspace into the smallest set of writes that expresses it.
 *
 * Pure, so the decision that matters — which rows get written, in which order —
 * is unit tested rather than inferred from a screen that happened to render.
 *
 * The workspace is a tree: a posting owns its requirements, an analysis owns
 * its matrix rows, a generated resume owns every sentence in it. The database
 * is flat, and deliberately so — the CHECK constraints that enforce the
 * product's central promise (`unsupported_claims_are_never_exported`,
 * `not_evidenced_has_no_evidence`) live on those child tables. So the planner
 * flattens the tree and diffs each level by id, rather than replacing a
 * parent's children wholesale: `requirement_matches` cascades from
 * `job_requirements`, and deleting a posting's requirements to re-insert them
 * would silently take every analysis's evidence matrix with it.
 */

import type { GeneratedLine, GeneratedResume } from "@hl-bos/ats-resume";

import type { Workspace } from "./workspace.ts";
import {
  analysisToRow,
  applicationToRow,
  claimEvidenceToRow,
  coverLetterToRow,
  factToRow,
  generatedToRow,
  interviewPrepToRow,
  jobToRow,
  keywordToRow,
  lineToRow,
  matchToRow,
  profileToRow,
  requirementToRow,
  resumeToRow,
  resumeVersionToRow,
  type Row,
} from "./mapping.ts";
import { isEmptyPlan, reconcile, type Identified } from "./reconcile.ts";

/** Everything the store persists, in dependency order for inserts. */
const ORDER = [
  "candidate_profiles",
  "career_facts",
  "resumes",
  "resume_versions",
  "job_postings",
  "job_requirements",
  "job_keywords",
  "job_analyses",
  "requirement_matches",
  "generated_resumes",
  "generated_resume_bullets",
  "claim_evidence",
  "applications",
  "cover_letters",
  "interview_preps",
] as const;

export interface TablePlan {
  readonly table: string;
  readonly upserts: Row[];
  readonly deletedIds: readonly string[];
  /** Conflict target for the upsert. Defaults to the primary key, `id`. */
  readonly conflictTarget?: string;
  /**
   * Rows to remove by a non-primary-key column before the upserts run.
   *
   * Used for `claim_evidence`, whose rows have no id the app knows: a bullet's
   * evidence set is replaced by clearing that bullet's links and writing the
   * current ones.
   */
  readonly clear?: { readonly column: string; readonly values: readonly string[] };
}

/** A child row, lifted out of its parent so it can be diffed on its own. */
interface Child<T> extends Identified {
  readonly parentId: string;
  readonly item: T;
}

/** A generated sentence, with the position that fixes its place in a section. */
interface LineChild extends Identified {
  readonly parentId: string;
  readonly position: number;
  readonly item: GeneratedLine;
}

/** Build every table's write plan from the before/after pair. */
export function planWorkspaceWrites(
  before: Workspace,
  after: Workspace,
  ownerId: string,
): TablePlan[] {
  const plans: TablePlan[] = [];

  const add = <T extends Identified>(
    table: string,
    beforeRows: readonly T[],
    afterRows: readonly T[],
    toRow: (item: T, owner: string) => Row,
  ): void => {
    const plan = reconcile(beforeRows, afterRows);
    if (isEmptyPlan(plan)) return;
    plans.push({
      table,
      upserts: [...plan.inserted, ...plan.updated].map((item) => toRow(item, ownerId)),
      deletedIds: plan.deletedIds,
    });
  };

  /** Same, for a child level that has been flattened out of its parents. */
  const addChildren = <T>(
    table: string,
    beforeRows: readonly Child<T>[],
    afterRows: readonly Child<T>[],
    toRow: (item: T, parentId: string, owner: string) => Row,
  ): void => {
    const plan = reconcile(beforeRows, afterRows);
    if (isEmptyPlan(plan)) return;
    plans.push({
      table,
      upserts: [...plan.inserted, ...plan.updated].map((child) =>
        toRow(child.item, child.parentId, ownerId),
      ),
      deletedIds: plan.deletedIds,
    });
  };

  add("candidate_profiles", before.profiles, after.profiles, profileToRow);
  add("career_facts", before.facts, after.facts, factToRow);

  // Resumes carry an immutable parsed snapshot in a child table. The app
  // creates a new resume record rather than re-parsing an existing one, so the
  // version row is written with the insert and never rewritten.
  const resumePlan = reconcile(before.resumes, after.resumes);
  if (!isEmptyPlan(resumePlan)) {
    plans.push({
      table: "resumes",
      upserts: [...resumePlan.inserted, ...resumePlan.updated].map((r) =>
        resumeToRow(r, ownerId),
      ),
      deletedIds: resumePlan.deletedIds,
    });
    if (resumePlan.inserted.length > 0) {
      plans.push({
        table: "resume_versions",
        upserts: resumePlan.inserted.map((r) => resumeVersionToRow(r, ownerId)),
        deletedIds: [],
        conflictTarget: "resume_id,version_no",
      });
    }
  }

  add("job_postings", before.jobs, after.jobs, jobToRow);
  addChildren(
    "job_requirements",
    flatten(before.jobs, (job) => job.requirements),
    flatten(after.jobs, (job) => job.requirements),
    requirementToRow,
  );
  addChildren(
    "job_keywords",
    flatten(before.jobs, (job) => job.keywords),
    flatten(after.jobs, (job) => job.keywords),
    keywordToRow,
  );

  add("job_analyses", before.analyses, after.analyses, analysisToRow);
  addChildren(
    "requirement_matches",
    flatten(before.analyses, (analysis) => analysis.matches),
    flatten(after.analyses, (analysis) => analysis.matches),
    matchToRow,
  );

  add("generated_resumes", before.generated, after.generated, generatedToRow);
  planGeneratedLines(plans, before, after, ownerId);

  add("applications", before.applications, after.applications, applicationToRow);
  add("cover_letters", before.coverLetters, after.coverLetters, coverLetterToRow);
  add(
    "interview_preps",
    before.interviewPreps,
    after.interviewPreps,
    interviewPrepToRow,
  );

  // Inserts must run parents-first; deletes run in reverse.
  return plans.sort(
    (a, b) => ORDER.indexOf(a.table as never) - ORDER.indexOf(b.table as never),
  );
}

/**
 * Every generated sentence, and the evidence links that justify it.
 *
 * These two tables move together on purpose. A sentence without its links is
 * an assertion; the links without the sentence are orphans. Writing them in
 * one step is what keeps "verified against your own resume" true after a
 * round trip through storage.
 */
function planGeneratedLines(
  plans: TablePlan[],
  before: Workspace,
  after: Workspace,
  ownerId: string,
): void {
  const plan = reconcile(flattenLines(before.generated), flattenLines(after.generated));
  if (isEmptyPlan(plan)) return;

  const written = [...plan.inserted, ...plan.updated];
  plans.push({
    table: "generated_resume_bullets",
    // `lineToRow` derives included_in_export from the line's own verdict, so an
    // unsupported or unconfirmed claim cannot be recorded as exported — and if
    // some future caller tried, PostgreSQL rejects the row.
    upserts: written.map((child) =>
      lineToRow(child.item, child.parentId, child.position, ownerId),
    ),
    deletedIds: plan.deletedIds,
  });

  // A sentence's evidence links are rewritten whenever the sentence is, so the
  // audit trail cannot drift from the text it is supposed to back. Lines
  // deleted by id are not cleared here: the foreign key cascades.
  if (written.length === 0) return;
  const knownFactIds = new Set(after.facts.map((fact) => fact.id));
  plans.push({
    table: "claim_evidence",
    upserts: written.flatMap((child) =>
      evidenceFactIdsFor(child.item, knownFactIds).map((factId) =>
        claimEvidenceToRow(child.id, factId, ownerId),
      ),
    ),
    deletedIds: [],
    conflictTarget: "bullet_id,fact_id",
    clear: { column: "bullet_id", values: written.map((child) => child.id) },
  });
}

/** Lift a one-to-many relationship into a flat, diffable list. */
function flatten<P extends Identified, T extends Identified>(
  parents: readonly P[],
  children: (parent: P) => readonly T[],
): Child<T>[] {
  return parents.flatMap((parent) =>
    children(parent).map((item) => ({ id: item.id, parentId: parent.id, item })),
  );
}

/**
 * Every generated sentence in document order.
 *
 * The headline, each summary line and each experience bullet are all rows in
 * `generated_resume_bullets`; position is what lets the read path put them back
 * in the order the user approved rather than the order PostgreSQL returns them.
 */
function flattenLines(resumes: readonly GeneratedResume[]): LineChild[] {
  const out: LineChild[] = [];
  for (const resume of resumes) {
    const positions = new Map<string, number>();
    const push = (line: GeneratedLine): void => {
      const key = `${line.section}/${line.groupId ?? ""}`;
      const position = positions.get(key) ?? 0;
      positions.set(key, position + 1);
      out.push({ id: line.id, parentId: resume.id, position, item: line });
    };

    push(resume.headline);
    for (const line of resume.summary) push(line);
    for (const entry of resume.experience) {
      for (const bullet of entry.bullets) push(bullet);
    }
  }
  return out;
}

/**
 * The fact ids a line's evidence links may actually reference.
 *
 * Deduplicated, and filtered to facts that exist: `claim_evidence.fact_id` is a
 * foreign key, so one dangling id would abort the whole save rather than lose
 * one link. The sentence is still written, with its verdict intact — and the
 * verdict, not the link, is what decides whether it may be exported.
 */
function evidenceFactIdsFor(line: GeneratedLine, known: ReadonlySet<string>): string[] {
  return [...new Set(line.evidenceFactIds)].filter((id) => known.has(id));
}
