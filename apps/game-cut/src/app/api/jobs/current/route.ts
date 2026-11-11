import { guard } from "@/lib/guard.ts";
import { jobs } from "@/lib/manager.ts";

export const dynamic = "force-dynamic";

/** The current (or last finished) job. The page asks about once a second. */
export function GET(request: Request): Response {
  const refused = guard(request);
  if (refused !== null) return refused;
  return Response.json(
    { job: jobs.snapshot() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
