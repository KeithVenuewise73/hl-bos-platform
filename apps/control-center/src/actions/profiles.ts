"use server";

import { revalidatePath } from "next/cache";

import type { PresenceResult } from "@/lib/presence";
import {
  assessProfile,
  buildProfileDraft,
  saveProfile,
  seedInternalProfiles,
} from "@/lib/profiles";
import { profileDeps } from "@/lib/profiles-runtime";

/**
 * The Business Profile buttons. Thin wrappers over lib/profiles.ts. Nothing
 * here publishes a page, registers a domain or contacts anyone.
 */

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

/** A saved homepage file is read here and used only for this one assessment. */
// Next.js accepts server-action bodies up to 1 MB; a homepage is far smaller.
const MAX_SAVED = 900 * 1024;

function refresh(id?: string) {
  revalidatePath("/profiles");
  revalidatePath("/presence");
  if (id) {
    revalidatePath(`/profiles/${id}`);
    revalidatePath(`/profiles/${id}/draft`);
  }
}

export async function seedProfiles(): Promise<PresenceResult> {
  const r = await seedInternalProfiles(profileDeps());
  refresh();
  return r;
}

export async function saveProfileForm(fd: FormData): Promise<PresenceResult> {
  const id = str(fd, "id");
  const r = await saveProfile(id, fd, profileDeps());
  refresh(id);
  return r;
}

export async function assessProfileForm(fd: FormData): Promise<PresenceResult> {
  const id = str(fd, "id");
  const file = fd.get("savedHomepage");
  let saved;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SAVED)
      return {
        ok: false,
        headline: "Not assessed.",
        meaning: "The saved homepage is over 900 KB.",
      };
    const source = str(fd, "savedSource").trim();
    if (!source)
      return {
        ok: false,
        headline: "Not assessed.",
        meaning:
          "Say where the saved copy came from (for example a GitHub repository and commit).",
      };
    saved = {
      url: "",
      html: await file.text(),
      source,
      savedAt: str(fd, "savedAt") || new Date().toISOString().slice(0, 10),
    };
  }
  const r = await assessProfile(id, saved, profileDeps());
  refresh(id);
  return r;
}

export async function buildProfileDraftForm(fd: FormData): Promise<PresenceResult> {
  const id = str(fd, "id");
  const r = await buildProfileDraft(id, profileDeps());
  refresh(id);
  return r;
}
