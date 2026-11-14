// Photo review — the media-review Edge Function's decisions (Deno).
//
// Against an in-memory store and storage that behave like migration 0055's
// functions and the private bucket. Self-contained: no remote imports, so it
// runs offline (`deno test --no-check supabase/functions/tests/`). The database
// half (no web access, pinned paths, files must exist, the review rules) is
// covered by supabase/tests/55_media_review.sql.

import { createHash } from "node:crypto";

import {
  handle,
  keyMatches,
  routeOf,
  userFromAuth,
  type AuthUser,
  type FolderRow,
  clientAddress,
  voterFingerprint,
  syncPublic,
  type PageRow,
  type PublicRow,
  type PublicTeamPage,
  type PhotoRow,
  type ReviewDeps,
  type ReviewStore,
  type TeamRow,
} from "../_shared/review/core.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(
      `assertion failed: ${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`,
    );
}

const BASE = "https://x.test/functions/v1/media-review";
const KEY = "k".repeat(48);
const KEY_SHA = createHash("sha256").update(KEY).digest("hex");
const OWNER_ID = "99999999-9999-9999-9999-999999999999";
const OWNER: AuthUser = { id: OWNER_ID, email: "owner@example.test" };
const BATCH = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const FOLDER = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const FOLDER2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const TEAM = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";
const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

const PAGE_ROW: PageRow = {
  slug: "athletes",
  title: "Athlete Spotlight",
  blurb: "Athlete spotlights.",
  href: "athlete-spotlight.html",
  menu_label: "Athletes",
  menu_order: 10,
  paths: ["athlete-spotlight.html"],
  enabled: false,
  coming_soon: true,
};

/** What a sync reports when there was nothing to copy or take down. */
const SYNCED = { published: 0, unpublished: 0, failed: 0 };

function world(over: Partial<ReviewDeps> = {}) {
  const calls: string[] = [];
  const votes = new Set<string>();
  const pub = {
    wanted: [] as PublicRow[],
    unwanted: [] as PublicRow[],
    copied: [] as string[],
    removed: [] as string[],
    marked: [] as string[],
    cleared: [] as string[],
    failCopy: new Set<string>(),
  };
  const PAGE: PublicTeamPage = {
    team: { slug: "cazenovia-chiefs", name: "Cazenovia Chiefs" },
    albums: [
      {
        id: FOLDER,
        name: "Varsity vs Wheatfield",
        sport: "Hockey",
        event_date: "2026-10-24",
        photos: [
          {
            id: P1,
            filename: "IMG_1.JPG",
            taken_at: "2026-10-24T10:02:00",
            width: 2400,
            height: 1600,
            web_path: `${BATCH}/${H1}-web.jpg`,
            thumb_path: `${BATCH}/${H1}-thumb.jpg`,
          },
        ],
      },
    ],
  };
  let registered: string | null = null;
  let windowOpen = true;
  const known = new Set<string>([H2]);
  const store: ReviewStore = {
    registerPublisher(sha) {
      calls.push("register");
      if (registered === sha) return Promise.resolve("connected");
      if (registered !== null) return Promise.resolve("taken");
      if (!windowOpen) return Promise.resolve("closed");
      registered = sha;
      return Promise.resolve("connected");
    },
    createBatch(p) {
      calls.push("batch:" + p.name);
      return Promise.resolve({
        batchId: BATCH,
        known: p.hashes.filter((h) => known.has(h)),
      });
    },
    commitPhotos(_b, photos) {
      calls.push("commit:" + photos.length);
      return Promise.resolve(photos.length);
    },
    folders() {
      const f: FolderRow = {
        id: FOLDER,
        name: "Varsity",
        sport: "Hockey",
        event_date: "2026-10-24",
        team_id: null,
        team_name: null,
        waiting: 1,
        approved: 0,
        rejected: 0,
        same_day: 0,
      };
      return Promise.resolve([f]);
    },
    folderPhotos(folder, status, limit, offset) {
      calls.push(`photos:${folder}:${status}:${limit}:${offset}`);
      const p: PhotoRow = {
        id: P1,
        filename: "IMG_1.JPG",
        taken_at: "2026-10-24T10:02:00",
        date_estimated: false,
        width: 2400,
        height: 1600,
        flags: ["soft"],
        status: "waiting",
        reason: null,
        web_path: `${BATCH}/${H1}-web.jpg`,
        thumb_path: `${BATCH}/${H1}-thumb.jpg`,
        total: 7,
      };
      return Promise.resolve([p]);
    },
    decide(ids, status, reason, by) {
      calls.push(`decide:${ids.length}:${status}:${reason}:${by}`);
      return Promise.resolve(ids.length);
    },
    approveWaiting(folder, by) {
      calls.push(`approveWaiting:${folder}:${by}`);
      return Promise.resolve(3);
    },
    renameFolder(folder, name) {
      calls.push(`rename:${folder}:${name}`);
      if (name === "") {
        const e = new Error("a folder name is 1 to 200 characters") as Error & {
          code: string;
        };
        e.code = "22023";
        return Promise.reject(e);
      }
      return Promise.resolve();
    },
    movePhotos(ids, folder) {
      calls.push(`move:${ids.length}:${folder}`);
      return Promise.resolve(ids.length);
    },
    newFolderFromPhotos(ids, name, sport, date) {
      calls.push(`newFolder:${ids.length}:${name}:${sport}:${date}`);
      return Promise.resolve(FOLDER2);
    },
    setFolderTeam(folder, team) {
      calls.push(`setTeam:${folder}:${team}`);
      return Promise.resolve();
    },
    teams() {
      const t: TeamRow = {
        id: TEAM,
        slug: "cazenovia-chiefs",
        name: "Cazenovia Chiefs",
        visibility: "public",
        folders: 1,
      };
      return Promise.resolve([t]);
    },
    createTeam(name) {
      calls.push("createTeam:" + name);
      return Promise.resolve(TEAM);
    },
    setTeamVisibility(team, v) {
      calls.push(`visibility:${team}:${v}`);
      return Promise.resolve();
    },
    publicPages() {
      return Promise.resolve([PAGE_ROW]);
    },
    ownerPages() {
      return Promise.resolve([{ ...PAGE_ROW, interest: 4 }]);
    },
    setPage(slug, enabled, comingSoon) {
      calls.push(`page:${slug}:${enabled}:${comingSoon}`);
      return Promise.resolve();
    },
    publicWanted() {
      return Promise.resolve(pub.wanted);
    },
    publicUnwanted() {
      return Promise.resolve(pub.unwanted);
    },
    markPublic(ids) {
      pub.marked.push(...ids);
      return Promise.resolve(ids.length);
    },
    clearPublic(ids) {
      pub.cleared.push(...ids);
      return Promise.resolve(ids.length);
    },
    publicTeams() {
      return Promise.resolve([
        {
          slug: "cazenovia-chiefs",
          name: "Cazenovia Chiefs",
          albums: 1,
          photos: 1,
          cover_thumb: `${BATCH}/${H1}-thumb.jpg`,
        },
      ]);
    },
    publicTeam(slug) {
      return Promise.resolve(slug === "cazenovia-chiefs" ? PAGE : null);
    },
    recordInterest(slug, voter) {
      calls.push(`interest:${slug}:${voter}`);
      const first = !votes.has(slug + voter);
      votes.add(slug + voter);
      return Promise.resolve(first);
    },
  };
  const requested: string[] = [];
  const deps: ReviewDeps = {
    store,
    files: {
      signedUrls(paths, seconds) {
        requested.push(`signed:${seconds}`);
        return Promise.resolve(
          new Map(paths.map((p) => [p, `https://files.test/${p}?sig=1`])),
        );
      },
      signedUploadUrl(path) {
        requested.push("upload:" + path);
        return Promise.resolve(`https://files.test/upload/${path}`);
      },
      copyToPublic(path) {
        if (pub.failCopy.has(path)) return Promise.reject(new Error("storage down"));
        pub.copied.push(path);
        return Promise.resolve();
      },
      removePublic(paths) {
        pub.removed.push(...paths);
        return Promise.resolve();
      },
      publicUrl(path) {
        return `https://public.test/${path}`;
      },
    },
    publisherKeySha256: null,
    ownerEmails: [OWNER.email],
    voterSalt: "salt-salt-salt-salt-salt-salt-salt-1234",
    now: () => Date.UTC(2026, 10, 14, 12, 0, 0),
    verifyUser(token) {
      return Promise.resolve(
        token === "owner-token"
          ? OWNER
          : token === "other-token"
            ? { id: P1, email: "someone@else.test" }
            : null,
      );
    },
    ...over,
  };
  return {
    deps,
    calls,
    requested,
    pub,
    closeWindow: () => (windowOpen = false),
    setPublisher: (sha: string | null) => (deps.publisherKeySha256 = sha),
  };
}

function post(route: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const asOwner = { authorization: "Bearer owner-token" };
const asPublisher = { "x-review-publisher-key": KEY };
async function out(res: Response) {
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, any>,
  };
}

// ---------------------------------------------------------------------------

Deno.test("the route is read after the function's own name", () => {
  assertEquals(routeOf(new URL(BASE + "/owner/photos/")), "/owner/photos", "route");
  assertEquals(routeOf(new URL("https://x.test/media-review")), "/", "no route");
});

Deno.test(
  "a key is checked by its fingerprint; no publisher yet means no publishing",
  () => {
    assert(keyMatches(KEY, KEY_SHA), "the right key");
    assert(!keyMatches("wrong", KEY_SHA), "a wrong key");
    assert(!keyMatches(KEY, null), "no publisher registered");
    assert(!keyMatches("", KEY_SHA), "an empty key");
    assert(!keyMatches(KEY, "not-hex"), "a malformed fingerprint");
  },
);

Deno.test("only a confirmed sign-in counts as a person", () => {
  const ok = {
    id: OWNER_ID,
    email: "Owner@Example.test ",
    email_confirmed_at: "2026-11-14T10:00:00Z",
  };
  assertEquals(
    userFromAuth(ok),
    { id: OWNER_ID, email: "owner@example.test" },
    "emails are lower-cased",
  );
  assert(
    userFromAuth({ ...ok, email_confirmed_at: null }) === null,
    "an unconfirmed email is nobody",
  );
  assert(
    userFromAuth({ ...ok, email_confirmed_at: undefined }) === null,
    "no confirmation is nobody",
  );
  assert(userFromAuth({ ...ok, id: "nope" }) === null, "a bad id is nobody");
  assert(userFromAuth({ ...ok, email: "" }) === null, "no email is nobody");
  assert(userFromAuth(null) === null && userFromAuth("x") === null, "junk is nobody");
});

Deno.test("DateSort connects by sending only its key's fingerprint, once", async () => {
  const w = world();
  assertEquals(
    (await out(await handle(post("/review/register", { key_sha256: "nope" }), w.deps)))
      .status,
    400,
    "bad fingerprint",
  );
  const first = await out(
    await handle(post("/review/register", { key_sha256: KEY_SHA }), w.deps),
  );
  assertEquals(first.json["status"], "connected", "first registration");
  const other = await out(
    await handle(post("/review/register", { key_sha256: "c".repeat(64) }), w.deps),
  );
  assertEquals(
    [other.status, other.json["status"]],
    [409, "taken"],
    "another computer is refused",
  );
  const w2 = world();
  w2.closeWindow();
  const closed = await out(
    await handle(post("/review/register", { key_sha256: KEY_SHA }), w2.deps),
  );
  assertEquals([closed.status, closed.json["status"]], [403, "closed"], "no window");
});

Deno.test(
  "sending needs the publisher key; the wrong key or none gets nothing",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const body = {
      label: { name: "Varsity", sport: "Hockey", date: "2026-10-24" },
      folder: "x",
      counts: { photos: 2, videos: 0 },
      hashes: [H1, H2],
    };
    assertEquals(
      (await out(await handle(post("/review/batch", body), w.deps))).status,
      401,
      "no key",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/review/batch", body, { "x-review-publisher-key": "wrong" }),
            w.deps,
          ),
        )
      ).status,
      401,
      "wrong key",
    );
    const none = world();
    assertEquals(
      (await out(await handle(post("/review/batch", body, asPublisher), none.deps)))
        .status,
      401,
      "no publisher registered yet",
    );
    assertEquals(w.calls.length, 0, "nothing reached the store");
  },
);

Deno.test(
  "a send: the batch learns what is already there, uploads go only to this batch's own paths, the commit records the photos",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const batch = await out(
      await handle(
        post(
          "/review/batch",
          {
            label: { name: "Varsity", sport: "Hockey", date: "2026-10-24" },
            folder: "2026-10-24 - Hockey",
            counts: { photos: 2, videos: 1 },
            hashes: [H1, H2],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(
      batch.json,
      { batch_id: BATCH, known: [H2] },
      "batch and known fingerprints",
    );

    const up = await out(
      await handle(
        post(
          "/review/uploads",
          {
            batch_id: BATCH,
            files: [
              { hash: H1, kind: "web" },
              { hash: H1, kind: "thumb" },
            ],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(
      up.json["uploads"].map((u: any) => u.url),
      [
        `https://files.test/upload/${BATCH}/${H1}-web.jpg`,
        `https://files.test/upload/${BATCH}/${H1}-thumb.jpg`,
      ],
      "own paths only",
    );
    assertEquals(
      (
        await out(
          await handle(
            post(
              "/review/uploads",
              { batch_id: BATCH, files: [{ hash: "../../x", kind: "web" }] },
              asPublisher,
            ),
            w.deps,
          ),
        )
      ).status,
      400,
      "a path cannot be smuggled in as a hash",
    );
    assertEquals(
      (
        await out(
          await handle(
            post(
              "/review/uploads",
              { batch_id: BATCH, files: [{ hash: H1, kind: "original" }] },
              asPublisher,
            ),
            w.deps,
          ),
        )
      ).status,
      400,
      "only web or thumb",
    );
    assertEquals(
      (
        await out(
          await handle(
            post(
              "/review/uploads",
              { batch_id: "not-a-uuid", files: [{ hash: H1, kind: "web" }] },
              asPublisher,
            ),
            w.deps,
          ),
        )
      ).status,
      400,
      "batch id must be a uuid",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/review/uploads", { batch_id: BATCH, files: [] }, asPublisher),
            w.deps,
          ),
        )
      ).status,
      400,
      "no files asked for",
    );

    const commit = await out(
      await handle(
        post(
          "/review/commit",
          {
            batch_id: BATCH,
            photos: [{ hash: H1, filename: "IMG_1.JPG", web_bytes: 5 }],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(commit.json, { added: 1 }, "commit");
    assertEquals(
      (
        await out(
          await handle(
            post(
              "/review/commit",
              { batch_id: BATCH, photos: [{ hash: "zzz" }] },
              asPublisher,
            ),
            w.deps,
          ),
        )
      ).status,
      400,
      "a photo needs its fingerprint",
    );
  },
);

Deno.test(
  "a batch needs a real date and real fingerprints, and the number of photos is limited",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const bad = async (b: unknown) =>
      (await out(await handle(post("/review/batch", b, asPublisher), w.deps))).status;
    assertEquals(
      await bad({ label: { name: "x", date: "tomorrow" }, hashes: [] }),
      400,
      "date",
    );
    assertEquals(
      await bad({ label: { name: "x", date: "2026-10-24" }, hashes: ["short"] }),
      400,
      "fingerprints",
    );
    assertEquals(
      await bad({
        label: { name: "x", date: "2026-10-24" },
        hashes: new Array(20_001).fill(H1),
      }),
      400,
      "too many",
    );
  },
);

Deno.test(
  "the owner routes: nobody without a sign-in, nobody who is not the owner, nobody at all when no owner is set up",
  async () => {
    const w = world();
    assertEquals(
      (await out(await handle(post("/owner/folders", {}), w.deps))).status,
      401,
      "no token",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/folders", {}, { authorization: "Bearer junk" }),
            w.deps,
          ),
        )
      ).status,
      401,
      "a bad token",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/folders", {}, { authorization: "Basic owner-token" }),
            w.deps,
          ),
        )
      ).status,
      401,
      "not a bearer token",
    );
    const other = await out(
      await handle(
        post("/owner/folders", {}, { authorization: "Bearer other-token" }),
        w.deps,
      ),
    );
    assertEquals(
      [other.status, other.json["error"]],
      [403, "Only the owner can review photos."],
      "a signed-in stranger",
    );
    assertEquals(
      (await out(await handle(post("/owner/folders", {}, asOwner), w.deps))).status,
      200,
      "the owner",
    );
    const nobody = world({ ownerEmails: [] });
    assertEquals(
      (await out(await handle(post("/owner/folders", {}, asOwner), nobody.deps)))
        .status,
      503,
      "no owner configured",
    );
    assertEquals(
      w.calls.filter((c) => c.startsWith("decide") || c.startsWith("rename")).length,
      0,
      "nothing was changed by refused calls",
    );
    // The publisher's key is not an owner's sign-in.
    w.setPublisher(KEY_SHA);
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/decide", { ids: [P1], status: "approved" }, asPublisher),
            w.deps,
          ),
        )
      ).status,
      401,
      "the publisher key opens no owner route",
    );
  },
);

Deno.test(
  "the owner reviews: photos come with expiring links, decisions carry who decided",
  async () => {
    const w = world();
    const list = await out(
      await handle(
        post(
          "/owner/photos",
          { folder: FOLDER, status: "waiting", limit: 5000, offset: -4 },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals(list.status, 200, "list");
    assertEquals(list.json["total"], 7, "total");
    assertEquals(list.json["expires_in"], 3600, "links expire in an hour");
    assertEquals(
      list.json["photos"][0]["thumb_url"],
      `https://files.test/${BATCH}/${H1}-thumb.jpg?sig=1`,
      "thumbnail link",
    );
    assert(
      !("web_path" in list.json["photos"][0]) &&
        !("thumb_path" in list.json["photos"][0]),
      "no raw storage paths leave the service",
    );
    assert(
      w.calls.includes(`photos:${FOLDER}:waiting:200:0`),
      "limit and offset are clamped",
    );
    assertEquals(
      (await out(await handle(post("/owner/photos", { folder: "x" }, asOwner), w.deps)))
        .status,
      400,
      "folder must be a uuid",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/photos", { folder: FOLDER, status: "published" }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "only known statuses",
    );

    const d = await out(
      await handle(
        post(
          "/owner/decide",
          { ids: [P1, P2, P1], status: "rejected", reason: "blurry" },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals(
      d.json,
      { changed: 2, public: SYNCED },
      "duplicates in the list are counted once",
    );
    assert(
      w.calls.includes(`decide:2:rejected:blurry:${OWNER_ID}`),
      "the decision records who decided",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/decide", { ids: [], status: "approved" }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "ids needed",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/decide", { ids: ["x"], status: "approved" }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "ids must be uuids",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/decide", { ids: [P1], status: "published" }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "publishing is not a decision here",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/approve-waiting", { folder: FOLDER }, asOwner),
            w.deps,
          ),
        )
      ).json,
      { changed: 3, public: SYNCED },
      "approve the rest",
    );
  },
);

Deno.test(
  "folders: rename, move, split into a new folder, file under a team",
  async () => {
    const w = world();
    assertEquals(
      (
        await out(
          await handle(
            post(
              "/owner/rename",
              { folder: FOLDER, name: "Varsity vs Wheatfield" },
              asOwner,
            ),
            w.deps,
          ),
        )
      ).json,
      { ok: true },
      "rename",
    );
    const bad = await out(
      await handle(
        post("/owner/rename", { folder: FOLDER, name: "" }, asOwner),
        w.deps,
      ),
    );
    assertEquals(
      [bad.status, bad.json["error"]],
      [400, "a folder name is 1 to 200 characters"],
      "the database's own plain refusal reaches the person",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/move", { ids: [P1], folder: FOLDER2 }, asOwner),
            w.deps,
          ),
        )
      ).json,
      { moved: 1, public: SYNCED },
      "move",
    );
    assertEquals(
      (await out(await handle(post("/owner/move", { ids: [P1] }, asOwner), w.deps)))
        .status,
      400,
      "move needs a folder",
    );
    const nf = await out(
      await handle(
        post(
          "/owner/new-folder",
          { ids: [P1, P2], name: "JV Lacrosse", sport: "Lacrosse" },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals(nf.json, { folder: FOLDER2, public: SYNCED }, "new folder");
    assert(
      w.calls.includes("newFolder:2:JV Lacrosse:Lacrosse:null"),
      "the date defaults to the photos' own",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/new-folder", { ids: [P1], name: "x", date: "soon" }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "a bad date",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/new-folder", { ids: [], name: "x" }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "tick photos first",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/set-team", { folder: FOLDER, team: TEAM }, asOwner),
            w.deps,
          ),
        )
      ).json,
      { ok: true, public: SYNCED },
      "file under a team",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/set-team", { folder: FOLDER, team: "" }, asOwner),
            w.deps,
          ),
        )
      ).json,
      { ok: true, public: SYNCED },
      "take it off a team",
    );
    assert(w.calls.includes(`setTeam:${FOLDER}:null`), "an empty team clears it");
  },
);

Deno.test(
  "teams: list, create from a name, switch one team public or private",
  async () => {
    const w = world();
    const t = await out(await handle(post("/owner/teams", {}, asOwner), w.deps));
    assertEquals(
      t.json["teams"][0]["visibility"],
      "public",
      "a team page is public by default",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/create-team", { name: "Orchard Park Quakers" }, asOwner),
            w.deps,
          ),
        )
      ).json,
      { team: TEAM },
      "create",
    );
    assertEquals(
      (
        await out(
          await handle(
            post(
              "/owner/team-visibility",
              { team: TEAM, visibility: "private" },
              asOwner,
            ),
            w.deps,
          ),
        )
      ).json,
      { ok: true, public: SYNCED },
      "visibility",
    );
    assertEquals(
      (
        await out(
          await handle(
            post(
              "/owner/team-visibility",
              { team: "nope", visibility: "private" },
              asOwner,
            ),
            w.deps,
          ),
        )
      ).status,
      400,
      "team id",
    );
  },
);

Deno.test(
  "only POST, and only the 5 Star website may read the answers from a browser",
  async () => {
    const w = world();
    const get = await handle(
      new Request(`${BASE}/owner/folders`, { method: "GET" }),
      w.deps,
    );
    assertEquals(get.status, 405, "GET refused");
    const pre = await handle(
      new Request(`${BASE}/owner/folders`, {
        method: "OPTIONS",
        headers: { origin: "https://5starsportsmedia.com" },
      }),
      w.deps,
    );
    assertEquals(
      [pre.status, pre.headers.get("access-control-allow-origin")],
      [204, "https://5starsportsmedia.com"],
      "the site is allowed",
    );
    const evil = await handle(
      new Request(`${BASE}/owner/folders`, {
        method: "OPTIONS",
        headers: { origin: "https://evil.example" },
      }),
      w.deps,
    );
    assertEquals(
      evil.headers.get("access-control-allow-origin"),
      null,
      "another site is not",
    );
    const res = await handle(
      post("/owner/folders", {}, { ...asOwner, origin: "https://evil.example" }),
      w.deps,
    );
    assertEquals(
      res.headers.get("access-control-allow-origin"),
      null,
      "answers carry no permission for another site",
    );
    assertEquals(
      (await out(await handle(post("/nowhere", {}), w.deps))).status,
      404,
      "unknown route",
    );
  },
);

Deno.test(
  "the public page list: anyone can read it, it carries names and addresses and never a count, and the site may cache it",
  async () => {
    const w = world();
    const res = await handle(
      new Request(`${BASE}/site/pages`, {
        method: "GET",
        headers: { origin: "https://5starsportsmedia.com" },
      }),
      w.deps,
    );
    const j = (await res.json()) as { pages: Record<string, unknown>[] };
    assertEquals(res.status, 200, "no sign-in needed");
    assertEquals(j.pages.length, 1, "the list");
    assertEquals(j.pages[0]!["slug"], "athletes", "a page");
    assert(!("interest" in j.pages[0]!), "no count in the public list");
    assertEquals(
      res.headers.get("cache-control"),
      "public, max-age=60",
      "cached for a minute",
    );
    assertEquals(
      res.headers.get("access-control-allow-origin"),
      "https://5starsportsmedia.com",
      "the site may read it",
    );
    const evil = await handle(
      new Request(`${BASE}/site/pages`, {
        method: "GET",
        headers: { origin: "https://evil.example" },
      }),
      w.deps,
    );
    assertEquals(
      evil.headers.get("access-control-allow-origin"),
      null,
      "another site's pages may not read it in a browser",
    );
    assertEquals(
      (await handle(new Request(`${BASE}/owner/folders`, { method: "GET" }), w.deps))
        .status,
      405,
      "GET is still refused everywhere else",
    );
  },
);

Deno.test(
  "'I'd like this': anonymous, counted once per visitor per day, never stores an address",
  async () => {
    const w = world();
    const ask = (ip: string) =>
      handle(
        post("/site/interest", { slug: "athletes" }, { "cf-connecting-ip": ip }),
        w.deps,
      );
    const first = await out(await ask("203.0.113.7"));
    assertEquals(first.json, { ok: true, counted: true }, "first ask is counted");
    const again = await out(await ask("203.0.113.7"));
    assertEquals(
      again.json,
      { ok: true, counted: false },
      "the same visitor again is thanked but not counted twice",
    );
    assertEquals(
      (await out(await ask("203.0.113.8"))).json["counted"],
      true,
      "another visitor is counted",
    );
    const sent = w.calls.filter((c) => c.startsWith("interest:"));
    assert(
      sent.every((c) => /^interest:athletes:[0-9a-f]{64}$/.test(c)),
      "only a 64-hex fingerprint reaches the store",
    );
    assert(
      !sent.some((c) => c.includes("203.0.113")),
      "the address itself never reaches the store",
    );
    assertEquals(
      (await out(await handle(post("/site/interest", { slug: "../x" }), w.deps)))
        .status,
      400,
      "a page name must be plain",
    );
    assertEquals(
      (await out(await handle(post("/site/interest", {}), w.deps))).status,
      400,
      "a page is needed",
    );
    const off = world({ voterSalt: "" });
    assertEquals(
      (await out(await handle(post("/site/interest", { slug: "athletes" }), off.deps)))
        .status,
      503,
      "no secret set up: counting is off",
    );
  },
);

Deno.test(
  "the visitor fingerprint: stable for a day, different the next day and per address and per secret; the address comes from the platform's header",
  () => {
    const t = Date.UTC(2026, 10, 14, 12);
    const f = voterFingerprint("salt", "1.2.3.4", t);
    assert(/^[0-9a-f]{64}$/.test(f), "64 hex");
    assertEquals(
      voterFingerprint("salt", "1.2.3.4", t + 3600_000),
      f,
      "stable within a day",
    );
    assert(
      voterFingerprint("salt", "1.2.3.4", t + 86_400_000) !== f,
      "a new day, a new fingerprint",
    );
    assert(voterFingerprint("salt", "1.2.3.5", t) !== f, "another address");
    assert(voterFingerprint("other", "1.2.3.4", t) !== f, "another secret");
    assertEquals(
      clientAddress(
        new Request(BASE, {
          headers: { "cf-connecting-ip": " 9.9.9.9 ", "x-forwarded-for": "6.6.6.6" },
        }),
      ),
      "9.9.9.9",
      "the platform's own header wins",
    );
    assertEquals(
      clientAddress(
        new Request(BASE, { headers: { "x-forwarded-for": "6.6.6.6, 7.7.7.7" } }),
      ),
      "7.7.7.7",
      "else the last hop, which a visitor cannot choose",
    );
    assertEquals(clientAddress(new Request(BASE)), "unknown", "no address at all");
  },
);

Deno.test(
  "the owner's page switches: counts are for the owner only; a switch needs a clear change",
  async () => {
    const w = world();
    assertEquals(
      (await out(await handle(post("/owner/pages", {}), w.deps))).status,
      401,
      "no sign-in, no counts",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/pages", {}, { authorization: "Bearer other-token" }),
            w.deps,
          ),
        )
      ).status,
      403,
      "a stranger gets no counts",
    );
    const list = await out(await handle(post("/owner/pages", {}, asOwner), w.deps));
    assertEquals(
      list.json["pages"][0]["interest"],
      4,
      "the owner sees how many people asked",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/page-set", { slug: "athletes", enabled: true }, asOwner),
            w.deps,
          ),
        )
      ).json,
      { ok: true },
      "switch on",
    );
    assert(
      w.calls.includes("page:athletes:true:null"),
      "only the switch asked for changes",
    );
    await handle(
      post("/owner/page-set", { slug: "athletes", coming_soon: true }, asOwner),
      w.deps,
    );
    assert(w.calls.includes("page:athletes:null:true"), "list as coming soon");
    assertEquals(
      (
        await out(
          await handle(post("/owner/page-set", { slug: "athletes" }, asOwner), w.deps),
        )
      ).status,
      400,
      "say what to change",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/page-set", { slug: "athletes", enabled: "yes" }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "a switch is true or false",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/page-set", { slug: "A B", enabled: true }, asOwner),
            w.deps,
          ),
        )
      ).status,
      400,
      "a plain page name",
    );
    assertEquals(
      (
        await out(
          await handle(
            post("/owner/page-set", { slug: "athletes", enabled: true }, asPublisher),
            w.deps,
          ),
        )
      ).status,
      401,
      "the publisher key opens no owner route",
    );
  },
);

Deno.test(
  "public team pages: anyone can read them, with public addresses only; an unknown or malformed team is a plain 404",
  async () => {
    const w = world();
    const teams = await handle(
      new Request(`${BASE}/site/teams`, {
        method: "GET",
        headers: { origin: "https://5starsportsmedia.com" },
      }),
      w.deps,
    );
    const tj = (await teams.json()) as { teams: Record<string, unknown>[] };
    assertEquals(teams.status, 200, "no sign-in");
    assertEquals(
      tj.teams[0]!["cover_url"],
      `https://public.test/${BATCH}/${H1}-thumb.jpg`,
      "the cover is a public address",
    );
    assertEquals(
      teams.headers.get("cache-control"),
      "public, max-age=60",
      "cached a minute",
    );
    const page = await handle(
      new Request(`${BASE}/site/team?slug=cazenovia-chiefs`, { method: "GET" }),
      w.deps,
    );
    const pj = (await page.json()) as {
      team: { name: string };
      albums: { photos: Record<string, unknown>[] }[];
    };
    assertEquals(pj.team.name, "Cazenovia Chiefs", "the team");
    const photo = pj.albums[0]!.photos[0]!;
    assertEquals(
      photo["web_url"],
      `https://public.test/${BATCH}/${H1}-web.jpg`,
      "a public picture address",
    );
    assert(
      !("web_path" in photo) && !("thumb_path" in photo),
      "no private storage path leaves the service",
    );
    assertEquals(
      (
        await handle(
          new Request(`${BASE}/site/team?slug=nobody`, { method: "GET" }),
          w.deps,
        )
      ).status,
      404,
      "an unknown team",
    );
    assertEquals(
      (
        await handle(
          new Request(`${BASE}/site/team?slug=..%2Fx`, { method: "GET" }),
          w.deps,
        )
      ).status,
      404,
      "a malformed team name",
    );
    assertEquals(
      (await handle(new Request(`${BASE}/site/team`, { method: "GET" }), w.deps))
        .status,
      404,
      "no team named",
    );
  },
);

Deno.test(
  "deciding syncs the public bucket: qualifying photos are copied (both files) and marked, those that stop qualifying are taken down",
  async () => {
    const w = world();
    w.pub.wanted = [
      {
        id: P1,
        web_path: `${BATCH}/${H1}-web.jpg`,
        thumb_path: `${BATCH}/${H1}-thumb.jpg`,
      },
    ];
    w.pub.unwanted = [
      {
        id: P2,
        web_path: `${BATCH}/${H2}-web.jpg`,
        thumb_path: `${BATCH}/${H2}-thumb.jpg`,
      },
    ];
    const r = await out(
      await handle(
        post("/owner/decide", { ids: [P1], status: "approved" }, asOwner),
        w.deps,
      ),
    );
    assertEquals(
      r.json["public"],
      { published: 1, unpublished: 1, failed: 0 },
      "the owner is told what happened to the public page",
    );
    assertEquals(
      w.pub.copied,
      [`${BATCH}/${H1}-web.jpg`, `${BATCH}/${H1}-thumb.jpg`],
      "both files are copied",
    );
    assertEquals(w.pub.marked, [P1], "and only then is the photo marked public");
    assertEquals(
      w.pub.removed,
      [`${BATCH}/${H2}-web.jpg`, `${BATCH}/${H2}-thumb.jpg`],
      "the photo that stopped qualifying is taken down",
    );
    assertEquals(w.pub.cleared, [P2], "and unmarked");
  },
);

Deno.test(
  "every change that can affect the public page syncs it; one that cannot, does not",
  async () => {
    for (const [route, body] of [
      ["/owner/approve-waiting", { folder: FOLDER }],
      ["/owner/move", { ids: [P1], folder: FOLDER2 }],
      ["/owner/new-folder", { ids: [P1], name: "x" }],
      ["/owner/set-team", { folder: FOLDER, team: TEAM }],
      ["/owner/team-visibility", { team: TEAM, visibility: "private" }],
      ["/owner/sync", {}],
    ] as const) {
      const w = world();
      w.pub.wanted = [{ id: P1, web_path: "a-web.jpg", thumb_path: "a-thumb.jpg" }];
      const r = await out(await handle(post(route, body, asOwner), w.deps));
      assertEquals(r.json["public"]?.published, 1, `${route} syncs the public page`);
    }
    const w = world();
    w.pub.wanted = [{ id: P1, web_path: "a-web.jpg", thumb_path: "a-thumb.jpg" }];
    const rename = await out(
      await handle(
        post("/owner/rename", { folder: FOLDER, name: "New name" }, asOwner),
        w.deps,
      ),
    );
    assert(!("public" in rename.json), "a rename needs no file work");
    const stranger = await out(
      await handle(
        post(
          "/owner/decide",
          { ids: [P1], status: "approved" },
          { authorization: "Bearer other-token" },
        ),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 403, "a stranger is refused");
    assertEquals(w.pub.copied.length, 0, "and nothing was copied");
  },
);

Deno.test(
  "a failed copy never marks the photo public and never blocks the others; the answer still comes back",
  async () => {
    const w = world();
    w.pub.wanted = [
      { id: P1, web_path: "bad-web.jpg", thumb_path: "bad-thumb.jpg" },
      { id: P2, web_path: "ok-web.jpg", thumb_path: "ok-thumb.jpg" },
    ];
    w.pub.failCopy.add("bad-thumb.jpg");
    const result = await syncPublic(w.deps);
    assertEquals(
      result,
      { published: 1, unpublished: 0, failed: 1 },
      "one published, one failed",
    );
    assertEquals(
      w.pub.marked,
      [P2],
      "only the photo whose both files copied is marked",
    );
    const r = await out(await handle(post("/owner/sync", {}, asOwner), w.deps));
    assertEquals(r.status, 200, "the owner still gets an answer");
  },
);
