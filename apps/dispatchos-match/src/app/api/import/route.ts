import { NextResponse } from "next/server";
import { handleImport } from "@/lib/import";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected a JSON body." },
      { status: 400 },
    );
  }
  const result = handleImport(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
