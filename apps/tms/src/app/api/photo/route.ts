import { NextResponse } from "next/server";
import { canCall, photoPathFor, type Snapshot } from "@hl-bos/tms";
import { demo } from "@/lib/demo.ts";
import { currentCtx } from "@/lib/guard.ts";

/**
 * Inspection photos. Stands in for the private Supabase bucket
 * hlg-fleet-documents: upload first, then the signed report names the path,
 * and the backend refuses the report unless this same user uploaded it.
 * JPEG only (the backend's path is dvir/<id>.jpg), 10 MB like the bucket.
 */
const MAX = 10 * 1024 * 1024;
const DV_ID = /^DV-[A-Za-z0-9-]{6,80}$/;

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await currentCtx();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canCall("submit_inspection", ctx.company.licensed).allowed) {
    return NextResponse.json(
      { error: "Digital DVIR is not licensed." },
      { status: 403 },
    );
  }
  const id = new URL(req.url).searchParams.get("inspection") ?? "";
  if (!DV_ID.test(id))
    return NextResponse.json({ error: "Invalid inspection id." }, { status: 400 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX)
    return NextResponse.json({ error: "Photo must be under 10 MB." }, { status: 413 });
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    return NextResponse.json({ error: "Photo must be a JPEG." }, { status: 415 });
  }
  const path = photoPathFor(id);
  const d = await demo();
  if (d.backend.getObject(ctx.company.id, path))
    return NextResponse.json({ error: "Photo already uploaded." }, { status: 409 });
  d.backend.putObject(ctx.company.id, path, ctx.user.id, bytes, "image/jpeg");
  return NextResponse.json({ path });
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await currentCtx();
  if (!ctx) return new Response("Sign in first.", { status: 401 });
  const id = new URL(req.url).searchParams.get("inspection") ?? "";
  const d = await demo();
  // Visible only if the inspection is visible to this user (the backend's own scoping).
  const s = await d.backend.call<Snapshot>(ctx.user.id, "snapshot", {
    workspace: ctx.company.id,
  });
  const rec = s.inspections.find((i) => i.id === id);
  if (!rec?.payload.photo) return new Response("Not found.", { status: 404 });
  const o = d.backend.getObject(ctx.company.id, rec.payload.photo);
  if (!o) return new Response("Not found.", { status: 404 });
  return new Response(Buffer.from(o.bytes), {
    headers: { "content-type": o.contentType, "cache-control": "private, no-store" },
  });
}
