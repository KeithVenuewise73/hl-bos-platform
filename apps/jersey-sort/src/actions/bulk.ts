"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db.ts";
import { addToAlbum, markReviewed, setFavorite } from "@/lib/repo/albums.ts";
import { ValidationError } from "@/lib/repo/events.ts";
import { ownedPhotoIds } from "@/lib/repo/photos.ts";
import { tagPlayer, untagPlayer } from "@/lib/repo/players.ts";
import { addNumber, recomputeStatus, removeNumber } from "@/lib/repo/review.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export type BulkOp =
  | "add_number"
  | "remove_number"
  | "assign_player"
  | "unassign_player"
  | "add_to_album"
  | "favorite"
  | "unfavorite"
  | "mark_reviewed";

export interface BulkResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * Every bulk action. The photo ids come from the browser, so the first thing
 * done with them is to keep only those that belong to the signed-in user's
 * organization; anything else is silently not acted on.
 */
export async function bulkAction(
  op: BulkOp,
  photoIds: string[],
  value: string,
): Promise<BulkResult> {
  const user = await requireUser();
  const org = user.organizationId;
  const d = db();
  const ids = ownedPhotoIds(
    d,
    org,
    Array.isArray(photoIds) ? photoIds.filter((x) => typeof x === "string") : [],
  );
  if (ids.length === 0) return { ok: false, message: "Select at least one photo." };
  const t = getSettings(d, org).thresholds;
  const n = `${ids.length} photo${ids.length === 1 ? "" : "s"}`;
  try {
    switch (op) {
      case "add_number": {
        let canonical = "";
        d.tx(() => {
          for (const id of ids)
            canonical = addNumber(d, org, user.userId, id, value, t);
        });
        revalidatePath("/", "layout");
        return { ok: true, message: `Added #${canonical} to ${n}.` };
      }
      case "remove_number":
        removeNumber(d, org, ids, value, t);
        revalidatePath("/", "layout");
        return { ok: true, message: `Removed #${value.replace(/^#/, "")} from ${n}.` };
      case "assign_player":
        tagPlayer(d, org, user.userId, ids, value);
        revalidatePath("/", "layout");
        return { ok: true, message: `Tagged ${n} with that player.` };
      case "unassign_player":
        untagPlayer(d, org, ids, value);
        revalidatePath("/", "layout");
        return { ok: true, message: `Removed that player's tag from ${n}.` };
      case "add_to_album":
        addToAlbum(d, org, value, ids);
        revalidatePath("/", "layout");
        return { ok: true, message: `Added ${n} to the album.` };
      case "favorite":
      case "unfavorite":
        setFavorite(d, org, user.userId, ids, op === "favorite");
        revalidatePath("/", "layout");
        return {
          ok: true,
          message: op === "favorite" ? `Favorited ${n}.` : `Unfavorited ${n}.`,
        };
      case "mark_reviewed": {
        const done = markReviewed(d, org, user.userId, ids);
        d.tx(() => {
          for (const id of done) recomputeStatus(d, org, id, t);
        });
        revalidatePath("/", "layout");
        return { ok: true, message: `Marked ${n} reviewed.` };
      }
      default:
        return { ok: false, message: "Unknown action." };
    }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof ValidationError
          ? e.message
          : "That did not work. Nothing was changed.",
    };
  }
}
