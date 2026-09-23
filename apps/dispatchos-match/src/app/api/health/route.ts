import { NextResponse } from "next/server";
import { matchFleet } from "@hl-bos/dispatch-match";
import { DEMO_LOADS, DEMO_TENANT_ID, DEMO_TRUCKS } from "@hl-bos/dispatch-match/demo";

// A cached health check reports the health of the past.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health. "Serving a page" is not the claim — "the engine ranks loads" is, so
 * this runs the matcher over the sample fleet and reports what it produced.
 */
export function GET(): Response {
  const headers = { "Cache-Control": "no-store" };
  try {
    const run = matchFleet({
      tenantId: DEMO_TENANT_ID,
      trucks: DEMO_TRUCKS,
      loads: DEMO_LOADS,
    });
    return NextResponse.json(
      {
        status: "ok",
        data: "sample",
        trucksRanked: run.trucks.length,
        trucksDedicated: run.dedicated.length,
        loads: DEMO_LOADS.length,
        feasiblePairings: run.trucks.reduce((n, t) => n + t.matches.length, 0),
        unmatchedLoads: run.unmatchedLoads.length,
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 503, headers },
    );
  }
}
