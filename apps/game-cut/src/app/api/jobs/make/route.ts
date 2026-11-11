import { guard } from "@/lib/guard.ts";
import { keepAwake } from "@/lib/keep-awake.ts";
import { jobs } from "@/lib/manager.ts";
import { asPath, asQuality } from "@/lib/parse.ts";
import { checkMake, makeWork } from "@/lib/work.ts";

export const dynamic = "force-dynamic";

/**
 * Start making the video from a plan, as a background job. Everything that can
 * be checked first (room on the drive, the name, the files) is checked first and
 * refused in plain words, before a long job starts.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = typeof b["planId"] === "string" ? b["planId"] : "";
  const outFile = asPath(b["outFile"]);
  if (planId === "" || outFile === null) {
    return Response.json(
      { error: "Choose where to save the finished video first." },
      { status: 400 },
    );
  }
  if (jobs.running) {
    return Response.json(
      { error: "Game Cut is already working on something. Wait for it, or stop it." },
      { status: 409 },
    );
  }
  const params = { planId, outFile, quality: asQuality(b["quality"]) };
  const check = await checkMake(params);
  if (!check.ok)
    return Response.json({ error: check.message }, { status: check.status });
  const id = jobs.start(
    "make",
    "Making the video",
    makeWork(params, () => keepAwake()),
  );
  return Response.json({ id, warning: check.warning });
}
