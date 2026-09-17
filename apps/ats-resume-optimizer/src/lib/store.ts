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

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { buildDemoDataset } from "@hl-bos/ats-resume";
import { emptyWorkspace, type Workspace } from "./store/workspace.ts";

export type { Workspace } from "./store/workspace.ts";
import type {
  CandidateProfile,
  CareerFact,
  JobAnalysis,
  MasterResume,
} from "@hl-bos/ats-resume";

import { config } from "./config.ts";
import { currentMode, getViewer, serverSupabase } from "./session.ts";
import {
  loadWorkspaceFromSupabase,
  saveWorkspaceToSupabase,
} from "./store/supabase-store.ts";

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

  if (currentMode() === "authenticated") {
    const client = await serverSupabase();
    if (client === null) {
      throw new Error(
        "Signed-in mode is active but no database client could be built.",
      );
    }
    return loadWorkspaceFromSupabase(client, viewer.userId);
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
  const before = await loadWorkspace();
  // The mutator edits in place, so the SQL path would have nothing to diff
  // against without a pristine copy. Cloning is also what stops a failed write
  // leaving a half-mutated workspace in the in-memory cache.
  const working = structuredClone(before);
  const result = await mutate(working);
  await persist(before, working);
  return result;
}

/** Write the mutated workspace, by whichever route this installation uses. */
async function persist(before: Workspace, after: Workspace): Promise<void> {
  if (currentMode() !== "authenticated") {
    await saveWorkspace(after);
    return;
  }
  const viewer = await getViewer();
  const client = await serverSupabase();
  if (client === null || viewer.userId === null) {
    throw new Error("Signed-in mode is active but no database client could be built.");
  }
  await saveWorkspaceToSupabase(client, before, after, viewer.userId);
}

/**
 * Erase everything this account owns.
 *
 * Both backends, because a user who clicks delete does not know or care which
 * one this installation runs. In SQL the deletes are scoped by RLS to the
 * signed-in user, so this cannot reach another account's rows even if the
 * filter were wrong. On the file store the file itself is removed.
 *
 * The Supabase Auth login is NOT deleted: that needs a service-role key and
 * this app holds none by design. Settings says so on screen instead of
 * implying otherwise.
 */
export async function deleteEverything(): Promise<void> {
  const viewer = await getViewer();
  if (viewer.userId === null) {
    throw new Error("No signed-in user, so there is no account to delete.");
  }

  if (currentMode() === "authenticated") {
    const client = await serverSupabase();
    if (client === null) {
      throw new Error(
        "Signed-in mode is active but no database client could be built.",
      );
    }
    // Parents only: every child table cascades from these, and the profile
    // cascade carries the rest. Ordered so nothing is orphaned mid-way if one
    // statement fails.
    for (const table of [
      "product_events",
      "applications",
      "interview_preps",
      "cover_letters",
      "generated_resumes",
      "job_analyses",
      "job_postings",
      "resumes",
      "career_facts",
      "candidate_profiles",
    ]) {
      const { error } = await client
        .schema("ats")
        .from(table)
        .delete()
        .eq("owner_id", viewer.userId);
      // product_events may not exist yet if migration 0049 is unapplied.
      // A missing analytics table must not stop an account deletion.
      if (error !== null && table !== "product_events") {
        throw new Error(`Could not delete ats.${table}: ${error.message}`);
      }
    }
    return;
  }

  const path = storePathFor(viewer.userId);
  memo.delete(path);
  await rm(path, { force: true });
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
  if (currentMode() === "authenticated") {
    const url = config().supabaseUrl ?? "the configured project";
    return `PostgreSQL (${url}), schema \`ats\`. Every query runs under your own session, so row-level security — not application code — is what keeps one account's career database invisible to another.`;
  }
  const viewer = await getViewer();
  const where = viewer.userId === null ? config().dataDir : storePathFor(viewer.userId);
  return `JSON store at ${where}. One file per account. Nothing leaves this machine except calls to the AI provider, if one is configured.`;
}
