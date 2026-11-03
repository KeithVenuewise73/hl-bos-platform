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
import {
  connectOnline,
  republishIfOnline,
  startPublish,
  takeOffline,
} from "@/lib/online.ts";
import { setCover } from "@/lib/online-core.ts";
import { cookieOptions, requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const why = (e: unknown, fallback: string) =>
  e instanceof ValidationError ? e.message : fallback;
const back = (id: string, key: "notice" | "error", message: string) =>
  `/galleries/${id}?${key}=${encodeURIComponent(message)}`;
const online = (live: boolean) => (live ? " Updating the online gallery now." : "");

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
  const live = await republishIfOnline(user.organizationId, id);
  revalidatePath("/galleries");
  redirect(
    back(
      id,
      "notice",
      events.length === 1
        ? `Saved: the team now sees 1 game.${online(live)}`
        : `Saved: the team now sees ${events.length} games.${online(live)}`,
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
  const live = await republishIfOnline(user.organizationId, id);
  revalidatePath("/galleries");
  redirect(back(id, "notice", `Name saved.${online(live)}`));
}

export async function setGalleryPasswordAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  try {
    setGalleryPassword(db(), user.organizationId, id, text(form, "password"));
  } catch (e) {
    redirect(back(id, "error", why(e, "Could not change the password.")));
  }
  const live = await republishIfOnline(user.organizationId, id);
  redirect(
    back(
      id,
      "notice",
      `New team password saved. Anyone already looking must enter the new one.${online(live)}`,
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
  const live = await republishIfOnline(user.organizationId, id);
  revalidatePath("/galleries");
  redirect(
    back(
      id,
      "notice",
      (on
        ? "The link works again."
        : "Link switched off. Nobody can open this gallery.") + online(live),
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
  const live = await republishIfOnline(user.organizationId, id);
  revalidatePath("/galleries");
  redirect(
    back(
      id,
      "notice",
      `New link made. The old link no longer works: share the new one.${online(live)}`,
    ),
  );
}

export async function deleteGalleryAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  // Online first: a gallery deleted here must not stay on the website.
  try {
    await takeOffline(id);
  } catch (e) {
    redirect(
      back(
        id,
        "error",
        `Not deleted: it is still online and could not be taken off (${e instanceof Error ? e.message : "no answer"}). Try again when the internet is back.`,
      ),
    );
  }
  deleteGallery(db(), user.organizationId, id);
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

/** Connect this computer's JerseySort as the online galleries' publisher. */
export async function connectOnlineAction(form: FormData): Promise<void> {
  await requireUser();
  const id = text(form, "id");
  const r = await connectOnline();
  redirect(
    r.ok
      ? back(id, "notice", "Connected to the online galleries. You can publish now.")
      : back(id, "error", r.message),
  );
}

export async function publishOnlineAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  startPublish(user.organizationId, id);
  redirect(`/galleries/${id}#online`);
}

/** The one photo a game's public page on the website may show (or none). */
export async function setCoverAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  const event = text(form, "event");
  const photo = text(form, "photo");
  try {
    setCover(db(), user.organizationId, id, event, photo === "" ? null : photo);
  } catch (e) {
    redirect(back(id, "error", why(e, "Could not save the cover.")));
  }
  redirect(
    back(
      id,
      "notice",
      photo === ""
        ? "No cover: that game's public page shows no photo."
        : "Cover saved. Publish online to put it on the website.",
    ),
  );
}
