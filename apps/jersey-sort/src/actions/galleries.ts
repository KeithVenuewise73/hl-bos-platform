"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { ValidationError } from "@/lib/repo/events.ts";
import {
  ACCESS_DAYS,
  accessCookie,
  createGallery,
  deleteGallery,
  galleryThrottled,
  newGalleryLink,
  recordGalleryFailure,
  renameGallery,
  setGalleryActive,
  setGalleryEvents,
  setGalleryPassword,
  unlockGallery,
} from "@/lib/repo/galleries.ts";
import { cookieOptions, requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const why = (e: unknown, fallback: string) =>
  e instanceof ValidationError ? e.message : fallback;
const back = (id: string, key: "notice" | "error", message: string) =>
  `/galleries/${id}?${key}=${encodeURIComponent(message)}`;

export async function createGalleryAction(form: FormData): Promise<void> {
  const user = await requireUser();
  let id: string;
  try {
    id = createGallery(db(), user.organizationId, user.userId, {
      group: text(form, "group"),
      name: text(form, "name"),
      password: text(form, "password"),
    });
  } catch (e) {
    redirect(
      `/galleries?error=${encodeURIComponent(why(e, "Could not create the team gallery."))}`,
    );
  }
  revalidatePath("/galleries");
  redirect(
    back(id, "notice", "Team gallery created. Now tick the games it should show."),
  );
}

export async function saveGalleryEventsAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  const events = form.getAll("event").filter((v): v is string => typeof v === "string");
  try {
    setGalleryEvents(db(), user.organizationId, id, events);
  } catch (e) {
    redirect(back(id, "error", why(e, "Could not save the games.")));
  }
  revalidatePath("/galleries");
  redirect(
    back(
      id,
      "notice",
      events.length === 1
        ? "Saved: the team now sees 1 game."
        : `Saved: the team now sees ${events.length} games.`,
    ),
  );
}

export async function renameGalleryAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  try {
    renameGallery(db(), user.organizationId, id, {
      group: text(form, "group"),
      name: text(form, "name"),
    });
  } catch (e) {
    redirect(back(id, "error", why(e, "Could not save the name.")));
  }
  revalidatePath("/galleries");
  redirect(back(id, "notice", "Name saved."));
}

export async function setGalleryPasswordAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  try {
    setGalleryPassword(db(), user.organizationId, id, text(form, "password"));
  } catch (e) {
    redirect(back(id, "error", why(e, "Could not change the password.")));
  }
  redirect(
    back(
      id,
      "notice",
      "New team password saved. Anyone already looking must enter the new one.",
    ),
  );
}

export async function setGalleryActiveAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  const on = text(form, "active") === "1";
  try {
    setGalleryActive(db(), user.organizationId, id, on);
  } catch (e) {
    redirect(back(id, "error", why(e, "Could not change the link.")));
  }
  revalidatePath("/galleries");
  redirect(
    back(
      id,
      "notice",
      on ? "The link works again." : "Link switched off. Nobody can open this gallery.",
    ),
  );
}

export async function newGalleryLinkAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  try {
    newGalleryLink(db(), user.organizationId, id);
  } catch (e) {
    redirect(back(id, "error", why(e, "Could not make a new link.")));
  }
  revalidatePath("/galleries");
  redirect(
    back(
      id,
      "notice",
      "New link made. The old link no longer works: share the new one.",
    ),
  );
}

export async function deleteGalleryAction(form: FormData): Promise<void> {
  const user = await requireUser();
  deleteGallery(db(), user.organizationId, text(form, "id"));
  revalidatePath("/galleries");
  redirect(
    `/galleries?notice=${encodeURIComponent("Team gallery deleted. Its photos are still in JerseySort.")}`,
  );
}

/** A visitor enters the team password. */
export async function unlockGalleryAction(form: FormData): Promise<void> {
  const link = text(form, "link");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(link)) redirect("/");
  if (galleryThrottled(link)) {
    redirect(
      `/g/${link}?error=${encodeURIComponent("Too many wrong passwords. Wait 15 minutes and try again.")}`,
    );
  }
  const access = unlockGallery(db(), link, text(form, "password"));
  if (access === null) {
    recordGalleryFailure(link);
    redirect(
      `/g/${link}?error=${encodeURIComponent("That password is not right. Ask your coach or photographer for the team password.")}`,
    );
  }
  const jar = await cookies();
  jar.set(accessCookie(link), access, {
    ...cookieOptions(ACCESS_DAYS * 86_400),
    path: `/g/${link}`,
  });
  redirect(`/g/${link}`);
}
