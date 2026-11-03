// team-gallery — team galleries, online (migration 0053).
//
// Serves the 5starsportsmedia.com galleries pages and takes "Publish online"
// from the photographer's JerseySort. All the decisions (password check,
// access passes, the guessing throttle, what is public) are in
// ../_shared/gallery/core.ts and tested offline; this file only connects them
// to the database and to Storage.
//
// The `gallery` schema is not API-exposed, so this function talks to it
// directly over SUPABASE_DB_URL. Two Vault secrets must exist before it is
// useful (it answers 503 until they do): gallery_access_secret (signs visitor
// passes) and gallery_publisher_key (the key JerseySort publishes with).
// Deployed with verify_jwt = false (supabase/config.toml): visitors have no
// Supabase account; the team password is the gate.
//
// NOT DEPLOYED until the CEO approves it through the protected Deploy workflow.

import postgres from "npm:postgres@3.4.5";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handle, type Bucket, type GalleryFiles } from "../_shared/gallery/core.ts";
import { pgStore } from "../_shared/gallery/pg-store.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 3 });
const storage = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
).storage;

const store = pgStore(sql);

const files: GalleryFiles = {
  async signedUrls(paths, seconds) {
    const out = new Map<string, string>();
    if (paths.length === 0) return out;
    const { data, error } = await storage
      .from("gallery-photos")
      .createSignedUrls(paths, seconds);
    if (error) throw error;
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
    return out;
  },
  async signedUploadUrl(bucket: Bucket, path: string) {
    const { data, error } = await storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw error ?? new Error("no upload url");
    return data.signedUrl;
  },
  publicUrl(bucket: Bucket, path: string) {
    return storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },
  async remove(bucket: Bucket, paths: string[]) {
    const { error } = await storage.from(bucket).remove(paths);
    if (error) throw error;
  },
};

let secrets: { access: string; publisher: string } | null = null;
async function loadSecrets() {
  if (secrets !== null) return secrets;
  const rows = await sql`select name, decrypted_secret from vault.decrypted_secrets
                          where name in ('gallery_access_secret', 'gallery_publisher_key')`;
  const get = (n: string) =>
    String(rows.find((r) => r.name === n)?.decrypted_secret ?? "");
  const s = {
    access: get("gallery_access_secret"),
    publisher: get("gallery_publisher_key"),
  };
  if (s.access.length < 32 || s.publisher.length < 32) return null;
  secrets = s;
  return s;
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const s = await loadSecrets();
    if (s === null) {
      return new Response(
        JSON.stringify({ error: "Galleries are not switched on yet." }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return await handle(req, {
      store,
      files,
      accessSecret: s.access,
      publisherKey: s.publisher,
    });
  } catch (e) {
    console.error("[team-gallery]", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Try again in a minute." }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
});
