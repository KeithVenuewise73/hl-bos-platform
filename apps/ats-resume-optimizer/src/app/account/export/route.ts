import { NextResponse } from "next/server";

import { loadWorkspace } from "@/lib/store.ts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Data export: the signed-in account's entire workspace, as stored. */
export async function GET(): Promise<Response> {
  const workspace = await loadWorkspace();
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: "hlg-career-platform/1",
      ...workspace,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="career-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
