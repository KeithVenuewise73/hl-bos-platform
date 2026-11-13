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
        signedUrls: (paths, s) =>
          Promise.resolve(
            new Map(paths.map((p) => [p, `${IMG_BASE}/img/${p}?exp=${s}`])),
          ),
      },
      publisherKeySha256: await publisherFingerprint(sql),
      ownerEmails: ["owner@example.test"],
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
