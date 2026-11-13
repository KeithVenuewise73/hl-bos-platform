import {
  connectReview,
  ensureKey,
  ReviewError,
  saveReview,
} from "@hl-bos/date-sort/review";

import { guard } from "@/lib/guard.ts";

export const dynamic = "force-dynamic";

/**
 * Connect this computer to the website's review area, once. Only the key's
 * fingerprint is sent; the key stays on this computer. The website accepts it
 * only during a short window that the owner opens.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const settings = await ensureKey();
  if (settings.serviceUrl === null || settings.key === null) {
    return Response.json(
      { error: "The website's review area is not switched on yet." },
      { status: 503 },
    );
  }
  try {
    const status = await connectReview(settings.serviceUrl, settings.key, (u, i) =>
      fetch(u, i),
    );
    if (status === "connected") {
      await saveReview({ ...settings, connectedAt: new Date().toISOString() });
      return Response.json({ connected: true });
    }
    return Response.json(
      {
        error:
          status === "taken"
            ? "Another computer is already connected to the review area. It has to be disconnected on the website first."
            : "The website is not accepting new connections right now. Ask Claude to open the connect window, then try again.",
      },
      { status: 409 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof ReviewError ? e.message : "Could not reach the website." },
      { status: 502 },
    );
  }
}
