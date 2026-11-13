"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { safeReturn, withParam } from "@/lib/format.ts";
import {
  approvePhotos,
  approveRemaining,
  NotAllowed,
  rejectPhotos,
  resetPhotos,
} from "@/lib/repo/approvals.ts";
import { ValidationError } from "@/lib/repo/events.ts";
import { createGameFromPhotos, movePhotos } from "@/lib/repo/relabel.ts";
import { requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const plural = (n: number, w: string) =>
  `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;

/**
 * Every decision on the approval pages. Who is allowed is decided in the data
 * layer (owner only), so a request made some other way is refused too.
 */
export async function approveAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const d = db();
  const org = user.organizationId;
  const back = safeReturn(text(form, "returnTo"), "/approve");
  const ids = form.getAll("photo").filter((v): v is string => typeof v === "string");
  const op = text(form, "op");
  let notice = "";
  let error = "";
  try {
    const picked = () => {
      if (ids.length === 0) throw new ValidationError("Tick the photos first.");
    };
    switch (op) {
      case "approve": {
        picked();
        const r = approvePhotos(d, org, user.userId, user.role, ids);
        notice = `Approved ${plural(r.changed, "photo")} for the website.`;
        break;
      }
      case "reject": {
        picked();
        const r = rejectPhotos(
          d,
          org,
          user.userId,
          user.role,
          ids,
          text(form, "reason"),
        );
        notice = `Rejected ${plural(r.changed, "photo")}. They stay here and are never published.`;
        break;
      }
      case "reset": {
        picked();
        const n = resetPhotos(d, org, user.role, ids);
        notice = `${plural(n, "photo")} sent back to waiting.`;
        break;
      }
      case "approveRest": {
        const n = approveRemaining(
          d,
          org,
          user.userId,
          user.role,
          text(form, "eventId"),
        );
        notice = `Approved the remaining ${plural(n, "photo")}. Rejected ones were left alone.`;
        break;
      }
      case "move": {
        picked();
        const n = movePhotos(d, org, user.role, ids, text(form, "toEvent"));
        notice = `Moved ${plural(n, "photo")} to the other game. They are waiting for review there.`;
        break;
      }
      case "newGame": {
        picked();
        createGameFromPhotos(d, org, user.userId, user.role, ids, {
          name: text(form, "name"),
          sport: text(form, "sport"),
          teamName: text(form, "team"),
          opponent: text(form, "opponent"),
          eventDate: text(form, "date"),
          location: "",
          season: text(form, "season"),
          notes: "",
        });
        notice = `Started a new game with ${plural(ids.length, "photo")}. They are waiting for review there.`;
        break;
      }
      default:
        error = "That action is not known.";
    }
  } catch (e) {
    if (e instanceof NotAllowed || e instanceof ValidationError) error = e.message;
    else throw e;
  }
  revalidatePath("/approve");
  redirect(error ? withParam(back, "error", error) : withParam(back, "notice", notice));
}
