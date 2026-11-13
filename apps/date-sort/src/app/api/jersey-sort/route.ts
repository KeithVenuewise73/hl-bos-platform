import { dayFolder } from "@/lib/day-folder.ts";
import { guard } from "@/lib/guard.ts";
import { ensureJerseySort, importUrl } from "@/lib/jersey-sort.ts";

export const dynamic = "force-dynamic";

/**
 * "Find jersey numbers" and "Publish to 5 Star" on a date card: find the
 * date's folder in the destination, make sure JerseySort is running, and
 * return the JerseySort page for it (purpose "publish" opens the page that
 * publishes it to the website). Nothing is read from or written to the photos
 * here; JerseySort reads the folder when the CEO confirms.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    day?: unknown;
    eventName?: unknown;
    purpose?: unknown;
  };
  const publish = body.purpose === "publish";
  const day =
    typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
      ? body.day
      : null;
  if (day === null) return Response.json({ error: "No date chosen." }, { status: 400 });
  const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";

  const found = await dayFolder(day, eventName, publish ? "publish" : "jersey");
  if (!found.ok) return Response.json({ error: found.error }, { status: found.status });

  const problem = await ensureJerseySort();
  if (problem !== null) return Response.json({ error: problem }, { status: 503 });
  return Response.json({
    url: importUrl({
      page: publish ? "publish" : "import",
      folder: found.folder,
      day,
      sport: found.sport,
      name: found.name,
    }),
  });
}
