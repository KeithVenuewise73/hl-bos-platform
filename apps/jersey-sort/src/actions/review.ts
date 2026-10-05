"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { safeReturn, withParam } from "@/lib/format.ts";
import { setFavorite } from "@/lib/repo/albums.ts";
import { ValidationError } from "@/lib/repo/events.ts";
import { setProfilePhoto, untagPlayer } from "@/lib/repo/players.ts";
import {
  addNumber,
  changeNumber,
  confirmDetection,
  flagPhoto,
  rejectDetection,
} from "@/lib/repo/review.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

/**
 * One action for every per-photo correction, used by both the photo page and
 * the review queue. `returnTo` must be a path inside this app.
 */
export async function photoAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const d = db();
  const org = user.organizationId;
  const t = getSettings(d, org).thresholds;
  const back = safeReturn(text(form, "returnTo"), "/");
  const op = text(form, "op");
  const photoId = text(form, "photoId");
  const detectionId = text(form, "detectionId");
  let notice = "";
  try {
    switch (op) {
      case "confirm":
        confirmDetection(d, org, detectionId, t);
        break;
      case "reject":
        rejectDetection(d, org, detectionId, t);
        break;
      case "change":
        changeNumber(d, org, user.userId, detectionId, text(form, "value"), t);
        notice = "Number changed.";
        break;
      case "add":
        notice = `Added #${addNumber(d, org, user.userId, photoId, text(form, "value"), t)}.`;
        break;
      case "no_jersey":
      case "unusable":
      case "usable":
      case "reviewed":
      case "skip":
        flagPhoto(d, org, user.userId, photoId, op, t);
        break;
      case "favorite":
      case "unfavorite":
        setFavorite(d, org, user.userId, [photoId], op === "favorite");
        break;
      case "untag_player":
        untagPlayer(d, org, [photoId], text(form, "playerId"));
        break;
      case "profile_photo":
        setProfilePhoto(d, org, text(form, "playerId"), photoId);
        notice = "Profile photo set.";
        break;
      default:
        throw new ValidationError("Unknown action.");
    }
  } catch (e) {
    redirect(
      withParam(
        back,
        "error",
        e instanceof ValidationError
          ? e.message
          : "That did not work. Nothing was changed.",
      ),
    );
  }
  revalidatePath("/", "layout");
  redirect(notice ? withParam(back, "notice", notice) : back);
}
