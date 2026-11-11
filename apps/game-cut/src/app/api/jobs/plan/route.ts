import { guard } from "@/lib/guard.ts";
import { jobs } from "@/lib/manager.ts";
import { asPadding, asPath, asQuietCut, asTimesText } from "@/lib/parse.ts";
import { planBroadcastWork, planTimesWork } from "@/lib/work.ts";

export const dynamic = "force-dynamic";

/**
 * Start the looking step as a background job: lines the videos up and works out
 * what to keep. Reads the videos; makes no video. Returns at once; the page
 * follows it through /api/jobs/current.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fileA = asPath(b["fileA"]);
  if (fileA === null)
    return Response.json({ error: "Choose the first video first." }, { status: 400 });
  if (jobs.running) {
    return Response.json(
      { error: "Game Cut is already working on something. Wait for it, or stop it." },
      { status: 409 },
    );
  }

  if (b["mode"] === "broadcast") {
    const fileB = asPath(b["fileB"]);
    if (fileB === null)
      return Response.json({ error: "Choose the second video too." }, { status: 400 });
    const id = jobs.start(
      "plan",
      "Planning the broadcast",
      planBroadcastWork({
        fileA,
        fileB,
        quietCutSeconds: asQuietCut(b["quietCutSeconds"]),
      }),
    );
    return Response.json({ id });
  }
  if (b["mode"] === "times") {
    const text = asTimesText(b["timesText"]);
    if (text === null || text.trim() === "") {
      return Response.json(
        { error: "Type at least one time first, like 12:34 big hit." },
        { status: 400 },
      );
    }
    const rawB = b["fileB"];
    const fileB =
      rawB === null || rawB === undefined || rawB === "" ? null : asPath(rawB);
    if (rawB !== null && rawB !== undefined && rawB !== "" && fileB === null) {
      return Response.json(
        { error: "The second video's path could not be read." },
        { status: 400 },
      );
    }
    const id = jobs.start(
      "plan",
      "Planning the highlights",
      planTimesWork({
        fileA,
        fileB,
        timesText: text,
        beforeSeconds: asPadding(b["beforeSeconds"], 8),
        afterSeconds: asPadding(b["afterSeconds"], 6),
      }),
    );
    return Response.json({ id });
  }
  return Response.json({ error: "Unknown request." }, { status: 400 });
}
