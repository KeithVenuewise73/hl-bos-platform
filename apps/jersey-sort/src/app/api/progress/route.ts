import { NextResponse } from "next/server";

import { db } from "@/lib/db.ts";
import { importStatus } from "@/lib/imports.ts";
import { kickQueue } from "@/lib/queue.ts";
import { progress } from "@/lib/repo/dashboard.ts";
import { currentUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await currentUser();
  if (user === null) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const event = new URL(request.url).searchParams.get("event");
  const p = progress(db(), user.organizationId, event);
  if (p.queued > 0) kickQueue();
  const imp = importStatus(event);
  return NextResponse.json(
    {
      ...p,
      importing:
        imp === null
          ? null
          : {
              done: imp.done,
              total: imp.total,
              alreadyIn: imp.alreadyIn,
              failed: imp.failed,
              finished: imp.finished,
              reasons: imp.reasons,
            },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
