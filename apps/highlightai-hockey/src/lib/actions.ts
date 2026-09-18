"use server";

/**
 * Everything the user can actually do.
 *
 * Server actions, so the browser never talks to the store or the vision
 * service directly. Each one validates its own input rather than trusting the
 * form: a form is a suggestion.
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  ACCEPTED_UPLOAD_TYPES,
  POSITIONS,
  advanceJob,
  buildReel,
  decide,
  findJerseyColor,
  newJob,
  retryJob,
  trim,
  renderPlan,
  type HighlightProject,
  type Position,
} from "@hl-bos/hockey-highlights";

import { config } from "./config.ts";
import { getViewer } from "./session.ts";
import { mediaRoot, updateWorkspace } from "./store.ts";
import { originalKeyFor, pathForKey } from "./media.ts";
import { visionProvider } from "./pipeline-runner.ts";
import { clipsFor, jobFor, mediaFor, projectById } from "./workspace.ts";

export interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

const OK: ActionResult = { ok: true, message: "" };

function problem(message: string): ActionResult {
  return { ok: false, message };
}

function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

// --- Projects ---------------------------------------------------------------

export async function createProject(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const name = text(form, "name");
  const athleteName = text(form, "athleteName");
  const jerseyNumber = text(form, "jerseyNumber");
  const jerseyColorId = text(form, "jerseyColorId");
  const position = text(form, "position");
  const gameDate = text(form, "gameDate");

  if (name.length === 0)
    return problem("Give the game a name so you can find it again.");
  if (athleteName.length === 0) return problem("Who is this reel for?");
  if (!/^\d{1,2}$/.test(jerseyNumber)) {
    return problem("A jersey number is one or two digits.");
  }
  if (findJerseyColor(jerseyColorId) === undefined) {
    return problem("Pick a jersey colour from the list.");
  }
  if (!POSITIONS.includes(position as Position)) {
    return problem("Pick a position.");
  }
  if (gameDate.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
    return problem("That game date is not a real date.");
  }

  const viewer = await getViewer();
  if (viewer.userId === null) return problem("You are not signed in.");

  const now = new Date().toISOString();
  const id = randomUUID();
  const project: HighlightProject = {
    id,
    ownerId: viewer.userId,
    name,
    gameDate,
    team: text(form, "team"),
    opponent: text(form, "opponent"),
    athlete: {
      id: randomUUID(),
      name: athleteName,
      jerseyNumber,
      jerseyColorId,
      position: position as Position,
    },
    createdAt: now,
    updatedAt: now,
  };

  await updateWorkspace((workspace) => {
    workspace.projects.push(project);
    workspace.jobs.push(newJob({ id: randomUUID(), projectId: id, now }));
  });
  revalidatePath("/");
  redirect(`/projects/${id}`);
}

export async function deleteProject(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const projectId = text(form, "projectId");
  await updateWorkspace((workspace) => {
    workspace.projects = workspace.projects.filter((p) => p.id !== projectId);
    workspace.jobs = workspace.jobs.filter((j) => j.projectId !== projectId);
    workspace.media = workspace.media.filter((m) => m.projectId !== projectId);
    workspace.tracks = workspace.tracks.filter((t) => t.projectId !== projectId);
    workspace.segments = workspace.segments.filter((s) => s.projectId !== projectId);
    workspace.events = workspace.events.filter((e) => e.projectId !== projectId);
    workspace.clips = workspace.clips.filter((c) => c.projectId !== projectId);
    workspace.reels = workspace.reels.filter((r) => r.projectId !== projectId);
  });
  revalidatePath("/");
  redirect("/");
}

// --- Upload -----------------------------------------------------------------

/**
 * Accept a game video.
 *
 * Checked on extension AND declared type, because browsers disagree about MOV
 * — Safari says `video/quicktime`, some Windows browsers say nothing at all.
 * Refusing a real game video because a browser was vague is a worse failure
 * than accepting a file whose extension is right.
 */
export async function uploadVideo(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const projectId = text(form, "projectId");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return problem("Choose a video file to upload.");
  }

  const lower = file.name.toLowerCase();
  const extensionOk = ACCEPTED_UPLOAD_EXTENSIONS.some((e) => lower.endsWith(e));
  const typeOk = file.type === "" || ACCEPTED_UPLOAD_TYPES.includes(file.type);
  if (!extensionOk || !typeOk) {
    return problem(
      `That file is not an MP4 or MOV. This version reads ${ACCEPTED_UPLOAD_EXTENSIONS.join(" and ")} only.`,
    );
  }
  if (file.size > config().maxUploadBytes) {
    const gb = (config().maxUploadBytes / 1024 ** 3).toFixed(1);
    return problem(`That file is larger than the ${gb}GB limit.`);
  }

  const viewer = await getViewer();
  if (viewer.userId === null) return problem("You are not signed in.");

  // A RELATIVE key under the shared media root, never an absolute path: the
  // vision service addresses the same file by the same key, and refuses
  // anything it cannot contain inside its own root.
  const storageKey = originalKeyFor(
    projectId,
    lower.endsWith(".mov") ? ".mov" : ".mp4",
  );
  const destination = pathForKey(mediaRoot(), storageKey);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await file.arrayBuffer()));

  await updateWorkspace((workspace) => {
    workspace.media = workspace.media.filter(
      (m) => !(m.projectId === projectId && m.role === "original"),
    );
    workspace.media.push({
      id: randomUUID(),
      projectId,
      role: "original",
      storageKey,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      // Null, not zero. Nothing has probed the file yet, and a UI showing
      // 0:00 would be stating a duration it does not know.
      durationSeconds: null,
      width: null,
      height: null,
      frameRate: null,
      createdAt: new Date().toISOString(),
    });
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, message: `${file.name} uploaded.` };
}

// --- Analysis ---------------------------------------------------------------

export async function startAnalysis(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const projectId = text(form, "projectId");
  // Imported lazily: pipeline-runner pulls in the provider stack, and a form
  // that only deletes a project should not pay for that.
  const { runAnalysis } = await import("./pipeline-runner.ts");
  try {
    const job = await runAnalysis(projectId);
    revalidatePath(`/projects/${projectId}`);
    if (job.status === "failed") {
      return problem(job.failure?.detail ?? "Analysis stopped.");
    }
    return { ok: true, message: "Analysis finished. Your clips are ready to review." };
  } catch (error) {
    return problem(
      error instanceof Error ? error.message : "Analysis could not start.",
    );
  }
}

export async function retryAnalysis(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const projectId = text(form, "projectId");
  try {
    await updateWorkspace((workspace) => {
      const job = jobFor(workspace, projectId);
      if (job === undefined) throw new Error("That project has no job to retry.");
      const next = retryJob(job, new Date().toISOString());
      workspace.jobs = workspace.jobs.map((j) => (j.id === next.id ? next : j));
    });
  } catch (error) {
    return problem(error instanceof Error ? error.message : "This cannot be retried.");
  }
  return startAnalysis(OK, form);
}

// --- Review -----------------------------------------------------------------

export async function decideClip(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const clipId = text(form, "clipId");
  const projectId = text(form, "projectId");
  const decision = text(form, "decision");
  if (decision !== "accepted" && decision !== "rejected" && decision !== "pending") {
    return problem("That is not a decision this app understands.");
  }
  const note = text(form, "note");
  await updateWorkspace((workspace) => {
    workspace.clips = workspace.clips.map((c) =>
      c.id === clipId ? decide(c, decision, note.length > 0 ? note : undefined) : c,
    );
  });
  revalidatePath(`/projects/${projectId}/review`);
  return OK;
}

export async function trimClip(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const clipId = text(form, "clipId");
  const projectId = text(form, "projectId");
  const start = Number(text(form, "start"));
  const end = Number(text(form, "end"));
  try {
    await updateWorkspace((workspace) => {
      workspace.clips = workspace.clips.map((c) =>
        c.id === clipId ? trim(c, start, end) : c,
      );
    });
  } catch (error) {
    return problem(error instanceof Error ? error.message : "That trim is not valid.");
  }
  revalidatePath(`/projects/${projectId}/review`);
  return OK;
}

// --- Reel -------------------------------------------------------------------

export async function buildHighlightReel(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const projectId = text(form, "projectId");
  const provider = visionProvider();

  const availability = await provider.availability();
  if (!availability.available) {
    return problem(availability.detail);
  }

  // The plan is built and persisted first, then rendered. Two steps because a
  // render can fail, and when it does the reel row must still exist with a
  // null media asset — which is what the page reads to decide NOT to offer a
  // download.
  let prepared: {
    plan: ReturnType<typeof renderPlan>;
    reelId: string;
  };

  try {
    prepared = await updateWorkspace((workspace) => {
      const project = projectById(workspace, projectId);
      const original = mediaFor(workspace, projectId, "original");
      if (project === undefined || original === undefined) {
        throw new Error("That project has no uploaded video.");
      }
      // buildReel filters to accepted clips itself; it is not trusting this
      // caller to have done so.
      const reel = buildReel(project, clipsFor(workspace, projectId), {
        id: randomUUID(),
        now: new Date().toISOString(),
      });
      workspace.reels = workspace.reels.filter((r) => r.projectId !== projectId);
      workspace.reels.push(reel);
      const job = jobFor(workspace, projectId);
      if (job !== undefined) {
        const next = advanceJob(job, "rendering", { now: new Date().toISOString() });
        workspace.jobs = workspace.jobs.map((j) => (j.id === next.id ? next : j));
      }
      return { plan: renderPlan(reel, original.storageKey), reelId: reel.id };
    });
  } catch (error) {
    return problem(
      error instanceof Error ? error.message : "The reel could not be planned.",
    );
  }

  const { plan, reelId } = prepared;

  try {
    const storageKey = await provider.renderReel(plan.sourceStorageKey, plan.cuts);
    await updateWorkspace((workspace) => {
      const assetId = randomUUID();
      workspace.media.push({
        id: assetId,
        projectId,
        role: "reel",
        storageKey,
        filename: "highlight-reel.mp4",
        contentType: "video/mp4",
        sizeBytes: null,
        durationSeconds: null,
        width: null,
        height: null,
        frameRate: null,
        createdAt: new Date().toISOString(),
      });
      workspace.reels = workspace.reels.map((r) =>
        r.id === reelId ? { ...r, mediaAssetId: assetId } : r,
      );
      const job = jobFor(workspace, projectId);
      if (job !== undefined) {
        const next = advanceJob(job, "completed", { now: new Date().toISOString() });
        workspace.jobs = workspace.jobs.map((j) => (j.id === next.id ? next : j));
      }
    });
  } catch (error) {
    // The reel row stays, with mediaAssetId still null — which is what the
    // page reads to decide whether to offer a download. A download button for
    // a file that does not exist is a control that controls nothing.
    return problem(
      error instanceof Error ? error.message : "The reel could not be rendered.",
    );
  }

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, message: "Your highlight reel is ready." };
}
