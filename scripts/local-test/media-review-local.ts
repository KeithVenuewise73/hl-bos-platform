// The media-review service against a LOCAL PostgreSQL that has migration 0055
// applied: the real request handling (supabase/functions/_shared/review/core.ts)
// and the real database calls (pg-store.ts). Only Storage and Supabase Auth are
// stand-ins. Never deployed; nothing here talks to Supabase.
//
//   (local PostgreSQL with all migrations applied, fresh: scripts/local-test/apply.cjs)
//   deno run -A --no-check scripts/local-test/media-review-local.ts
//
// Exercises, end to end through real SQL: connect, send, review, rename, split,
// move, teams. Prints one line per check and exits 1 on any failure.
import postgres from "npm:postgres@3.4.5";
import { createHash } from "node:crypto";

import {
  handle,
  userFromAuth,
  type ReviewDeps,
} from "../../supabase/functions/_shared/review/core.ts";
import {
  pgStore,
  publisherFingerprint,
} from "../../supabase/functions/_shared/review/pg-store.ts";

declare const Deno: {
  env: { get(n: string): string | undefined };
  exit(c: number): never;
};

const sql = postgres({
  host: Deno.env.get("PGHOST") ?? "/tmp",
  port: Number(Deno.env.get("PGPORT") ?? "5433"),
  database: Deno.env.get("PGDATABASE") ?? "hlbos",
  username: Deno.env.get("PGUSER") ?? "postgres",
  prepare: false,
  max: 2,
});
const BASE = "https://x.test/functions/v1/media-review";
const KEY = "k".repeat(48);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const OWNER_ID = "99999999-9999-9999-9999-999999999999";

let failures = 0,
  checks = 0;
const check = (name: string, ok: unknown, detail?: unknown) => {
  checks++;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "OK  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : " — " + JSON.stringify(detail)}`,
  );
};

await sql`delete from review.photos`;
await sql`delete from review.batches`;
await sql`delete from review.folders`;
await sql`delete from storage.objects where bucket_id = 'review-photos'`;
await sql`delete from site.page_interest`;
await sql`delete from storage.objects where bucket_id = 'review-public'`;
await sql`update site.pages set enabled = false, coming_soon = false`;
await sql`select review.reset_publisher(2)`.catch(() => undefined);
await sql`update review.settings set publisher_key_sha256 = null, connect_until = now() + interval '1 hour'`;
await sql`delete from review.teams where slug not in ('west-seneca-high-school','west-seneca-club-hockey','cazenovia-chiefs','cheektowaga-warriors')`;

const uploaded: string[] = [];
const deps = (): Promise<ReviewDeps> =>
  publisherFingerprint(sql).then((fp) => ({
    store: pgStore(sql),
    files: {
      // The stand-in "upload": the file is in the bucket the moment its address is handed out.
      async signedUploadUrl(path) {
        await sql`insert into storage.objects (bucket_id, name) values ('review-photos', ${path}) on conflict do nothing`;
        uploaded.push(path);
        return `https://files.test/upload/${path}`;
      },
      // The public bucket is a set of rows in storage.objects, like the private one.
      async copyToPublic(path) {
        await sql`insert into storage.objects (bucket_id, name) values ('review-public', ${path}) on conflict do nothing`;
      },
      async removePublic(paths) {
        await sql`delete from storage.objects where bucket_id = 'review-public' and name = any(${paths})`;
      },
      publicUrl: (path) => `https://public.test/${path}`,
      signedUrls: (paths, s) =>
        Promise.resolve(
          new Map(paths.map((p) => [p, `https://files.test/${p}?exp=${s}`])),
        ),
    },
    publisherKeySha256: fp,
    ownerEmails: ["owner@example.test"],
    voterSalt: "s".repeat(40),
    verifyUser: (t) =>
      Promise.resolve(
        t === "owner"
          ? userFromAuth({
              id: OWNER_ID,
              email: "owner@example.test",
              email_confirmed_at: "2026-11-14T10:00:00Z",
            })
          : null,
      ),
  }));
const call = async (
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  const res = await handle(
    new Request(BASE + route, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    await deps(),
  );
  return { status: res.status, json: (await res.json()) as any };
};
const pub = { "x-review-publisher-key": KEY };
const own = { authorization: "Bearer owner" };

console.log("Connect");
check(
  "DateSort connects with only its fingerprint",
  (await call("/review/register", { key_sha256: sha(KEY) })).json.status ===
    "connected",
);
check(
  "a different computer is refused",
  (await call("/review/register", { key_sha256: sha("other") })).status === 409,
);

console.log("\nSend");
const hashes = [1, 2, 3, 4].map((n) => String(n).repeat(64));
const batch = await call(
  "/review/batch",
  {
    label: { name: "Varsity vs Wheatfield", sport: "Hockey", date: "2026-10-24" },
    folder: "2026-10-24 - Hockey - Varsity vs Wheatfield",
    counts: { photos: 4, videos: 0 },
    hashes,
  },
  pub,
);
check(
  "a batch is started",
  batch.status === 200 && /^[0-9a-f-]{36}$/.test(batch.json.batch_id),
  batch,
);
const refused = await call(
  "/review/commit",
  {
    batch_id: batch.json.batch_id,
    photos: [{ hash: hashes[0], filename: "IMG_1.JPG", web_bytes: 10 }],
  },
  pub,
);
check(
  "a photo whose files were never uploaded is refused in words",
  refused.status === 400 && /not uploaded/.test(refused.json.error),
  refused,
);
const up = await call(
  "/review/uploads",
  {
    batch_id: batch.json.batch_id,
    files: hashes.flatMap((h) => [
      { hash: h, kind: "web" },
      { hash: h, kind: "thumb" },
    ]),
  },
  pub,
);
check(
  "upload addresses are only this batch's own paths",
  up.status === 200 &&
    uploaded.length === 8 &&
    uploaded.every((p) => p.startsWith(batch.json.batch_id + "/")),
  uploaded.slice(0, 2),
);
const photos = hashes.map((h, i) => ({
  hash: h,
  filename: `IMG_${i + 1}.JPG`,
  taken_at: i < 3 ? `2026-10-24T10:0${i}:00` : "2026-10-24T15:00:00",
  width: 2400,
  height: 1600,
  sharpness: 120.5,
  brightness: 100.25,
  flags: i === 1 ? ["soft"] : [],
  web_bytes: 1000 + i,
}));
const commit = await call(
  "/review/commit",
  { batch_id: batch.json.batch_id, photos },
  pub,
);
check("four photos are recorded", commit.json.added === 4, commit);
const again = await call(
  "/review/batch",
  {
    label: { name: "varsity vs wheatfield", sport: "hockey", date: "2026-10-24" },
    folder: "again",
    counts: { photos: 4, videos: 0 },
    hashes,
  },
  pub,
);
check(
  "sending the day again reports every photo as already there",
  again.json.known.length === 4,
  again.json,
);

console.log("\nReview (the owner)");
check("no sign-in, no access", (await call("/owner/folders", {})).status === 401);
const folders = await call("/owner/folders", {}, own);
check(
  "one folder with 4 waiting photos",
  folders.json.folders.length === 1 && folders.json.folders[0].waiting === 4,
  folders.json,
);
const folder = folders.json.folders[0].id;
const list = await call("/owner/photos", { folder, status: "waiting" }, own);
check(
  "photos come in the order taken, with links, hints and no raw paths",
  list.json.photos.length === 4 &&
    list.json.photos[0].filename === "IMG_1.JPG" &&
    list.json.photos[1].flags[0] === "soft" &&
    /^https:\/\/files\.test\//.test(list.json.photos[0].thumb_url) &&
    !("web_path" in list.json.photos[0]),
  list.json.photos[0],
);
check(
  "the camera-clock time is not shifted",
  list.json.photos[0].taken_at === "2026-10-24T10:00:00",
  list.json.photos[0].taken_at,
);
const id = (n: number) => list.json.photos[n].id as string;
check(
  "approve one",
  (await call("/owner/decide", { ids: [id(0)], status: "approved" }, own)).json
    .changed === 1,
);
check(
  "reject one with a reason",
  (
    await call(
      "/owner/decide",
      { ids: [id(1)], status: "rejected", reason: "out of focus" },
      own,
    )
  ).json.changed === 1,
);
check(
  "approve the rest never overrides the rejection",
  (await call("/owner/approve-waiting", { folder }, own)).json.changed === 2,
);
const rej = await call("/owner/photos", { folder, status: "rejected" }, own);
check(
  "the rejected photo keeps its reason",
  rej.json.photos.length === 1 && rej.json.photos[0].reason === "out of focus",
  rej.json,
);

console.log("\nFolders");
check(
  "rename a folder",
  (await call("/owner/rename", { folder, name: "Varsity vs Wheatfield (Hockey)" }, own))
    .json.ok === true,
);
const bad = await call("/owner/rename", { folder, name: "" }, own);
check(
  "an empty name is refused in the database's own words",
  bad.status === 400 && /1 to 200 characters/.test(bad.json.error),
  bad,
);
const split = await call(
  "/owner/new-folder",
  { ids: [id(3)], name: "JV Lacrosse vs Lockport", sport: "Lacrosse" },
  own,
);
check(
  "a photo that does not belong goes to a new folder",
  split.status === 200 && /^[0-9a-f-]{36}$/.test(split.json.folder),
  split,
);
const f2 = (await call("/owner/folders", {}, own)).json.folders;
const lax = f2.find((f: any) => f.name === "JV Lacrosse vs Lockport");
check(
  "the new folder has the photo, waiting, on the day it was taken, and the day is flagged",
  lax &&
    lax.waiting === 1 &&
    lax.event_date === "2026-10-24" &&
    f2.every((f: any) => f.same_day === 1),
  f2,
);
check(
  "move it back",
  (await call("/owner/move", { ids: [id(3)], folder }, own)).json.moved === 1,
);

console.log("\nTeams");
const teams = (await call("/owner/teams", {}, own)).json.teams;
check(
  "your four teams, all public",
  teams.length === 4 && teams.every((t: any) => t.visibility === "public"),
  teams.map((t: any) => t.name),
);
const created = await call("/owner/create-team", { name: "Orchard Park Quakers" }, own);
check("create a new team", created.status === 200);
check(
  "one name cannot be used twice",
  (await call("/owner/create-team", { name: "orchard park quakers" }, own)).status ===
    400,
);
check(
  "file a folder under a team",
  (await call("/owner/set-team", { folder, team: created.json.team }, own)).json.ok ===
    true,
);
check(
  "switch one team private",
  (
    await call(
      "/owner/team-visibility",
      { team: created.json.team, visibility: "private" },
      own,
    )
  ).json.ok === true,
);
check(
  "the folder list shows its team",
  (await call("/owner/folders", {}, own)).json.folders.some(
    (f: any) => f.team_name === "Orchard Park Quakers",
  ),
);

console.log("\nPage switches");
const getPages = async () => {
  const res = await handle(
    new Request(BASE + "/site/pages", { method: "GET" }),
    await deps(),
  );
  return {
    status: res.status,
    cache: res.headers.get("cache-control"),
    json: (await res.json()) as any,
  };
};
const pagesOut = await getPages();
check(
  "the public list is readable with no sign-in, 15 page groups, all off, cached a minute",
  pagesOut.status === 200 &&
    pagesOut.json.pages.length === 15 &&
    pagesOut.json.pages.every((p: any) => p.enabled === false) &&
    pagesOut.cache === "public, max-age=60",
  pagesOut.cache,
);
check(
  "the public list carries no count",
  pagesOut.json.pages.every((p: any) => !("interest" in p)),
);
const asked0 = await call(
  "/site/interest",
  { slug: "athletes" },
  { "cf-connecting-ip": "203.0.113.7" },
);
check(
  "asking for a page that is not listed as coming soon is refused in words",
  asked0.status === 400 && /not listed as coming soon/.test(asked0.json.error),
  asked0,
);
check(
  "the owner lists Athlete Spotlight as coming soon",
  (await call("/owner/page-set", { slug: "athletes", coming_soon: true }, own)).json
    .ok === true,
);
check(
  "it now shows as coming soon, still off",
  (await getPages()).json.pages.find((p: any) => p.slug === "athletes").coming_soon ===
    true,
);
const a1 = await call(
  "/site/interest",
  { slug: "athletes" },
  { "cf-connecting-ip": "203.0.113.7" },
);
const a2 = await call(
  "/site/interest",
  { slug: "athletes" },
  { "cf-connecting-ip": "203.0.113.7" },
);
const a3 = await call(
  "/site/interest",
  { slug: "athletes" },
  { "cf-connecting-ip": "203.0.113.8" },
);
check(
  "an 'I'd like this' is counted once per visitor",
  a1.json.counted === true && a2.json.counted === false && a3.json.counted === true,
  [a1.json, a2.json, a3.json],
);
const stored = await sql`select voter_hash from site.page_interest`;
check(
  "only fingerprints are stored, never an address",
  stored.length === 2 &&
    stored.every(
      (r: any) => /^[0-9a-f]{64}$/.test(r.voter_hash) && !r.voter_hash.includes("203"),
    ),
  stored,
);
check("no sign-in, no counts", (await call("/owner/pages", {})).status === 401);
const owned = await call("/owner/pages", {}, own);
check(
  "the owner sees 2 people asked for Athlete Spotlight",
  owned.json.pages.find((p: any) => p.slug === "athletes").interest === 2,
  owned.json.pages.find((p: any) => p.slug === "athletes"),
);
check(
  "the owner switches the page on",
  (await call("/owner/page-set", { slug: "athletes", enabled: true }, own)).json.ok ===
    true,
);
const on = (await getPages()).json.pages.find((p: any) => p.slug === "athletes");
check(
  "it is on and no longer listed as coming soon",
  on.enabled === true && on.coming_soon === false,
  on,
);
check(
  "asking for a page that is now on is refused",
  (
    await call(
      "/site/interest",
      { slug: "athletes" },
      { "cf-connecting-ip": "203.0.113.9" },
    )
  ).status === 400,
);
check(
  "the owner switches it off again",
  (await call("/owner/page-set", { slug: "athletes", enabled: false }, own)).json.ok ===
    true &&
    (await getPages()).json.pages.find((p: any) => p.slug === "athletes").enabled ===
      false,
);
check(
  "an unknown page is refused in words",
  (await call("/owner/page-set", { slug: "no-such-page", enabled: true }, own))
    .status === 400,
);

console.log("\nPublic team pages");
const getJson = async (route: string) => {
  const res = await handle(new Request(BASE + route, { method: "GET" }), await deps());
  return { status: res.status, json: (await res.json()) as any };
};
const pubObjects = async () =>
  Number(
    (
      await sql`select count(*)::int n from storage.objects where bucket_id = 'review-public'`
    )[0].n,
  );
check(
  "before anything is approved and filed, no team has a public page",
  (await getJson("/site/teams")).json.teams.length === 0,
);
const teamsNow = (await call("/owner/teams", {}, own)).json.teams;
const chiefs = teamsNow.find((t: any) => t.slug === "cazenovia-chiefs");
const allFolders = (await call("/owner/folders", {}, own)).json.folders;
// the folder that holds the photos (an earlier step left an empty one behind)
const f1 = allFolders.sort(
  (a: any, b: any) =>
    b.waiting + b.approved + b.rejected - (a.waiting + a.approved + a.rejected),
)[0].id;
const ph = (await call("/owner/photos", { folder: f1, status: "all" }, own)).json
  .photos;
const ids2 = ph
  .filter((p: any) => p.status !== "rejected")
  .slice(0, 2)
  .map((p: any) => p.id);
await call("/owner/decide", { ids: ids2, status: "approved" }, own);
check(
  "approved photos in a folder with no team stay private",
  (await pubObjects()) === 0 && (await getJson("/site/teams")).json.teams.length === 0,
);
const filed = await call("/owner/set-team", { folder: f1, team: chiefs.id }, own);
check(
  "filing the folder under a public team publishes them (2 photos, 4 files copied)",
  filed.json.public.published === 2 && (await pubObjects()) === 4,
  filed.json,
);
const lst = await getJson("/site/teams");
check(
  "the team is listed with its 2 photos and a public cover",
  lst.json.teams.length === 1 &&
    lst.json.teams[0].photos === 2 &&
    /^https:\/\/public\.test\//.test(lst.json.teams[0].cover_url),
  lst.json,
);
const teamPage = await getJson("/site/team?slug=cazenovia-chiefs");
check(
  "its page has the album and the photos in the order taken, with public addresses only",
  teamPage.status === 200 &&
    teamPage.json.albums.length === 1 &&
    teamPage.json.albums[0].photos.length === 2 &&
    teamPage.json.albums[0].photos.every(
      (p: any) => /^https:\/\/public\.test\//.test(p.web_url) && !("web_path" in p),
    ),
  teamPage.json,
);
const rejectedOne = await call(
  "/owner/decide",
  { ids: [ids2[0]], status: "rejected", reason: "blurry" },
  own,
);
check(
  "rejecting one takes it down (its 2 files leave the public bucket)",
  rejectedOne.json.public.unpublished === 1 && (await pubObjects()) === 2,
  rejectedOne.json,
);
check(
  "the page now has 1 photo",
  (await getJson("/site/team?slug=cazenovia-chiefs")).json.albums[0].photos.length ===
    1,
);
const priv = await call(
  "/owner/team-visibility",
  { team: chiefs.id, visibility: "private" },
  own,
);
check(
  "making the team private takes the rest down and removes the page",
  priv.json.public.unpublished === 1 &&
    (await pubObjects()) === 0 &&
    (await getJson("/site/team?slug=cazenovia-chiefs")).status === 404,
  priv.json,
);
const publicAgain = await call(
  "/owner/team-visibility",
  { team: chiefs.id, visibility: "public" },
  own,
);
check(
  "making it public again brings the approved photo back",
  publicAgain.json.public.published === 1 && (await pubObjects()) === 2,
  publicAgain.json,
);
check(
  "an unknown team is a plain 404",
  (await getJson("/site/team?slug=no-such-team")).status === 404,
);

await sql.end();
console.log(`\n${checks - failures}/${checks} checks passed`);
Deno.exit(failures === 0 ? 0 : 1);
