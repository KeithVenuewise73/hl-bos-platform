import "server-only";

import path from "node:path";

import { folderNames, folderPlanForDay, loadSettings } from "@hl-bos/date-sort/copy";
import { SPORT_LABEL, SPORTS } from "@hl-bos/date-sort/sport-rules";

import {
  noDestinationMessage,
  notCopiedMessage,
  renameMessage,
  type Purpose,
} from "@/lib/folder-messages.ts";

export type DayFolder =
  | {
      readonly ok: true;
      /** The date's folder on the drive. */
      readonly folder: string;
      readonly sport: string;
      /** The event name without the sport: "Basketball - Zac K" -> "Zac K". */
      readonly name: string;
    }
  | { readonly ok: false; readonly status: number; readonly error: string };

/**
 * Find a date's folder in the destination, for a button on its card. Says in
 * words what to do first when the folder is missing, or named differently from
 * what the card now says. Reads only.
 */
export async function dayFolder(
  day: string,
  eventName: string,
  purpose: Purpose,
): Promise<DayFolder> {
  const { destination } = await loadSettings();
  if (destination === null)
    return { ok: false, status: 409, error: noDestinationMessage(purpose) };
  const existing = await folderNames(destination);
  const plan = folderPlanForDay(day, eventName, existing);
  if (plan.kind === "refuse") return { ok: false, status: 409, error: plan.reason };
  if (plan.kind === "rename" || !existing.includes(plan.name)) {
    return {
      ok: false,
      status: 409,
      error:
        plan.kind === "rename"
          ? renameMessage(purpose, plan.from, plan.name)
          : notCopiedMessage(purpose),
    };
  }
  // "Basketball - Zac K" -> sport Basketball, event "Zac K".
  const sport = SPORTS.map((s) => SPORT_LABEL[s]).find(
    (label) => eventName === label || eventName.startsWith(`${label} - `),
  );
  return {
    ok: true,
    folder: path.join(destination, plan.name),
    sport: sport ?? "",
    name:
      sport === undefined
        ? eventName
        : eventName.slice(sport.length).replace(/^ - /, ""),
  };
}
