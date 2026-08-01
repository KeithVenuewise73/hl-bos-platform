import { NextResponse } from "next/server";
import { recordDecision } from "@/lib/writes";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed request." },
      { status: 400 },
    );
  }
  const r = await recordDecision(id, body);
  return NextResponse.json(r, { status: r.status });
}
