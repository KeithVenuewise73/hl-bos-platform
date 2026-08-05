import { NextResponse } from "next/server";
import { getInternalViewer } from "@/lib/session";
import { destinationFor } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * Minimal role resolver for post-sign-in routing. Server-side, reuses the same
 * Supabase session; returns NO secrets and no PII beyond the coarse role — just
 * enough for the login pages to route correctly and to show a safe
 * access-denied state. Authorization itself is always re-checked server-side on
 * each protected page; this endpoint is a convenience, never the gate.
 */
export async function GET(req: Request) {
  const viewer = await getInternalViewer();
  const next = new URL(req.url).searchParams.get("next");
  return NextResponse.json(
    {
      authenticated: viewer.authenticated,
      role: viewer.role,
      internal: viewer.internal,
      canBTIC: viewer.canBTIC,
      destination: destinationFor(viewer.role, { next }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
