import { leadSummaryHtml } from "@hl-bos/presence-scanner";

import { filterLeads, filtersFromParams } from "@/lib/lead-board";
import { leadBoard, toLeadRow } from "@/lib/presence";
import { FilePresenceRepository } from "@/lib/presence-store";

export const dynamic = "force-dynamic";

/** A printable HTML summary of the Lead Board's current selection (print it, or save as PDF). */
export async function GET(req: Request): Promise<Response> {
  const prospects = await leadBoard(new FilePresenceRepository());
  const keep = new Set(
    filterLeads(
      prospects.map(toLeadRow),
      filtersFromParams(new URL(req.url).searchParams),
    ).map((r) => r.id),
  );
  return new Response(
    leadSummaryHtml(
      prospects.filter((p) => keep.has(p.id)),
      new Date(),
    ),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        // Business-supplied text is escaped; this also stops any script running.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    },
  );
}
