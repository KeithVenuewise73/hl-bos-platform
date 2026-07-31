import { NextResponse } from "next/server";
import { normalizeEvent } from "@/lib/analytics";

// Analytics sink. Records measurable product events (page visits, assessment
// starts/submits, consultation requests, logins, marketplace views, solution
// interest, document views, portal engagement). It records EVENTS only — never
// revenue, ROI, or outcomes. Unknown events are rejected.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const b = (body ?? {}) as { event?: unknown; path?: unknown; props?: unknown };
  const rec = normalizeEvent(b.event, b.path, b.props);
  if (!rec) return NextResponse.json({ ok: false }, { status: 422 });

  // In this release the sink logs server-side; a deploy-time endpoint
  // (HLD_ANALYTICS_URL) can forward to the platform analytics store.
  const forward = process.env["HLD_ANALYTICS_URL"];
  if (forward) {
    try {
      void fetch(forward, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rec),
      });
    } catch {
      /* best-effort */
    }
  } else {
    console.info("[event]", rec.event, rec.path);
  }
  return NextResponse.json({ ok: true });
}
