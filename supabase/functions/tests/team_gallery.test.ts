// Team galleries online — the team-gallery Edge Function's decisions (Deno).
//
// Against an in-memory store and storage that behave like migration 0053's
// functions and the two buckets. Self-contained: no remote imports, so it
// runs offline (`deno test --no-check supabase/functions/tests/`). The
// database half (no web access, pinned paths, exact publishing, switched-off
// galleries) is covered by supabase/tests/53_team_galleries.sql.

import { randomBytes, scryptSync } from "node:crypto";

import {
  handle,
  MAX_FAILURES,
  passIsValid,
  routeOf,
  verifyPassword,
  type GalleryDeps,
  type GalleryRow,
  type GameRow,
  type ListingRow,
  type PhotoRow,
} from "../_shared/gallery/core.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

/** Exactly how JerseySort hashes a team password (auth-core.ts). */
function jerseySortHash(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 64).toString("base64")}`;
}

const VARSITY = "11111111-1111-1111-1111-111111111111";
const JV = "33333333-3333-3333-3333-333333333333";
const GAME = "22222222-2222-2222-2222-222222222222";
const JV_GAME = "44444444-4444-4444-4444-444444444444";
const PHOTO = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SECRET = "s".repeat(48);
const PUBLISHER = "p".repeat(48);

function world() {
  const galleries = new Map<string, GalleryRow & { link: string; active: boolean }>([
    [
      VARSITY,
      {
        id: VARSITY,
        slug: "caz-varsity",
        brand: "5 Star Sports Media",
        group_name: "Cazenovia Hockey",
        name: "Varsity",
        password_hash: jerseySortHash("goblue26"),
        link: "VarsityLinkToken0001",
        active: true,
      },
    ],
    [
      JV,
      {
        id: JV,
        slug: "caz-jv",
        brand: "5 Star Sports Media",
        group_name: "Cazenovia Hockey",
        name: "JV",
        password_hash: jerseySortHash("gojv2026"),
        link: "JvLinkToken000000001",
        active: true,
      },
    ],
  ]);
  const games: Record<string, GameRow[]> = {
    [VARSITY]: [
      {
        id: GAME,
        slug: "2026-10-24-vs-wheatfield",
        title: "Varsity vs Wheatfield",
        sport: "Hockey",
        opponent: "Wheatfield",
        location: null,
        event_date: "2026-10-24",
        photo_count: 1,
        first_thumb: `${VARSITY}/${GAME}/${PHOTO}-thumb.jpg`,
      },
    ],
    [JV]: [
      {
        id: JV_GAME,
        slug: "2026-10-25-vs-lockport",
        title: "JV vs Lockport",
        sport: "Hockey",
        opponent: "Lockport",
        location: null,
        event_date: "2026-10-25",
        photo_count: 1,
        first_thumb: null,
      },
    ],
  };
  const photos: Record<string, PhotoRow[]> = {
    [GAME]: [
      {
        id: PHOTO,
        filename: "IMG_0001.JPG",
        captured_at: null,
        width: 2400,
        height: 1600,
        web_path: `${VARSITY}/${GAME}/${PHOTO}-web.jpg`,
        thumb_path: `${VARSITY}/${GAME}/${PHOTO}-thumb.jpg`,
      },
    ],
    [JV_GAME]: [
      {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        filename: "JV.JPG",
        captured_at: null,
        width: null,
        height: null,
        web_path: `${JV}/${JV_GAME}/x-web.jpg`,
        thumb_path: `${JV}/${JV_GAME}/x-thumb.jpg`,
      },
    ],
  };
  const failures: Record<string, number> = {};
  const removed: { bucket: string; paths: string[] }[] = [];
  const published: Record<string, unknown>[] = [];
  const deps: GalleryDeps = {
    accessSecret: SECRET,
    publisherKey: PUBLISHER,
    store: {
      galleryForLink: (link) =>
        Promise.resolve(
          [...galleries.values()].find((g) => g.link === link && g.active),
        ),
      visitorGames: (id) =>
        Promise.resolve(galleries.get(id)?.active ? (games[id] ?? []) : []),
      visitorPhotos: (id, game) =>
        Promise.resolve(
          (games[id] ?? []).some((g) => g.id === game) ? (photos[game] ?? []) : [],
        ),
      publicListing: () =>
        Promise.resolve(
          [...galleries.values()]
            .filter((g) => g.active)
            .flatMap((g) =>
              (games[g.id] ?? []).map((gm): ListingRow => ({
                gallery_slug: g.slug,
                brand: g.brand,
                group_name: g.group_name,
                gallery_name: g.name,
                link_token: g.link,
                game_slug: gm.slug,
                title: gm.title,
                sport: gm.sport,
                opponent: gm.opponent,
                location: gm.location,
                event_date: gm.event_date,
                photo_count: gm.photo_count,
                cover_path: g.id === VARSITY ? `${GAME}/${PHOTO}.jpg` : null,
              })),
            ),
        ),
      publishGallery: (p) => {
        published.push(p);
        return Promise.resolve();
      },
      publishGame: (_g, game) => {
        published.push(game);
        return Promise.resolve([
          `${VARSITY}/${GAME}/old-web.jpg`,
          `cover:${GAME}/old.jpg`,
        ]);
      },
      removeGamesExcept: () => Promise.resolve([]),
      removeGallery: () => Promise.resolve([`${VARSITY}/${GAME}/${PHOTO}-web.jpg`]),
      recordFailure: (id) => Promise.resolve((failures[id] = (failures[id] ?? 0) + 1)),
      recentFailures: (id) => Promise.resolve(failures[id] ?? 0),
    },
    files: {
      signedUrls: (paths) =>
        Promise.resolve(
          new Map(paths.map((p) => [p, `https://signed.example/${p}?token=t`])),
        ),
      signedUploadUrl: (bucket, path) =>
        Promise.resolve(`https://upload.example/${bucket}/${path}?token=u`),
      publicUrl: (bucket, path) => `https://public.example/${bucket}/${path}`,
      remove: (bucket, paths) => {
        removed.push({ bucket, paths });
        return Promise.resolve();
      },
    },
  };
  return { deps, galleries, removed, published };
}

const BASE = "https://x.supabase.co/functions/v1/team-gallery";
const SITE = "https://5starsportsmedia.com";
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, ...headers },
    body: JSON.stringify(body),
  });
const get = (path: string) => new Request(BASE + path, { headers: { origin: SITE } });

async function unlock(w: ReturnType<typeof world>, link: string, password: string) {
  return handle(post("/unlock", { link, password }), w.deps);
}

Deno.test("checks a team password hashed exactly as JerseySort hashes it", () => {
  const h = jerseySortHash("goblue26");
  assert(verifyPassword("goblue26", h), "right password");
  assert(!verifyPassword("goblue27", h), "wrong password");
  assert(!verifyPassword("goblue26", "plain:goblue26"), "not an scrypt hash");
});

Deno.test("routes under the function's own path", () => {
  assertEquals(routeOf(new URL(BASE + "/listing")), "/listing", "listing");
  assertEquals(routeOf(new URL(BASE + "/")), "/", "root");
});

Deno.test(
  "a right password opens only its own gallery; a wrong one is refused",
  async () => {
    const w = world();
    assertEquals(
      (await unlock(w, "VarsityLinkToken0001", "gojv2026")).status,
      401,
      "JV password on Varsity",
    );
    assertEquals(
      (await unlock(w, "NoSuchLinkToken00001", "goblue26")).status,
      404,
      "unknown link",
    );
    assertEquals(
      (await unlock(w, "bad link", "goblue26")).status,
      404,
      "malformed link",
    );
    const ok = await unlock(w, "VarsityLinkToken0001", "goblue26");
    assertEquals(ok.status, 200, "right password");
    const { pass } = await ok.json();
    const games = await handle(
      get(`/gallery?link=VarsityLinkToken0001&pass=${pass}`),
      w.deps,
    );
    assertEquals(games.status, 200, "Varsity pass opens Varsity");
    const body = await games.json();
    assertEquals(body.games.length, 1, "one game");
    assertEquals(body.gallery.brand, "5 Star Sports Media", "brand");
    assert(!JSON.stringify(body).includes("password_hash"), "no hash in the answer");
    const jv = await handle(
      get(`/gallery?link=JvLinkToken000000001&pass=${pass}`),
      w.deps,
    );
    assertEquals(jv.status, 401, "Varsity pass does not open JV");
    const none = await handle(get(`/gallery?link=VarsityLinkToken0001`), w.deps);
    assertEquals(none.status, 401, "no pass, no games");
  },
);

Deno.test(
  "photos come only as expiring signed URLs, and only for this gallery's games",
  async () => {
    const w = world();
    const { pass } = await (await unlock(w, "VarsityLinkToken0001", "goblue26")).json();
    const r = await handle(
      get(`/game?link=VarsityLinkToken0001&pass=${pass}&game=${GAME}`),
      w.deps,
    );
    assertEquals(r.status, 200, "own game");
    const b = await r.json();
    assertEquals(b.photos.length, 1, "its photo");
    assert(
      String(b.photos[0].web_url).startsWith("https://signed.example/"),
      "signed web url",
    );
    assert(!JSON.stringify(b).includes('"web_path"'), "no storage paths handed out");
    const other = await handle(
      get(`/game?link=VarsityLinkToken0001&pass=${pass}&game=${JV_GAME}`),
      w.deps,
    );
    assertEquals(other.status, 404, "JV's game through Varsity's link");
  },
);

Deno.test(
  "changing the password, or switching the gallery off, ends every pass",
  async () => {
    const w = world();
    const { pass } = await (await unlock(w, "VarsityLinkToken0001", "goblue26")).json();
    const g = w.galleries.get(VARSITY)!;
    assert(passIsValid(SECRET, g, pass, Date.now()), "valid now");
    g.password_hash = jerseySortHash("newpass26");
    assert(!passIsValid(SECRET, g, pass, Date.now()), "dead after a new password");
    const after = await handle(
      get(`/gallery?link=VarsityLinkToken0001&pass=${pass}`),
      w.deps,
    );
    assertEquals(after.status, 401, "refused after a new password");
    const fresh = (await (await unlock(w, "VarsityLinkToken0001", "newpass26")).json())
      .pass;
    g.active = false;
    const off = await handle(
      get(`/gallery?link=VarsityLinkToken0001&pass=${fresh}`),
      w.deps,
    );
    assertEquals(off.status, 404, "switched off");
    assert(
      !passIsValid(SECRET, g, fresh, Date.now() + 31 * 86_400_000),
      "passes expire",
    );
    assert(
      !passIsValid(
        "another-secret".repeat(4),
        { ...g, password_hash: g.password_hash },
        fresh,
        Date.now(),
      ),
      "signed with our secret only",
    );
  },
);

Deno.test(
  "ten wrong passwords and that link waits, even for the right one",
  async () => {
    const w = world();
    for (let i = 0; i < MAX_FAILURES; i++)
      await unlock(w, "JvLinkToken000000001", `guess-${i}`);
    const r = await unlock(w, "JvLinkToken000000001", "gojv2026");
    assertEquals(r.status, 429, "throttled");
    assertEquals(
      (await unlock(w, "VarsityLinkToken0001", "goblue26")).status,
      200,
      "other teams unaffected",
    );
  },
);

Deno.test("the public listing shows the chosen cover and nothing private", async () => {
  const w = world();
  const r = await handle(get("/listing"), w.deps);
  const b = await r.json();
  assertEquals(b.games.length, 2, "both teams' games");
  const varsity = b.games.find((x: ListingRow) => x.gallery_name === "Varsity");
  assertEquals(
    varsity.cover_url,
    `https://public.example/gallery-covers/${GAME}/${PHOTO}.jpg`,
    "public cover",
  );
  assertEquals(
    b.games.find((x: ListingRow) => x.gallery_name === "JV").cover_url,
    null,
    "no cover chosen",
  );
  const s = JSON.stringify(b);
  assert(
    !s.includes("password") && !s.includes("-web.jpg") && !s.includes("-thumb.jpg"),
    "nothing private",
  );
  assertEquals(
    r.headers.get("access-control-allow-origin"),
    SITE,
    "the website may read it",
  );
});

Deno.test("only the website (and local testing) gets CORS", async () => {
  const w = world();
  const evil = await handle(
    new Request(BASE + "/listing", { headers: { origin: "https://evil.example" } }),
    w.deps,
  );
  assertEquals(
    evil.headers.get("access-control-allow-origin"),
    null,
    "no CORS for others",
  );
  const www = await handle(
    new Request(BASE + "/listing", {
      headers: { origin: "https://www.5starsportsmedia.com" },
    }),
    w.deps,
  );
  assertEquals(
    www.headers.get("access-control-allow-origin"),
    "https://www.5starsportsmedia.com",
    "www",
  );
});

Deno.test("publishing needs the publisher key", async () => {
  const w = world();
  const no = await handle(post("/publish/remove", { gallery_id: VARSITY }), w.deps);
  assertEquals(no.status, 401, "no key");
  const wrong = await handle(
    post(
      "/publish/remove",
      { gallery_id: VARSITY },
      { "x-gallery-publisher-key": "q".repeat(48) },
    ),
    w.deps,
  );
  assertEquals(wrong.status, 401, "wrong key");
  assertEquals(w.removed.length, 0, "nothing removed");
  const ok = await handle(
    post(
      "/publish/remove",
      { gallery_id: VARSITY },
      { "x-gallery-publisher-key": PUBLISHER },
    ),
    w.deps,
  );
  assertEquals(ok.status, 200, "right key");
  assertEquals(w.removed[0]?.bucket, "gallery-photos", "its files removed");
});

Deno.test(
  "upload URLs go only to the gallery's own paths; dropped files are deleted",
  async () => {
    const w = world();
    const key = { "x-gallery-publisher-key": PUBLISHER };
    const up = await handle(
      post(
        "/publish/uploads",
        {
          gallery_id: VARSITY,
          game_id: GAME,
          files: [
            { photo_id: PHOTO, kind: "web" },
            { photo_id: PHOTO, kind: "thumb" },
            { photo_id: PHOTO, kind: "cover" },
          ],
        },
        key,
      ),
      w.deps,
    );
    const urls = (await up.json()).uploads.map((u: { url: string }) => u.url);
    assertEquals(
      urls[0],
      `https://upload.example/gallery-photos/${VARSITY}/${GAME}/${PHOTO}-web.jpg?token=u`,
      "web path",
    );
    assertEquals(
      urls[1],
      `https://upload.example/gallery-photos/${VARSITY}/${GAME}/${PHOTO}-thumb.jpg?token=u`,
      "thumb path",
    );
    assertEquals(
      urls[2],
      `https://upload.example/gallery-covers/${GAME}/${PHOTO}.jpg?token=u`,
      "cover path",
    );
    const bad = await handle(
      post(
        "/publish/uploads",
        {
          gallery_id: VARSITY,
          game_id: GAME,
          files: [{ photo_id: "../../etc", kind: "web" }],
        },
        key,
      ),
      w.deps,
    );
    assertEquals(bad.status, 400, "a path cannot be smuggled in");
    const game = await handle(
      post(
        "/publish/game",
        { gallery_id: VARSITY, game: { id: GAME }, photos: [] },
        key,
      ),
      w.deps,
    );
    assertEquals(game.status, 200, "published");
    assertEquals(
      JSON.stringify(w.removed),
      JSON.stringify([
        { bucket: "gallery-photos", paths: [`${VARSITY}/${GAME}/old-web.jpg`] },
        { bucket: "gallery-covers", paths: [`${GAME}/old.jpg`] },
      ]),
      "dropped photo and old cover deleted from the right buckets",
    );
  },
);
