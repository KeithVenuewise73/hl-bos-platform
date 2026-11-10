import { guard } from "@/lib/guard.ts";
import { toolStatus } from "@/lib/engine.ts";
import { jobs } from "@/lib/manager.ts";

export const dynamic = "force-dynamic";

/** Is ffmpeg here, and what is the job doing? `?again=1` looks for ffmpeg again. */
export async function GET(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const again = new URL(request.url).searchParams.get("again") === "1";
  return Response.json(
    {
      tools: await toolStatus(again),
      job: jobs.snapshot(),
      platform: process.platform,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
