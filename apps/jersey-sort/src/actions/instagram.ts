"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { longDate } from "@/lib/format.ts";
import { suggestCaption } from "@/lib/instagram-core.ts";
import { ValidationError, getEvent } from "@/lib/repo/events.ts";
import { createDraft, deleteDraft, getDraft, saveDraft } from "@/lib/repo/instagram.ts";
import { requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const why = (e: unknown, fallback: string) =>
  e instanceof ValidationError ? e.message : fallback;

/** Start a new Instagram post for a game, with a caption to begin from. */
export async function startInstagramPostAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const eventId = text(form, "event");
  const event = getEvent(db(), user.organizationId, eventId);
  if (event === undefined) redirect("/events");
  const brand =
    db().get<{ name: string }>("select name from organizations where id = :o", {
      o: user.organizationId,
    })?.name ?? "";
  let id: string;
  try {
    id = createDraft(
      db(),
      user.organizationId,
      user.userId,
      eventId,
      suggestCaption({ ...event, brand, dateText: longDate(event.event_date) }),
    );
  } catch (e) {
    redirect(
      `/events/${eventId}/instagram?error=${encodeURIComponent(why(e, "Could not start the post."))}`,
    );
  }
  redirect(`/events/${eventId}/instagram/${id}`);
}

export async function saveInstagramPostAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  const draft = getDraft(db(), user.organizationId, id);
  if (draft === undefined) redirect("/events");
  const here = `/events/${draft.event_id}/instagram/${id}`;
  try {
    saveDraft(db(), user.organizationId, id, {
      caption: text(form, "caption"),
      format: text(form, "format"),
      fit: text(form, "fit"),
      photoIds: form.getAll("photo").filter((v): v is string => typeof v === "string"),
    });
  } catch (e) {
    redirect(`${here}?error=${encodeURIComponent(why(e, "Could not save the post."))}`);
  }
  redirect(
    `${here}?notice=${encodeURIComponent("Saved. The pictures below are made from what you chose.")}`,
  );
}

export async function deleteInstagramPostAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  const draft = getDraft(db(), user.organizationId, id);
  if (draft === undefined) redirect("/events");
  deleteDraft(db(), user.organizationId, id);
  redirect(
    `/events/${draft.event_id}/instagram?notice=${encodeURIComponent("That Instagram post was deleted. Your photos are untouched.")}`,
  );
}
