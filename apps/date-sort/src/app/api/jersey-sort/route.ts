import { dayFolder } from "@/lib/day-folder.ts";
import { guard } from "@/lib/guard.ts";
import { ensureJerseySort, importUrl } from "@/lib/jersey-sort.ts";

export const dynamic = "force-dynamic";

/**
 * "JerseySort" on a date card: find the date's folder in the destination,
 * make sure JerseySort is running, and return the JerseySort page for it.
 * Nothing is read from or written to the photos here; JerseySort reads the
 * folder when the CEO confirms. (Putting photos on the website is "Send for
 * review", a separate button.)
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

  const found = await dayFolder(day, eventName, "jersey");
  if (!found.ok) return Response.json({ error: found.error }, { status: found.status });

  const problem = await ensureJerseySort();
  if (problem !== null) return Response.json({ error: problem }, { status: 503 });
  return Response.json({
    url: importUrl({
      folder: found.folder,
      day,
      sport: found.sport,
      name: found.name,
    }),
  });
}
