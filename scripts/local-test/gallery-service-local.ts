// A LOCAL stand-in for the online team-gallery service, for end-to-end tests:
// the real request handling (supabase/functions/_shared/gallery/core.ts) and
// the real database calls (pg-store.ts) against a local PostgreSQL that has
// migrations 0053 and 0054 applied. Only Supabase Storage is replaced: files
// are kept in a folder and served from /storage/.
//
// Never deployed; nothing here talks to Supabase.
//
//   deno run -A scripts/local-test/gallery-service-local.ts
//   env: GALLERY_PORT (54400), GALLERY_FILES (a folder), PGHOST, PGPORT,
//        PGDATABASE, PGUSER
//
// The service is then at http://127.0.0.1:54400/functions/v1/team-gallery.

import postgres from "npm:postgres@3.4.5";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  handle,
  type Bucket,
  type GalleryFiles,
} from "../../supabase/functions/_shared/gallery/core.ts";
import {
  pgStore,
  serviceSettings,
} from "../../supabase/functions/_shared/gallery/pg-store.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (
    o: { port: number; hostname: string },
    h: (req: Request) => Promise<Response>,
  ) => void;
};

const port = Number(Deno.env.get("GALLERY_PORT") ?? "54400");
const root = Deno.env.get("GALLERY_FILES") ?? "./gallery-files";
const base = `http://127.0.0.1:${port}`;
const sql = postgres({
  host: Deno.env.get("PGHOST") ?? "/var/run/postgresql",
  port: Number(Deno.env.get("PGPORT") ?? "5433"),
  database: Deno.env.get("PGDATABASE") ?? "hlbos",
  username: Deno.env.get("PGUSER") ?? "postgres",
  prepare: false,
});
const store = pgStore(sql);

const inside = (bucket: string, p: string) => {
  const full = path.resolve(root, bucket, p);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("outside");
  return full;
};

const files: GalleryFiles = {
  signedUrls: (paths) =>
    Promise.resolve(
      new Map(paths.map((p) => [p, `${base}/storage/gallery-photos/${p}?signed=1`])),
    ),
  signedUploadUrl: (bucket: Bucket, p: string) =>
    Promise.resolve(`${base}/storage/${bucket}/${p}?upload=1`),
  publicUrl: (bucket: Bucket, p: string) => `${base}/storage/${bucket}/${p}`,
  async remove(bucket: Bucket, paths: string[]) {
    for (const p of paths) await rm(inside(bucket, p), { force: true });
  },
};

Deno.serve({ port, hostname: "127.0.0.1" }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/storage/")) {
    const [, , bucket, ...rest] = url.pathname.split("/");
    const p = decodeURIComponent(rest.join("/"));
    if (bucket !== "gallery-photos" && bucket !== "gallery-covers") {
      return new Response("no such bucket", { status: 404 });
    }
    const full = inside(bucket, p);
    if (req.method === "PUT" && url.searchParams.get("upload") === "1") {
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, new Uint8Array(await req.arrayBuffer()));
      return new Response(null, { status: 200 });
    }
    // Private photos only with a "signed" URL; covers are public.
    if (bucket === "gallery-photos" && url.searchParams.get("signed") !== "1") {
      return new Response("not signed", { status: 400 });
    }
    try {
      return new Response(await readFile(full), {
        headers: { "content-type": "image/jpeg", "access-control-allow-origin": "*" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
  const s = await serviceSettings(sql);
  if (s === null)
    return new Response(JSON.stringify({ error: "not switched on" }), { status: 503 });
  return handle(req, { store, files, ...s });
});
console.log(
  `team-gallery (local) on ${base}/functions/v1/team-gallery, files in ${root}`,
);
