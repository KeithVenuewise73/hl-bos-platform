// media-review — the private photo review (migration 0055).
//
// Takes photos from the photographer's DateSort ("Send for review") and lets
// the OWNER review them: approve, reject, rename a folder, move photos, start a
// new folder, create a team. All the decisions are in
// ../_shared/review/core.ts and tested offline; this file only connects them to
// the database, Storage and Supabase Auth.
//
// The `review` schema is not API-exposed, so this function talks to it directly
// over SUPABASE_DB_URL. DateSort connects once with the fingerprint of its own
// key (the connect window migration 0055 opens). The owner signs in with
// Supabase Auth; who counts as the owner is the REVIEW_OWNER_EMAILS setting
// (comma-separated), kept in the function's secrets, never in the repository.
// Without it every owner route answers 503. It answers 503 until 0055 is applied.
//
// verify_jwt = false (supabase/config.toml): the function does its own checks
// (publisher key, or a verified and confirmed owner sign-in).
//
// NOT DEPLOYED until the CEO approves it through the protected Deploy workflow.

import postgres from "npm:postgres@3.4.5";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handle, userFromAuth, type ReviewFiles } from "../_shared/review/core.ts";
import { pgStore, publisherFingerprint } from "../_shared/review/pg-store.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OWNERS = (Deno.env.get("REVIEW_OWNER_EMAILS") ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.includes("@"));

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 3 });
const storage = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
}).storage;
const store = pgStore(sql);

const files: ReviewFiles = {
  async signedUrls(paths, seconds) {
    const out = new Map<string, string>();
    if (paths.length === 0) return out;
    const { data, error } = await storage
      .from("review-photos")
      .createSignedUrls(paths, seconds);
    if (error) throw error;
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
    return out;
  },
  async signedUploadUrl(path) {
    const { data, error } = await storage
      .from("review-photos")
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw error ?? new Error("no upload url");
    return data.signedUrl;
  },
};

/** Ask Supabase Auth who this access token belongs to. */
async function verifyUser(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (res === null || !res.ok) return null;
  return userFromAuth(await res.json().catch(() => null));
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const publisherKeySha256 = await publisherFingerprint(sql).catch(() => {
      throw new Error("not-applied");
    });
    return await handle(req, {
      store,
      files,
      publisherKeySha256,
      ownerEmails: OWNERS,
      verifyUser,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m === "not-applied") {
      return new Response(
        JSON.stringify({ error: "The review area is not switched on yet." }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      );
    }
    console.error("[media-review]", m);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Try again in a minute." }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
});
