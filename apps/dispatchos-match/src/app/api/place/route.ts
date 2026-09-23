import { NextResponse } from "next/server";
import { handlePlaceLookup } from "@/lib/import";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const q = new URL(request.url).searchParams.get("q");
  return NextResponse.json(handlePlaceLookup(q), {
    headers: { "Cache-Control": "no-store" },
  });
}
