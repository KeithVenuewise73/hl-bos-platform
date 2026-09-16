import "server-only";

/**
 * Storage.
 *
 * One JSON document per workspace, written atomically to disk. That is a
 * deliberate choice for this phase, not a placeholder:
 *
 *   - It works with no credentials, no network and no migration, so the app
 *     is usable the moment it is started.
 *   - A career database is one person's data, read and written by one process.
 *     It does not need a connection pool.
 *   - Everything is a plain serialisable record, so moving to PostgreSQL is a
 *     different implementation of `AtsStore`, not a rewrite of the app.
 *
 * The PostgreSQL schema this maps onto is written and committed
 * (supabase/migrations/…_hlbos_0048_ats_resume_optimizer.sql). It has NOT been
 * applied to any project and the Supabase-backed store is NOT built yet —
 * Settings says so on screen rather than implying a database that is not there.
 */

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { buildDemoDataset } from "@hl-bos/ats-resume";
import type {
  Application,
  CandidateProfile,
  CareerFact,
  CoverLetter,
  GeneratedResume,
  InterviewPrep,
  JobAnalysis,
  JobPosting,
  MasterResume,
} from "@hl-bos/ats-resume";

import { config } from "./config.ts";
import { getViewer } from "./session.ts";

export interface Workspace {
  readonly version: 1;
  readonly userId: string;
  // Mutable by design: `updateWorkspace` hands this object to a mutator and
  // writes the result. Everything that reaches a page is a copy of a record,
  // not a live reference into this object.
  profiles: CandidateProfile[];
  facts: CareerFact[];
  resumes: MasterResume[];
  jobs: JobPosting[];
  analyses: JobAnalysis[];
  generated: GeneratedResume[];
  applications: Application[];
  coverLetters: CoverLetter[];
  interviewPreps: InterviewPrep[];
  settings: Record<string, string>;
}

function emptyWorkspace(userId: string): Workspace {
  return {
    version: 1,
    userId,
    profiles: [],
    facts: [],
    resumes: [],
    jobs: [],
    analyses: [],
    generated: [],
    applications: [],
    coverLetters: [],
    interviewPreps: [],
    settings: {},
  };
}

/**
 * One file per owner.
 *
 * In local mode there is exactly one owner and one file. Once an identity
 * provider is configured there is one per account, so two people signed into
 * the same deployment never see each other's career database — the same
 * property `ats` row-level security gives the PostgreSQL path.
 *
 * The id is a UUID from the identity provider and is used as a path segment,
 * so it is validated rather than trusted: anything that is not a plain UUID is
 * refused instead of being written somewhere unexpected.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function storePathFor(ownerId: string): string {
  if (!UUID_RE.test(ownerId)) {
    throw new Error("Refusing to open a career store for a malformed owner id.");
  }
  const dir = config().dataDir;
  const base = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  return join(base, `workspace-${ownerId.toLowerCase()}.json`);
}

async function currentStorePath(): Promise<string> {
  const viewer = await getViewer();
  if (viewer.userId === null) {
    throw new Error("No signed-in user, so there is no career store to open.");
  }
  return storePathFor(viewer.userId);
}

/**
 * Cache keyed on the file's modification time — NOT a plain in-memory copy.
 *
 * The first version memoised the parsed workspace and trusted it. Testing the
 * running app caught what that costs: a user edited a resume line, the edit was
 * written to disk and flagged unsupported, and the export route then served a
 * document built from a stale copy — complete with the line that had just been
 * invalidated, and an `X-Claims-Dropped: 0` header stating that nothing had
 * been dropped.
 *
 * The cause is that route handlers and server actions do not reliably share
 * module state: each bundle can carry its own copy of this module, and each
 * copy its own cache. Re-stating the file on every read costs a syscall and
 * removes the whole class of bug. For a document someone sends to an employer,
 * serving yesterday's bytes is not an acceptable failure mode.
 */
const memo = new Map<string, { workspace: Workspace; mtimeMs: number }>();

/**
 * Seed the demo dataset on first run.
 *
 * Every seeded record is marked `isSample`, and Settings can delete all of
 * them in one action. A new user should see a working app, not an empty one —
 * but they should never be unable to tell the sample from their own data.
 */
function seed(userId: string): Workspace {
  const workspace = emptyWorkspace(userId);
  if (!config().seedDemoData) return workspace;
  const demo = buildDemoDataset(userId);
  workspace.profiles.push(demo.profile);
  workspace.facts.push(...demo.facts);
  workspace.resumes.push(demo.resume);
  workspace.jobs.push(demo.job);
  workspace.analyses.push(demo.analysis);
  workspace.generated.push(demo.generated);
  workspace.applications.push(...demo.applications);
  return workspace;
}

export async function loadWorkspace(): Promise<Workspace> {
  const viewer = await getViewer();
  if (viewer.userId === null) {
    throw new Error("No signed-in user, so there is no career store to open.");
  }
  const path = storePathFor(viewer.userId);
  try {
    const stats = await stat(path);
    const cached = memo.get(path);
    if (cached !== undefined && cached.mtimeMs === stats.mtimeMs)
      return cached.workspace;
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Workspace;
    const workspace = { ...emptyWorkspace(parsed.userId), ...parsed };
    memo.set(path, { workspace, mtimeMs: stats.mtimeMs });
    return workspace;
  } catch {
    // No store yet (or an unreadable one): start fresh and seed the sample.
    const workspace = seed(viewer.userId);
    await saveWorkspace(workspace);
    return workspace;
  }
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const path = await currentStorePath();
  await mkdir(dirname(path), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous file intact
  // rather than a truncated one. Losing a career database to a half-write
  // would be unforgivable for a tool whose whole job is remembering things.
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(workspace, null, 2), "utf8");
  await rename(temporary, path);
  const stats = await stat(path);
  memo.set(path, { workspace, mtimeMs: stats.mtimeMs });
}

/** Read, mutate, write. The only way the app changes stored state. */
export async function updateWorkspace<T>(
  mutate: (workspace: Workspace) => T | Promise<T>,
): Promise<T> {
  const workspace = await loadWorkspace();
  const result = await mutate(workspace);
  await saveWorkspace(workspace);
  return result;
}

/** Testing hook: forget every cached workspace. */
export function resetWorkspaceCache(): void {
  memo.clear();
}

// ---------------------------------------------------------------------------
// Convenience readers
// ---------------------------------------------------------------------------

export async function currentProfile(): Promise<CandidateProfile | undefined> {
  const workspace = await loadWorkspace();
  const real = workspace.profiles.find((p) => p.isSample !== true);
  return real ?? workspace.profiles[0];
}

export async function factsFor(profileId: string): Promise<CareerFact[]> {
  const workspace = await loadWorkspace();
  return workspace.facts.filter((f) => f.profileId === profileId);
}

export async function resumesFor(profileId: string): Promise<MasterResume[]> {
  const workspace = await loadWorkspace();
  return workspace.resumes.filter((r) => r.profileId === profileId);
}

export async function defaultResume(
  profileId: string,
): Promise<MasterResume | undefined> {
  const resumes = await resumesFor(profileId);
  return resumes.find((r) => r.isDefault) ?? resumes[resumes.length - 1];
}

export async function analysesFor(profileId: string): Promise<JobAnalysis[]> {
  const workspace = await loadWorkspace();
  return workspace.analyses
    .filter((a) => a.profileId === profileId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function storageDescription(): Promise<string> {
  const viewer = await getViewer();
  const where = viewer.userId === null ? config().dataDir : storePathFor(viewer.userId);
  return `JSON store at ${where}. One file per account, so two signed-in people never share a career database. Nothing leaves this machine except calls to the AI provider, if one is configured.`;
}
