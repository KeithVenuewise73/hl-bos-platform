// The media-review service as a local HTTP server, for the owner page's browser
// check (verify-owner-page.cjs): the real request handling (core.ts) and the real
// database calls (pg-store.ts) against a LOCAL PostgreSQL that has migration 0055
// applied. Only Supabase Auth and Storage are stand-ins:
//   - the access token "owner-token" is the owner; "stranger-token" is a signed-in
//     person who is not; anything else is nobody;
//   - a "file" is a row in storage.objects, and its link points at IMG_BASE.
// Never deployed; nothing here talks to Supabase.
import postgres from "npm:postgres@3.4.5";

import { handle, userFromAuth, type ReviewDeps } from "./review/core.ts";
import { pgStore, publisherFingerprint } from "./review/pg-store.ts";
import { makeSocialPublisher } from "./review/social.ts";

let n = 0; // the stand-in Meta's request counter
declare const Deno: {
  env: { get(n: string): string | undefined };
  serve: (
    o: { port: number; hostname: string; onListen?: () => void },
    h: (r: Request) => Promise<Response>,
  ) => void;
};

const sql = postgres({
  host: Deno.env.get("PGHOST") ?? "/tmp",
  port: Number(Deno.env.get("PGPORT") ?? "5433"),
  database: Deno.env.get("PGDATABASE") ?? "hlbos",
  username: Deno.env.get("PGUSER") ?? "postgres",
  prepare: false,
  max: 3,
});
const IMG_BASE = Deno.env.get("IMG_BASE") ?? "http://127.0.0.1:4660";
const store = pgStore(sql);

Deno.serve(
  {
    port: Number(Deno.env.get("API_PORT") ?? "4661"),
    hostname: "127.0.0.1",
    onListen: () => console.log("READY"),
  },
  async (req) => {
    const deps: ReviewDeps = {
      store,
      files: {
        async signedUploadUrl(path) {
          await sql`insert into storage.objects (bucket_id, name) values ('review-photos', ${path}) on conflict do nothing`;
          return `${IMG_BASE}/upload/${path}`;
        },
        // The public bucket, like the private one, is rows in storage.objects.
        async copyToPublic(path) {
          await sql`insert into storage.objects (bucket_id, name) values ('review-public', ${path}) on conflict do nothing`;
        },
        async removePublic(paths) {
          await sql`delete from storage.objects where bucket_id = 'review-public' and name = any(${paths})`;
        },
        async removePrivate(paths) {
          await sql`delete from storage.objects where bucket_id = 'review-photos' and name = any(${paths})`;
        },
        publicUrl: (path) => `${IMG_BASE}/img/${path}?public=1`,
        signedUrls: (paths, s) =>
          Promise.resolve(
            new Map(paths.map((p) => [p, `${IMG_BASE}/img/${p}?exp=${s}`])),
          ),
      },
      publisherKeySha256: await publisherFingerprint(sql),
      ownerEmails: ["owner@example.test"],
      voterSalt: "s".repeat(40),
      // The real Instagram / Facebook code against a stand-in for Meta that always accepts.
      social: makeSocialPublisher({
        secret: () => "EAAG" + "t".repeat(60),
        sleep: () => Promise.resolve(),
        fetcher: (url) => {
          n += 1;
          const u = new URL(String(url));
          const path = u.pathname.replace(/^\/v[\d.]+/, "");
          const ok = (b: unknown) =>
            Promise.resolve(new Response(JSON.stringify(b), { status: 200 }));
          if (path.endsWith("/media_publish")) return ok({ id: "ig_media_" + n });
          if (path.endsWith("/media")) return ok({ id: "container_" + n });
          if (path.endsWith("/photos")) return ok({ id: "ph_" + n });
          if (path.endsWith("/feed")) return ok({ id: "100000000000001_" + n });
          if (u.searchParams.get("fields")?.includes("status_code"))
            return ok({ status_code: "FINISHED" });
          if (u.searchParams.get("fields")?.includes("permalink"))
            return ok({ permalink: "https://www.instagram.com/p/TEST" + n + "/" });
          return ok({});
        },
      }),
      verifyUser: (t) =>
        Promise.resolve(
          t === "owner-token"
            ? userFromAuth({
                id: "99999999-9999-9999-9999-999999999999",
                email: "owner@example.test",
                email_confirmed_at: "2026-11-14T10:00:00Z",
              })
            : t === "stranger-token"
              ? userFromAuth({
                  id: "88888888-8888-8888-8888-888888888888",
                  email: "someone@else.test",
                  email_confirmed_at: "2026-11-14T10:00:00Z",
                })
              : null,
        ),
    };
    try {
      return await handle(req, deps);
    } catch (e) {
      console.error("[owner-api-local]", e instanceof Error ? e.message : e);
      return new Response(JSON.stringify({ error: "Something went wrong." }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
);
