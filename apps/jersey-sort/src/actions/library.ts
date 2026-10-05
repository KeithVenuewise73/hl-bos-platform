"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { withParam } from "@/lib/format.ts";
import { createAlbum, deleteAlbum } from "@/lib/repo/albums.ts";
import { ValidationError } from "@/lib/repo/events.ts";
import {
  addPlayerNumber,
  createPlayer,
  deletePlayer,
  removePlayerNumber,
  updatePlayer,
  type PlayerInput,
} from "@/lib/repo/players.ts";
import { requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const why = (e: unknown, fallback: string) =>
  e instanceof ValidationError ? e.message : fallback;

function playerInput(form: FormData): PlayerInput {
  return {
    firstName: text(form, "first"),
    lastName: text(form, "last"),
    jerseyNumber: text(form, "number"),
    teamName: text(form, "team"),
    sport: text(form, "sport"),
    season: text(form, "season"),
    position: text(form, "position"),
    graduationYear: text(form, "year"),
  };
}

export async function createPlayerAction(form: FormData): Promise<void> {
  const user = await requireUser();
  let id: string;
  try {
    id = createPlayer(db(), user.organizationId, user.userId, playerInput(form));
  } catch (e) {
    redirect(
      `/players/new?error=${encodeURIComponent(why(e, "Could not create the player."))}`,
    );
  }
  revalidatePath("/", "layout");
  redirect(
    `/players/${id}?notice=${encodeURIComponent("Player created. Photos with their number for that team and season are now in their gallery.")}`,
  );
}

export async function updatePlayerAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  try {
    updatePlayer(db(), user.organizationId, id, playerInput(form));
  } catch (e) {
    redirect(
      `/players/${id}?edit=1&error=${encodeURIComponent(why(e, "Could not save."))}`,
    );
  }
  revalidatePath("/", "layout");
  redirect(`/players/${id}?notice=Saved.`);
}

export async function addPlayerNumberAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  try {
    addPlayerNumber(
      db(),
      user.organizationId,
      id,
      text(form, "team"),
      text(form, "season"),
      text(form, "number"),
    );
  } catch (e) {
    redirect(
      withParam(`/players/${id}`, "error", why(e, "Could not add that number.")),
    );
  }
  revalidatePath("/", "layout");
  redirect(`/players/${id}?notice=Number+added.`);
}

export async function removePlayerNumberAction(form: FormData): Promise<void> {
  const user = await requireUser();
  removePlayerNumber(db(), user.organizationId, text(form, "numberId"));
  revalidatePath("/", "layout");
  redirect(`/players/${text(form, "id")}?notice=Number+removed.`);
}

export async function deletePlayerAction(form: FormData): Promise<void> {
  const user = await requireUser();
  deletePlayer(db(), user.organizationId, text(form, "id"));
  revalidatePath("/", "layout");
  redirect("/players?notice=Player+deleted.+Their+photos+are+untouched.");
}

export async function createAlbumAction(form: FormData): Promise<void> {
  const user = await requireUser();
  let id: string;
  try {
    id = createAlbum(
      db(),
      user.organizationId,
      user.userId,
      text(form, "name"),
      text(form, "description"),
    );
  } catch (e) {
    redirect(
      `/albums?error=${encodeURIComponent(why(e, "Could not create the album."))}`,
    );
  }
  redirect(
    `/albums/${id}?notice=${encodeURIComponent("Album created. Add photos from any gallery with Select photos → Add to album.")}`,
  );
}

export async function deleteAlbumAction(form: FormData): Promise<void> {
  const user = await requireUser();
  deleteAlbum(db(), user.organizationId, text(form, "id"));
  redirect("/albums?notice=Album+deleted.+The+photos+are+untouched.");
}
