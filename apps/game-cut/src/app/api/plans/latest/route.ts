import { guard } from "@/lib/guard.ts";
import { latestPlan } from "@/lib/plans.ts";
import { summarizeStored } from "@/lib/work.ts";

export const dynamic = "force-dynamic";

/**
 * The most recent plan, from this run or an earlier one, so the page can show it again
 * after being reloaded or after Game Cut was restarted. Planning a long game takes the
 * better part of an hour; it must not be lost to a closed window.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const plan = await latestPlan();
  return Response.json(
    { plan: plan === undefined ? null : summarizeStored(plan) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
