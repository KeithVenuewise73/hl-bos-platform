import { guard } from "@/lib/guard.ts";
import { jobs } from "@/lib/manager.ts";

export const dynamic = "force-dynamic";

/** Stop the running job. Nothing it made is kept. */
export function POST(request: Request): Response {
  const refused = guard(request);
  if (refused !== null) return refused;
  return Response.json({ stopping: jobs.cancel() });
}
