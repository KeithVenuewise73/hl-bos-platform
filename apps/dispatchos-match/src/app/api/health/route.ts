import { NextResponse } from "next/server";
import { matchFleet } from "@hl-bos/dispatch-match";
import { SAMPLE_FLEETS } from "@hl-bos/dispatch-match/demo";
import { gazetteerSize, resolvePlace } from "@hl-bos/dispatch-match/places";

// A cached health check reports the health of the past.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health. "Serving a page" is not the claim — "the engine ranks loads and
 * places resolve nationally" is, so this runs the matcher over every sample
 * fleet and resolves a known ZIP, and reports what it got.
 */
export function GET(): Response {
  const headers = { "Cache-Control": "no-store" };
  try {
    const fleets = SAMPLE_FLEETS.map((f) => {
      const run = matchFleet({
        tenantId: f.tenantId,
        trucks: f.trucks,
        loads: f.loads,
      });
      return {
        fleet: f.id,
        trucksRanked: run.trucks.length,
        trucksDedicated: run.dedicated.length,
        loads: f.loads.length,
        feasiblePairings: run.trucks.reduce((n, t) => n + t.matches.length, 0),
      };
    });
    const probe = resolvePlace("90210");
    if (!probe.ok) throw new Error(`Place resolver failed its probe: ${probe.error}`);
    return NextResponse.json(
      {
        status: "ok",
        data: "sample",
        fleets,
        places: { ...gazetteerSize(), probe: probe.place.name },
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
