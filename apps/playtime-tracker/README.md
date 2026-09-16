# PlayTime Tracker

Tap an athlete on. Tap them off. Know exactly how long every child actually
played — with or without a signal.

```bash
pnpm --filter @hl-bos/playtime-tracker dev     # http://localhost:4700
pnpm --filter @hl-bos/playtime-tracker build   # static export into out/
```

## What it is

A statically exported Next.js app. `output: "export"` produces a folder of
HTML, JS and CSS with no server behind it — which is what a native app bundle
already is, and what Capacitor wraps for the App Store and Play Store. The same
files are the web PWA and the native app.

The participation arithmetic is **not** in this app. It lives in
[`@hl-bos/playtime-engine`](../../packages/playtime-engine), with no React, no
Supabase and no screen, so it can be lifted into AthleteHuddle, CoachesHuddle,
OrganizationHuddle, GameTracker and 5-Star Sports Media intact.

## The three decisions everything else follows from

### 1. There is no server session, so RLS is the boundary

A static export has nowhere to hold a secret and is given none. Every read and
write goes from the device to Supabase with the publishable key, and migration
0049 enables **and forces** Row Level Security on every table, with no
service-role path and no admin escape hatch. That is the same boundary a native
app would rely on.

### 2. The device is the primary database, not a cache

Every tap is written to local storage synchronously, before any network is
attempted. `localStorage` rather than IndexedDB, deliberately: iOS does not
wait for an async transaction to settle when it suspends a backgrounded app, so
a substitution recorded as the coach switches to the camera can simply not
land. A synchronous write has already happened by the time the handler returns.

The capacity arithmetic is comfortable — a four-quarter game with a
substitution every thirty seconds is roughly 400 events, about 60 KB, and a
whole season fits inside 2 MB of a guaranteed 5.

If storage is blocked entirely (private browsing, blocked site data) the app
**stops and says so** rather than letting someone track a game it cannot keep.

### 3. Signing in is not a gate in front of the product

A coach who installs this twenty minutes before kickoff should be tracking a
game, not filling in a form. Local mode is a real mode; everything created in
it is re-owned by whoever eventually signs in on that device.

When a build has no account service configured, the app says exactly that on
its Account screen and shows no sign-in form — a sign-in box that cannot sign
anyone in is worse than none.

## Timers

There is no timer that counts. `useNow()` decides how often the screen is
repainted and nothing else; every duration comes from the engine, computed from
recorded instants. If that interval is throttled to a stop by a locked screen,
or never fires because the app was suspended, not one second of anyone's
playing time is affected — the next paint just shows the correct, larger
number.

## Proving it

```bash
pnpm --filter @hl-bos/playtime-tracker build
node scripts/serve.mjs out 4700 &
pnpm --filter @hl-bos/playtime-tracker qa
```

39 assertions against the production build in a real browser: twenty athletes,
a full game, repeated substitutions, the app backgrounded, the phone locked,
the process killed, the network pulled out mid-game, and a cold start with no
connectivity. See [`qa/README.md`](qa/README.md) for why the clock is faked and
which assertion matters most.

`src/lib/sync.test.ts` reads migration 0049 and checks every field this client
sends against the columns that migration actually creates — the failure it
exists to catch is a sync rejected at a field with no signal, where nobody
would find out until the game was over.

## Native

See [`store/NATIVE.md`](store/NATIVE.md) for the build steps and an honest list
of what is not done, and [`store/LISTING.md`](store/LISTING.md) for the listing
copy, the permission answer (there are none) and both privacy questionnaires.

## Version

One source: [`store/release.json`](store/release.json).
`node scripts/set-release.mjs --bump` propagates it to the web build, Gradle and
Xcode, so the version a user reads on the Account screen is the version of the
build they are running.
