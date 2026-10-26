"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { ImportError, readImportFolder } from "@/lib/folder-import.ts";
import { startImport } from "@/lib/imports.ts";
import { createEvent, ValidationError } from "@/lib/repo/events.ts";
import { requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

/**
 * Create the event and start bringing the folder's photos in. The photos
 * arrive in the background; the event page shows them arriving and being
 * read. Nothing in the folder is changed.
 */
export async function importFolderAction(form: FormData): Promise<void> {
  const back = text(form, "back");
  const user = await requireUser(back || undefined);
  const fail = (message: string): never =>
    redirect(
      `${back || "/import"}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`,
    );

  let contents;
  try {
    contents = await readImportFolder(text(form, "folder"));
  } catch (e) {
    return fail(e instanceof ImportError ? e.message : "The folder could not be read.");
  }
  if (contents.photos.length === 0)
    return fail("There are no JPG, PNG or HEIC photos in that folder.");

  let eventId: string;
  try {
    eventId = createEvent(db(), user.organizationId, user.userId, {
      name: text(form, "name"),
      sport: text(form, "sport"),
      teamName: text(form, "team"),
      opponent: text(form, "opponent"),
      eventDate: text(form, "date"),
      location: text(form, "location"),
      season: text(form, "season"),
      notes: text(form, "notes"),
    });
  } catch (e) {
    return fail(
      e instanceof ValidationError ? e.message : "Could not create the event.",
    );
  }
  startImport({ org: user.organizationId, userId: user.userId, eventId, contents });
  redirect(
    `/events/${eventId}?notice=${encodeURIComponent(`Bringing in ${contents.photos.length} photos from ${contents.folder}. Jersey numbers are read as they arrive; you can leave this page.`)}`,
  );
}
