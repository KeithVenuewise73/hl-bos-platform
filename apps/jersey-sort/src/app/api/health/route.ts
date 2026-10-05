import { NextResponse } from "next/server";

import { db } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

/** Health as the Control Center asks it: "ok" only when the database answers. */
export function GET(): Response {
  const headers = { "Cache-Control": "no-store" };
  try {
    const row = db().get<{ photos: number; queued: number }>(
      "select count(*) as photos, coalesce(sum(status in ('queued','processing')), 0) as queued from photos",
    );
    return NextResponse.json(
      {
        status: "ok",
        storage: "local-sqlite",
        photos: row?.photos ?? 0,
        analyzing: row?.queued ?? 0,
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        detail: error instanceof Error ? error.message : "Database unreadable.",
      },
      { status: 503, headers },
    );
  }
}
