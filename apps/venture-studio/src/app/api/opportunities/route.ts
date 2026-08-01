import { NextResponse } from "next/server";
import { createOpportunity } from "@/lib/writes";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed request." },
      { status: 400 },
    );
  }
  const r = await createOpportunity(body);
  return NextResponse.json(r, { status: r.status });
}
