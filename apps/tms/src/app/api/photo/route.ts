import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDbError } from "@hl-bos/commercial";
import { canCall, photoPathFor, type Snapshot } from "@hl-bos/tms";
import { db } from "@/lib/db.ts";
import { env } from "@/lib/env.ts";
import { currentCtx, snapshotFor } from "@/lib/guard.ts";

/**
 * Inspection photos, the way Supabase Storage holds them: a storage.objects
 * row in bucket hlg-fleet-documents, inserted AS the user so production's own
 * upload policy (fleet.storage_access) decides, and the bytes beside it — on
 * this computer's disk in the isolated environment.
 */
const MAX = 10 * 1024 * 1024;
const DV_ID = /^DV-[A-Za-z0-9-]{6,80}$/;
const BUCKET = "hlg-fleet-documents";

function diskPath(objectName: string): string {
  return path.join(
    path.resolve(env.dataDir),
    "objects",
    BUCKET,
    ...objectName.split("/"),
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await currentCtx();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canCall("submit_inspection", ctx.company.licensed).allowed) {
    return NextResponse.json(
      { error: "Digital DVIR is not licensed for this company." },
      { status: 403 },
    );
  }
  const id = new URL(req.url).searchParams.get("inspection") ?? "";
  if (!DV_ID.test(id))
    return NextResponse.json({ error: "Invalid inspection id." }, { status: 400 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX)
    return NextResponse.json({ error: "Photo must be under 10 MB." }, { status: 413 });
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff))
    return NextResponse.json({ error: "Photo must be a JPEG." }, { status: 415 });
  const rel = photoPathFor(id);
  const name = `${ctx.company.id}/${rel}`;
  try {
    await db().asUser(ctx.user.id, (c) =>
      c.query(
        "insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3::uuid, $4::text, $5::jsonb)",
        [
          BUCKET,
          name,
          ctx.user.id,
          ctx.user.id,
          JSON.stringify({ mimetype: "image/jpeg", size: bytes.length }),
        ],
      ),
    );
  } catch (e) {
    if (isDbError(e) && e.code === "23505")
      return NextResponse.json({ error: "Photo already uploaded." }, { status: 409 });
    if (isDbError(e) && e.code === "42501")
      return NextResponse.json(
        { error: "Upload refused by storage policy." },
        { status: 403 },
      );
    throw e;
  }
  await mkdir(path.dirname(diskPath(name)), { recursive: true });
  await writeFile(diskPath(name), bytes);
  return NextResponse.json({ path: rel });
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await currentCtx();
  if (!ctx) return new Response("Sign in first.", { status: 401 });
  const id = new URL(req.url).searchParams.get("inspection") ?? "";
  const s: Snapshot = await snapshotFor(ctx);
  const rec = s.inspections.find((i) => i.id === id);
  if (!rec?.payload.photo) return new Response("Not found.", { status: 404 });
  const name = `${ctx.company.id}/${rec.payload.photo}`;
  // Production's read policy decides, as this user.
  const visible = await db().rows(
    ctx.user.id,
    "select 1 from storage.objects where bucket_id = $1 and name = $2",
    [BUCKET, name],
  );
  if (visible.length === 0) return new Response("Not found.", { status: 404 });
  const bytes = await readFile(diskPath(name)).catch(() => null);
  if (!bytes) return new Response("Not found.", { status: 404 });
  return new Response(bytes, {
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" },
  });
}
