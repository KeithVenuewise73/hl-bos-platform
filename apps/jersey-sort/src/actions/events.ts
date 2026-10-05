"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { kickQueue } from "@/lib/queue.ts";
import { reanalyze, retryFailed } from "@/lib/queue-core.ts";
import {
  createEvent,
  deleteEvent,
  updateEvent,
  ValidationError,
  type EventInput,
} from "@/lib/repo/events.ts";
import { requireUser } from "@/lib/session.ts";
import { removeObjects } from "@/lib/storage.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

function input(form: FormData): EventInput {
  return {
    name: text(form, "name"),
    sport: text(form, "sport"),
    teamName: text(form, "team"),
    opponent: text(form, "opponent"),
    eventDate: text(form, "date"),
    location: text(form, "location"),
    season: text(form, "season"),
    notes: text(form, "notes"),
  };
}

export async function createEventAction(form: FormData): Promise<void> {
  const user = await requireUser();
  let id: string;
  try {
    id = createEvent(db(), user.organizationId, user.userId, input(form));
  } catch (e) {
    redirect(
      `/events/new?error=${encodeURIComponent(e instanceof ValidationError ? e.message : "Could not create the event.")}`,
    );
  }
  redirect(
    `/events/${id}?notice=${encodeURIComponent("Event created. Now add the photos.")}`,
  );
}

export async function updateEventAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  try {
    updateEvent(db(), user.organizationId, id, input(form));
  } catch (e) {
    redirect(
      `/events/${id}/edit?error=${encodeURIComponent(e instanceof ValidationError ? e.message : "Could not save.")}`,
    );
  }
  redirect(`/events/${id}?notice=Saved.`);
}

export async function deleteEventAction(form: FormData): Promise<void> {
  const user = await requireUser();
  // An organization decision (jerseysort.settings.manage in 0052).
  if (user.role !== "owner") {
    redirect(
      `/events/${text(form, "id")}/edit?error=${encodeURIComponent("Only the organization's owner can delete an event.")}`,
    );
  }
  if (text(form, "confirm") !== "delete") {
    redirect(
      `/events/${text(form, "id")}/edit?error=${encodeURIComponent('Type "delete" to confirm.')}`,
    );
  }
  const paths = deleteEvent(db(), user.organizationId, text(form, "id"));
  await removeObjects(config().dataDir, paths);
  revalidatePath("/", "layout");
  redirect(`/events?notice=${encodeURIComponent("Event and its photos deleted.")}`);
}

export async function retryFailedAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const eventId = text(form, "eventId") || undefined;
  const photoId = text(form, "photoId") || undefined;
  const n = retryFailed(db(), user.organizationId, {
    ...(eventId ? { eventId } : {}),
    ...(photoId ? { photoId } : {}),
  });
  kickQueue();
  revalidatePath("/", "layout");
  const back = text(form, "returnTo").startsWith("/") ? text(form, "returnTo") : "/";
  redirect(
    `${back}${back.includes("?") ? "&" : "?"}notice=${encodeURIComponent(`${n} photo${n === 1 ? "" : "s"} queued for another try.`)}`,
  );
}

export async function reanalyzeAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const eventId = text(form, "eventId") || undefined;
  const photoId = text(form, "photoId") || undefined;
  const n = reanalyze(db(), user.organizationId, {
    ...(eventId ? { eventId } : {}),
    ...(photoId ? { photoId } : {}),
  });
  kickQueue();
  revalidatePath("/", "layout");
  const back = text(form, "returnTo").startsWith("/") ? text(form, "returnTo") : "/";
  redirect(
    `${back}${back.includes("?") ? "&" : "?"}notice=${encodeURIComponent(`${n} photo${n === 1 ? "" : "s"} queued for analysis. Numbers a person confirmed or removed are kept.`)}`,
  );
}
