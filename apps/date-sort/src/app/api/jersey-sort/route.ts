import path from "node:path";

import { folderNames, folderPlanForDay, loadSettings } from "@hl-bos/date-sort/copy";
import { SPORT_LABEL, SPORTS } from "@hl-bos/date-sort/sport-rules";

import { guard } from "@/lib/guard.ts";
import { ensureJerseySort, importUrl } from "@/lib/jersey-sort.ts";

export const dynamic = "force-dynamic";

/**
 * "Find jersey numbers" on a date card: find the date's folder in the
 * destination, make sure JerseySort is running, and return the JerseySort
 * page that turns that folder into an event. Nothing is read from or written
 * to the photos here; JerseySort reads the folder when the CEO confirms.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    day?: unknown;
    eventName?: unknown;
  };
  const day =
    typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
      ? body.day
      : null;
  if (day === null) return Response.json({ error: "No date chosen." }, { status: 400 });
  const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";

  const { destination } = await loadSettings();
  if (destination === null) {
    return Response.json(
      { error: "Copy this date into its folder first (Copy to dated folders, above)." },
      { status: 409 },
    );
  }
  const existing = await folderNames(destination);
  const plan = folderPlanForDay(day, eventName, existing);
  if (plan.kind === "refuse")
    return Response.json({ error: plan.reason }, { status: 409 });
  if (plan.kind === "rename" || !existing.includes(plan.name)) {
    return Response.json(
      {
        error:
          plan.kind === "rename"
            ? "The event name changed since this date was copied. Press Copy first, so its folder has the new name."
            : "Copy this date into its folder first, then find the jersey numbers.",
      },
      { status: 409 },
    );
  }

  // "Basketball - Zac K" -> sport Basketball, event "Zac K".
  const sport = SPORTS.map((s) => SPORT_LABEL[s]).find(
    (label) => eventName === label || eventName.startsWith(`${label} - `),
  );
  const name =
    sport === undefined ? eventName : eventName.slice(sport.length).replace(/^ - /, "");

  const problem = await ensureJerseySort();
  if (problem !== null) return Response.json({ error: problem }, { status: 503 });
  return Response.json({
    url: importUrl({
      folder: path.join(destination, plan.name),
      day,
      sport: sport ?? "",
      name,
    }),
  });
}
