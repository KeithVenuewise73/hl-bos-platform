import { guard } from "@/lib/guard.ts";
import { jobs } from "@/lib/manager.ts";
import { asClock, asPadding, asPlanId, asTimesText } from "@/lib/parse.ts";
import { adjustPlanWork } from "@/lib/work.ts";

export const dynamic = "force-dynamic";

/**
 * Add moments a person is sure about to a plan that already exists, as a background job.
 * It does not look at the videos again (that takes the better part of an hour): it turns
 * each time into game time and picks the nearer camera, which takes a few seconds each.
 * The plan it came from is kept; the result is a new plan.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = asPlanId(b["planId"]);
  if (planId === null) {
    return Response.json(
      { error: "There is no plan to add moments to yet." },
      { status: 400 },
    );
  }
  const text = asTimesText(b["timesText"]);
  if (text === null || text.trim() === "") {
    return Response.json(
      { error: "Type at least one time first, like 53:25 big hit." },
      { status: 400 },
    );
  }
  if (jobs.running) {
    return Response.json(
      { error: "Game Cut is already working on something. Wait for it, or stop it." },
      { status: 409 },
    );
  }
  const id = jobs.start(
    "plan",
    "Adding your moments",
    adjustPlanWork({
      planId,
      timesText: text,
      clock: asClock(b["clock"]),
      watchedPlanId: asPlanId(b["watchedPlanId"]),
      beforeSeconds: asPadding(b["beforeSeconds"], 8),
      afterSeconds: asPadding(b["afterSeconds"], 6),
    }),
  );
  return Response.json({ id });
}
