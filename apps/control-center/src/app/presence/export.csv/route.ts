import { prospectsToCsv } from "@hl-bos/presence-scanner";

import { filterLeads, filtersFromParams } from "@/lib/lead-board";
import { leadBoard, toLeadRow } from "@/lib/presence";
import { FilePresenceRepository } from "@/lib/presence-store";

export const dynamic = "force-dynamic";

/** The Lead Board, with its current filters, as a CSV download. */
export async function GET(req: Request): Promise<Response> {
  const prospects = await leadBoard(new FilePresenceRepository());
  const keep = new Set(
    filterLeads(
      prospects.map(toLeadRow),
      filtersFromParams(new URL(req.url).searchParams),
    ).map((r) => r.id),
  );
  const csv = prospectsToCsv(prospects.filter((p) => keep.has(p.id)));
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hlg-leads-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
