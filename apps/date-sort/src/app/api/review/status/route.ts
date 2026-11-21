import { loadReview, reviewStatus } from "@hl-bos/date-sort/review";

import { guard } from "@/lib/guard.ts";

export const dynamic = "force-dynamic";

/**
 * Which dates already have photos on the website, for the badge on each date card.
 * Reads only. When the website is not set up, or this computer is not connected,
 * or it cannot be reached, it says "unavailable" and the cards show nothing: it never guesses.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const s = await loadReview();
  const none = { available: false, days: {} };
  const headers = { "Cache-Control": "no-store" };
  if (s.serviceUrl === null || s.key === null || s.connectedAt === null)
    return Response.json(none, { headers });
  try {
    const days = await reviewStatus(s.serviceUrl, s.key, (u, i) => fetch(u, i));
    return Response.json(
      { available: true, days: Object.fromEntries(days.map((d) => [d.date, d])) },
      { headers },
    );
  } catch {
    return Response.json(none, { headers });
  }
}
