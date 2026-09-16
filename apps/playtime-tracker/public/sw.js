/*
 * Offline shell.
 *
 * Only relevant when the app is installed from the web -- inside the iOS and
 * Android shells the assets are already on the device and this never runs.
 *
 * Cache-first for the app's own files, network-never for anything else. It
 * caches NO data: every team, athlete and game lives in local storage, which
 * this worker does not touch. That separation matters -- a cache that served a
 * stale roster would be worse than no cache at all.
 */
const CACHE = "playtime-shell-v1";

/*
 * Every file this build produced, injected by scripts/build-sw.mjs from the
 * real export. Generated, never hand-maintained, so it cannot drift from what
 * shipped.
 *
 * The literal below is what a build that skipped that step would fall back to:
 * valid JavaScript that precaches the shell and nothing else, rather than a
 * placeholder token that would make this file fail to parse.
 */
const PRECACHE = ["/"]; // __PRECACHE__

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // One failed asset must not abort the whole install and leave the app
        // with no offline shell at all, so each is added independently.
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Same-origin only. A Supabase call must never be served from a cache: a
  // stale answer about someone's account is worse than an honest failure.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Refresh in the background so the next launch is current.
        void fetch(request)
          .then((res) => {
            if (res.ok)
              void caches.open(CACHE).then((c) => c.put(request, res.clone()));
          })
          .catch(() => {});
        return hit;
      }
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          // Offline and never cached. Fall back to the app shell so a deep
          // link still opens the app rather than a browser error page.
          const shell = await caches.match("/");
          if (shell) return shell;
          return new Response(
            "You are offline and this page has not been saved on this device.",
            {
              status: 503,
              headers: { "content-type": "text/plain" },
            },
          );
        });
    }),
  );
});
