import { NextResponse } from "next/server";

import { isEventName, type EventProps } from "@/lib/analytics/events.ts";
import { record } from "@/lib/analytics/record.ts";

/**
 * The one client-side counter.
 *
 * Almost every event is recorded on the server where the work happens. This
 * route exists for the single case that cannot be: a click on a checkout
 * button, where the next thing that happens is the browser leaving for Stripe.
 *
 * KNOWN LIMITATION, stated rather than hidden: `record()` needs a signed-in
 * user, so a checkout click from a signed-out visitor on the public pricing
 * page is NOT counted here. Stripe's own dashboard is the source of truth for
 * conversions; this number only tells us about intent from inside the app.
 *
 * Always answers 204. An analytics endpoint that returns errors to the browser
 * is an analytics endpoint that can break a page.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) {
      const payload = body as { event?: unknown; props?: unknown };
      const name = typeof payload.event === "string" ? payload.event : "";
      if (isEventName(name)) {
        const raw = payload.props;
        const props =
          typeof raw === "object" && raw !== null ? (raw as EventProps) : undefined;
        await record(name, props);
      }
    }
  } catch {
    /* a malformed beacon is not an error worth reporting to a page */
  }
  return new NextResponse(null, { status: 204 });
}
