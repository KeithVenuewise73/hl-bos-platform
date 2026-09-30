"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import {
  ACCENTS,
  CREATOR_ROLES,
  InputRefusedError,
  OUTPUT_TYPES,
  TEMPLATE_KEYS,
  TONES,
  advanceStatus,
  checkConsent,
  findTemplate,
  generatePackage,
  normalizeDetails,
  readiness,
  validateDetails,
  type ConsentRecord,
  type HypeProject,
} from "@hl-bos/hype-video";

import { modelWriter } from "./ai.ts";
import { isId } from "./media.ts";
import { store } from "./store.ts";

/**
 * Server actions. Next checks the Origin of every server action request, so a
 * page on another site cannot drive these. Every action re-reads the project
 * from the store and re-checks it; nothing trusts what the form claims about
 * the project's state.
 */

const text = (form: FormData, key: string, max = 120): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
const oneOf = <T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T => ((allowed as readonly string[]).includes(value) ? (value as T) : fallback);

function requireId(id: string): string {
  if (!isId(id)) redirect("/projects");
  return id;
}

export interface CreateState {
  readonly problems: readonly string[];
  /**
   * What was submitted, echoed back. React resets a form after its action
   * runs, so without this a refused submission would wipe what the person
   * typed and make them start again.
   */
  readonly values?: {
    readonly name: string;
    readonly template: string;
    readonly creatorRole: string;
    readonly mediaRightsConfirmed: boolean;
    readonly featuresMinor: boolean;
    readonly guardianConsentConfirmed: boolean;
    readonly guardianName: string;
  };
}

export async function createProject(
  _prev: CreateState,
  form: FormData,
): Promise<CreateState> {
  const name = text(form, "name", 80);
  const featuresMinor = form.get("featuresMinor") === "on";
  const consent: ConsentRecord = {
    mediaRightsConfirmed: form.get("mediaRightsConfirmed") === "on",
    featuresMinor,
    guardianConsentConfirmed:
      featuresMinor && form.get("guardianConsentConfirmed") === "on",
    guardianName: featuresMinor ? text(form, "guardianName", 80) : "",
    confirmedAt: null,
  };

  const problems: string[] = [];
  if (name.length === 0)
    problems.push("Give the project a name, like “Jordan — Game Day vs. Central”.");
  problems.push(...checkConsent(consent).problems);
  if (problems.length > 0) {
    return {
      problems,
      values: {
        name,
        template: text(form, "template"),
        creatorRole: text(form, "creatorRole"),
        mediaRightsConfirmed: consent.mediaRightsConfirmed,
        featuresMinor,
        guardianConsentConfirmed: consent.guardianConsentConfirmed,
        guardianName: consent.guardianName,
      },
    };
  }

  const now = new Date().toISOString();
  const template = oneOf(text(form, "template"), TEMPLATE_KEYS, "game_day");
  const project: HypeProject = {
    id: randomUUID(),
    name,
    creatorRole: oneOf(text(form, "creatorRole"), CREATOR_ROLES, "parent"),
    template,
    tone: findTemplate(template)?.defaultTone ?? "cinematic",
    outputTypes: ["hype_script", "short_social_post", "full_video_prompt"],
    accent: "red",
    // Private, always, at creation. See the preview page for why sharing is
    // not offered in this version at all.
    visibility: "private",
    status: "draft",
    consent: { ...consent, confirmedAt: now },
    details: null,
    media: [],
    generations: [],
    packageStale: false,
    exportedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await store().insert(project);
  redirect(`/projects/${project.id}/media`);
}

export async function saveDetails(projectId: string, form: FormData): Promise<void> {
  const id = requireId(projectId);
  const details = normalizeDetails({
    athleteName: form.get("athleteName"),
    sport: form.get("sport"),
    teamOrSchool: form.get("teamOrSchool"),
    jerseyNumber: form.get("jerseyNumber"),
    position: form.get("position"),
    classYearOrAgeGroup: form.get("classYearOrAgeGroup"),
    achievements: form.get("achievements"),
    personalityNotes: form.get("personalityNotes"),
    sponsorName: form.get("sponsorName"),
    extraContext: form.get("extraContext"),
  });
  const saved = await store().update(id, (p) => {
    const valid = validateDetails(details, p.template).ok;
    return {
      ...p,
      details,
      status: valid ? advanceStatus(p.status, "details_complete") : p.status,
      packageStale:
        p.generations.length > 0 &&
        JSON.stringify(p.details) !== JSON.stringify(details),
    };
  });
  // Always save what was typed; only move on when it is complete.
  if (validateDetails(details, saved.template).ok) redirect(`/projects/${id}/template`);
  redirect(`/projects/${id}/details?check=1`);
}

export async function saveTemplate(projectId: string, form: FormData): Promise<void> {
  const id = requireId(projectId);
  const outputTypes = OUTPUT_TYPES.filter((t) =>
    form.getAll("outputTypes").includes(t),
  );
  await store().update(id, (p) => {
    const template = oneOf(text(form, "template"), TEMPLATE_KEYS, p.template);
    const tone = oneOf(text(form, "tone"), TONES, p.tone);
    const accent = oneOf(text(form, "accent"), ACCENTS, p.accent);
    const changed = template !== p.template || tone !== p.tone;
    return {
      ...p,
      template,
      tone,
      accent,
      outputTypes: outputTypes.length > 0 ? outputTypes : p.outputTypes,
      packageStale: p.packageStale || (p.generations.length > 0 && changed),
    };
  });
  redirect(`/projects/${id}`);
}

export async function generate(projectId: string): Promise<void> {
  const id = requireId(projectId);
  const project = await store().get(id);
  if (project === null) redirect("/projects");

  const ready = readiness(project);
  if (!ready.canGenerate || project.details === null) {
    redirect(`/projects/${id}?error=${encodeURIComponent(ready.missing.join(" "))}`);
  }

  let errorMessage: string | null = null;
  try {
    const writer = modelWriter();
    const record = await generatePackage(
      {
        template: project.template,
        tone: project.tone,
        outputTypes: project.outputTypes,
        details: project.details,
        media: project.media.map((m) => ({ kind: m.kind, label: m.originalName })),
      },
      writer === undefined ? {} : { writer },
    );
    await store().update(id, (p) => ({
      ...p,
      // Newest first, and every earlier version kept.
      generations: [record, ...p.generations].slice(0, 20),
      status: advanceStatus(p.status, "generated"),
      packageStale: false,
    }));
  } catch (error) {
    errorMessage =
      error instanceof InputRefusedError
        ? error.message
        : `Something went wrong writing the package: ${error instanceof Error ? error.message : "unknown error"}`;
  }
  // redirect() throws, so it must sit outside the try.
  redirect(
    errorMessage === null
      ? `/projects/${id}`
      : `/projects/${id}?error=${encodeURIComponent(errorMessage)}`,
  );
}

export async function deleteMedia(projectId: string, mediaId: string): Promise<void> {
  const id = requireId(projectId);
  if (!isId(mediaId)) redirect(`/projects/${id}/media`);
  const project = await store().get(id);
  const item = project?.media.find((m) => m.id === mediaId);
  if (item !== undefined) {
    await store().update(id, (p) => ({
      ...p,
      media: p.media.filter((m) => m.id !== mediaId),
    }));
    await store().deleteMedia(id, item);
  }
  redirect(`/projects/${id}/media`);
}

export async function deleteProject(projectId: string): Promise<void> {
  const id = requireId(projectId);
  await store().remove(id);
  redirect("/projects?deleted=1");
}
