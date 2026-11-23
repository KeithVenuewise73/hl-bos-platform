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
import { makeSocialPublisher } from "../../supabase/functions/_shared/review/social.ts";

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

// --- A stand-in for Meta's Graph API: records every request and answers like Meta does. ---
const META_TOKEN = "EAAG" + "t".repeat(60);
const metaCalls: { method: string; url: string; body: any }[] = [];
let metaFailInstagram = false;
const metaFetch = (url: string, init?: RequestInit): Promise<Response> => {
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  metaCalls.push({ method: init?.method ?? "GET", url, body });
  const reply = (status: number, b: unknown) =>
    Promise.resolve(new Response(JSON.stringify(b), { status }));
  const u = new URL(url);
  const path = u.pathname.replace(/^\/v[\d.]+/, "");
  if (metaFailInstagram && path.startsWith("/17841400000000001/")) {
    return reply(400, { error: { message: "Media could not be fetched", code: 9004 } });
  }
  if (path.endsWith("/media_publish"))
    return reply(200, { id: "ig_media_" + metaCalls.length });
  if (path.endsWith("/media"))
    return reply(200, { id: "container_" + metaCalls.length });
  if (path.endsWith("/photos")) return reply(200, { id: "ph_" + metaCalls.length });
  if (path.endsWith("/feed"))
    return reply(200, { id: "100000000000001_" + metaCalls.length });
  if (u.searchParams.get("fields")?.includes("status_code"))
    return reply(200, { status_code: "FINISHED" });
  if (u.searchParams.get("fields")?.includes("permalink"))
    return reply(200, {
      permalink: "https://www.instagram.com/p/FAKE" + metaCalls.length + "/",
    });
  return reply(200, {});
};
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
      async removePrivate(paths) {
        await sql`delete from storage.objects where bucket_id = 'review-photos' and name = any(${paths})`;
      },
      // A short-lived download link on the private storage (the stand-in just spells it out).
      signedDownload: (path, name, seconds) =>
        Promise.resolve(`https://files.test/dl/${path}?name=${name}&exp=${seconds}`),
      publicUrl: (path) => `https://public.test/${path}`,
      signedUrls: (paths, s) =>
        Promise.resolve(
          new Map(paths.map((p) => [p, `https://files.test/${p}?exp=${s}`])),
        ),
    },
    publisherKeySha256: fp,
    ownerEmails: ["owner@example.test"],
    voterSalt: "s".repeat(40),
    // The REAL Instagram / Facebook code, talking to a stand-in for Meta (metaFetch below).
    social: makeSocialPublisher({
      secret: (name) => (name === "META_PAGE_TOKEN" ? META_TOKEN : undefined),
      fetcher: (url, init) => metaFetch(String(url), init),
      sleep: () => Promise.resolve(),
    }),
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

// A large copy (3,600 px) for each photo already sent: the website says which ones still need one.
check(
  "sending the day again also lists the 4 photos that still have no large copy, with the batch their files live under",
  again.json.need_large.length === 4 &&
    again.json.need_large.every(
      (n: { batch_id: string }) => n.batch_id === batch.json.batch_id,
    ),
  again.json.need_large,
);
const largeUp = await call(
  "/review/uploads",
  {
    batch_id: again.json.batch_id,
    files: hashes.slice(0, 3).map((hash: string) => ({
      hash,
      kind: "large",
      batch_id: again.json.need_large.find((n: { hash: string }) => n.hash === hash)
        .batch_id,
    })),
  },
  pub,
);
check(
  "their large files are uploaded under the ORIGINAL batch's folder, not the new send's",
  largeUp.json.uploads.length === 3 &&
    uploaded.filter(
      (u) => u.includes(batch.json.batch_id + "/") && u.endsWith("-large.jpg"),
    ).length === 3,
  uploaded.filter((u) => u.endsWith("-large.jpg")),
);
const attachedLarge = await call(
  "/review/large",
  { items: hashes.slice(0, 4).map((h: string) => ({ hash: h, bytes: 2500000 })) },
  pub,
);
check(
  "3 large copies are recorded; the 4th (no file uploaded) is not",
  attachedLarge.json.attached === 3 &&
    (
      await sql`select count(*)::int n from review.photos where large_path is not null`
    )[0].n === 3,
  attachedLarge,
);
check(
  "a third send now lists only the one photo still needing a large copy",
  (
    await call(
      "/review/batch",
      {
        label: { name: "varsity vs wheatfield", sport: "hockey", date: "2026-10-24" },
        folder: "third",
        counts: { photos: 4, videos: 0 },
        hashes,
      },
      pub,
    )
  ).json.need_large.length === 1,
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
// Download large: the private file, by a short-lived link, only while the switch is on.
const lg = await sql`select id from review.photos
  where public_at is not null and large_path is not null order by filename limit 1`;
// (make sure one public photo has no large copy)
await sql`update review.photos set large_path = null, large_bytes = null
  where id = (select id from review.photos where public_at is not null and large_path is not null
              order by filename offset 1 limit 1)`;
const noLg = await sql`select id from review.photos
  where public_at is not null and large_path is null order by filename limit 1`;
const dlRes = async (q: string) => {
  const r = await handle(
    new Request(BASE + "/site/large?" + q, { method: "GET" }),
    await deps(),
  );
  return {
    status: r.status,
    location: r.headers.get("location"),
    cache: r.headers.get("cache-control"),
  };
};
const dl1 = await dlRes(`photo=${lg[0].id}&name=Team_Game_IMG%201.JPG`);
check(
  "Download large for a public photo with a large copy gives a short-lived private link, named safely",
  dl1.status === 302 &&
    /^https:\/\/files\.test\/dl\/.+-large\.jpg\?name=Team_Game_IMG-1\.JPG&exp=300$/.test(
      dl1.location ?? "",
    ) &&
    dl1.cache === "no-store",
  dl1,
);
check(
  "a public photo with no large copy is simply not available",
  (await dlRes(`photo=${noLg[0].id}`)).status === 404,
);
const pageLarge = await getJson("/site/team?slug=cazenovia-chiefs");
check(
  "the public team page says downloads are on and which photos have a large copy, never where it is kept",
  pageLarge.json.large_downloads === true &&
    pageLarge.json.albums[0].photos.some((p: { large: boolean }) => p.large === true) &&
    pageLarge.json.albums[0].photos.some(
      (p: { large: boolean }) => p.large === false,
    ) &&
    !JSON.stringify(pageLarge.json).includes("-large.jpg"),
  pageLarge.json,
);
const swOff = await call("/owner/large-downloads", { enabled: false }, own);
check(
  "the owner's switch turns large downloads off everywhere at once",
  swOff.json.enabled === false &&
    (await dlRes(`photo=${lg[0].id}`)).status === 403 &&
    (await getJson("/site/team?slug=cazenovia-chiefs")).json.large_downloads === false,
  swOff.json,
);
const swOn = await call("/owner/large-downloads", { enabled: true }, own);
check(
  "and back on again, with nothing to put back",
  swOn.json.enabled === true && (await dlRes(`photo=${lg[0].id}`)).status === 302,
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

// An empty duplicate folder can be deleted; a folder with photos cannot, and nothing is lost.
const [dup] = await sql`insert into review.folders (name, event_date)
  values ('Duplicate of a game', '2026-10-24') returning id`;
const photosBefore = (await sql`select count(*)::int as n from review.photos`)[0].n;
const delEmpty = await call("/owner/delete-folder", { folder: dup.id }, own);
check(
  "an empty folder is deleted",
  delEmpty.json.ok === true &&
    (await sql`select count(*)::int as n from review.folders where id = ${dup.id}`)[0]
      .n === 0,
  delEmpty,
);
const delFull = await call("/owner/delete-folder", { folder: f1 }, own);
check(
  "a folder with photos is refused in plain words, and no photo is lost",
  delFull.status === 400 &&
    /still has photos/.test(delFull.json.error) &&
    (await sql`select count(*)::int as n from review.photos`)[0].n === photosBefore,
  delFull,
);

// Deleting photos that are not approved: their rows and files go; an approved photo is kept.
const [fx] = await sql`insert into review.folders (name, event_date)
  values ('Delete-photos fixture', '2026-10-25') returning id`;
const [fxb] =
  await sql`insert into review.batches (folder_id, source_folder, photo_count, video_count)
  values (${fx.id}, 'x', 3, 0) returning id`;
const fxPhotos: { id: string; hash: string; status: string }[] = [];
for (const [hash, status] of [
  ["d".repeat(64), "approved"],
  ["e".repeat(64), "waiting"],
  ["f".repeat(64), "rejected"],
] as const) {
  const [row] = await sql`insert into review.photos
    (batch_id, folder_id, file_hash, filename, web_bytes, web_path, thumb_path, status, decided_at)
    values (${fxb.id}, ${fx.id}, ${hash}, ${"FX_" + status + ".JPG"}, 10,
            ${fxb.id + "/" + hash + "-web.jpg"}, ${fxb.id + "/" + hash + "-thumb.jpg"},
            ${status}, ${status === "waiting" ? null : sql`now()`})
    returning id`;
  await sql`insert into storage.objects (bucket_id, name) values
    ('review-photos', ${fxb.id + "/" + hash + "-web.jpg"}),
    ('review-photos', ${fxb.id + "/" + hash + "-thumb.jpg"})`;
  fxPhotos.push({ id: row.id, hash, status });
}
const filesOf = async () =>
  (
    await sql`select count(*)::int as n from storage.objects
      where bucket_id = 'review-photos' and name like ${fxb.id + "/%"}`
  )[0].n;
check("the fixture starts with 3 photos and 6 files", (await filesOf()) === 6);
const delPhotos = await call(
  "/owner/delete-photos",
  { ids: fxPhotos.map((p) => p.id) },
  own,
);
check(
  "deleting 3 photos deletes the waiting and the rejected one, and keeps the approved one",
  delPhotos.json.deleted === 2 && delPhotos.json.kept === 1,
  delPhotos,
);
check(
  "their files are gone from storage; the approved photo's files stay",
  (await filesOf()) === 2 &&
    (
      await sql`select count(*)::int as n from review.photos where folder_id = ${fx.id}`
    )[0].n === 1 &&
    (await sql`select status from review.photos where folder_id = ${fx.id}`)[0]
      .status === "approved",
  delPhotos,
);
const delApprovedAgain = await call(
  "/owner/delete-photos",
  { ids: [fxPhotos[0]!.id] },
  own,
);
check(
  "asking to delete only the approved photo deletes nothing",
  delApprovedAgain.json.deleted === 0 && (await filesOf()) === 2,
  delApprovedAgain,
);

// Deleting a photo that is not approved removes its large file as well.
const [lgFolder] =
  await sql`insert into review.folders (name, event_date) values ('Large-delete fixture', '2026-10-26') returning id`;
const [lgBatch] =
  await sql`insert into review.batches (folder_id, source_folder, photo_count, video_count)
  values (${lgFolder.id}, 'x', 1, 0) returning id`;
const lgHash = "c".repeat(64);
const lgBase = lgBatch.id + "/" + lgHash;
const [lgPhoto] = await sql`insert into review.photos
  (batch_id, folder_id, file_hash, filename, web_bytes, web_path, thumb_path, large_path, large_bytes)
  values (${lgBatch.id}, ${lgFolder.id}, ${lgHash}, 'LG.JPG', 10, ${lgBase + "-web.jpg"}, ${lgBase + "-thumb.jpg"}, ${lgBase + "-large.jpg"}, 20)
  returning id`;
await sql`insert into storage.objects (bucket_id, name) values
  ('review-photos', ${lgBase + "-web.jpg"}), ('review-photos', ${lgBase + "-thumb.jpg"}), ('review-photos', ${lgBase + "-large.jpg"})`;
const delLg = await call("/owner/delete-photos", { ids: [lgPhoto.id] }, own);
check(
  "deleting an unapproved photo removes its large file along with the web copy and thumbnail",
  delLg.json.deleted === 1 &&
    (
      await sql`select count(*)::int n from storage.objects where bucket_id = 'review-photos' and name like ${lgBatch.id + "/%"}`
    )[0].n === 0,
  delLg.json,
);

// Renaming a team: the name changes, the page address does not; a taken or empty name is refused.
const [chiefsRow] =
  await sql`select id, slug from review.teams where slug = 'cazenovia-chiefs'`;
const renamedTeam = await call(
  "/owner/rename-team",
  { team: chiefsRow.id, name: "Cazenovia Chiefs Varsity" },
  own,
);
const [afterRename] =
  await sql`select name, slug from review.teams where id = ${chiefsRow.id}`;
check(
  "a team is renamed, and its page address stays the same",
  renamedTeam.json.ok === true &&
    afterRename.name === "Cazenovia Chiefs Varsity" &&
    afterRename.slug === "cazenovia-chiefs",
  { renamedTeam: renamedTeam.json, afterRename },
);
const taken = await call(
  "/owner/rename-team",
  { team: chiefsRow.id, name: "cheektowaga warriors" },
  own,
);
check(
  "a name another team already has (any capitals) is refused in words",
  taken.status === 400 && /already a team with that name/.test(taken.json.error),
  taken,
);
const blankTeam = await call(
  "/owner/rename-team",
  { team: chiefsRow.id, name: "   " },
  own,
);
check(
  "a blank team name is refused in words",
  blankTeam.status === 400 && /1 to 120 characters/.test(blankTeam.json.error),
  blankTeam,
);
await call("/owner/rename-team", { team: chiefsRow.id, name: "Cazenovia Chiefs" }, own);

// --- Posting approved photos to Instagram and Facebook (migration 0058), against the stand-in ---
await sql`insert into review.social_accounts (platform, external_account_id, display_name, facebook_page_id, token_secret_name)
  values ('facebook_page', '100000000000001', '5Star Facebook', null, 'META_PAGE_TOKEN'),
         ('instagram', '17841400000000001', '5Star Instagram', '100000000000001', 'META_PAGE_TOKEN')`;
const accts = await call("/owner/social/accounts", {}, own);
check(
  "the owner sees the two connected accounts, and posting is switched on",
  accts.json.enabled === true && accts.json.accounts.length === 2,
  accts.json,
);
// Two approved photos on a public team's page to post (approving publishes them).
const f1Ids = (await sql`select id from review.photos where folder_id = ${f1}`).map(
  (r) => r.id,
);
await call("/owner/decide", { ids: f1Ids, status: "approved" }, own);
const postable =
  await sql`select id from review.photos where status = 'approved' and public_at is not null
  order by taken_at, filename limit 2`;
const accountIds = accts.json.accounts.map((a: { id: string }) => a.id);
const posted = await call(
  "/owner/social/post",
  {
    photos: postable.map((r) => r.id),
    caption: "Game one, from 5-Star Sports Media",
    accounts: accountIds,
  },
  own,
);
check(
  "pressing Post records the post, approved by the owner, with nothing sent yet",
  typeof posted.json.post === "string" &&
    metaCalls.length === 0 &&
    (
      await sql`select approved_by from review.social_posts where id = ${posted.json.post}`
    )[0].approved_by === OWNER_ID,
  posted,
);
let step: any = null;
let rounds = 0;
do {
  step = await call("/owner/social/publish", { post: posted.json.post }, own);
  rounds++;
} while (step.json.done === false && rounds < 5);
check(
  "publishing works through the two accounts one at a time and ends 'published'",
  step.json.done === true && step.json.post.status === "published" && rounds === 2,
  step.json,
);
const targets = await sql`select a.platform, t.status, t.external_post_id, t.permalink
  from review.social_targets t join review.social_accounts a on a.id = t.account_id
  where t.post_id = ${posted.json.post} order by a.platform`;
check(
  "each account has the id Meta returned (a success is only what Meta said)",
  targets.length === 2 &&
    targets.every((t) => t.status === "published" && t.external_post_id && t.permalink),
  targets,
);
const fbFeed = metaCalls.find((c) => c.url.includes("/100000000000001/feed"));
check(
  "Facebook got both pictures as ONE post: uploaded unpublished, then attached with the caption",
  metaCalls.filter((c) => c.url.includes("/100000000000001/photos")).length === 2 &&
    metaCalls
      .filter((c) => c.url.includes("/100000000000001/photos"))
      .every((c) => c.body.published === false) &&
    fbFeed?.body.attached_media.length === 2 &&
    fbFeed?.body.message === "Game one, from 5-Star Sports Media",
);
const igPublish = metaCalls.filter((c) =>
  c.url.includes("/17841400000000001/media_publish"),
);
check(
  "Instagram got a two-picture carousel: one container per picture, one for the carousel, one publish",
  metaCalls.filter(
    (c) =>
      c.url.includes("/17841400000000001/media") && !c.url.includes("media_publish"),
  ).length === 3 && igPublish.length === 1,
  metaCalls.map(
    (c) => c.method + " " + c.url.replace(/^https:\/\/graph.facebook.com/, ""),
  ),
);
check(
  "the pictures were handed to Meta by their PUBLIC address, never a private one",
  metaCalls
    .filter((c) => c.body?.url || c.body?.image_url)
    .every((c) => /^https:\/\/public\.test\//.test(c.body.url ?? c.body.image_url)),
);
const leaked = await sql`select count(*)::int as n from review.social_attempts
  where request::text like ${"%" + META_TOKEN + "%"} or response::text like ${"%" + META_TOKEN + "%"}
     or error like ${"%" + META_TOKEN + "%"}`;
check(
  "every request is recorded, and the login token is nowhere in the record",
  (await sql`select count(*)::int as n from review.social_attempts`)[0].n >= 5 &&
    leaked[0].n === 0,
);
const was = await call("/owner/social/posted", { ids: postable.map((r) => r.id) }, own);
check(
  "the owner is told these photos were already posted (twice each: Instagram and Facebook)",
  was.json.posted.length === 4,
  was.json,
);

// A refusal by Instagram: the failure is recorded in words, Facebook still goes out, no fake success.
metaFailInstagram = true;
const second = await call(
  "/owner/social/post",
  { photos: [postable[0].id], caption: "Second try", accounts: accountIds },
  own,
);
let step2: any = null;
rounds = 0;
do {
  step2 = await call("/owner/social/publish", { post: second.json.post }, own);
  rounds++;
} while (step2.json.done === false && rounds < 5);
const t2 = await sql`select a.platform, t.status, t.external_post_id, t.error
  from review.social_targets t join review.social_accounts a on a.id = t.account_id
  where t.post_id = ${second.json.post} order by a.platform`;
check(
  "when Instagram refuses, the post is 'partly published': Facebook is out, Instagram shows Meta's reason and has no id",
  step2.json.post.status === "partly_published" &&
    t2.find((t) => t.platform === "facebook_page")?.status === "published" &&
    t2.find((t) => t.platform === "instagram")?.status === "failed" &&
    t2.find((t) => t.platform === "instagram")?.external_post_id === null &&
    /Media could not be fetched/.test(
      t2.find((t) => t.platform === "instagram")?.error ?? "",
    ),
  t2,
);
metaFailInstagram = false;

// Refusals in words.
const waitingPhoto =
  await sql`select id from review.photos where status <> 'approved' limit 1`;
if (waitingPhoto.length > 0) {
  const notApproved = await call(
    "/owner/social/post",
    { photos: [waitingPhoto[0].id], caption: "x", accounts: accountIds },
    own,
  );
  check(
    "a photo that is not approved cannot be posted, in words",
    notApproved.status === 400 && /only approved photos/.test(notApproved.json.error),
    notApproved,
  );
}
await sql`update review.social_accounts set token_secret_name = 'NOT_SET_ANYWHERE' where platform = 'facebook_page'`;
const third = await call(
  "/owner/social/post",
  { photos: [postable[1].id], caption: "No login", accounts: accountIds },
  own,
);
const callsBefore = metaCalls.length;
let step3: any = null;
rounds = 0;
do {
  step3 = await call("/owner/social/publish", { post: third.json.post }, own);
  rounds++;
} while (step3.json.done === false && rounds < 5);
const t3 = await sql`select a.platform, t.status, t.error from review.social_targets t
  join review.social_accounts a on a.id = t.account_id where t.post_id = ${third.json.post}`;
check(
  "an account whose login secret is missing fails in words, sends nothing to Meta for it, and the other account still posts",
  t3.find((t) => t.platform === "facebook_page")?.status === "failed" &&
    /not set up yet/.test(
      t3.find((t) => t.platform === "facebook_page")?.error ?? "",
    ) &&
    t3.find((t) => t.platform === "instagram")?.status === "published" &&
    metaCalls.slice(callsBefore).every((c) => !c.url.includes("/100000000000001/")),
  t3,
);
const recent = await call("/owner/social/recent", {}, own);
check(
  "the owner's history lists the three posts, newest first, with each account's result",
  recent.json.posts.length === 3 &&
    recent.json.posts[0].caption === "No login" &&
    recent.json.posts[0].targets.length === 2,
  recent.json.posts.map((p: { caption: string }) => p.caption),
);

// ---- Short video clips beside the photos of a game ----------------------------------------------
const CLIP_HASH = "c".repeat(64);
const clipBatch = await call(
  "/review/batch",
  {
    label: { name: "Clip game", sport: "Football", date: "2026-11-07" },
    folder: "clips",
    counts: { photos: 0, videos: 1 },
    hashes: [CLIP_HASH],
  },
  pub,
);
const clipUp = await call(
  "/review/uploads",
  {
    batch_id: clipBatch.json.batch_id,
    files: [
      { hash: CLIP_HASH, kind: "web" },
      { hash: CLIP_HASH, kind: "thumb" },
      { hash: CLIP_HASH, kind: "video" },
    ],
  },
  pub,
);
const clipPaths =
  await sql`select name from storage.objects where bucket_id = 'review-photos'
  and name like ${clipBatch.json.batch_id + "/%"}`;
check(
  "a clip goes up as three files under its batch: poster, thumbnail and an .mp4",
  clipUp.status === 200 &&
    clipPaths
      .map((r) => String(r.name).split("-").pop())
      .sort()
      .join() === "thumb.jpg,video.mp4,web.jpg",
  clipPaths.map((r) => r.name),
);
const clipCommit = await call(
  "/review/commit",
  {
    batch_id: clipBatch.json.batch_id,
    photos: [
      {
        hash: CLIP_HASH,
        kind: "video",
        filename: "C0001.MOV",
        taken_at: "2026-11-07T12:00:00",
        width: 1920,
        height: 1080,
        web_bytes: 1000,
        video_bytes: 5_000_000,
        duration: 14.2,
      },
    ],
  },
  pub,
);
check("the clip is recorded", clipCommit.json.added === 1, clipCommit);
const clipFolder = (await call("/owner/folders", {}, own)).json.folders.find(
  (f: { name: string }) => f.name === "Clip game",
);
check(
  "the folder counts the clip as one waiting item",
  clipFolder.waiting === 1,
  clipFolder,
);
const clipList = await call(
  "/owner/photos",
  { folder: clipFolder.id, status: "all" },
  own,
);
check(
  "the owner is shown it is a clip, 14.2 seconds, with an expiring link to play it",
  clipList.json.photos.length === 1 &&
    clipList.json.photos[0].video === true &&
    clipList.json.photos[0].duration === 14.2 &&
    String(clipList.json.photos[0].video_url).includes("-video.mp4"),
  clipList.json.photos[0],
);
const clipTeam = (await call("/owner/create-team", { name: "Clip Team" }, own)).json
  .team;
await sql`update review.teams set visibility = 'public' where id = ${clipTeam}`;
const publicBefore =
  await sql`select count(*)::int n from storage.objects where bucket_id = 'review-public'
  and name like ${clipBatch.json.batch_id + "/%"}`;
await call("/owner/set-team", { folder: clipFolder.id, team: clipTeam }, own);
const approvedClip = await call(
  "/owner/decide",
  { ids: [clipList.json.photos[0].id], status: "approved" },
  own,
);
const publicAfter =
  await sql`select name from storage.objects where bucket_id = 'review-public'
  and name like ${clipBatch.json.batch_id + "/%"}`;
check(
  "approved and filed under a public team, the clip is copied with its poster and thumbnail (nothing before)",
  publicBefore[0].n === 0 &&
    approvedClip.json.public.published === 1 &&
    publicAfter
      .map((r) => String(r.name).split("-").pop())
      .sort()
      .join() === "thumb.jpg,video.mp4,web.jpg",
  { before: publicBefore, after: publicAfter.map((r) => r.name) },
);
const clipSlug = (await sql`select slug from review.teams where id = ${clipTeam}`)[0]
  .slug;
const clipPage = await getJson(`/site/team?slug=${clipSlug}`);
const clipOnPage = clipPage.json.albums
  .flatMap((a: { photos: unknown[] }) => a.photos)
  .find((p: { filename: string }) => p.filename === "C0001.MOV");
check(
  "the public page lists it as a clip with its length and its public .mp4 address, and shows no storage path",
  clipOnPage?.video === true &&
    clipOnPage.duration === 14.2 &&
    /-video\.mp4$/.test(clipOnPage.video_url) &&
    !JSON.stringify(clipPage.json).includes("video_path"),
  clipOnPage,
);
const clipPost = await call(
  "/owner/social/post",
  {
    photos: [clipList.json.photos[0].id],
    accounts: [crypto.randomUUID()],
    caption: "Great play",
  },
  own,
);
check(
  "a clip cannot be posted to Instagram or Facebook as a photo",
  clipPost.status === 400 && /clips can't be posted/i.test(clipPost.json.error ?? ""),
  clipPost.json,
);
await call(
  "/owner/decide",
  { ids: [clipList.json.photos[0].id], status: "rejected", reason: "shaky" },
  own,
);
const publicGone =
  await sql`select count(*)::int n from storage.objects where bucket_id = 'review-public'
  and name like ${clipBatch.json.batch_id + "/%"}`;
check(
  "rejecting it takes the clip and its poster off the public bucket",
  publicGone[0].n === 0,
  publicGone,
);
const delClip = await call(
  "/owner/delete-photos",
  { ids: [clipList.json.photos[0].id] },
  own,
);
const privateLeft =
  await sql`select count(*)::int n from storage.objects where bucket_id = 'review-photos'
  and name like ${clipBatch.json.batch_id + "/%"}`;
check(
  "deleting a rejected clip also removes its mp4 and poster from private storage",
  delClip.json.deleted === 1 && privateLeft[0].n === 0,
  { delClip: delClip.json, privateLeft },
);

await sql.end();
console.log(`\n${checks - failures}/${checks} checks passed`);
Deno.exit(failures === 0 ? 0 : 1);
