"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { eventForFolder } from "@/lib/folder-event.ts";
import { ImportError, readImportFolder } from "@/lib/folder-import.ts";
import { startImport } from "@/lib/imports.ts";
import { connectOnline, isConnected, startPublish } from "@/lib/online.ts";
import { kickQueue } from "@/lib/queue.ts";
import { readUnread } from "@/lib/queue-core.ts";
import { createEvent, ValidationError } from "@/lib/repo/events.ts";
import { getGallery, setGalleryEvents } from "@/lib/repo/galleries.ts";
import { requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

/**
 * "Publish to 5 Star", from DateSort: put a date's folder in a team gallery
 * and publish that gallery to 5starsportsmedia.com.
 *
 *   1. the folder's photos are found in JerseySort already (same event used
 *      again), or a new event is made for them;
 *   2. the event is added to the chosen team gallery (its other games stay);
 *   3. the photos are brought in (only the missing ones), and once every one
 *      has been tried, the gallery is published online.
 *
 * Jersey numbers are NOT read unless the switch is ticked: reading means
 * every photo is analysed, which costs money with Claude as the reader. The
 * photos come in as "not read yet" and can be read later from the game's page.
 *
 * Nothing in the folder is changed. Pressing it again is safe: what is in
 * JerseySort and online already is skipped.
 */
export async function publishFolderAction(form: FormData): Promise<void> {
  const back = text(form, "back");
  const user = await requireUser(back || undefined);
  const fail = (message: string): never =>
    redirect(
      `${back || "/publish"}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`,
    );

  const galleryId = text(form, "gallery");
  const jerseys = text(form, "jerseys") === "1";
  const gallery = getGallery(db(), user.organizationId, galleryId);
  if (gallery === undefined) return fail("Choose the team gallery to publish into.");
  if (gallery.active !== 1) {
    return fail(
      "That team gallery's link is switched off. Switch it back on first (on its page), or choose another.",
    );
  }

  let contents;
  try {
    contents = await readImportFolder(text(form, "folder"));
  } catch (e) {
    return fail(e instanceof ImportError ? e.message : "The folder could not be read.");
  }
  if (contents.photos.length === 0)
    return fail("There are no JPG, PNG or HEIC photos in that folder.");

  if (!(await isConnected())) {
    const r = await connectOnline();
    if (!r.ok) return fail(r.message);
  }

  let eventId = await eventForFolder(db(), user.organizationId, contents);
  const reused = eventId !== null;
  if (eventId === null) {
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
        e instanceof ValidationError ? e.message : "Could not create the game.",
      );
    }
  }
  setGalleryEvents(db(), user.organizationId, gallery.id, [
    ...gallery.eventIds,
    eventId,
  ]);
  const org = user.organizationId;
  // A game already in JerseySort with photos not read yet: read them too.
  if (jerseys && reused) {
    readUnread(db(), org, { eventId });
    kickQueue();
  }
  startImport({
    org,
    userId: user.userId,
    eventId,
    contents,
    analyze: jerseys,
    onDone: () => startPublish(org, gallery.id),
  });
  redirect(
    `/galleries/${gallery.id}?notice=${encodeURIComponent(
      `${reused ? "This game was already in JerseySort; it is now in this team gallery." : "Game created and added to this team gallery."} Bringing in ${contents.photos.length.toLocaleString("en-US")} photos from ${contents.folder}; the gallery goes online on 5starsportsmedia.com as soon as they are all in. ${jerseys ? "Jersey numbers are being read too." : "Jersey numbers are not being read: do that from the game's page if you want them."}`,
    )}#online`,
  );
}
