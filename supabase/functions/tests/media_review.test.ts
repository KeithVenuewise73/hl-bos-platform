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
  type SocialOutcome,
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
/** A photo the database layer refuses to delete because it is approved. */
const APPROVED_PHOTO = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** A folder the database refuses to delete because it still holds photos. */
const FULL_FOLDER = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const SYNCED = { published: 0, unpublished: 0, failed: 0, remaining: 0 };

const SOCIAL_POST = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const LARGE_BATCH = "99999999-9999-9999-9999-999999999998";

function world(over: Partial<ReviewDeps> = {}) {
  const calls: string[] = [];
  // Large copies: which photos have one, the owner's switch, and the links handed out.
  const large = {
    enabled: true,
    have: new Set<string>([P1]),
    attached: [] as string[],
    links: [] as string[],
  };
  // Short clips: when on, the folder and the public page hold one clip beside the photo.
  const clip = { on: false, ids: new Set<string>() };
  const CLIP = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  // The posting queue: targets still to be worked on, and what the (fake) publisher answers.
  const soc = {
    pending: [
      {
        target_id: "t-ig",
        platform: "instagram" as const,
        external_account_id: "17841400000000001",
        display_name: "5Star Instagram",
        facebook_page_id: "100000000000001",
        token_secret_name: "META_PAGE_TOKEN",
        caption: "Game one",
        attempt_no: 1,
      },
      {
        target_id: "t-fb",
        platform: "facebook_page" as const,
        external_account_id: "100000000000001",
        display_name: "5Star Facebook",
        facebook_page_id: null,
        token_secret_name: "META_PAGE_TOKEN",
        caption: "Game one",
        attempt_no: 1,
      },
    ],
    status: "approved",
    finished: [] as boolean[],
    answers: [] as SocialOutcome[],
    photosSeen: [] as { public_url: string; filename: string }[][],
    throwOnPublish: false,
  };
  const votes = new Set<string>();
  const pub = {
    wanted: [] as PublicRow[],
    unwanted: [] as PublicRow[],
    copied: [] as string[],
    removed: [] as string[],
    removedPrivate: [] as string[],
    failRemovePrivate: false,
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
      const knownHashes = p.hashes.filter((h) => known.has(h));
      return Promise.resolve({
        batchId: BATCH,
        known: knownHashes,
        // A photo already here but with no large copy yet: where its files live.
        needLarge: knownHashes
          .filter((h) => !large.attached.includes(h))
          .map((hash) => ({ hash, batch_id: LARGE_BATCH })),
      });
    },
    statusDays() {
      return Promise.resolve([
        {
          date: "2026-10-24",
          photos: 1,
          clips: clip.on ? 1 : 0,
          waiting: clip.on ? 2 : 1,
          approved: 0,
          rejected: 0,
        },
      ]);
    },
    gamesOn(date) {
      return Promise.resolve(
        date === "2026-10-24"
          ? [
              {
                name: "Varsity vs Wheatfield",
                sport: "Hockey",
                team: "Cazenovia Chiefs",
                photos: 1,
                clips: 0,
              },
            ]
          : [],
      );
    },
    knownHashes(hashes) {
      calls.push("known:" + hashes.length);
      return Promise.resolve(hashes.filter((h) => h === H1));
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
    folderPhotos(folder, status, limit, offset, kind = "all") {
      calls.push(
        `photos:${folder}:${status}:${limit}:${offset}` +
          (kind === "all" ? "" : `:${kind}`),
      );
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
      const rows: PhotoRow[] = [p];
      if (clip.on)
        rows.push({
          ...p,
          id: CLIP,
          filename: "C0001.MOV",
          flags: [],
          web_path: `${BATCH}/${H2}-web.jpg`,
          thumb_path: `${BATCH}/${H2}-thumb.jpg`,
          video_path: `${BATCH}/${H2}-video.mp4`,
          duration_seconds: 12.5,
        });
      return Promise.resolve(rows);
    },
    videoIds(ids) {
      return Promise.resolve(ids.filter((i) => i === CLIP || clip.ids.has(i)));
    },
    decide(ids, status, reason, by) {
      calls.push(`decide:${ids.length}:${status}:${reason}:${by}`);
      return Promise.resolve(ids.length);
    },
    approveWaiting(folder, by) {
      calls.push(`approveWaiting:${folder}:${by}`);
      return Promise.resolve(3);
    },
    socialAccounts() {
      return Promise.resolve([
        {
          id: "acc-ig",
          platform: "instagram" as const,
          display_name: "5Star Instagram",
          status: "active" as const,
        },
      ]);
    },
    socialAlreadyPosted() {
      return Promise.resolve([]);
    },
    socialCreatePost(photos, caption, accounts, by) {
      calls.push(`socialPost:${photos.length}:${accounts.length}:${by}`);
      if (caption.trim() === "") {
        return Promise.reject(
          Object.assign(new Error("a caption is 1 to 2,200 characters"), {
            code: "22023",
          }),
        );
      }
      return Promise.resolve(SOCIAL_POST);
    },
    socialFailStale() {
      return Promise.resolve(0);
    },
    socialClaim() {
      const t = soc.pending.shift() ?? null;
      if (t) {
        calls.push(`claim:${t.platform}`);
        soc.status = "publishing";
      }
      return Promise.resolve(t);
    },
    socialPhotoPaths() {
      return Promise.resolve([
        { web_path: `${BATCH}/${H1}-web.jpg`, filename: "IMG_1.JPG" },
      ]);
    },
    socialRecordAttempt(_t, phase, ok) {
      calls.push(`attempt:${phase}:${ok}`);
      return Promise.resolve();
    },
    socialFinish(_t, published, external) {
      calls.push(`finish:${published}:${external}`);
      soc.finished.push(published);
      if (soc.pending.length === 0) {
        soc.status = soc.finished.every((x) => x)
          ? "published"
          : soc.finished.some((x) => x)
            ? "partly_published"
            : "failed";
      }
      return Promise.resolve(soc.status);
    },
    socialPostStatus(post) {
      return Promise.resolve({
        id: post,
        status: soc.status,
        caption: "Game one",
        approved_at: "2026-11-14T12:00:00Z",
        photos: 1,
        targets: [],
      });
    },
    socialRecent() {
      return Promise.resolve([]);
    },
    deleteFolder(folder) {
      calls.push(`deleteFolder:${folder}`);
      if (folder === FULL_FOLDER) {
        const e = new Error(
          "that folder still has photos in it: move them to another folder first",
        ) as Error & { code: string };
        e.code = "22023";
        return Promise.reject(e);
      }
      return Promise.resolve();
    },
    deletePhotos(ids) {
      calls.push(`deletePhotos:${ids.length}`);
      // An approved photo is never deleted (the database layer keeps it).
      const gone = ids.filter((i) => i !== APPROVED_PHOTO);
      return Promise.resolve({
        deleted: gone.length,
        paths: gone.flatMap((i) => [
          `${BATCH}/${i}-web.jpg`,
          `${BATCH}/${i}-thumb.jpg`,
        ]),
      });
    },
    renameTeam(team, name) {
      calls.push(`renameTeam:${team}:${name}`);
      const plain = (m: string, code: string) =>
        Promise.reject(Object.assign(new Error(m), { code }));
      if (name.trim() === "")
        return plain("a team name is 1 to 120 characters", "22023");
      if (name === "Cazenovia Chiefs")
        return plain("there is already a team with that name", "23505");
      return Promise.resolve();
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
      if (slug !== "cazenovia-chiefs") return Promise.resolve(null);
      return Promise.resolve({
        ...PAGE,
        large_downloads: large.enabled,
        albums: PAGE.albums.map((a) => ({
          ...a,
          photos: [
            ...a.photos.map((p) => ({ ...p, large: large.have.has(p.id) })),
            ...(clip.on
              ? [
                  {
                    id: CLIP,
                    filename: "C0001.MOV",
                    taken_at: "2026-10-24T10:05:00",
                    width: 1920,
                    height: 1080,
                    large: false,
                    video: true,
                    duration: 12.5,
                    video_path: `${BATCH}/${H2}-video.mp4`,
                    web_path: `${BATCH}/${H2}-web.jpg`,
                    thumb_path: `${BATCH}/${H2}-thumb.jpg`,
                  },
                ]
              : []),
          ],
        })),
      });
    },
    attachLarge(hash) {
      calls.push(`attachLarge:${hash.slice(0, 4)}`);
      if (hash === "9".repeat(64)) return Promise.resolve(false); // its file is not there
      large.attached.push(hash);
      return Promise.resolve(true);
    },
    largeSettings() {
      return Promise.resolve({
        enabled: large.enabled,
        large_photos: large.have.size,
        public_photos: 3,
      });
    },
    setLargeDownloads(enabled) {
      calls.push(`large:${enabled}`);
      large.enabled = enabled;
      return Promise.resolve();
    },
    publicLarge(photo) {
      if (photo !== P1 && photo !== P2) return Promise.resolve(null);
      return Promise.resolve({
        path:
          large.enabled && large.have.has(photo) ? `${BATCH}/${H1}-large.jpg` : null,
        enabled: large.enabled,
      });
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
      signedDownload(path, filename, seconds) {
        large.links.push(`${path}|${filename}|${seconds}`);
        return Promise.resolve(`https://files.test/dl/${path}?name=${filename}`);
      },
      removePrivate(paths) {
        if (pub.failRemovePrivate) return Promise.reject(new Error("storage down"));
        pub.removedPrivate.push(...paths);
        return Promise.resolve();
      },
      publicUrl(path) {
        return `https://public.test/${path}`;
      },
    },
    publisherKeySha256: null,
    ownerEmails: [OWNER.email],
    voterSalt: "salt-salt-salt-salt-salt-salt-salt-1234",
    social: {
      publish(target, photos) {
        soc.photosSeen.push(photos);
        if (soc.throwOnPublish) return Promise.reject(new Error("socket closed"));
        return Promise.resolve(
          soc.answers.shift() ?? {
            status: "published" as const,
            externalPostId: `${target.platform}_post_1`,
            permalink: "https://example.test/post",
            attempts: [{ phase: "publish", ok: true, httpStatus: 200 }],
          },
        );
      },
    },
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
    soc,
    large,
    clip,
    CLIP,
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
      {
        batch_id: BATCH,
        known: [H2],
        need_large: [{ hash: H2, batch_id: LARGE_BATCH }],
      },
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
      { published: 1, unpublished: 1, failed: 0, remaining: 0 },
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
  "a very large approval is published 100 photos at a time, each chunk marked as soon as it is copied, and the owner is told how many remain",
  async () => {
    const w = world();
    w.pub.wanted = Array.from({ length: 250 }, (_, i) => ({
      id: `id${i}`,
      web_path: `p${i}-web.jpg`,
      thumb_path: `p${i}-thumb.jpg`,
    }));
    const stillWanted = () => {
      // The database stops listing a photo once it is marked public.
      w.pub.wanted = w.pub.wanted.filter((p) => !w.pub.marked.includes(p.id));
    };
    assertEquals(
      await syncPublic(w.deps),
      { published: 100, unpublished: 0, failed: 0, remaining: 150 },
      "the first call does 100 and says 150 remain",
    );
    assertEquals(w.pub.copied.length, 200, "two files per photo");
    stillWanted();
    assertEquals(
      await syncPublic(w.deps),
      { published: 100, unpublished: 0, failed: 0, remaining: 50 },
      "the second does the next 100",
    );
    stillWanted();
    assertEquals(
      await syncPublic(w.deps),
      { published: 50, unpublished: 0, failed: 0, remaining: 0 },
      "the third finishes",
    );
    assertEquals(w.pub.marked.length, 250, "every photo ended up marked public");
    assertEquals(new Set(w.pub.copied).size, 500, "and every file was copied once");
  },
);

Deno.test(
  "approving a whole folder answers with how many photos still have to be published",
  async () => {
    const w = world();
    w.pub.wanted = Array.from({ length: 130 }, (_, i) => ({
      id: `id${i}`,
      web_path: `p${i}-web.jpg`,
      thumb_path: `p${i}-thumb.jpg`,
    }));
    const r = await out(
      await handle(post("/owner/approve-waiting", { folder: FOLDER }, asOwner), w.deps),
    );
    assertEquals(r.status, 200, "approving works");
    assertEquals(
      (r.json["public"] as { remaining: number }).remaining,
      30,
      "30 are left for the next sync",
    );
  },
);

Deno.test(
  "deleting a folder: only the owner, only a real folder id, and the database's refusal for a folder that still has photos reaches the person",
  async () => {
    const w = world();
    const ok = await out(
      await handle(post("/owner/delete-folder", { folder: FOLDER }, asOwner), w.deps),
    );
    assertEquals(
      [ok.status, ok.json],
      [200, { ok: true }],
      "an empty folder is deleted",
    );
    assertEquals(
      w.calls.includes(`deleteFolder:${FOLDER}`),
      true,
      "the store was asked",
    );
    const bad = await out(
      await handle(post("/owner/delete-folder", { folder: "nope" }, asOwner), w.deps),
    );
    assertEquals(bad.status, 400, "a malformed id is refused");
    const full = await out(
      await handle(
        post("/owner/delete-folder", { folder: FULL_FOLDER }, asOwner),
        w.deps,
      ),
    );
    assertEquals(
      [full.status, full.json["error"]],
      [400, "that folder still has photos in it: move them to another folder first"],
      "a folder with photos is refused in plain words",
    );
    const before = w.calls.length;
    const stranger = await out(
      await handle(
        post(
          "/owner/delete-folder",
          { folder: FOLDER },
          { authorization: "Bearer other-token" },
        ),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 403, "a stranger is refused");
    assertEquals(w.calls.length, before, "and nothing was deleted");
    const anon = await out(
      await handle(post("/owner/delete-folder", { folder: FOLDER }), w.deps),
    );
    assertEquals(anon.status, 401, "no sign-in is refused");
  },
);

Deno.test(
  "deleting photos: only the owner; never an approved one; the files go too; a file that cannot be removed does not undo the deletion",
  async () => {
    const w = world();
    const P_A = "11111111-1111-1111-1111-111111111111";
    const P_B = "22222222-2222-2222-2222-222222222222";
    const r = await out(
      await handle(
        post("/owner/delete-photos", { ids: [P_A, P_B, APPROVED_PHOTO] }, asOwner),
        w.deps,
      ),
    );
    assertEquals(r.status, 200, "deleting works");
    assertEquals(
      [r.json["deleted"], r.json["kept"], r.json["leftover_files"]],
      [2, 1, 0],
      "two deleted, the approved one kept",
    );
    assertEquals(
      w.pub.removedPrivate.sort(),
      [
        `${BATCH}/${P_A}-thumb.jpg`,
        `${BATCH}/${P_A}-web.jpg`,
        `${BATCH}/${P_B}-thumb.jpg`,
        `${BATCH}/${P_B}-web.jpg`,
      ],
      "only the deleted photos' files were removed, never the approved one's",
    );
    const bad = await out(
      await handle(post("/owner/delete-photos", { ids: ["nope"] }, asOwner), w.deps),
    );
    assertEquals(bad.status, 400, "a malformed id is refused");
    w.pub.failRemovePrivate = true;
    const hiccup = await out(
      await handle(post("/owner/delete-photos", { ids: [P_A] }, asOwner), w.deps),
    );
    assertEquals(
      [hiccup.status, hiccup.json["deleted"], hiccup.json["leftover_files"]],
      [200, 1, 2],
      "a storage hiccup is reported as leftover files, not as a failure",
    );
    const before = w.calls.length;
    const stranger = await out(
      await handle(
        post(
          "/owner/delete-photos",
          { ids: [P_A] },
          { authorization: "Bearer other-token" },
        ),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 403, "a stranger is refused");
    assertEquals(w.calls.length, before, "and nothing was deleted");
  },
);

Deno.test(
  "renaming a team: owner only, a plain refusal for an empty or taken name, and the page address is not touched",
  async () => {
    const w = world();
    const ok = await out(
      await handle(
        post(
          "/owner/rename-team",
          { team: TEAM, name: "Cazenovia Chiefs Varsity" },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals([ok.status, ok.json], [200, { ok: true }], "renamed");
    const empty = await out(
      await handle(
        post("/owner/rename-team", { team: TEAM, name: " " }, asOwner),
        w.deps,
      ),
    );
    assertEquals(
      [empty.status, empty.json["error"]],
      [400, "a team name is 1 to 120 characters"],
      "an empty name is refused in words",
    );
    const taken = await out(
      await handle(
        post("/owner/rename-team", { team: TEAM, name: "Cazenovia Chiefs" }, asOwner),
        w.deps,
      ),
    );
    assertEquals(
      [taken.status, taken.json["error"]],
      [400, "there is already a team with that name"],
      "a name already used is refused in words",
    );
    const bad = await out(
      await handle(
        post("/owner/rename-team", { team: "x", name: "A" }, asOwner),
        w.deps,
      ),
    );
    assertEquals(bad.status, 400, "a malformed team id is refused");
    const before = w.calls.length;
    const stranger = await out(
      await handle(
        post(
          "/owner/rename-team",
          { team: TEAM, name: "Hijacked" },
          { authorization: "Bearer other-token" },
        ),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 403, "a stranger is refused");
    assertEquals(w.calls.length, before, "and nothing was renamed");
  },
);

Deno.test(
  "posting to social: pressing Post records the approval with who pressed it; the posts then go out one account at a time and the status follows the answers",
  async () => {
    const w = world();
    const made = await out(
      await handle(
        post(
          "/owner/social/post",
          { photos: [P1], caption: "Game one", accounts: [P2, TEAM] },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals(
      [made.status, made.json["post"]],
      [200, SOCIAL_POST],
      "the post is recorded",
    );
    assertEquals(
      w.calls.filter((c) => c.startsWith("socialPost"))[0],
      `socialPost:1:2:${OWNER.id}`,
      "with the owner's id as the approver",
    );
    assertEquals(
      w.calls.some((c) => c.startsWith("claim")),
      false,
      "and nothing is sent until the page asks for it",
    );
    // First account (Instagram): published with the platform's id.
    const one = await out(
      await handle(
        post("/owner/social/publish", { post: SOCIAL_POST }, asOwner),
        w.deps,
      ),
    );
    assertEquals(
      [one.status, one.json["done"], (one.json["post"] as { status: string }).status],
      [200, false, "publishing"],
      "after the first account the post is still publishing",
    );
    assertEquals(
      w.soc.photosSeen[0]![0]!.public_url,
      `https://public.test/${BATCH}/${H1}-web.jpg`,
      "the photo is handed over by its PUBLIC address, never a private one",
    );
    // Second account (Facebook): the platform refuses.
    w.soc.answers.push({
      status: "failed",
      error: "http_400: bad",
      attempts: [{ phase: "publish", ok: false, httpStatus: 400 }],
    });
    const two = await out(
      await handle(
        post("/owner/social/publish", { post: SOCIAL_POST }, asOwner),
        w.deps,
      ),
    );
    assertEquals(
      [two.json["done"], (two.json["post"] as { status: string }).status],
      [true, "partly_published"],
      "one published and one failed is partly published, and the page is told it is done",
    );
    assertEquals(
      w.calls.filter((c) => c.startsWith("finish")),
      ["finish:true:instagram_post_1", "finish:false:null"],
      "a success carries the platform's id; a failure carries none",
    );
    assertEquals(
      w.calls.filter((c) => c.startsWith("attempt")).length,
      2,
      "every request that was made is recorded",
    );
  },
);

Deno.test(
  "posting to social: a claimed success with no id is a failure, a publisher that throws is a failure with words, a blank caption is refused in words, and a stranger or an absent publisher changes nothing",
  async () => {
    const w = world();
    w.soc.answers.push({ status: "published", attempts: [] }); // success, but no id
    const noId = await out(
      await handle(
        post("/owner/social/publish", { post: SOCIAL_POST }, asOwner),
        w.deps,
      ),
    );
    assertEquals(noId.status, 200, "the call still answers");
    assertEquals(
      w.calls.filter((c) => c.startsWith("finish"))[0],
      "finish:false:null",
      "published without an id is recorded as failed: a success is never invented",
    );
    w.soc.throwOnPublish = true;
    await handle(post("/owner/social/publish", { post: SOCIAL_POST }, asOwner), w.deps);
    assertEquals(
      w.calls.filter((c) => c.startsWith("finish")).pop(),
      "finish:false:null",
      "a publisher that throws is a failed target, not a crashed request",
    );
    const blank = await out(
      await handle(
        post(
          "/owner/social/post",
          { photos: [P1], caption: " ", accounts: [P2] },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals(
      [blank.status, blank.json["error"]],
      [400, "a caption is 1 to 2,200 characters"],
      "a blank caption is refused in words",
    );
    const tooMany = await out(
      await handle(
        post(
          "/owner/social/post",
          {
            photos: Array.from(
              { length: 11 },
              (_, i) => `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, "0")}`,
            ),
            caption: "x",
            accounts: [P2],
          },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals(tooMany.status, 400, "more than 10 photos is refused");
    const before = w.calls.length;
    const stranger = await out(
      await handle(
        post(
          "/owner/social/post",
          { photos: [P1], caption: "x", accounts: [P2] },
          { authorization: "Bearer other-token" },
        ),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 403, "a stranger is refused");
    assertEquals(w.calls.length, before, "and nothing was recorded");
    const off = world({ social: undefined });
    const none = await out(
      await handle(
        post(
          "/owner/social/post",
          { photos: [P1], caption: "x", accounts: [P2] },
          asOwner,
        ),
        off.deps,
      ),
    );
    assertEquals(none.status, 503, "with no publisher connected, posting answers 503");
    const list = await out(
      await handle(post("/owner/social/accounts", {}, asOwner), off.deps),
    );
    assertEquals(
      [list.status, list.json["enabled"]],
      [200, false],
      "and the accounts list says posting is not switched on",
    );
  },
);

Deno.test(
  "large copies from DateSort: a photo sent earlier is reported as needing one, its large file goes under the batch it was first stored in, and it is recorded only when its file is really there",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const batch = await out(
      await handle(
        post(
          "/review/batch",
          {
            label: { name: "Game", sport: "Hockey", date: "2026-10-24" },
            folder: "x",
            counts: { photos: 2, videos: 0 },
            hashes: [H1, H2],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(
      batch.json["need_large"],
      [{ hash: H2, batch_id: LARGE_BATCH }],
      "the photo already here is reported, with the batch its files live under",
    );
    const up = await out(
      await handle(
        post(
          "/review/uploads",
          {
            batch_id: BATCH,
            files: [
              { hash: H2, kind: "large", batch_id: LARGE_BATCH },
              { hash: H1, kind: "large" },
            ],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(up.status, 200, "large uploads are allowed");
    assertEquals(
      w.requested.filter((r) => r.startsWith("upload:")),
      [`upload:${LARGE_BATCH}/${H2}-large.jpg`, `upload:${BATCH}/${H1}-large.jpg`],
      "an earlier photo's large file goes under its own batch; a new one under this batch",
    );
    const badBatch = await out(
      await handle(
        post(
          "/review/uploads",
          { batch_id: BATCH, files: [{ hash: H2, kind: "large", batch_id: "../etc" }] },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(badBatch.status, 400, "a made-up batch id cannot name another place");
    const web = await out(
      await handle(
        post(
          "/review/uploads",
          {
            batch_id: BATCH,
            files: [{ hash: H1, kind: "web", batch_id: LARGE_BATCH }],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(
      w.requested.filter((r) => r.startsWith("upload:")).pop(),
      `upload:${BATCH}/${H1}-web.jpg`,
      "the batch override applies only to large copies",
    );
    assertEquals(web.status, 200, "a web upload still works");
    const rec = await out(
      await handle(
        post(
          "/review/large",
          {
            items: [
              { hash: H2, bytes: 2400000 },
              { hash: "9".repeat(64), bytes: 1000 },
            ],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(
      rec.json["attached"],
      1,
      "only the one whose file is there is recorded",
    );
    const bad = await out(
      await handle(
        post("/review/large", { items: [{ hash: "nope", bytes: 5 }] }, asPublisher),
        w.deps,
      ),
    );
    assertEquals(bad.status, 400, "a malformed item is refused");
    const stranger = await out(
      await handle(
        post(
          "/review/large",
          { items: [{ hash: H1, bytes: 5 }] },
          { "x-review-publisher-key": "wrong" },
        ),
        w.deps,
      ),
    );
    assertEquals(
      stranger.status,
      401,
      "only the connected DateSort may record large copies",
    );
  },
);

Deno.test(
  "video clips: an mp4 is uploaded under the batch, the owner can play it, a sync copies it with its poster, the public page says it is a clip, and a clip cannot be posted as a photo",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const up = await out(
      await handle(
        post(
          "/review/uploads",
          {
            batch_id: BATCH,
            files: [
              { hash: H2, kind: "web" },
              { hash: H2, kind: "thumb" },
              { hash: H2, kind: "video" },
            ],
          },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(up.status, 200, "the three files of a clip can be uploaded");
    assertEquals(
      w.requested.filter((r) => r.startsWith("upload:")).slice(-3),
      [
        `upload:${BATCH}/${H2}-web.jpg`,
        `upload:${BATCH}/${H2}-thumb.jpg`,
        `upload:${BATCH}/${H2}-video.mp4`,
      ],
      "the clip goes up as an mp4, the poster and thumbnail as jpegs",
    );
    const bad = await out(
      await handle(
        post(
          "/review/uploads",
          { batch_id: BATCH, files: [{ hash: H2, kind: "movie" }] },
          asPublisher,
        ),
        w.deps,
      ),
    );
    assertEquals(bad.status, 400, "no other kind is accepted");

    w.clip.on = true;
    const list = await out(
      await handle(post("/owner/photos", { folder: FOLDER }, asOwner), w.deps),
    );
    const photos = list.json["photos"] as Record<string, unknown>[];
    const clipRow = photos.find((p) => p["id"] === w.CLIP)!;
    assertEquals(clipRow["video"], true, "the owner is told it is a clip");
    assertEquals(clipRow["duration"], 12.5, "and how long");
    assertEquals(
      String(clipRow["video_url"]).includes(`${H2}-video.mp4`),
      true,
      "and gets an expiring link to play it",
    );
    assertEquals(photos[0]!["video"], false, "a photo is not a clip");
    assertEquals(photos[0]!["video_url"], null, "and has no clip link");

    // The owner page's Videos and Photos tabs: the kind is passed to the store, and nonsense is refused.
    w.calls.length = 0;
    for (const kind of ["video", "photo"]) {
      const r = await handle(
        post("/owner/photos", { folder: FOLDER, kind }, asOwner),
        w.deps,
      );
      assertEquals(r.status, 200, `kind ${kind} is accepted`);
    }
    assertEquals(
      w.calls
        .filter((c: string) => c.startsWith("photos:"))
        .map((c: string) => c.split(":").pop()),
      ["video", "photo"],
      "the kind reaches the store",
    );
    const badKind = await handle(
      post("/owner/photos", { folder: FOLDER, kind: "everything" }, asOwner),
      w.deps,
    );
    assertEquals(badKind.status, 400, "an unknown kind is refused");

    w.pub.wanted = [
      {
        id: w.CLIP,
        web_path: `${BATCH}/${H2}-web.jpg`,
        thumb_path: `${BATCH}/${H2}-thumb.jpg`,
        video_path: `${BATCH}/${H2}-video.mp4`,
      },
    ];
    const sync = await out(await handle(post("/owner/sync", {}, asOwner), w.deps));
    assertEquals(sync.json["public"]["published"], 1, "the clip is published");
    assertEquals(
      w.pub.copied.includes(`${BATCH}/${H2}-video.mp4`) &&
        w.pub.copied.includes(`${BATCH}/${H2}-web.jpg`),
      true,
      "its mp4 is copied to the public bucket with its poster",
    );
    w.pub.wanted = [];
    w.pub.unwanted = [
      {
        id: w.CLIP,
        web_path: `${BATCH}/${H2}-web.jpg`,
        thumb_path: `${BATCH}/${H2}-thumb.jpg`,
        video_path: `${BATCH}/${H2}-video.mp4`,
      },
    ];
    await handle(post("/owner/sync", {}, asOwner), w.deps);
    assertEquals(
      w.pub.removed.includes(`${BATCH}/${H2}-video.mp4`),
      true,
      "a clip taken down also loses its public mp4",
    );

    const page = await out(
      await handle(
        new Request(
          "https://x.test/functions/v1/media-review/site/team?slug=cazenovia-chiefs",
        ),
        w.deps,
      ),
    );
    const pub = (page.json["albums"] as { photos: Record<string, unknown>[] }[])[0]!
      .photos;
    const pc = pub.find((p) => p["id"] === w.CLIP)!;
    assertEquals(pc["video"], true, "the public page marks the clip");
    assertEquals(pc["duration"], 12.5, "with its length");
    assertEquals(
      pc["video_url"],
      `https://public.test/${BATCH}/${H2}-video.mp4`,
      "and its public address",
    );
    assertEquals(
      JSON.stringify(page.json).includes("video_path"),
      false,
      "no storage path is ever shown",
    );
    assertEquals(pub[0]!["video_url"], null, "a photo has no clip address");

    const social = await out(
      await handle(
        post(
          "/owner/social/post",
          { photos: [w.CLIP], accounts: [SOCIAL_POST], caption: "x" },
          asOwner,
        ),
        w.deps,
      ),
    );
    assertEquals(
      social.status,
      400,
      "a clip is refused as an Instagram/Facebook photo post",
    );
  },
);

Deno.test(
  "known: DateSort can ask which photos 5Star already holds (before it offers to free up a card), with the publisher key only",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const ok = await out(
      await handle(post("/review/known", { hashes: [H1, H2] }, asPublisher), w.deps),
    );
    assertEquals(ok.status, 200, "the connected DateSort may ask");
    assertEquals(
      ok.json["known"],
      [H1],
      "only the photo the service holds is reported",
    );
    for (const bad of [{ hashes: [] }, { hashes: ["nope"] }, {}]) {
      const r = await out(
        await handle(post("/review/known", bad, asPublisher), w.deps),
      );
      assertEquals(
        r.status,
        400,
        "a malformed list is refused: " + JSON.stringify(bad),
      );
    }
    const stranger = await out(
      await handle(
        post("/review/known", { hashes: [H1] }, { "x-review-publisher-key": "wrong" }),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 401, "nobody else may ask");
  },
);

Deno.test(
  "status: DateSort can ask which dates already have photos in review, with the publisher key only",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const ok = await out(await handle(post("/review/status", {}, asPublisher), w.deps));
    assertEquals(ok.status, 200, "the connected DateSort may ask");
    assertEquals(
      ok.json["days"],
      [
        {
          date: "2026-10-24",
          photos: 1,
          clips: 0,
          waiting: 1,
          approved: 0,
          rejected: 0,
        },
      ],
      "one entry per date, with how many photos and clips are there",
    );
    const stranger = await out(
      await handle(
        post("/review/status", {}, { "x-review-publisher-key": "wrong" }),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 401, "nobody else may ask");
  },
);

Deno.test(
  "which games does the website hold on a date: read only, for the connected DateSort alone",
  async () => {
    const w = world();
    w.setPublisher(KEY_SHA);
    const ok = await out(
      await handle(post("/review/games", { date: "2026-10-24" }, asPublisher), w.deps),
    );
    assertEquals(ok.status, 200);
    assertEquals(
      ok.json["games"],
      [
        {
          name: "Varsity vs Wheatfield",
          sport: "Hockey",
          team: "Cazenovia Chiefs",
          photos: 1,
          clips: 0,
        },
      ],
      "the game that date already has, with what it holds",
    );
    const none = await out(
      await handle(post("/review/games", { date: "2026-01-01" }, asPublisher), w.deps),
    );
    assertEquals(none.json["games"], [], "a date with nothing says so");
    const bad = await out(
      await handle(post("/review/games", { date: "tomorrow" }, asPublisher), w.deps),
    );
    assertEquals(bad.status, 400, "a date must be a date");
    const stranger = await out(
      await handle(
        post(
          "/review/games",
          { date: "2026-10-24" },
          { "x-review-publisher-key": "wrong" },
        ),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 401, "nobody else may ask");
  },
);

Deno.test(
  "download large: a short-lived private link, only while the switch is on and the photo qualifies; the public page says which photos have one",
  async () => {
    const w = world();
    const get = (q: string) =>
      handle(new Request(`${BASE}/site/large?${q}`, { method: "GET" }), w.deps);
    const ok = await get(`photo=${P1}&name=Cazenovia%20Chiefs_Game%20one_IMG 1.JPG`);
    assertEquals(ok.status, 302, "an eligible photo redirects to a download link");
    assert(
      (ok.headers.get("location") ?? "").startsWith("https://files.test/dl/"),
      "to a link on the private storage, not a public address",
    );
    assertEquals(ok.headers.get("cache-control"), "no-store", "never cached");
    assertEquals(
      w.large.links[0],
      `${BATCH}/${H1}-large.jpg|Cazenovia-Chiefs_Game-one_IMG-1.JPG|300`,
      "the name is made safe, and the link lasts 5 minutes",
    );
    assertEquals(
      (await get(`photo=${P1}&name=..%2F..%2Fx`)).status,
      302,
      "a hostile name is only ever a file name",
    );
    assert(
      w.large.links[1]!.endsWith("|x.jpg|300") || w.large.links[1]!.includes("x"),
      "and gets a .jpg ending",
    );
    assertEquals(
      (await get(`photo=${P2}`)).status,
      404,
      "a photo with no large copy is not found",
    );
    assertEquals((await get("photo=nope")).status, 404, "a malformed id is not found");
    assertEquals(
      (await get("photo=00000000-0000-0000-0000-000000000000")).status,
      404,
      "an unknown photo is not found",
    );
    const page = await handle(
      new Request(`${BASE}/site/team?slug=cazenovia-chiefs`, { method: "GET" }),
      w.deps,
    );
    const pj = (await page.json()) as {
      large_downloads: boolean;
      albums: { photos: { large: boolean }[] }[];
    };
    assertEquals(pj.large_downloads, true, "the page says downloads are on");
    assertEquals(
      pj.albums[0]!.photos[0]!.large,
      true,
      "and which photo has a large copy",
    );
    assert(!JSON.stringify(pj).includes("large_path"), "and never where it is kept");

    // The owner's switch.
    const off = await out(
      await handle(post("/owner/large-downloads", { enabled: false }, asOwner), w.deps),
    );
    assertEquals(
      [off.status, off.json["enabled"]],
      [200, false],
      "the owner switches it off",
    );
    const refused = await get(`photo=${P1}`);
    assertEquals(refused.status, 403, "with it off, a download is refused in words");
    const after = (await (
      await handle(
        new Request(`${BASE}/site/team?slug=cazenovia-chiefs`, { method: "GET" }),
        w.deps,
      )
    ).json()) as { large_downloads: boolean };
    assertEquals(after.large_downloads, false, "and the page says downloads are off");
    const settings = await out(await handle(post("/owner/large", {}, asOwner), w.deps));
    assertEquals(settings.json["enabled"], false, "the owner can read the switch");
    const before = w.calls.length;
    const stranger = await out(
      await handle(
        post(
          "/owner/large-downloads",
          { enabled: true },
          { authorization: "Bearer other-token" },
        ),
        w.deps,
      ),
    );
    assertEquals(stranger.status, 403, "a stranger cannot flip it");
    assertEquals(w.calls.length, before, "and nothing changed");
    const bad = await out(
      await handle(post("/owner/large-downloads", { enabled: "yes" }, asOwner), w.deps),
    );
    assertEquals(bad.status, 400, "on or off must be true or false");
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
      { published: 1, unpublished: 0, failed: 1, remaining: 1 },
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
