import { NextResponse } from "next/server";
import { createNotebookEntry } from "@/lib/notebook";

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
  const r = await createNotebookEntry(body);
  return NextResponse.json(r, { status: r.status });
}
