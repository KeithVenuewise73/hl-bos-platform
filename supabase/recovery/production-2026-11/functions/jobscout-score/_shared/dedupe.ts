// One job, posted many times.
//
// Three shapes of duplicate, all observed on live data: the same job from two
// SOURCES, one job posted per LOCATION, and the same posting listed twice by
// one board.
//
// EQUALITY IS NOT ENOUGH: six Tile Shop rows carried FIVE distinct
// descriptions. Same template, small edits. Hashing the text, however
// carefully normalized, collapses none of them.

export interface DupJob {
  id: number;
  company_id: number;
  title: string;
  location?: string | null;
  description?: string | null;
  comp_text?: string | null;
}

/** Case, punctuation and spacing carry no meaning in a job title. */
export const normTitle = (t: string): string =>
  (t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Overlapping 3-word shingles. Single words would match on boilerplate alone —
 * every posting at one employer shares its benefits and EEO paragraphs.
 */
export function shingles(text: string, n = 3): Set<string> {
  const w = (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter(Boolean);
  const out = new Set<string>();
  if (w.length < n) {
    if (w.length) out.add(w.join(" "));
    return out;
  }
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Jaccard overlap of two shingle sets: 1 identical, 0 nothing in common. */
export function similarity(a: string, b: string): number {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const s of A) if (B.has(s)) shared++;
  return shared / (A.size + B.size - shared);
}

/**
 * Same employer AND same normalized title AND near-identical descriptions — or
 * one of them has no description to disagree with.
 *
 * When in doubt this SPLITS: a wrong split costs a model call; a wrong merge
 * hides a job.
 */
export const SIMILAR_ENOUGH = 0.6;

export function sameJob(a: DupJob, b: DupJob): boolean {
  if (a.company_id !== b.company_id) return false;
  if (normTitle(a.title) !== normTitle(b.title)) return false;
  const da = a.description ?? "", db = b.description ?? "";
  // A description-less row is the same opportunity seen with less information.
  if (!da || !db) return true;
  return similarity(da, db) >= SIMILAR_ENOUGH;
}

/** The copy worth scoring: the one carrying the most information. */
export function representative<T extends DupJob>(group: T[]): T {
  return [...group].sort((x, y) => {
    const d = (y.description?.length ?? 0) - (x.description?.length ?? 0);
    if (d) return d;
    const c = (y.comp_text ? 1 : 0) - (x.comp_text ? 1 : 0);
    if (c) return c;
    return x.id - y.id; // stable
  })[0];
}

/**
 * Every location the group was posted in. Scoring one copy and copying its
 * verdict would judge the job on ONE of those — pick a Colorado row and a
 * Buffalo-commutable job reads as a relocation.
 */
export function mergedLocation(group: DupJob[]): string | null {
  const seen: string[] = [];
  for (const j of group) {
    const l = (j.location ?? "").trim();
    if (l && !seen.includes(l)) seen.push(l);
  }
  if (!seen.length) return null;
  if (seen.length === 1) return seen[0];
  return `${seen.join("; ")} (${seen.length} locations)`;
}

/** Partition into groups of the same job. */
export function groupDuplicates<T extends DupJob>(jobs: T[]): T[][] {
  const groups: T[][] = [];
  for (const j of jobs) {
    // Compare against the group's representative rather than any member, so a
    // chain of drifting near-matches cannot merge two clearly-different jobs.
    const hit = groups.find((g) => sameJob(representative(g), j));
    if (hit) hit.push(j);
    else groups.push([j]);
  }
  return groups;
}
